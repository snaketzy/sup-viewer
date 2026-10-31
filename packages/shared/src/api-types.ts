export type AnnotationCategory = 'timing' | 'position' | 'style' | 'text' | 'other';
export type AnnotationStatus = 'open' | 'resolved';

export interface Annotation {
  id: string;
  assetId: string;
  /** 关联的 display set 下标，可为空表示仅标记时间点 */
  eventIndex: number | null;
  /** 时间点（秒） */
  time: number;
  category: AnnotationCategory;
  status: AnnotationStatus;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAnnotationInput {
  eventIndex: number | null;
  time: number;
  category: AnnotationCategory;
  note: string;
}

export interface UpdateAnnotationInput {
  category?: AnnotationCategory;
  status?: AnnotationStatus;
  note?: string;
}

export interface AssetSummary {
  id: string;
  name: string;
  size: number;
  sha256: string;
  createdAt: string;
  width: number;
  height: number;
  frameRate: number;
  durationSeconds: number;
  contentEventCount: number;
  pcsTimestampsMissing: boolean;
  annotationCount: number;
}

export interface AssetDetail extends AssetSummary {
  metadata: import('./sup/types').SupMetadata;
  events: import('./sup/types').SupEvent[];
}
