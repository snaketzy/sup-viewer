import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssetSummary } from '@sup-viewer/shared';
import { formatBytes } from '@sup-viewer/shared';
import { FolderOpen, Loader2, Upload, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IconTooltip } from '@/components/ui/tooltip';
import { AnnotationPanel } from '@/features/annotations/annotation-panel';
import { MetadataPanel } from '@/features/inspector/metadata-panel';
import { AssetLibraryPanel } from '@/features/library/asset-library-panel';
import { DropOverlay } from '@/features/viewer/drop-overlay';
import { EventList } from '@/features/viewer/event-list';
import { findEventIndexAt, stepContentEventIndex } from '@/features/viewer/event-lookup';
import { Timeline } from '@/features/viewer/timeline';
import { TransportBar } from '@/features/viewer/transport-bar';
import { ViewToolbar } from '@/features/viewer/view-toolbar';
import { ViewerStage } from '@/features/viewer/viewer-stage';
import { usePgsRendererEngine, type ViewerSource } from '@/hooks/use-pgs-renderer';
import * as api from '@/lib/api';
import { isSupFile, parseSupFile } from '@/lib/sup-source';
import { annotationsCleared, assetListed, fetchAnnotations } from '@/store/assetsSlice';
import {
  documentCleared,
  documentFailed,
  documentLoaded,
  parseStarted,
  uploadFailed,
  uploadFinished,
  uploadProgressed,
  uploadStarted,
} from '@/store/documentSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { playbackReset, playingToggled } from '@/store/playbackSlice';
import { eventHovered, eventSelected, timelineWindowChanged } from '@/store/viewerSlice';

type TabValue = 'events' | 'metadata' | 'annotations' | 'library';

