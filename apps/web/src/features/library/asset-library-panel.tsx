import { useEffect } from 'react';
import type { AssetSummary } from '@sup-viewer/shared';
import { formatBytes, formatTimecode } from '@sup-viewer/shared';
import { RefreshCw, Trash2, Upload } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { fetchAssets, removeAsset } from '@/store/assetsSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

interface Props {
  activeAssetId: string | null;
  onOpen: (asset: AssetSummary) => void;
}

export function AssetLibraryPanel({ activeAssetId, onOpen }: Props) {
  const dispatch = useAppDispatch();
  const items = useAppSelector((state) => state.assets.items);
  const status = useAppSelector((state) => state.assets.listStatus);
  const error = useAppSelector((state) => state.assets.listError);

  useEffect(() => {
    if (status === 'idle') dispatch(fetchAssets());
  }, [status, dispatch]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">
          {items.length} 个文件
        </span>
        <IconTooltip label="刷新资产库">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => dispatch(fetchAssets())}
            disabled={status === 'loading'}
          >
            <RefreshCw className={cn(status === 'loading' && 'animate-spin')} />
          </Button>
        </IconTooltip>
      </div>

      <div className="thin-scrollbar min-h-0 flex-1 overflow-auto">
        {error && <p className="px-1 pb-2 text-[11px] text-destructive">{error}</p>}

        {status === 'error' && !error && (
          <p className="px-1 py-4 text-center text-xs text-muted-foreground">
            无法连接服务端，资产库不可用。
          </p>
        )}

        {status !== 'error' && items.length === 0 && (
          <p className="flex flex-col items-center gap-2 px-1 py-8 text-center text-xs text-muted-foreground">
            <Upload className="size-5" />
            资产库为空。把当前文件入库后会显示在这里。
          </p>
        )}

        <ul className="space-y-2">
          {items.map((asset) => {
            const active = asset.id === activeAssetId;
            return (
              <li
                key={asset.id}
                className={cn(
                  'rounded-lg border p-2.5 transition-colors',
                  active ? 'border-sky-400/60 bg-sky-500/10' : 'border-white/10 hover:bg-white/5',
                )}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpen(asset)}
                    className="min-w-0 flex-1 truncate text-left font-mono text-xs hover:text-sky-300"
                    title={asset.name}
                  >
                    {asset.name}
                  </button>
                  <IconTooltip label="从资产库删除">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => dispatch(removeAsset(asset.id))}
                    >
                      <Trash2 />
                    </Button>
                  </IconTooltip>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                  <span>
                    {asset.width}×{asset.height}
                  </span>
                  <span>·</span>
                  <span>{asset.contentEventCount} 条内容</span>
                  <span>·</span>
                  <span>{formatTimecode(asset.durationSeconds, false)}</span>
                  <span>·</span>
                  <span>{formatBytes(asset.size)}</span>
                  {asset.annotationCount > 0 && (
                    <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                      {asset.annotationCount} 标注
                    </Badge>
                  )}
                  {asset.pcsTimestampsMissing && (
                    <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                      时间戳缺失
                    </Badge>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
