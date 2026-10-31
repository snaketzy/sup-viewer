import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseSup } from './parse-sup';
import { resolveDisplaySetGeometry } from './events';
import { SegmentType } from './constants';

/** 构造 SUP 段的测试工具：段头 13 字节 + 负载 */
function segment(type: number, pts: number, payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(13 + payload.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0x5047);
  view.setUint32(2, pts);
  view.setUint32(6, 0);
  view.setUint8(10, type);
  view.setUint16(11, payload.byteLength);
  bytes.set(payload, 13);
  return bytes;
}

interface CompositionObjectInput {
  id: number;
  windowId: number;
  x: number;
  y: number;
  cropped?: boolean;
  forced?: boolean;
}

function pcsPayload(options: {
  width?: number;
  height?: number;
  frameRateCode?: number;
  compositionNumber?: number;
  state: number;
  paletteId?: number;
  paletteUpdate?: boolean;
  objects?: CompositionObjectInput[];
}): Uint8Array {
  const objects = options.objects ?? [];
  const bytes = new Uint8Array(11 + objects.length * (objects.some((o) => o.cropped) ? 16 : 8));
  const view = new DataView(bytes.buffer);
  view.setUint16(0, options.width ?? 1920);
  view.setUint16(2, options.height ?? 1080);
  view.setUint8(4, options.frameRateCode ?? 4);
  view.setUint16(5, options.compositionNumber ?? 1);
  view.setUint8(7, options.state);
  view.setUint8(8, options.paletteUpdate ? 0x80 : 0);
  view.setUint8(9, options.paletteId ?? 0);
  view.setUint8(10, objects.length);

  let cursor = 11;
  for (const object of objects) {
    const flag = (object.cropped ? 0x80 : 0) | (object.forced ? 0x40 : 0);
    view.setUint16(cursor, object.id);
    view.setUint8(cursor + 2, object.windowId);
    view.setUint8(cursor + 3, flag);
    view.setUint16(cursor + 4, object.x);
    view.setUint16(cursor + 6, object.y);
    cursor += 8;
    if (object.cropped) {
      view.setUint16(cursor, 0);
      view.setUint16(cursor + 2, 0);
      view.setUint16(cursor + 4, 100);
      view.setUint16(cursor + 6, 50);
      cursor += 8;
    }
  }

  return bytes;
}

function wdsPayload(windows: Array<{ id: number; x: number; y: number; width: number; height: number }>): Uint8Array {
  const bytes = new Uint8Array(1 + windows.length * 9);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, windows.length);
  let cursor = 1;
  for (const window of windows) {
    view.setUint8(cursor, window.id);
    view.setUint16(cursor + 1, window.x);
    view.setUint16(cursor + 3, window.y);
    view.setUint16(cursor + 5, window.width);
    view.setUint16(cursor + 7, window.height);
    cursor += 9;
  }
  return bytes;
}

function odsPayload(id: number, width: number, height: number, dataLength = 64): Uint8Array {
  const bytes = new Uint8Array(11 + 4);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, id);
  view.setUint8(2, 0);
  view.setUint8(3, 0xc0);
  view.setUint8(4, Math.floor(dataLength / 65536));
  view.setUint16(5, dataLength % 65536);
  view.setUint16(7, width);
  view.setUint16(9, height);
  return bytes;
}

function pdsPayload(id: number, entries: number): Uint8Array {
  const bytes = new Uint8Array(2 + entries * 5);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, id);
  view.setUint8(1, 0);
  for (let index = 0; index < entries; index++) {
    const cursor = 2 + index * 5;
    view.setUint8(cursor, index);
    view.setUint8(cursor + 1, 235);
    view.setUint8(cursor + 2, 128);
    view.setUint8(cursor + 3, 128);
    view.setUint8(cursor + 4, index === 0 ? 0 : 255);
  }
  return bytes;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

const END_SEGMENT = segment(SegmentType.End, 0, new Uint8Array(0));

