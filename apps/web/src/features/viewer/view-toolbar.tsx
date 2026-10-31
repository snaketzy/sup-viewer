import { Download, FileJson } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';

import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { IconTooltip } from '@/components/ui/tooltip';
import { exportFrameAsPng, exportProjectAsJson } from '@/lib/exporter';
import { cn } from '@/lib/utils';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  BACKGROUNDS,
  FIT_MODES,
  RENDERER_MODES,
  backgroundChanged,
  boundsToggled,
  fitChanged,
  rendererModeChanged,
  safeAreaToggled,
  windowsToggled,
  type BackgroundMode,
  type FitMode,
  type RendererMode,
} from '@/store/viewerSlice';

const BACKGROUND_LABELS: Record<BackgroundMode, string> = {
  checkerboard: '棋盘',
  black: '黑',
  white: '白',
  green: '绿',
};

const FIT_LABELS: Record<FitMode, string> = {
  contain: '适配窗口',
  native: '原始像素',
};

const RENDERER_LABELS: Record<RendererMode, string> = {
  workerWithoutOffscreenCanvas: 'Worker',
  worker: 'Worker + OC',
  mainThread: '主线程',
};

const RENDERER_HINTS: Record<RendererMode, string> = {
  workerWithoutOffscreenCanvas: '在 Web Worker 里解码，用 ImageBitmap 回传（兼容性最好）',
  worker: '在 Web Worker 里配合 OffscreenCanvas 直接绘制（最快）',
  mainThread: '在主线程解码绘制，便于断点调试',
};

interface Props {
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

export function ViewToolbar({ canvasRef }: Props) {
  const dispatch = useAppDispatch();
  const background = useAppSelector((state) => state.viewer.background);
  const fit = useAppSelector((state) => state.viewer.fit);
  const rendererMode = useAppSelector((state) => state.viewer.rendererMode);
  const showSafeArea = useAppSelector((state) => state.viewer.showSafeArea);
  const showBounds = useAppSelector((state) => state.viewer.showBounds);
  const showWindows = useAppSelector((state) => state.viewer.showWindows);
  const doc = useAppSelector((state) => state.document.doc);
  const annotations = useAppSelector((state) => state.assets.annotations);

  const disabled = !doc;

  const handleExportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas || !doc) return;
    exportFrameAsPng(canvas, background, doc.name);
  };

  const handleExportJson = () => {
    if (!doc) return;
    exportProjectAsJson(
      {
        file: doc.name,
        exportedAt: new Date().toISOString(),
        metadata: doc.metadata,
        events: doc.events,
        annotations,
      },
      doc.name,
    );
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/10 px-4 py-2">
      <ToggleGroup
        type="single"
        size="sm"
        value={background}
        disabled={disabled}
        onValueChange={(value) => value && dispatch(backgroundChanged(value as BackgroundMode))}
      >
        {BACKGROUNDS.map((value) => (
          <ToggleGroupItem key={value} value={value} size="sm">
            {BACKGROUND_LABELS[value]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <ToggleGroup
        type="single"
        size="sm"
        value={fit}
        disabled={disabled}
        onValueChange={(value) => value && dispatch(fitChanged(value as FitMode))}
      >
        {FIT_MODES.map((value) => (
          <ToggleGroupItem key={value} value={value} size="sm">
            {FIT_LABELS[value]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="flex items-center gap-1 rounded-lg bg-muted/60 p-1">
        <ToggleChip active={showSafeArea} onClick={() => dispatch(safeAreaToggled())}>
          安全区
        </ToggleChip>
        <ToggleChip active={showBounds} onClick={() => dispatch(boundsToggled())}>
          对象框
        </ToggleChip>
        <ToggleChip active={showWindows} onClick={() => dispatch(windowsToggled())}>
          窗口
        </ToggleChip>
      </div>

      <div className="flex flex-1 items-center justify-end gap-2">
        <span className="text-[11px] text-muted-foreground">解码</span>
        <ToggleGroup
          type="single"
          size="sm"
          value={rendererMode}
          disabled={disabled}
          onValueChange={(value) => value && dispatch(rendererModeChanged(value as RendererMode))}
        >
          {RENDERER_MODES.map((value) => (
            <ToggleGroupItem key={value} value={value} size="sm" title={RENDERER_HINTS[value]}>
              {RENDERER_LABELS[value]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <IconTooltip label="导出当前帧（PNG）">
          <Button variant="ghost" size="icon-sm" disabled={disabled} onClick={handleExportPng}>
            <Download />
          </Button>
        </IconTooltip>
        <IconTooltip label="导出元数据与事件（JSON）">
          <Button variant="ghost" size="icon-sm" disabled={disabled} onClick={handleExportJson}>
            <FileJson />
          </Button>
        </IconTooltip>
      </div>
    </div>
  );
}

function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-6 rounded-md px-2 text-xs font-medium transition-colors',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
