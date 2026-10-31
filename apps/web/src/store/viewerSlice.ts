import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export const BACKGROUNDS = ['checkerboard', 'black', 'white', 'green'] as const;
export type BackgroundMode = (typeof BACKGROUNDS)[number];

export const FIT_MODES = ['contain', 'native'] as const;
export type FitMode = (typeof FIT_MODES)[number];

export const RENDERER_MODES = ['workerWithoutOffscreenCanvas', 'worker', 'mainThread'] as const;
export type RendererMode = (typeof RENDERER_MODES)[number];

export interface ViewerState {
  background: BackgroundMode;
  fit: FitMode;
  showSafeArea: boolean;
  showBounds: boolean;
  showWindows: boolean;
  rendererMode: RendererMode;
  /** 当前选中的事件在 events 数组中的下标 */
  selectedEventIndex: number | null;
  /** 时间轴 / 列表中被悬停的事件下标 */
  hoveredEventIndex: number | null;
  /** 时间轴缩放：可视时间窗口，单位为秒；null 表示铺满时长 */
  timelineWindow: number | null;
}

const initialState: ViewerState = {
  background: 'checkerboard',
  fit: 'contain',
  showSafeArea: false,
  showBounds: true,
  showWindows: false,
  rendererMode: 'workerWithoutOffscreenCanvas',
  selectedEventIndex: null,
  hoveredEventIndex: null,
  timelineWindow: null,
};

const viewerSlice = createSlice({
  name: 'viewer',
  initialState,
  reducers: {
    backgroundChanged(state, action: PayloadAction<BackgroundMode>) {
      state.background = action.payload;
    },
    fitChanged(state, action: PayloadAction<FitMode>) {
      state.fit = action.payload;
    },
    safeAreaToggled(state) {
      state.showSafeArea = !state.showSafeArea;
    },
    boundsToggled(state) {
      state.showBounds = !state.showBounds;
    },
    windowsToggled(state) {
      state.showWindows = !state.showWindows;
    },
    rendererModeChanged(state, action: PayloadAction<RendererMode>) {
      state.rendererMode = action.payload;
    },
    eventSelected(state, action: PayloadAction<number | null>) {
      state.selectedEventIndex = action.payload;
    },
    eventHovered(state, action: PayloadAction<number | null>) {
      state.hoveredEventIndex = action.payload;
    },
    timelineWindowChanged(state, action: PayloadAction<number | null>) {
      state.timelineWindow = action.payload;
    },
  },
});

export const {
  backgroundChanged,
  fitChanged,
  safeAreaToggled,
  boundsToggled,
  windowsToggled,
  rendererModeChanged,
  eventSelected,
  eventHovered,
  timelineWindowChanged,
} = viewerSlice.actions;

export default viewerSlice.reducer;
