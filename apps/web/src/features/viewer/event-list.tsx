import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { SupEvent } from '@sup-viewer/shared';
import { formatDuration, formatPts, formatTimecode } from '@sup-viewer/shared';

import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { eventHovered } from '@/store/viewerSlice';

const ROW_HEIGHT = 48;

type Filter = 'all' | 'content' | 'forced';

interface Row {
  event: SupEvent;
  /** events 数组下标 */
  index: number;
}

interface Props {
  events: SupEvent[];
  onSelect: (index: number) => void;
}

export function EventList({ events, onSelect }: Props) {
  const dispatch = useAppDispatch();
  const selectedIndex = useAppSelector((state) => state.viewer.selectedEventIndex);
  const hoveredIndex = useAppSelector((state) => state.viewer.hoveredEventIndex);
  const annotations = useAppSelector((state) => state.assets.annotations);
  const [filter, setFilter] = useState<Filter>('content');

  const scrollRef = useRef<HTMLDivElement>(null);

  const annotatedDisplaySets = useMemo(() => {
    const set = new Set<number>();
    for (const annotation of annotations) {
      if (annotation.eventIndex !== null) set.add(annotation.eventIndex);
    }
    return set;
  }, [annotations]);

  const rows = useMemo<Row[]>(() => {
    const result: Row[] = [];
    events.forEach((event, index) => {
      if (filter === 'content' && !event.hasContent) return;
      if (filter === 'forced' && !event.hasForced) return;
      result.push({ event, index });
    });
    return result;
  }, [events, filter]);

  // 虚拟滚动只需要可见行的下标
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 px-3 pb-2">
        <ToggleGroup
          type="single"
          size="sm"
          value={filter}
          onValueChange={(value) => value && setFilter(value as Filter)}
        >
          <ToggleGroupItem value="content" size="sm">
            有内容
          </ToggleGroupItem>
          <ToggleGroupItem value="forced" size="sm">
            Forced
          </ToggleGroupItem>
          <ToggleGroupItem value="all" size="sm">
            全部
          </ToggleGroupItem>
        </ToggleGroup>
        <span className="font-mono text-[11px] text-muted-foreground">
          {rows.length} / {events.length}
        </span>
      </div>

      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 border-y border-white/10 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>#index · 时间</span>
        <span>尺寸 / 位置</span>
        <span>时长</span>
      </div>

      <div ref={scrollRef} className="thin-scrollbar min-h-0 flex-1 overflow-auto">
        {rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">没有匹配的事件</p>
        ) : (
          <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              const { event } = row;
              const isSelected = row.index === selectedIndex;
              const isHovered = row.index === hoveredIndex;
              return (
                <button
                  key={item.key}
                  type="button"
                  style={{ height: item.size, transform: `translateY(${item.start}px)` }}
                  className={cn(
                    'absolute inset-x-0 top-0 flex items-center gap-3 border-l-2 px-3 text-left text-xs transition-colors',
                    isSelected
                      ? 'border-l-sky-400 bg-sky-500/10'
                      : isHovered
                        ? 'border-l-white/30 bg-white/5'
                        : 'border-l-transparent hover:bg-white/5',
                  )}
                  onMouseEnter={() => dispatch(eventHovered(row.index))}
                  onMouseLeave={() => dispatch(eventHovered(null))}
                  onClick={() => onSelect(row.index)}
                >
                  <div className="w-[104px] shrink-0">
                    <div className="font-mono text-[12px] tabular-nums text-foreground">
                      {formatTimecode(event.startSeconds)}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      dset {event.index} · {formatPts(event.pts)}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant={
                          event.stateType === 2
                            ? 'info'
                            : event.stateType === 3
                              ? 'success'
                              : event.stateType === 1
                                ? 'secondary'
                                : 'muted'
                        }
                        className="px-1.5 py-0 text-[10px]"
                      >
                        {event.stateLabel}
                      </Badge>
                      {event.hasForced && (
                        <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                          forced
                        </Badge>
                      )}
                      {event.paletteUpdate && (
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                          pal {event.paletteId}
                        </Badge>
                      )}
                      {annotatedDisplaySets.has(event.index) && (
                        <span className="size-1.5 rounded-full bg-amber-400" title="已标注" />
                      )}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                      {event.objects.length === 0
                        ? '无对象'
                        : event.objects
                            .map(
                              (object) =>
                                `#${object.id} ${object.width}×${object.height}@${object.x},${object.y}`,
                            )
                            .join('  |  ')}
                    </div>
                  </div>

                  <div className="w-[70px] shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                    {formatDuration(event.durationSeconds)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
