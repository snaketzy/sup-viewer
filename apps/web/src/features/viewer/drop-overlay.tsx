import { AlertTriangle, FileUp, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LoadStatus } from '@/store/documentSlice';

interface Props {
  visible: boolean;
  dragging: boolean;
  status: LoadStatus;
  error: string | null;
  onPick: () => void;
}

export function DropOverlay({ visible, dragging, status, error, onPick }: Props) {
  if (!visible) return null;

  const parsing = status === 'parsing';

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div
        className={cn(
          'w-[440px] max-w-[calc(100%-48px)] rounded-xl border border-dashed bg-card/60 p-8 text-center transition-colors',
          dragging ? 'border-sky-400 bg-sky-500/10' : 'border-white/20',
        )}
      >
        {parsing ? (
          <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" />
        ) : error ? (
          <AlertTriangle className="mx-auto size-8 text-amber-400" />
        ) : (
          <FileUp
            className={cn(
              'mx-auto size-8',
              dragging ? 'text-sky-300' : 'text-muted-foreground',
            )}
          />
        )}

        <h2 className="mt-4 text-sm font-semibold">
          {parsing ? '正在解析…' : error ? '无法载入这个文件' : '拖入 .sup 文件'}
        </h2>

        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {parsing
            ? '正在读取 PGS 段并建立事件索引'
            : error
              ? error
              : '支持裸 PGS 流（.sup / .pgs）。文件只在本地解析，不会自动上传。'}
        </p>

        {!parsing && (
          <Button variant="secondary" size="sm" className="mt-5" onClick={onPick}>
            选择文件
          </Button>
        )}
      </div>
    </div>
  );
}
