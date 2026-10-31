import type { Annotation, SupEvent, SupMetadata } from '@sup-viewer/shared';

import type { BackgroundMode } from '@/store/viewerSlice';

const SOLID_BACKGROUNDS: Partial<Record<BackgroundMode, string>> = {
  black: '#000000',
  white: '#ffffff',
  green: '#00b140',
};

function triggerDownload(url: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function baseName(name: string): string {
  return name.replace(/\.[^./\\]+$/, '') || 'subtitle';
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * 导出当前帧。舞台上的棋盘格代表“透明”，因此导出时保留 alpha 通道。
 */
export function exportFrameAsPng(
  canvas: HTMLCanvasElement,
  background: BackgroundMode,
  documentName: string,
): void {
  const { width, height } = canvas;
  if (width === 0 || height === 0) return;

  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const context = output.getContext('2d');
  if (!context) return;

  if (background !== 'checkerboard') {
    context.fillStyle = SOLID_BACKGROUNDS[background] ?? '#000000';
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(canvas, 0, 0);

  triggerDownload(output.toDataURL('image/png'), `${baseName(documentName)}-${timestamp()}.png`);
}

export interface ExportPayload {
  file: string;
  exportedAt: string;
  metadata: SupMetadata;
  events: SupEvent[];
  annotations: Annotation[];
}

export function exportProjectAsJson(payload: ExportPayload, documentName: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, `${baseName(documentName)}.json`);
  // 交给浏览器一小段时间完成下载后再回收
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
