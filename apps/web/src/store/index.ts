import { configureStore } from '@reduxjs/toolkit';

import assetsReducer from './assetsSlice';
import documentReducer from './documentSlice';
import playbackReducer from './playbackSlice';
import viewerReducer from './viewerSlice';

export const store = configureStore({
  reducer: {
    document: documentReducer,
    playback: playbackReducer,
    viewer: viewerReducer,
    assets: assetsReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
