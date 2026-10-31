export interface SupParseIssue {
  /** 出错位置（字节偏移） */
  offset: number;
  code: 'invalid-magic' | 'truncated' | 'missing-end' | 'unknown-segment' | 'too-many-display-sets';
  message: string;
}

export interface SupSegmentCounts {
  paletteDefinition: number;
  objectDefinition: number;
  presentationComposition: number;
  windowDefinition: number;
  end: number;
  unknown: number;
}

export interface SupWindowDefinition {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SupObjectDefinition {
  id: number;
  version: number;
  firstInSequence: boolean;
  lastInSequence: boolean;
  /** 整个对象数据的长度（跨多个 ODS 段） */
  dataLength: number;
  width: number;
  height: number;
}

export interface SupPaletteDefinition {
  id: number;
  version: number;
  entryCount: number;
}

export interface SupCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SupCompositionObject {
  id: number;
  windowId: number;
  cropped: boolean;
  forced: boolean;
  x: number;
  y: number;
  crop: SupCrop | null;
}

export interface SupPresentationComposition {
  width: number;
  height: number;
  frameRateCode: number;
  frameRate: number;
  compositionNumber: number;
  compositionState: number;
  /** composition_state 的高 2 位取值，见 CompositionStateType */
  stateType: number;
  paletteUpdate: boolean;
  paletteId: number;
  objects: SupCompositionObject[];
}

/** 一个 display set：以 PCS 开头、以 END 段结束的一组 PGS 段 */
export interface SupDisplaySet {
  index: number;
  offset: number;
  byteLength: number;
  /** 与 libpgs 一致：只取 PCS 段头的时间戳（90kHz） */
  pts: number;
  dts: number;
  /** 该 display set 内所有段头 PTS 的最大值，用于诊断时间戳缺失的文件 */
  maxSegmentPts: number;
  pcs: SupPresentationComposition | null;
  palettes: SupPaletteDefinition[];
  objects: SupObjectDefinition[];
  windows: SupWindowDefinition[];
  selfContained: boolean;
}

export interface SupBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SupEventObject {
  id: number;
  windowId: number;
  x: number;
  y: number;
  width: number;
  height: number;
  cropped: boolean;
  forced: boolean;
  crop: SupCrop | null;
}

/** 时间轴上的一条字幕事件（一个带 PCS 的 display set） */
export interface SupEvent {
  /** display set 下标，与渲染器的时间戳索引一致 */
  index: number;
  pts: number;
  startSeconds: number;
  /** null 表示延续到文件结束 */
  endSeconds: number | null;
  durationSeconds: number | null;
  stateType: number;
  stateLabel: string;
  selfContained: boolean;
  paletteId: number;
  paletteUpdate: boolean;
  /** 是否能在画面上显示内容（有可解析的对象与窗口） */
  hasContent: boolean;
  hasForced: boolean;
  width: number;
  height: number;
  bounds: SupBounds | null;
  objects: SupEventObject[];
  windows: SupWindowDefinition[];
}

export interface SupMetadata {
  fileSize: number;
  width: number;
  height: number;
  frameRateCode: number;
  frameRate: number;
  durationSeconds: number;
  /** 所有 display set 数量（含无内容的状态更新） */
  displaySetCount: number;
  /** 带 PCS 的 display set 数量 */
  compositionCount: number;
  /** 能显示内容的事件数量 */
  contentEventCount: number;
  objectDefinitionCount: number;
  paletteDefinitionCount: number;
  windowDefinitionCount: number;
  firstPts: number;
  lastPts: number;
  /** PCS 时间戳缺失（部分工具生成的文件会出现），预览时间轴可能不可信 */
  pcsTimestampsMissing: boolean;
  segmentCounts: SupSegmentCounts;
  issues: SupParseIssue[];
}

export interface SupParseResult {
  metadata: SupMetadata;
  displaySets: SupDisplaySet[];
  events: SupEvent[];
}
