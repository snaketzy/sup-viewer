import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatBytes, formatDuration, formatPts, formatTimecode } from '@sup-viewer/shared';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ViewerDocument } from '@/store/documentSlice';

const MAX_LISTED_ISSUES = 100;

interface Props {
  doc: ViewerDocument | null;
}

export function MetadataPanel({ doc }: Props) {
  if (!doc) {
    return <p className="px-3 py-6 text-center text-xs text-muted-foreground">尚未载入文件</p>;
  }

  const m = doc.metadata;
  const seg = m.segmentCounts;

  return (
    <div className="thin-scrollbar min-h-0 flex-1 overflow-auto px-3 pb-4">
      <Section title="文件">
        <Row label="名称" value={doc.name} mono={false} />
        <Row label="大小" value={formatBytes(doc.size)} />
        <Row label="帧率代码" value={`0x${m.frameRateCode.toString(16).padStart(2, '0')}`} />
        <Row label="帧率" value={`${m.frameRate} fps`} />
        <Row label="时长" value={formatTimecode(m.durationSeconds)} />
      </Section>

      <Section title="画面">
        <Row label="分辨率" value={`${m.width} × ${m.height}`} />
        <Row label="display set" value={m.displaySetCount} />
        <Row label="含 PCS 的集合" value={m.compositionCount} />
        <Row label="可显示内容的事件" value={m.contentEventCount} />
      </Section>

      <Section title="段统计">
        <Row label="PCS 合成段" value={seg.presentationComposition} />
        <Row label="ODS 对象段" value={seg.objectDefinition} />
        <Row label="PDS 调色板段" value={seg.paletteDefinition} />
        <Row label="WDS 窗口段" value={seg.windowDefinition} />
        <Row label="END 结束段" value={seg.end} />
        <Row label="未知段" value={seg.unknown} />
        <Row label="对象定义（去重）" value={m.objectDefinitionCount} />
        <Row label="调色板定义（去重）" value={m.paletteDefinitionCount} />
      </Section>

      <Section title="时间戳">
        <Row label="首个 PTS" value={formatPts(m.firstPts)} />
        <Row label="末尾 PTS" value={formatPts(m.lastPts)} />
        <Row label="覆盖时长" value={formatDuration((m.lastPts - m.firstPts) / 90_000)} />
      </Section>

      <Section title="诊断">
        <div className="py-1">
          {m.pcsTimestampsMissing ? (
            <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-[11px] text-amber-300">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              <span>部分 display set 的 PCS 段缺少时间戳，时间轴可能不可信。</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 p-2 text-[11px] text-emerald-300">
              <CheckCircle2 className="size-3.5 shrink-0" />
              <span>PCS 时间戳完整。</span>
            </div>
          )}
        </div>

        {m.issues.length === 0 ? (
          <p className="py-1 text-[11px] text-muted-foreground">没有解析告警。</p>
        ) : (
          <ul className="space-y-1.5 pt-1">
            {m.issues.slice(0, MAX_LISTED_ISSUES).map((issue, index) => (
              <li
                key={`${issue.offset}-${index}`}
                className="rounded-md border border-white/10 p-2 text-[11px]"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                    {issue.code}
                  </Badge>
                  <span className="font-mono text-muted-foreground">@ {issue.offset}</span>
                </div>
                <p className="mt-1 text-muted-foreground">{issue.message}</p>
              </li>
            ))}
            {m.issues.length > MAX_LISTED_ISSUES && (
              <li className="text-[11px] text-muted-foreground">
                仅显示前 {MAX_LISTED_ISSUES} 条，共 {m.issues.length} 条。
              </li>
            )}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4">
      <h3 className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <div className="rounded-lg border border-white/10 px-2.5 py-1">{children}</div>
    </section>
  );
}

function Row({ label, value, mono = true }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/5 py-1 last:border-b-0">
      <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <span
        className={cn(
          'min-w-0 truncate text-right text-xs',
          mono && 'font-mono tabular-nums',
        )}
      >
        {value}
      </span>
    </div>
  );
}
