import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SupEvent } from '@sup-viewer/shared';
import { formatTimecode } from '@sup-viewer/shared';
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { IconTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { eventHovered, eventSelected } from '@/store/viewerSlice';

import { findEventIndexAt } from './event-lookup';

interface Props {
  events: SupEvent[];
  duration: number;
  selectedEventIndex: number | null;
  onSeek: (seconds: number) => void;
}

const TRACK_HEIGHT = 62;
const ZOOM_STEP = 1.8;
const MIN_WINDOW_SECONDS = 0.4;

const STATE_COLORS: Record<number, string> = {
  0: '#5b6b7f',
  1: '#a78bfa',
  2: '#22d3ee',
  3: '#34d399',
};

export function Timeline({ events, duration, selectedEventIndex, onSeek }: Props) {
  const dispatch = useAppDispatch();
  const time = useAppSelector((state) => state.playback.time);
  const hoveredIndex = useAppSelector((state) => state.viewer.hoveredEventIndex);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: TRACK_HEIGHT });
  const [windowSeconds, setWindowSeconds] = useState<number | null>(null);
  const [cursor, setCursor] = useState<{ x: number; time: number } | null>(null);
  const scrubbingRef = useRef(false);

  const total = duration > 0 ? duration : events.at(-1)?.startSeconds ?? 0;

  /**
   * 可视窗口：null 表示铺满整个时长。放大后窗口跟随播放头平移，
   * 这样密集的字幕轨道才有可读性。
   */
  const view = useMemo(() => {
    if (windowSeconds === null || total <= 0) {
      return { start: 0, seconds: total > 0 ? total : 1 };
    }
    const seconds = Math.min(windowSeconds, total);
    const half = seconds / 2;
    const start = Math.max(0, Math.min(time - half, Math.max(0, total - seconds)));
    return { start, seconds };
  }, [windowSeconds, total, time]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: TRACK_HEIGHT });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // 重绘静态轨道：事件、尺寸、窗口、选中态变化时触发
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(size.width * dpr);
    canvas.height = Math.floor(size.height * dpr);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTrack(context, {
      events,
      size,
      view,
      selectedEventIndex,
      hoveredIndex,
    });
  }, [events, size, view, selectedEventIndex, hoveredIndex]);

  const timeToRatio = useCallback(
    (seconds: number) => (seconds - view.start) / view.seconds,
    [view],
  );

  const pointerToTime = useCallback(
    (clientX: number) => {
      const element = containerRef.current;
      if (!element) return 0;
      const rect = element.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      return Math.max(0, Math.min(view.start + ratio * view.seconds, total));
    },
    [view, total],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    scrubbingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    onSeek(pointerToTime(event.clientX));
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const seconds = pointerToTime(event.clientX);
    const rect = event.currentTarget.getBoundingClientRect();
    setCursor({ x: event.clientX - rect.left, time: seconds });
    const index = findEventIndexAt(events, seconds);
    if (index !== hoveredIndex) dispatch(eventHovered(index));
    if (scrubbingRef.current) onSeek(seconds);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    scrubbingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePointerLeave = () => {
    scrubbingRef.current = false;
    setCursor(null);
    dispatch(eventHovered(null));
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const seconds = pointerToTime(event.clientX);
    const index = findEventIndexAt(events, seconds);
    if (index !== null) dispatch(eventSelected(index));
  };

  const zoomBy = (factor: number) => {
    if (total <= 0) return;
    setWindowSeconds((current) => {
      const base = current ?? total;
      return Math.max(MIN_WINDOW_SECONDS, Math.min(base * factor, total));
    });
  };

  // React 的 onWheel 是 passive 监听，无法 preventDefault，这里手动绑定原生监听
  const totalRef = useRef(total);
  totalRef.current = total;
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const onWheel = (event: WheelEvent) => {
      if (totalRef.current <= 0) return;
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
      setWindowSeconds((current) => {
        const base = current ?? totalRef.current;
        return Math.max(MIN_WINDOW_SECONDS, Math.min(base * factor, totalRef.current));
      });
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  const zoomed = windowSeconds !== null && windowSeconds < total - 1e-6;
  const playheadRatio = timeToRatio(time);
  const showPlayhead = playheadRatio >= 0 && playheadRatio <= 1;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <div
        ref={containerRef}
        className="relative h-[62px] min-w-0 flex-1 cursor-crosshair select-none overflow-hidden rounded-lg border border-white/10 bg-black/40"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
      >
        <canvas
          ref={canvasRef}
          style={{ width: size.width, height: TRACK_HEIGHT }}
          className="block"
        />

        {showPlayhead && (
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]"
            style={{
              left: `${playheadRatio * 100}%`,
              transition: scrubbingRef.current ? 'none' : 'left 240ms linear',
            }}
          >
            <div className="absolute -top-0 -left-[3px] size-[7px] rounded-full bg-white" />
          </div>
        )}

        {cursor && (
          <>
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-white/30"
              style={{ left: cursor.x }}
            />
            <div
              className="pointer-events-none absolute bottom-1 z-30 -translate-x-1/2 rounded bg-black/85 px-1.5 py-0.5 font-mono text-[11px] text-white/90 ring-1 ring-white/15"
              style={{ left: cursor.x }}
            >
              {formatTimecode(cursor.time)}
            </div>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <IconTooltip label="放大时间轴">
          <Button variant="ghost" size="icon-sm" onClick={() => zoomBy(1 / ZOOM_STEP)}>
            <ZoomIn />
          </Button>
        </IconTooltip>
        <IconTooltip label="缩小时间轴">
          <Button variant="ghost" size="icon-sm" onClick={() => zoomBy(ZOOM_STEP)}>
            <ZoomOut />
          </Button>
        </IconTooltip>
        <IconTooltip label="铺满整个时长">
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn(zoomed && 'text-foreground')}
            onClick={() => setWindowSeconds(null)}
          >
            <Maximize2 />
          </Button>
        </IconTooltip>
      </div>
    </div>
  );
}

