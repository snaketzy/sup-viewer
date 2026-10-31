import {
  CompositionStateType,
  DEFAULT_FRAME_RATE,
  FRAME_RATE_TABLE,
  PGS_MAGIC,
  PGS_TICKS_PER_SECOND,
  SEGMENT_HEADER_SIZE,
  SegmentType,
} from './constants';
import { buildEvents } from './events';
import type {
  SupCompositionObject,
  SupDisplaySet,
  SupMetadata,
  SupObjectDefinition,
  SupPaletteDefinition,
  SupParseIssue,
  SupParseResult,
  SupPresentationComposition,
  SupSegmentCounts,
  SupWindowDefinition,
} from './types';

export interface ParseSupOptions {
  /** 安全阀：超过该数量的 display set 时停止解析 */
  maxDisplaySets?: number;
}

const DEFAULT_MAX_DISPLAY_SETS = 200_000;

function emptyDisplaySet(index: number, offset: number): SupDisplaySet {
  return {
    index,
    offset,
    byteLength: 0,
    pts: 0,
    dts: 0,
    maxSegmentPts: 0,
    pcs: null,
    palettes: [],
    objects: [],
    windows: [],
    selfContained: false,
  };
}

function readComposition(
  view: DataView,
  offset: number,
  size: number,
): SupPresentationComposition | null {
  // PCS 固定头 11 字节，其余为 8/16 字节的对象引用
  if (size < 11) return null;

  let cursor = offset;
  const width = view.getUint16(cursor, false);
  const height = view.getUint16(cursor + 2, false);
  const frameRateCode = view.getUint8(cursor + 4);
  const compositionNumber = view.getUint16(cursor + 5, false);
  const compositionState = view.getUint8(cursor + 7);
  const paletteUpdate = (view.getUint8(cursor + 8) & 0x80) !== 0;
  const paletteId = view.getUint8(cursor + 9);
  const objectCount = view.getUint8(cursor + 10);
  cursor += 11;

  const objects: SupCompositionObject[] = [];
  for (let i = 0; i < objectCount; i++) {
    if (cursor + 8 > offset + size) break;

    const id = view.getUint16(cursor, false);
    const windowId = view.getUint8(cursor + 2);
    const compositionFlag = view.getUint8(cursor + 3);
    const x = view.getUint16(cursor + 4, false);
    const y = view.getUint16(cursor + 6, false);
    cursor += 8;

    let crop = null;
    if ((compositionFlag & 0x80) !== 0) {
      if (cursor + 8 > offset + size) break;
      crop = {
        x: view.getUint16(cursor, false),
        y: view.getUint16(cursor + 2, false),
        width: view.getUint16(cursor + 4, false),
        height: view.getUint16(cursor + 6, false),
      };
      cursor += 8;
    }

    objects.push({
      id,
      windowId,
      cropped: (compositionFlag & 0x80) !== 0,
      forced: (compositionFlag & 0x40) !== 0,
      x,
      y,
      crop,
    });
  }

  return {
    width,
    height,
    frameRateCode,
    frameRate: FRAME_RATE_TABLE[frameRateCode] ?? DEFAULT_FRAME_RATE,
    compositionNumber,
    compositionState,
    stateType: compositionState >> 6,
    paletteUpdate,
    paletteId,
    objects,
  };
}

function readWindows(view: DataView, offset: number, size: number): SupWindowDefinition[] {
  const windows: SupWindowDefinition[] = [];
  if (size < 1) return windows;

  const count = view.getUint8(offset);
  let cursor = offset + 1;
  for (let i = 0; i < count; i++) {
    if (cursor + 9 > offset + size) break;
    windows.push({
      id: view.getUint8(cursor),
      x: view.getUint16(cursor + 1, false),
      y: view.getUint16(cursor + 3, false),
      width: view.getUint16(cursor + 5, false),
      height: view.getUint16(cursor + 7, false),
    });
    cursor += 9;
  }
  return windows;
}

function readObjectDefinition(
  view: DataView,
  offset: number,
  size: number,
): SupObjectDefinition | null {
  if (size < 4) return null;

  const id = view.getUint16(offset, false);
  const version = view.getUint8(offset + 2);
  const sequenceFlag = view.getUint8(offset + 3);
  const firstInSequence = (sequenceFlag & 0x80) !== 0;
  const lastInSequence = (sequenceFlag & 0x40) !== 0;

  // 只有序列中的第一个 ODS 携带完整图像尺寸与总数据长度
  let dataLength = 0;
  let width = 0;
  let height = 0;
  if (firstInSequence && size >= 11) {
    dataLength = view.getUint8(offset + 4) * 65536 + view.getUint16(offset + 5, false);
    width = view.getUint16(offset + 7, false);
    height = view.getUint16(offset + 9, false);
  }

  return { id, version, firstInSequence, lastInSequence, dataLength, width, height };
}

function readPaletteDefinition(
  view: DataView,
  offset: number,
  size: number,
): SupPaletteDefinition | null {
  if (size < 2) return null;
  return {
    id: view.getUint8(offset),
    version: view.getUint8(offset + 1),
    entryCount: Math.max(0, Math.floor((size - 2) / 5)),
  };
}

/**
 * 解析 .sup（裸 PGS 流）。
 *
 * display set 的下标与 libpgs 的内部索引保持一致，因此解析出的 `events[].index`
 * 可直接用于渲染器的时间戳定位。
 */
