import { PgsRenderer } from 'libpgs';
import type { PgsRendererOptions } from 'libpgs/dist/pgsRendererOptions';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { RendererMode } from '@/store/viewerSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { playingChanged, timeChanged } from '@/store/playbackSlice';

/** 由 scripts/copy-libpgs-worker.mjs 拷贝到 public/ 下 */
const WORKER_URL = `${import.meta.env.BASE_URL}libpgs.worker.js`;

/** store 里的时间只用于驱动 UI，播放时钟本身跑在 ref + rAF 上 */
const SYNC_INTERVAL_MS = 250;

export type ViewerSource = { kind: 'buffer'; buffer: ArrayBuffer } | { kind: 'url'; url: string };

export type AspectRatioMode = 'contain' | 'cover' | 'fill';

interface Params {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  source: ViewerSource | null;
  mode: RendererMode;
  aspectRatio: AspectRatioMode;
  duration: number;
}

export interface PgsEngine {
  ready: boolean;
  error: string | null;
  seek: (seconds: number) => void;
  /** 读取当前播放时间，不触发重渲染 */
  getTime: () => number;
}

/**
 * 把 libpgs 渲染器接到我们自己的 canvas 上。
 * 不创建 <video>：播放时钟由 requestAnimationFrame 驱动，直接调用 renderAtTimestamp。
 */
export function usePgsRendererEngine({
  canvasRef,
  source,
  mode,
  aspectRatio,
  duration,
}: Params): PgsEngine {
  const dispatch = useAppDispatch();
  const playing = useAppSelector((state) => state.playback.playing);
  const rate = useAppSelector((state) => state.playback.rate);
  const loop = useAppSelector((state) => state.playback.loop);

  const rendererRef = useRef<PgsRenderer | null>(null);
  const timeRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 播放循环里读取的实时参数，避免这些值变化时重建 rAF 循环
  const runtimeRef = useRef({ duration, rate, loop });
  runtimeRef.current = { duration, rate, loop };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return undefined;

    let disposed = false;
    setReady(false);
    setError(null);
    timeRef.current = 0;

    const options: PgsRendererOptions = { canvas, aspectRatio, workerUrl: WORKER_URL };
    options.mode = mode as unknown as PgsRendererOptions['mode'];

    const renderer = new PgsRenderer(options);
    rendererRef.current = renderer;

    const loading = source.kind === 'buffer'
      ? renderer.loadFromBuffer(source.buffer)
      : renderer.loadFromUrl(source.url);

    loading
      .then(() => {
        if (disposed) return;
        setReady(true);
        // libpgs 在“时间戳索引未变化”时会跳过渲染，而它的初始索引就是 0。
        // 先用一个无效索引把内部状态推出初始值，保证第 0 条事件能被画出来。
        renderer.renderAtTimestamp(-1);
        renderer.renderAtTimestamp(0);
        dispatch(timeChanged(0));
      })
      .catch((cause: unknown) => {
        if (disposed) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      });

    return () => {
      disposed = true;
      rendererRef.current = null;
      renderer.dispose();
    };
    // aspectRatio 通过属性单独同步，见下方 effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef, source, mode, dispatch]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (renderer) renderer.aspectRatio = aspectRatio;
  }, [aspectRatio, ready]);

  useEffect(() => {
    if (!playing) return undefined;

    let frame = 0;
    let last = performance.now();
    let lastSync = last;

    const tick = (now: number) => {
      const delta = Math.max(0, (now - last) / 1000);
      last = now;

      const { duration: total, rate: speed, loop: repeat } = runtimeRef.current;
      let next = timeRef.current + delta * speed;

      if (total > 0 && next >= total) {
        if (repeat) {
          next %= total;
        } else {
          next = total;
          dispatch(playingChanged(false));
        }
      }

      timeRef.current = next;
      rendererRef.current?.renderAtTimestamp(next);

      if (now - lastSync >= SYNC_INTERVAL_MS) {
        lastSync = now;
        dispatch(timeChanged(next));
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, dispatch]);

  const seek = useCallback(
    (seconds: number) => {
      const total = runtimeRef.current.duration;
      const clamped = seconds < 0 ? 0 : total > 0 ? Math.min(seconds, total) : seconds;
      timeRef.current = clamped;
      rendererRef.current?.renderAtTimestamp(clamped);
      dispatch(timeChanged(clamped));
    },
    [dispatch],
  );

  const getTime = useCallback(() => timeRef.current, []);

  return { ready, error, seek, getTime };
}
