/** PGS(SUP) 段头长度：魔术字(2) + PTS(4) + DTS(4) + 类型(1) + 长度(2) */
export const SEGMENT_HEADER_SIZE = 13;

/** 段魔术字 "PG" */
export const PGS_MAGIC = 0x5047;

/** PGS 时间戳时钟频率（90kHz） */
export const PGS_TICKS_PER_SECOND = 90_000;

export const SegmentType = {
  PaletteDefinition: 0x14,
  ObjectDefinition: 0x15,
  PresentationComposition: 0x16,
  WindowDefinition: 0x17,
  End: 0x80,
} as const;

/**
 * PCS 的 composition_state 高 2 位：
 * 00 Normal（沿用之前定义的对象与调色板）
 * 01 Acquisition Point / 10 Epoch Start / 11 Epoch Continue（均会清空缓存，自带完整数据）
 */
export const CompositionStateType = {
  Normal: 0,
  AcquisitionPoint: 1,
  EpochStart: 2,
  EpochContinue: 3,
} as const;

export const COMPOSITION_STATE_LABELS: Record<number, string> = {
  0: 'Normal',
  1: 'Acquisition',
  2: 'Epoch Start',
  3: 'Epoch Continue',
};

/** PCS 中的帧率代码（与标准码表一致） */
export const FRAME_RATE_TABLE: Record<number, number> = {
  1: 23.976,
  2: 24,
  3: 25,
  4: 29.97,
  5: 30,
  6: 50,
  7: 59.94,
  8: 60,
};

export const DEFAULT_FRAME_RATE = 23.976;
