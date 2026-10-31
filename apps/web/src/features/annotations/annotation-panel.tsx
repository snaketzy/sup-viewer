import { useState } from 'react';
import type { AnnotationCategory } from '@sup-viewer/shared';
import { formatTimecode } from '@sup-viewer/shared';
import { Check, RotateCcw, Trash2, Upload } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { IconTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { addAnnotation, patchAnnotation, removeAnnotation } from '@/store/assetsSlice';
import type { ViewerDocument } from '@/store/documentSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

const CATEGORIES: AnnotationCategory[] = ['timing', 'position', 'style', 'text', 'other'];

const CATEGORY_LABELS: Record<AnnotationCategory, string> = {
  timing: '时间轴',
  position: '位置',
  style: '样式',
  text: '文本',
  other: '其他',
};

interface Props {
  doc: ViewerDocument | null;
  /** 当前时间点所在事件的 display set 下标 */
  activeDisplaySetIndex: number | null;
  uploading: boolean;
  onUpload: () => void;
  onSeek: (seconds: number) => void;
}

export function AnnotationPanel({
  doc,
  activeDisplaySetIndex,
  uploading,
  onUpload,
  onSeek,
}: Props) {
  const dispatch = useAppDispatch();
  const annotations = useAppSelector((state) => state.assets.annotations);
  const status = useAppSelector((state) => state.assets.annotationStatus);
  const error = useAppSelector((state) => state.assets.annotationError);
  const time = useAppSelector((state) => state.playback.time);

  const [category, setCategory] = useState<AnnotationCategory>('timing');
  const [note, setNote] = useState('');
  const [linkEvent, setLinkEvent] = useState(true);

  const assetId = doc?.assetId ?? null;

  if (!assetId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-xs leading-relaxed text-muted-foreground">
          标注需要绑定服务端资产才能保存。把当前文件入库后即可开始标记。
        </p>
        <Button
          variant="secondary"
          size="sm"
          disabled={!doc || uploading}
          onClick={onUpload}
        >
          <Upload />
          {uploading ? '正在入库…' : '入库并启用标注'}
        </Button>
      </div>
    );
  }

  const submit = () => {
    const trimmed = note.trim();
    if (trimmed.length === 0) return;
    dispatch(
      addAnnotation({
        assetId,
        input: {
          eventIndex: linkEvent ? activeDisplaySetIndex : null,
          time,
          category,
          note: trimmed,
        },
      }),
    );
    setNote('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="shrink-0 space-y-2 rounded-lg border border-white/10 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <ToggleGroup
            type="single"
            size="sm"
            value={category}
            onValueChange={(value) => value && setCategory(value as AnnotationCategory)}
          >
            {CATEGORIES.map((value) => (
              <ToggleGroupItem key={value} value={value} size="sm">
                {CATEGORY_LABELS[value]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="描述这里的问题，例如：字幕比语音晚 200ms"
          rows={3}
          className="text-xs"
        />

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setLinkEvent((current) => !current)}
            className={cn(
              'rounded-md px-2 py-1 font-mono text-[11px] transition-colors',
              linkEvent
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {linkEvent
              ? activeDisplaySetIndex === null
                ? `关联时间点 ${formatTimecode(time, false)}`
                : `关联 dset ${activeDisplaySetIndex}`
              : '仅标记时间点'}
          </button>
          <Button size="sm" disabled={note.trim().length === 0} onClick={submit}>
            添加标注
          </Button>
        </div>
      </div>

      <div className="thin-scrollbar min-h-0 flex-1 overflow-auto">
        {error && <p className="px-1 pb-2 text-[11px] text-destructive">{error}</p>}

        {status === 'loading' && (
          <p className="px-1 py-4 text-center text-xs text-muted-foreground">正在读取标注…</p>
        )}

        {status !== 'loading' && annotations.length === 0 && (
          <p className="px-1 py-4 text-center text-xs text-muted-foreground">
            还没有标注。当前时间点 {formatTimecode(time, false)}
          </p>
        )}

        <ul className="space-y-2">
          {annotations.map((annotation) => (
            <li key={annotation.id} className="rounded-lg border border-white/10 p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSeek(annotation.time)}
                  className="font-mono text-xs tabular-nums transition-colors hover:text-sky-300"
                >
                  {formatTimecode(annotation.time)}
                </button>
                {annotation.eventIndex !== null && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    dset {annotation.eventIndex}
                  </span>
                )}
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                  {CATEGORY_LABELS[annotation.category]}
                </Badge>
                <Badge
                  variant={annotation.status === 'resolved' ? 'success' : 'warning'}
                  className="px-1.5 py-0 text-[10px]"
                >
                  {annotation.status === 'resolved' ? '已解决' : '待处理'}
                </Badge>

                <div className="ml-auto flex items-center">
                  <IconTooltip
                    label={annotation.status === 'resolved' ? '重新打开' : '标记为已解决'}
                  >
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() =>
                        dispatch(
                          patchAnnotation({
                            annotationId: annotation.id,
                            input: {
                              status: annotation.status === 'resolved' ? 'open' : 'resolved',
                            },
                          }),
                        )
                      }
                    >
                      {annotation.status === 'resolved' ? <RotateCcw /> : <Check />}
                    </Button>
                  </IconTooltip>
                  <IconTooltip label="删除标注">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => dispatch(removeAnnotation(annotation.id))}
                    >
                      <Trash2 />
                    </Button>
                  </IconTooltip>
                </div>
              </div>

              {annotation.note && (
                <p className="mt-1.5 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
                  {annotation.note}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
