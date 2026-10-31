import { useEffect, useRef, useState } from 'react';
import type { SupEvent, SupMetadata } from '@sup-viewer/shared';
import { formatTimecode } from '@sup-viewer/shared';

import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';

const STAGE_PADDING = 24;

const BACKGROUND_CLASS: Record<string, string> = {
  checkerboard: 'bg-checkerboard',
  black: 'bg-black',
  white: 'bg-white',
  green: 'bg-[#00b140]',
};

interface Props {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  metadata: SupMetadata | null;
  selectedEvent: SupEvent | null;
  /** 覆盖在舞台上的空状态 / 提示层 */
  overlay?: React.ReactNode;
}

export function ViewerStage({ canvasRef, metadata, selectedEvent, overlay }: Props) {
  const background = useAppSelector((state) => state.viewer.background);
  const fit = useAppSelector((state) => state.viewer.fit);
  const showSafeArea = useAppSelector((state) => state.viewer.showSafeArea);
  const showBounds = useAppSelector((state) => state.viewer.showBounds);
  const showWindows = useAppSelector((state) => state.viewer.showWindows);

  const containerRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setAvailable({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const frameWidth = metadata?.width ?? 1920;
  const frameHeight = metadata?.height ?? 1080;
  const aspect = frameWidth / frameHeight;

  const inner = {
    width: Math.max(0, available.width - STAGE_PADDING * 2),
    height: Math.max(0, available.height - STAGE_PADDING * 2),
  };

  const fitted = (() => {
    if (fit === 'native') return { width: frameWidth, height: frameHeight };
    if (inner.width <= 0 || inner.height <= 0) return { width: 0, height: 0 };
    return inner.width / inner.height > aspect
      ? { width: inner.height * aspect, height: inner.height }
      : { width: inner.width, height: inner.width / aspect };
  })();

  const scale = fitted.width / frameWidth || 0;
  const bounds = selectedEvent?.bounds ?? null;

  const toPercent = (value: number, total: number) => `${(value / total) * 100}%`;

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-black/50"
    >
      <div
        className="relative shrink-0 shadow-2xl ring-1 ring-white/10"
        style={{ width: fitted.width, height: fitted.height }}
      >
        {/* z-0 背景层：棋盘格代表透明 */}
        <div className={cn('absolute inset-0 z-0', BACKGROUND_CLASS[background])} />

        {/* z-10 字幕画布，由 libpgs 直接绘制 */}
        <canvas ref={canvasRef} className="absolute inset-0 z-10 size-full" />

        {/* z-20 辅助线与几何叠加层 */}
        {(showSafeArea || showBounds || showWindows) && (
          <div className="pointer-events-none absolute inset-0 z-20">
            {showSafeArea && (
              <>
                <GuideRect inset={5} label="5%" />
                <GuideRect inset={10} label="10%" />
              </>
            )}

            {showWindows &&
              selectedEvent?.windows.map((window) => (
                <div
                  key={`window-${window.id}`}
                  className="absolute border border-dashed border-violet-400/70"
                  style={{
                    left: toPercent(window.x, frameWidth),
                    top: toPercent(window.y, frameHeight),
                    width: toPercent(window.width, frameWidth),
                    height: toPercent(window.height, frameHeight),
                  }}
                >
                  <span className="absolute -top-4 left-0 rounded bg-violet-500/80 px-1 text-[10px] leading-4 text-white">
                    win {window.id}
                  </span>
                </div>
              ))}

            {showBounds &&
              selectedEvent?.objects.map((object) => (
                <div
                  key={`object-${object.id}-${object.windowId}`}
                  className={cn(
                    'absolute border',
                    object.forced ? 'border-amber-400' : 'border-sky-400/80',
                  )}
                  style={{
                    left: toPercent(object.x, frameWidth),
                    top: toPercent(object.y, frameHeight),
                    width: toPercent(object.width, frameWidth),
                    height: toPercent(object.height, frameHeight),
                  }}
                >
                  <span
                    className={cn(
                      'absolute left-0 rounded px-1 text-[10px] leading-4 text-black',
                      object.forced ? 'bg-amber-400' : 'bg-sky-400',
                    )}
                  >
                    #{object.id}
                    {object.forced ? ' · forced' : ''}
                    {object.cropped ? ' · crop' : ''}
                  </span>
                </div>
              ))}

            {showBounds && bounds && (
              <div
                className="absolute border border-dashed border-white/70"
                style={{
                  left: toPercent(bounds.x, frameWidth),
                  top: toPercent(bounds.y, frameHeight),
                  width: toPercent(bounds.width, frameWidth),
                  height: toPercent(bounds.height, frameHeight),
                }}
              >
                <span className="absolute right-0 -bottom-4 rounded bg-white/85 px-1 font-mono text-[10px] leading-4 text-black">
                  {bounds.x},{bounds.y} · {bounds.width}×{bounds.height}
                </span>
              </div>
            )}
          </div>
        )}

        {/* z-30 舞台信息条 */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-center justify-between px-2 py-1.5 text-[11px] text-white/60">
          <span className="font-mono">
            {frameWidth}×{frameHeight}
            {metadata?.frameRate ? ` · ${metadata.frameRate} fps` : ''}
            {scale > 0 ? ` · ${(scale * 100).toFixed(0)}%` : ''}
          </span>
          {selectedEvent && (
            <span className="font-mono">
              #{selectedEvent.index} · {formatTimecode(selectedEvent.startSeconds)}
            </span>
          )}
        </div>
      </div>

      {overlay}
    </div>
  );
}

function GuideRect({ inset, label }: { inset: number; label: string }) {
  return (
    <div
      className="absolute border border-dashed border-white/25"
      style={{ inset: `${inset}%` }}
    >
      <span className="absolute top-1 left-1 rounded bg-black/50 px-1 text-[10px] leading-4 text-white/50">
        safe {label}
      </span>
    </div>
  );
}
