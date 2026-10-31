import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type {
  Annotation,
  AssetSummary,
  CreateAnnotationInput,
  UpdateAnnotationInput,
} from '@sup-viewer/shared';

import * as api from '@/lib/api';

export type AsyncStatus = 'idle' | 'loading' | 'ready' | 'error';

export const fetchAssets = createAsyncThunk<AssetSummary[]>('assets/fetch', () => api.listAssets());

export const removeAsset = createAsyncThunk<string, string>('assets/remove', async (assetId) => {
  await api.deleteAsset(assetId);
  return assetId;
});

export const fetchAnnotations = createAsyncThunk<Annotation[], string>(
  'annotations/fetch',
  (assetId) => api.listAnnotations(assetId),
);

export const addAnnotation = createAsyncThunk<
  Annotation,
  { assetId: string; input: CreateAnnotationInput }
>('annotations/add', ({ assetId, input }) => api.createAnnotation(assetId, input));

export const patchAnnotation = createAsyncThunk<
  Annotation,
  { annotationId: string; input: UpdateAnnotationInput }
>('annotations/patch', ({ annotationId, input }) => api.updateAnnotation(annotationId, input));

export const removeAnnotation = createAsyncThunk<string, string>(
  'annotations/remove',
  async (annotationId) => {
    await api.deleteAnnotation(annotationId);
    return annotationId;
  },
);

export interface AssetsState {
  items: AssetSummary[];
  listStatus: AsyncStatus;
  listError: string | null;
  annotations: Annotation[];
  annotationStatus: AsyncStatus;
  annotationError: string | null;
}

const initialState: AssetsState = {
  items: [],
  listStatus: 'idle',
  listError: null,
  annotations: [],
  annotationStatus: 'idle',
  annotationError: null,
};

const assetsSlice = createSlice({
  name: 'assets',
  initialState,
  reducers: {
    annotationsCleared(state) {
      state.annotations = [];
      state.annotationStatus = 'idle';
      state.annotationError = null;
    },
    assetListed(state, action: PayloadAction<AssetSummary>) {
      state.items = [action.payload, ...state.items.filter((item) => item.id !== action.payload.id)];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAssets.pending, (state) => {
        state.listStatus = 'loading';
        state.listError = null;
      })
      .addCase(fetchAssets.fulfilled, (state, action) => {
        state.listStatus = 'ready';
        state.items = action.payload;
      })
      .addCase(fetchAssets.rejected, (state, action) => {
        state.listStatus = 'error';
        state.listError = action.error.message ?? '无法读取资产库';
      })
      .addCase(removeAsset.fulfilled, (state, action) => {
        state.items = state.items.filter((item) => item.id !== action.payload);
      })
      .addCase(fetchAnnotations.pending, (state) => {
        state.annotationStatus = 'loading';
        state.annotationError = null;
      })
      .addCase(fetchAnnotations.fulfilled, (state, action) => {
        state.annotationStatus = 'ready';
        state.annotations = action.payload;
      })
      .addCase(fetchAnnotations.rejected, (state, action) => {
        state.annotationStatus = 'error';
        state.annotationError = action.error.message ?? '无法读取标注';
      })
      .addCase(addAnnotation.fulfilled, (state, action) => {
        state.annotations.push(action.payload);
        state.annotationStatus = 'ready';
      })
      .addCase(addAnnotation.rejected, (state, action) => {
        state.annotationError = action.error.message ?? '新增标注失败';
      })
      .addCase(patchAnnotation.fulfilled, (state, action) => {
        state.annotations = state.annotations.map((item) =>
          item.id === action.payload.id ? action.payload : item,
        );
      })
      .addCase(removeAnnotation.fulfilled, (state, action) => {
        state.annotations = state.annotations.filter((item) => item.id !== action.payload);
      });
  },
});

export const { annotationsCleared, assetListed } = assetsSlice.actions;

export default assetsSlice.reducer;