describe('parseSup', () => {
  it('解析 epoch start 显示集并还原字幕几何', () => {
    const file = concat([
      segment(SegmentType.PresentationComposition, 90_000, pcsPayload({
        state: 0x80,
        objects: [{ id: 1, windowId: 0, x: 300, y: 880 }],
      })),
      segment(SegmentType.WindowDefinition, 0, wdsPayload([{ id: 0, x: 300, y: 880, width: 1320, height: 88 }])),
      segment(SegmentType.PaletteDefinition, 0, pdsPayload(0, 256)),
      segment(SegmentType.ObjectDefinition, 0, odsPayload(1, 1320, 88)),
      END_SEGMENT,
    ]);

    const result = parseSup(file);

    expect(result.metadata.issues).toEqual([]);
    expect(result.metadata.width).toBe(1920);
    expect(result.metadata.height).toBe(1080);
    expect(result.metadata.frameRate).toBe(29.97);
    expect(result.metadata.displaySetCount).toBe(1);
    expect(result.metadata.contentEventCount).toBe(1);
    expect(result.metadata.durationSeconds).toBeCloseTo(1, 5);
    expect(result.metadata.pcsTimestampsMissing).toBe(false);

    const [event] = result.events;
    expect(event?.index).toBe(0);
    expect(event?.stateLabel).toBe('Epoch Start');
    expect(event?.selfContained).toBe(true);
    expect(event?.hasContent).toBe(true);
    expect(event?.bounds).toEqual({ x: 300, y: 880, width: 1320, height: 88 });
    expect(event?.objects[0]).toMatchObject({ id: 1, width: 1320, height: 88, forced: false });
  });

  it('Normal 状态的显示集沿用之前的对象与调色板', () => {
    const file = concat([
      // 第一个显示集：完整数据
      segment(SegmentType.PresentationComposition, 90_000, pcsPayload({
        state: 0x80,
        objects: [{ id: 1, windowId: 0, x: 100, y: 900 }],
      })),
      segment(SegmentType.WindowDefinition, 0, wdsPayload([{ id: 0, x: 100, y: 900, width: 400, height: 60 }])),
      segment(SegmentType.PaletteDefinition, 0, pdsPayload(0, 256)),
      segment(SegmentType.ObjectDefinition, 0, odsPayload(1, 400, 60)),
      END_SEGMENT,
      // 第二个显示集：Normal 状态，只给出新的位置，对象与调色板来自上一个显示集
      segment(SegmentType.PresentationComposition, 180_000, pcsPayload({
        compositionNumber: 2,
        state: 0x00,
        objects: [{ id: 1, windowId: 0, x: 200, y: 950 }],
      })),
      END_SEGMENT,
      // 第三个显示集：清屏（没有对象）
      segment(SegmentType.PresentationComposition, 270_000, pcsPayload({
        compositionNumber: 3,
        state: 0x80,
      })),
      END_SEGMENT,
    ]);

    const result = parseSup(file);

    expect(result.metadata.issues).toEqual([]);
    expect(result.metadata.displaySetCount).toBe(3);
    expect(result.events).toHaveLength(3);

    const [, second, third] = result.events;
    expect(second?.selfContained).toBe(false);
    expect(second?.hasContent).toBe(true);
    expect(second?.bounds).toEqual({ x: 200, y: 950, width: 400, height: 60 });
    expect(second?.startSeconds).toBeCloseTo(2, 5);
    expect(second?.endSeconds).toBeCloseTo(3, 5);
    expect(second?.durationSeconds).toBeCloseTo(1, 5);

    expect(third?.hasContent).toBe(false);
    expect(third?.bounds).toBeNull();
    // 最后一个事件延续到文件结尾（此处即自身时间戳）
    expect(third?.durationSeconds).toBe(0);
  });

  it('非法的魔术字会终止解析并记录问题', () => {
    const good = concat([
      segment(SegmentType.PresentationComposition, 90_000, pcsPayload({ state: 0x80 })),
      END_SEGMENT,
    ]);
    const broken = new Uint8Array(good);
    broken[broken.byteLength - 13] = 0x00;

    const result = parseSup(broken);
    expect(result.metadata.issues.map((issue) => issue.code)).toContain('invalid-magic');
  });

  it('未知段类型按长度跳过并记录问题', () => {
    const file = concat([
      segment(SegmentType.PresentationComposition, 90_000, pcsPayload({ state: 0x80 })),
      segment(0x99, 0, new Uint8Array(6)),
      END_SEGMENT,
    ]);

    const result = parseSup(file);
    expect(result.metadata.issues.map((issue) => issue.code)).toContain('unknown-segment');
    expect(result.metadata.segmentCounts.unknown).toBe(1);
    expect(result.metadata.displaySetCount).toBe(1);
  });

  it('截断的段会被识别且已解析的内容保留', () => {
    const full = concat([
      segment(SegmentType.PresentationComposition, 90_000, pcsPayload({ state: 0x80, objects: [] })),
      END_SEGMENT,
      segment(SegmentType.PresentationComposition, 180_000, pcsPayload({ state: 0x80, objects: [] })),
      END_SEGMENT,
    ]);

    const result = parseSup(full.subarray(0, full.byteLength - 20));
    expect(result.metadata.issues.map((issue) => issue.code)).toContain('truncated');
    expect(result.metadata.displaySetCount).toBe(1);
  });

  it('裁剪与 forced 标记会被识别', () => {
    const file = concat([
      segment(SegmentType.PresentationComposition, 90_000, pcsPayload({
        state: 0x80,
        objects: [{ id: 2, windowId: 1, x: 10, y: 20, cropped: true, forced: true }],
      })),
      segment(SegmentType.WindowDefinition, 0, wdsPayload([{ id: 1, x: 10, y: 20, width: 200, height: 100 }])),
      segment(SegmentType.PaletteDefinition, 0, pdsPayload(0, 4)),
      segment(SegmentType.ObjectDefinition, 0, odsPayload(2, 200, 100)),
      END_SEGMENT,
    ]);

    const result = parseSup(file);
    const [event] = result.events;
    expect(event?.hasForced).toBe(true);
    expect(event?.objects[0]?.cropped).toBe(true);
    // 有裁剪时以裁剪矩形作为绘制尺寸
    expect(event?.bounds).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });

  it('PCS 时间戳全部缺失时标记警告', () => {
    const file = concat([
      segment(SegmentType.PresentationComposition, 0, pcsPayload({ state: 0x80 })),
      END_SEGMENT,
    ]);

    const result = parseSup(file);
    expect(result.metadata.pcsTimestampsMissing).toBe(true);
  });

  it('解析 libpgs 自带的真实样本文件（存在时）', () => {
    const fixture = fileURLToPath(new URL('../../../../node_modules/libpgs/tests/files/test.sup', import.meta.url));
    if (!existsSync(fixture)) {
      expect(true).toBe(true);
      return;
    }

    const result = parseSup(readFileSync(fixture));

    expect(result.metadata.issues).toEqual([]);
    expect(result.metadata.displaySetCount).toBeGreaterThan(0);
    expect(result.metadata.width).toBeGreaterThan(0);
    expect(result.metadata.height).toBeGreaterThan(0);
    expect(result.metadata.durationSeconds).toBeGreaterThan(0);
    expect(result.events.length).toBe(result.metadata.compositionCount);
    expect(result.metadata.contentEventCount).toBeGreaterThan(0);
    expect(result.events.some((event) => event.hasContent)).toBe(true);
  });
});

describe('resolveDisplaySetGeometry', () => {
  it('没有调色板时不输出任何对象', () => {
    const file = concat([
      segment(SegmentType.PresentationComposition, 90_000, pcsPayload({
        state: 0x80,
        objects: [{ id: 1, windowId: 0, x: 0, y: 0 }],
      })),
      segment(SegmentType.WindowDefinition, 0, wdsPayload([{ id: 0, x: 0, y: 0, width: 100, height: 20 }])),
      segment(SegmentType.ObjectDefinition, 0, odsPayload(1, 100, 20)),
      END_SEGMENT,
    ]);

    const parsed = parseSup(file);
    const geometry = resolveDisplaySetGeometry(parsed.displaySets, 0);
    expect(geometry?.hasPalette).toBe(false);
    expect(geometry?.objects).toEqual([]);
  });
});
