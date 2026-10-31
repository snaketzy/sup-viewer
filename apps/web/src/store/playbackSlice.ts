import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface PlaybackState {
  /** 当前播放时间（秒），由引擎以约 4Hz 节流同步到 store */
  time: number;
  playing: boolean;
  rate: number;
  loop: boolean;
}

const initialState: PlaybackState = {
  time: 0,
  playing: false,
  rate: 1,
  loop: false,
};

const playbackSlice = createSlice({
  name: 'playback',
  initialState,
  reducers: {
    timeChanged(state, action: PayloadAction<number>) {
      state.time = action.payload;
    },
    playingChanged(state, action: PayloadAction<boolean>) {
      state.playing = action.payload;
    },
    playingToggled(state) {
      state.playing = !state.playing;
    },
    rateChanged(state, action: PayloadAction<number>) {
      state.rate = action.payload;
    },
    loopToggled(state) {
      state.loop = !state.loop;
    },
    playbackReset() {
      return initialState;
    },
  },
});

export const {
  timeChanged,
  playingChanged,
  playingToggled,
  rateChanged,
  loopToggled,
  playbackReset,
} = playbackSlice.actions;

export default playbackSlice.reducer;