interface DrawOptions {
  events: SupEvent[];
  size: { width: number; height: number };
  view: { start: number; seconds: number };
  selectedEventIndex: number | null;
  hoveredIndex: number | null;
}

function drawTrack(context: CanvasRenderingContext2D, options: DrawOptions): void {
  const { events, size, view, selectedEventIndex, hoveredIndex } = options;
  const { width, height } = size;

  context.clearRect(0, 0, width, height);
  context.fillStyle = '#0b0b0d';
  context.fillRect(0, 0, width, height);

  // 时间刻度
  const tickStep = pickTickStep(view.seconds);
  context.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
  context.textBaseline = 'bottom';
  const firstTick = Math.ceil(view.start / tickStep) * tickStep;
  for (let t = firstTick; t <= view.start + view.seconds; t += tickStep) {
    const x = ((t - view.start) / view.seconds) * width;
    context.fillStyle = 'rgba(255,255,255,0.07)';
    context.fillRect(Math.round(x), 0, 1, height);
    context.fillStyle = 'rgba(255,255,255,0.32)';
    context.fillText(formatTimecode(t, false), Math.round(x) + 3, height - 3);
  }

  const trackTop = 8;
  const trackHeight = height - 26;
  const toX = (seconds: number) => ((seconds - view.start) / view.seconds) * width;

  for (const event of events) {
    const start = event.startSeconds;
    const end = event.endSeconds ?? view.start + view.seconds;
    if (end < view.start || start > view.start + view.seconds) continue;

    const x0 = Math.max(0, toX(start));
    const x1 = Math.min(width, Math.max(toX(end), x0 + 1.5));
    const isSelected = event.index === selectedEventIndex;
    const isHovered = event.index === hoveredIndex;

    if (event.hasContent) {
      context.fillStyle = STATE_COLORS[event.stateType] ?? '#22d3ee';
      context.globalAlpha = isSelected ? 1 : isHovered ? 0.95 : 0.78;
      context.fillRect(x0, trackTop, x1 - x0, trackHeight);
      context.globalAlpha = 1;

      if (event.hasForced) {
        context.fillStyle = '#fbbf24';
        context.fillRect(x0, trackTop, x1 - x0, 2.5);
      }
      if (isSelected || isHovered) {
        context.strokeStyle = '#ffffff';
        context.lineWidth = isSelected ? 1.5 : 1;
        context.strokeRect(x0 + 0.5, trackTop + 0.5, Math.max(0, x1 - x0 - 1), trackHeight - 1);
      }
    } else {
      // 无内容的 display set：只是一次状态/调色板更新
      context.fillStyle = 'rgba(148,163,184,0.35)';
      context.fillRect(x0, trackTop + trackHeight - 3, Math.max(1.5, x1 - x0), 3);
    }
  }

  context.strokeStyle = 'rgba(255,255,255,0.08)';
  context.lineWidth = 1;
  context.strokeRect(0.5, trackTop - 0.5, width - 1, trackHeight + 1);
}

function pickTickStep(seconds: number): number {
  const candidates = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800];
  const target = seconds / 8;
  return candidates.find((value) => value >= target) ?? candidates.at(-1) ?? 60;
}
