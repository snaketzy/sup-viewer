import { COMPOSITION_STATE_LABELS, PGS_TICKS_PER_SECOND } from './constants';
import type {
  SupBounds,
  SupDisplaySet,
  SupEvent,
  SupEventObject,
  SupObjectDefinition,
  SupPaletteDefinition,
  SupWindowDefinition,
} from './types';

interface CompositionContext {
  objects: SupObjectDefinition[];
  palettes: SupPaletteDefinition[];
  windows: SupWindowDefinition[];
}

export interface SupDisplaySetGeometry {
  objects: SupEventObject[];
  bounds: SupBounds | null;
  windows: SupWindowDefinition[];
  /** 该 display set 引用的调色板是否可用（不可用时渲染器不会输出任何像素） */
  hasPalette: boolean;
}

/**
 * 收集渲染某个 display set 所需的上下文元素（对象 / 调色板 / 窗口）。
 *
 * 判定逻辑与 libpgs 完全一致：只有 Normal(0) 状态的 PCS 会沿用之前的元素，
 * 其余状态（Acquisition / Epoch Start / Epoch Continue）自带完整数据，可直接停止回溯。
 */
function collectContext(displaySets: SupDisplaySet[], index: number): CompositionContext {
  const objects: SupObjectDefinition[] = [];
  const palettes: SupPaletteDefinition[] = [];
  const windows: SupWindowDefinition[] = [];

  let cursor = index;
  while (cursor >= 0) {
    const displaySet = displaySets[cursor];
    if (!displaySet) break;

    // 反向往前收集，用 unshift 保持原始顺序
    objects.unshift(...displaySet.objects);
    palettes.unshift(...displaySet.palettes);
    windows.unshift(...displaySet.windows);

    if (displaySet.pcs === null || displaySet.pcs.compositionState !== 0) break;
    cursor -= 1;
  }

  return { objects, palettes, windows };
}

function unionBounds(current: SupBounds | null, next: SupBounds): SupBounds {
  if (!current) return next;

  const x = Math.min(current.x, next.x);
  const y = Math.min(current.y, next.y);
  const right = Math.max(current.x + current.width, next.x + next.width);
  const bottom = Math.max(current.y + current.height, next.y + next.height);
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * 还原某个 display set 在画面上的对象与包围盒。
 * 只做几何还原，不做 RLE 解码，因此开销很低，可用于整份文件的预览索引。
 */
export function resolveDisplaySetGeometry(
  displaySets: SupDisplaySet[],
  index: number,
): SupDisplaySetGeometry | null {
  const displaySet = displaySets[index];
  if (!displaySet?.pcs) return null;

  const { pcs } = displaySet;
  const context = collectContext(displaySets, index);

  // 与 libpgs 一致：找不到调色板时该帧不渲染
  const palette = context.palettes.find((item) => item.id === pcs.paletteId);
  if (!palette) {
    return { objects: [], bounds: null, windows: context.windows, hasPalette: false };
  }

  const objects: SupEventObject[] = [];
  let bounds: SupBounds | null = null;

  for (const compositionObject of pcs.objects) {
    const window = context.windows.find((item) => item.id === compositionObject.windowId);
    if (!window) continue;

    // 一个对象的数据可能被拆到多个 ODS 段，只有 first-in-sequence 携带尺寸
    let width = 0;
    let height = 0;
    let found = false;
    for (const ods of context.objects) {
      if (ods.id !== compositionObject.id) continue;
      if (ods.firstInSequence) {
        width = ods.width;
        height = ods.height;
      }
      found = true;
    }
    if (!found) continue;

    const crop = compositionObject.crop;
    const rect: SupBounds = {
      x: compositionObject.x,
      y: compositionObject.y,
      width: crop ? crop.width : width,
      height: crop ? crop.height : height,
    };
    if (rect.width <= 0 || rect.height <= 0) continue;

    objects.push({
      id: compositionObject.id,
      windowId: compositionObject.windowId,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      cropped: compositionObject.cropped,
      forced: compositionObject.forced,
      crop,
    });

    // 与画面尺寸求交，避免异常坐标把包围盒撑爆
    const clippedX = Math.max(0, Math.min(rect.x, pcs.width));
    const clippedY = Math.max(0, Math.min(rect.y, pcs.height));
    const clippedRight = Math.max(clippedX, Math.min(rect.x + rect.width, pcs.width));
    const clippedBottom = Math.max(clippedY, Math.min(rect.y + rect.height, pcs.height));
    if (clippedRight > clippedX && clippedBottom > clippedY) {
      bounds = unionBounds(bounds, {
        x: clippedX,
        y: clippedY,
        width: clippedRight - clippedX,
        height: clippedBottom - clippedY,
      });
    }
  }

  return { objects, bounds, windows: context.windows, hasPalette: true };
}

function findNextTimestamp(sortedTimestamps: number[], current: number): number | null {
  let low = 0;
  let high = sortedTimestamps.length - 1;
  let result: number | null = null;

  while (low <= high) {
    const middle = (low + high) >> 1;
    const value = sortedTimestamps[middle] as number;
    if (value > current) {
      result = value;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }

  return result;
}

/**
 * 把 display set 序列转换成时间轴事件。
 *
 * 事件区间按「下一个更大的时间戳」计算，这与渲染器
 * “任意时刻显示最后一个时间戳不大于该时刻的 display set” 的行为保持一致。
 */
export function buildEvents(displaySets: SupDisplaySet[], durationSeconds: number): SupEvent[] {
  const sortedTimestamps = [...new Set(displaySets.map((ds) => ds.pts).filter((pts) => pts > 0))]
    .sort((a, b) => a - b);

  const events: SupEvent[] = [];

  for (let index = 0; index < displaySets.length; index++) {
    const displaySet = displaySets[index];
    if (!displaySet.pcs) continue;

    const geometry = resolveDisplaySetGeometry(displaySets, index);
    const startSeconds = displaySet.pts / PGS_TICKS_PER_SECOND;
    const nextPts = findNextTimestamp(sortedTimestamps, displaySet.pts);
    const endSeconds = nextPts === null
      ? Math.max(durationSeconds, startSeconds)
      : nextPts / PGS_TICKS_PER_SECOND;

    const objects = geometry?.objects ?? [];

    events.push({
      index,
      pts: displaySet.pts,
      startSeconds,
      endSeconds,
      durationSeconds: Math.max(0, endSeconds - startSeconds),
      stateType: displaySet.pcs.stateType,
      stateLabel: COMPOSITION_STATE_LABELS[displaySet.pcs.stateType] ?? 'Unknown',
      selfContained: displaySet.selfContained,
      paletteId: displaySet.pcs.paletteId,
      paletteUpdate: displaySet.pcs.paletteUpdate,
      hasContent: objects.length > 0,
      hasForced: objects.some((object) => object.forced),
      width: displaySet.pcs.width,
      height: displaySet.pcs.height,
      bounds: geometry?.bounds ?? null,
      objects,
      windows: geometry?.windows ?? [],
    });
  }

  return events;
}
