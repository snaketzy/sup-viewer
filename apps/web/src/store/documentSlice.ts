import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { SupEvent, SupMetadata } from '@sup-viewer/shared';

/** 当前载入的 .sup 预览文档（本地文件或服务端资产） */
export interface ViewerDocument {
  name: string;
  size: number;
  metadata: SupMetadata;
  events: SupEvent[];
  /** 服务端资产 id；纯本地预览时为 null */
  assetId: string | null;
}

export type LoadStatus = 'idle' | 'parsing' | 'ready' | 'error';
export type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';

export interface DocumentState {
  doc: ViewerDocument | null;
  status: LoadStatus;
  error: string | null;
  /** 正在解析的文件名，仅在 status === 'parsing' 时有意义 */
  pendingName: string | null;
  upload: {
    status: UploadStatus;
    progress: number;
    error: string | null;
  };
}

const initialState: DocumentState = {
  doc: null,
  status: 'idle',
  error: null,
  pendingName: null,
  upload: { status: 'idle', progress: 0, error: null },
};

const documentSlice = createSlice({
  name: 'document',
  initialState,
  reducers: {
    parseStarted(state, action: PayloadAction<string>) {
      state.status = 'parsing';
      state.error = null;
      state.pendingName = action.payload;
      state.upload = { status: 'idle', progress: 0, error: null };
    },
    documentLoaded(state, action: PayloadAction<ViewerDocument>) {
      state.status = 'ready';
      state.error = null;
      state.pendingName = null;
      state.doc = action.payload;
    },
    documentFailed(state, action: PayloadAction<string>) {
      state.status = 'error';
      state.error = action.payload;
      state.pendingName = null;
      state.doc = null;
    },
    documentCleared() {
      return initialState;
    },
    uploadStarted(state) {
      state.upload = { status: 'uploading', progress: 0, error: null };
    },
    uploadProgressed(state, action: PayloadAction<number>) {
      state.upload.progress = action.payload;
    },
    uploadFinished(state, action: PayloadAction<string>) {
      state.upload = { status: 'done', progress: 100, error: null };
      if (state.doc) state.doc.assetId = action.payload;
    },
    uploadFailed(state, action: PayloadAction<string>) {
      state.upload = { status: 'error', progress: 0, error: action.payload };
    },
  },
});

export const {
  parseStarted,
  documentLoaded,
  documentFailed,
  documentCleared,
  uploadStarted,
  uploadProgressed,
  uploadFinished,
  uploadFailed,
} = documentSlice.actions;

export default documentSlice.reducer;