export function parseSup(
  input: Uint8Array | ArrayBuffer,
  options: ParseSupOptions = {},
): SupParseResult {
  const maxDisplaySets = options.maxDisplaySets ?? DEFAULT_MAX_DISPLAY_SETS;
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const issues: SupParseIssue[] = [];
  const segmentCounts: SupSegmentCounts = {
    paletteDefinition: 0,
    objectDefinition: 0,
    presentationComposition: 0,
    windowDefinition: 0,
    end: 0,
    unknown: 0,
  };
  const displaySets: SupDisplaySet[] = [];

  let current: SupDisplaySet | null = null;
  let offset = 0;
  let aborted = false;

  while (offset + SEGMENT_HEADER_SIZE <= bytes.byteLength) {
    const magic = view.getUint16(offset, false);
    if (magic !== PGS_MAGIC) {
      issues.push({
        offset,
        code: 'invalid-magic',
        message: `偏移 ${offset} 处不是 "PG" 段头，解析终止`,
      });
      aborted = true;
      break;
    }

    const pts = view.getUint32(offset + 2, false);
    const dts = view.getUint32(offset + 6, false);
    const type = view.getUint8(offset + 10);
    const size = view.getUint16(offset + 11, false);
    const payloadOffset = offset + SEGMENT_HEADER_SIZE;

    if (payloadOffset + size > bytes.byteLength) {
      issues.push({ offset, code: 'truncated', message: '段数据不完整，文件可能被截断' });
      aborted = true;
      break;
    }

    if (!current) current = emptyDisplaySet(displaySets.length, offset);
    if (pts > current.maxSegmentPts) current.maxSegmentPts = pts;

    switch (type) {
      case SegmentType.PresentationComposition: {
        segmentCounts.presentationComposition += 1;
        const pcs = readComposition(view, payloadOffset, size);
        if (pcs) {
          current.pcs = pcs;
          // 与 libpgs 保持一致：时间戳只取 PCS 段头
          current.pts = pts;
          current.dts = dts;
        }
        break;
      }
      case SegmentType.WindowDefinition: {
        segmentCounts.windowDefinition += 1;
        current.windows.push(...readWindows(view, payloadOffset, size));
        break;
      }
      case SegmentType.ObjectDefinition: {
        segmentCounts.objectDefinition += 1;
        const ods = readObjectDefinition(view, payloadOffset, size);
        if (ods) current.objects.push(ods);
        break;
      }
      case SegmentType.PaletteDefinition: {
        segmentCounts.paletteDefinition += 1;
        const pds = readPaletteDefinition(view, payloadOffset, size);
        if (pds) current.palettes.push(pds);
        break;
      }
      case SegmentType.End: {
        segmentCounts.end += 1;
        break;
      }
      default: {
        segmentCounts.unknown += 1;
        issues.push({
          offset,
          code: 'unknown-segment',
          message: `未知段类型 0x${type.toString(16)}，已按长度跳过`,
        });
        break;
      }
    }

    offset = payloadOffset + size;
    current.byteLength = offset - current.offset;

    if (type === SegmentType.End) {
      current.selfContained = current.pcs !== null
        && (current.pcs.compositionState >> 6) !== CompositionStateType.Normal;
      displaySets.push(current);
      current = null;

      if (displaySets.length >= maxDisplaySets) {
        issues.push({
          offset,
          code: 'too-many-display-sets',
          message: `display set 数量超过 ${maxDisplaySets}，已停止解析`,
        });
        aborted = true;
        break;
      }
    }
  }

  if (current) {
    current.selfContained = current.pcs !== null
      && (current.pcs.compositionState >> 6) !== CompositionStateType.Normal;
    issues.push({
      offset: current.offset,
      code: 'missing-end',
      message: aborted ? '文件在 display set 中途结束' : '最后一个 display set 缺少 END 段',
    });
    displaySets.push(current);
  }

  const firstComposition = displaySets.find((ds) => ds.pcs !== null)?.pcs ?? null;
  const lastPts = displaySets.reduce((max, ds) => Math.max(max, ds.pts), 0);
  const firstPts = displaySets.find((ds) => ds.pts > 0)?.pts ?? 0;

  // 有些工具不会在 PCS 段头写入时间戳，此时 libpgs 的索引会全部落在 0 上
  const compositionSets = displaySets.filter((ds) => ds.pcs !== null);
  const missingPtsCount = compositionSets.filter((ds) => ds.pts === 0).length;
  const pcsTimestampsMissing = compositionSets.length > 0
    && missingPtsCount / compositionSets.length > 0.5
    && lastPts === 0;

  const durationTicks = pcsTimestampsMissing
    ? displaySets.reduce((max, ds) => Math.max(max, ds.maxSegmentPts), 0)
    : lastPts;

  const events = buildEvents(displaySets, durationTicks / PGS_TICKS_PER_SECOND);

  const metadata: SupMetadata = {
    fileSize: bytes.byteLength,
    width: firstComposition?.width ?? 0,
    height: firstComposition?.height ?? 0,
    frameRateCode: firstComposition?.frameRateCode ?? 0,
    frameRate: firstComposition?.frameRate ?? DEFAULT_FRAME_RATE,
    durationSeconds: durationTicks / PGS_TICKS_PER_SECOND,
    displaySetCount: displaySets.length,
    compositionCount: compositionSets.length,
    contentEventCount: events.filter((event) => event.hasContent).length,
    objectDefinitionCount: segmentCounts.objectDefinition,
    paletteDefinitionCount: segmentCounts.paletteDefinition,
    windowDefinitionCount: segmentCounts.windowDefinition,
    firstPts,
    lastPts,
    pcsTimestampsMissing,
    segmentCounts,
    issues,
  };

  return { metadata, displaySets, events };
}