export default function App() {
  const dispatch = useAppDispatch();
  const doc = useAppSelector((state) => state.document.doc);
  const status = useAppSelector((state) => state.document.status);
  const loadError = useAppSelector((state) => state.document.error);
  const pendingName = useAppSelector((state) => state.document.pendingName);
  const upload = useAppSelector((state) => state.document.upload);
  const selectedEventIndex = useAppSelector((state) => state.viewer.selectedEventIndex);
  const rendererMode = useAppSelector((state) => state.viewer.rendererMode);
  const time = useAppSelector((state) => state.playback.time);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** 当前本地文件，用于“入库”时重新上传；从资产库打开时为 null */
  const fileRef = useRef<File | null>(null);

  const [source, setSource] = useState<ViewerSource | null>(null);
  const [dragging, setDragging] = useState(false);
  const [tab, setTab] = useState<TabValue>('events');

  const events = doc?.events ?? [];
  const duration = doc?.metadata.durationSeconds ?? 0;

  const { seek, getTime } = usePgsRendererEngine({
    canvasRef,
    source,
    mode: rendererMode,
    aspectRatio: 'contain',
    duration,
  });

  const resetView = useCallback(() => {
    dispatch(playbackReset());
    dispatch(eventSelected(null));
    dispatch(eventHovered(null));
    dispatch(timelineWindowChanged(null));
    dispatch(annotationsCleared());
  }, [dispatch]);

  const loadFile = useCallback(
    async (file: File) => {
      if (!isSupFile(file)) {
        dispatch(documentFailed('只支持 .sup / .pgs 文件'));
        return;
      }
      dispatch(parseStarted(file.name));
      try {
        const { parsed, buffer } = await parseSupFile(file);
        resetView();
        fileRef.current = file;
        dispatch(
          documentLoaded({
            name: parsed.name,
            size: parsed.size,
            metadata: parsed.metadata,
            events: parsed.events,
            assetId: null,
          }),
        );
        setSource({ kind: 'buffer', buffer });
        setTab('events');
      } catch (cause) {
        fileRef.current = null;
        setSource(null);
        dispatch(documentFailed(cause instanceof Error ? cause.message : String(cause)));
      }
    },
    [dispatch, resetView],
  );

  const openAsset = useCallback(
    async (asset: AssetSummary) => {
      dispatch(parseStarted(asset.name));
      try {
        const detail = await api.getAsset(asset.id);
        resetView();
        fileRef.current = null;
        dispatch(
          documentLoaded({
            name: detail.name,
            size: detail.size,
            metadata: detail.metadata,
            events: detail.events,
            assetId: detail.id,
          }),
        );
        setSource({ kind: 'url', url: api.assetFileUrl(detail.id) });
        dispatch(fetchAnnotations(detail.id));
        setTab('events');
      } catch (cause) {
        setSource(null);
        dispatch(documentFailed(cause instanceof Error ? cause.message : String(cause)));
      }
    },
    [dispatch, resetView],
  );

  const clearDocument = useCallback(() => {
    dispatch(documentCleared());
    resetView();
    fileRef.current = null;
    setSource(null);
  }, [dispatch, resetView]);

  const uploadCurrent = useCallback(async () => {
    const file = fileRef.current;
    if (!file) return;
    dispatch(uploadStarted());
    try {
      const detail = await api.uploadAssetFile(file, (percent) => {
        dispatch(uploadProgressed(percent));
      });
      dispatch(uploadFinished(detail.id));
      dispatch(assetListed(detail));
      dispatch(fetchAnnotations(detail.id));
    } catch (cause) {
      dispatch(uploadFailed(cause instanceof Error ? cause.message : String(cause)));
    }
  }, [dispatch]);

  const step = useCallback(
    (direction: 1 | -1) => {
      const index = stepContentEventIndex(events, getTime(), direction);
      if (index === null) return;
      dispatch(eventSelected(index));
      seek(events[index].startSeconds);
    },
    [dispatch, events, getTime, seek],
  );

  const selectEvent = useCallback(
    (index: number) => {
      const event = events[index];
      if (!event) return;
      dispatch(eventSelected(index));
      seek(event.startSeconds);
    },
    [dispatch, events, seek],
  );

  // 未手动选中时，跟随播放头显示当前帧的几何信息
  const liveIndex = findEventIndexAt(events, time);
  const activeIndex = selectedEventIndex ?? liveIndex;
  const activeEvent = activeIndex === null ? null : (events[activeIndex] ?? null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      if (!doc) return;

      if (event.code === 'Space') {
        event.preventDefault();
        dispatch(playingToggled());
      } else if (event.key === ',') {
        step(-1);
      } else if (event.key === '.') {
        step(1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        seek(getTime() - (event.shiftKey ? 5 : 1));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        seek(getTime() + (event.shiftKey ? 5 : 1));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch, doc, getTime, seek, step]);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void loadFile(file);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    if (!dragging) setDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    // 只有真正离开窗口时才收起高亮，避免掠过子元素时闪烁
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragging(false);
  };

  return (
    <div
      className="flex h-full flex-col"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-4">
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-semibold tracking-wide">SUP 预览器</span>
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            PGS
          </Badge>
        </div>

        <div className="min-w-0 flex-1">
          {doc ? (
            <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate font-mono text-foreground" title={doc.name}>
                {doc.name}
              </span>
              <span className="shrink-0">{formatBytes(doc.size)}</span>
              {doc.assetId && (
                <Badge variant="success" className="px-1.5 py-0 text-[10px]">
                  已入库
                </Badge>
              )}
            </div>
          ) : status === 'parsing' ? (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              正在解析 {pendingName}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">拖入 .sup 文件开始预览</span>
          )}
        </div>

        {upload.status === 'uploading' && (
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            上传 {upload.progress}%
          </span>
        )}
        {upload.status === 'error' && upload.error && (
          <span className="shrink-0 text-xs text-destructive">{upload.error}</span>
        )}

        <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
          <FolderOpen />
          打开文件
        </Button>

        {doc && !doc.assetId && (
          <IconTooltip label="保存到资产库后即可添加标注">
            <Button
              variant="outline"
              size="sm"
              disabled={upload.status === 'uploading'}
              onClick={() => void uploadCurrent()}
            >
              <Upload />
              入库
            </Button>
          </IconTooltip>
        )}

        {doc && (
          <IconTooltip label="关闭当前文件">
            <Button variant="ghost" size="icon-sm" onClick={clearDocument}>
              <X />
            </Button>
          </IconTooltip>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".sup,.pgs"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void loadFile(file);
          }}
        />
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <ViewToolbar canvasRef={canvasRef} />

          <ViewerStage
            canvasRef={canvasRef}
            metadata={doc?.metadata ?? null}
            selectedEvent={activeEvent}
            overlay={
              <DropOverlay
                visible={!doc || dragging}
                dragging={dragging}
                status={status}
                error={loadError}
                onPick={() => inputRef.current?.click()}
              />
            }
          />

          <div className="flex shrink-0 flex-col gap-1 border-t border-white/10 px-4 pt-3 pb-2">
            <Timeline
              events={events}
              duration={duration}
              selectedEventIndex={activeIndex}
              onSeek={seek}
            />
            <TransportBar disabled={!doc} duration={duration} onStep={step} />
          </div>
        </main>

        <aside className="flex w-[380px] shrink-0 flex-col border-l border-white/10 p-3">
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as TabValue)}
            className="min-h-0 flex-1"
          >
            <TabsList className="w-full shrink-0">
              <TabsTrigger value="events">事件</TabsTrigger>
              <TabsTrigger value="metadata">元数据</TabsTrigger>
              <TabsTrigger value="annotations">标注</TabsTrigger>
              <TabsTrigger value="library">资产库</TabsTrigger>
            </TabsList>

            <TabsContent value="events" className="flex min-h-0 flex-1 flex-col">
              {doc ? (
                <EventList events={events} onSelect={selectEvent} />
              ) : (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  尚未载入文件
                </p>
              )}
            </TabsContent>

            <TabsContent value="metadata" className="flex min-h-0 flex-1 flex-col">
              <MetadataPanel doc={doc} />
            </TabsContent>

            <TabsContent value="annotations" className="flex min-h-0 flex-1 flex-col">
              <AnnotationPanel
                doc={doc}
                activeDisplaySetIndex={activeEvent?.index ?? null}
                uploading={upload.status === 'uploading'}
                onUpload={() => void uploadCurrent()}
                onSeek={seek}
              />
            </TabsContent>

            <TabsContent value="library" className="flex min-h-0 flex-1 flex-col">
              <AssetLibraryPanel
                activeAssetId={doc?.assetId ?? null}
                onOpen={(asset) => void openAsset(asset)}
              />
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}
