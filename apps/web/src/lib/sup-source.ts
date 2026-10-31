import { parseSup, type SupEvent, type SupMetadata } from '@sup-viewer/shared';

export interface ParsedSupFile {
  name: string;
  size: number;
  metadata: SupMetadata;
  events: SupEvent[];
}

/**
 * 在浏览器里直接解析 .sup，用于拖入文件后立刻预览，不必等待服务端。
 * 同时返回原始字节，供 libpgs 的 loadFromBuffer 使用。
 */
export async function parseSupFile(
  file: File,
): Promise<{ parsed: ParsedSupFile; buffer: ArrayBuffer }> {
  const buffer = await file.arrayBuffer();
  const result = parseSup(new Uint8Array(buffer));

  if (result.metadata.displaySetCount === 0) {
    throw new Error('该文件里没有找到任何 PGS display set，请确认它是裸 .sup 流');
  }
  if (result.metadata.compositionCount === 0) {
    throw new Error('该文件缺少 PCS（合成段），无法作为字幕渲染');
  }

  return {
    parsed: {
      name: file.name,
      size: file.size,
      metadata: result.metadata,
      events: result.events,
    },
    buffer,
  };
}

export function isSupFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.sup') || name.endsWith('.pgs') || name.endsWith('.sup.txt');
}
