import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import type { FastifyError } from 'fastify';
import type {
  AnnotationCategory,
  AnnotationStatus,
  CreateAnnotationInput,
  UpdateAnnotationInput,
} from '@sup-viewer/shared';
import { AssetStore } from './asset-store';
import { HttpError } from './http-error';

const CATEGORIES: readonly AnnotationCategory[] = ['timing', 'position', 'style', 'text', 'other'];

const app = Fastify({ logger: true, bodyLimit: 64 * 1024 * 1024 });

await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 1 } });

// 数据落在 apps/server/data 下（可随时删除的本地缓存，没有数据库）
const dataDir = path.resolve(import.meta.dirname, '../data');
const filesDir = path.join(dataDir, 'files');
const stateFile = path.join(dataDir, 'state.json');

const store = new AssetStore({ filesDir, stateFile });
await store.init();

app.get('/api/health', async () => ({ ok: true }));

app.get('/api/assets', async () => store.listSummaries());

app.post('/api/assets', async (request, reply) => {
  const data = await request.file();
  if (!data) {
    return reply.code(400).send({ message: '缺少 file 字段' });
  }

  const filename = data.filename;
  if (!/\.(sup|pgs)$/i.test(filename)) {
    return reply.code(400).send({ message: '只支持 .sup / .pgs 文件' });
  }

  const buffer = await data.toBuffer();
  if (buffer.length === 0) {
    return reply.code(400).send({ message: '上传的文件为空' });
  }

  const { detail, deduped } = await store.saveUpload({ name: filename, buffer });
  return reply.code(deduped ? 200 : 201).send(detail);
});

app.get<{ Params: { id: string } }>('/api/assets/:id', async (request, reply) => {
  const detail = store.getDetail(request.params.id);
  if (!detail) {
    return reply.code(404).send({ message: '资产不存在' });
  }
  return reply.send(detail);
});

app.get<{ Params: { id: string } }>('/api/assets/:id/file', async (request, reply) => {
  const record = store.getRecord(request.params.id);
  if (!record || !existsSync(record.filePath)) {
    return reply.code(404).send({ message: '资产不存在' });
  }

  const size = record.size;
  reply.header('Accept-Ranges', 'bytes');
  reply.header('Content-Type', 'application/octet-stream');
  reply.header('Cache-Control', 'no-store');

  const range = request.headers.range;
  if (range) {
    const parsed = parseRange(range, size);
    if (!parsed) {
      reply.header('Content-Range', `bytes */${size}`);
      return reply.code(416).send();
    }
    const { start, end } = parsed;
    reply.header('Content-Range', `bytes ${start}-${end}/${size}`);
    reply.header('Content-Length', end - start + 1);
    return reply.code(206).send(createReadStream(record.filePath, { start, end }));
  }

  reply.header('Content-Length', size);
  return reply.code(200).send(createReadStream(record.filePath));
});

app.delete<{ Params: { id: string } }>('/api/assets/:id', async (request, reply) => {
  const removed = await store.delete(request.params.id);
  if (!removed) {
    return reply.code(404).send({ message: '资产不存在' });
  }
  return reply.code(204).send();
});

app.get<{ Params: { id: string } }>('/api/assets/:id/annotations', async (request, reply) => {
  if (!store.getRecord(request.params.id)) {
    return reply.code(404).send({ message: '资产不存在' });
  }
  return reply.send(store.getAnnotations(request.params.id));
});

app.post<{ Params: { id: string }; Body: unknown }>(
  '/api/assets/:id/annotations',
  async (request, reply) => {
    const input = parseCreateInput(request.body);
    const annotation = await store.createAnnotation(request.params.id, input);
    return reply.code(201).send(annotation);
  },
);

app.patch<{ Params: { id: string }; Body: unknown }>('/api/annotations/:id', async (request, reply) => {
  const input = parseUpdateInput(request.body);
  const annotation = await store.updateAnnotation(request.params.id, input);
  if (!annotation) {
    return reply.code(404).send({ message: '批注不存在' });
  }
  return reply.send(annotation);
});

app.delete<{ Params: { id: string } }>('/api/annotations/:id', async (request, reply) => {
  const removed = await store.deleteAnnotation(request.params.id);
  if (!removed) {
    return reply.code(404).send({ message: '批注不存在' });
  }
  return reply.code(204).send();
});

app.setNotFoundHandler((_request, reply) => {
  reply.code(404).send({ message: '接口不存在' });
});

app.setErrorHandler((error: FastifyError, request, reply) => {
  const statusCode =
    typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode <= 599
      ? error.statusCode
      : 500;

  if (statusCode >= 500) {
    request.log.error(error);
  } else {
    request.log.warn(error.message);
  }

  reply.code(statusCode).send({ message: error.message });
});

function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const startRaw = match[1];
  const endRaw = match[2];
  if (startRaw === '' && endRaw === '') return null;

  let start: number;
  let end: number;
  if (startRaw === '') {
    const suffix = Number(endRaw);
    if (!Number.isInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw === '' ? size - 1 : Number(endRaw);
    if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
    if (end > size - 1) end = size - 1;
  }

  if (start < 0 || start >= size || end < start) return null;
  return { start, end };
}

function parseCategory(value: unknown): AnnotationCategory {
  if (typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value)) {
    return value as AnnotationCategory;
  }
  throw new HttpError(400, 'category 必须是 timing / position / style / text / other 之一');
}

function parseStatus(value: unknown): AnnotationStatus {
  if (value === 'open' || value === 'resolved') return value;
  throw new HttpError(400, 'status 必须是 open / resolved');
}

function parseTime(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new HttpError(400, 'time 必须是 ≥ 0 的有限数字');
  }
  return value;
}

function parseEventIndex(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  throw new HttpError(400, 'eventIndex 必须是 null 或 ≥ 0 的整数');
}

function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, '请求体必须是 JSON 对象');
  }
  return body as Record<string, unknown>;
}

function parseCreateInput(body: unknown): CreateAnnotationInput {
  const record = asObject(body);
  const category = parseCategory(record.category);
  if (typeof record.note !== 'string') {
    throw new HttpError(400, 'note 必须是字符串');
  }
  return {
    eventIndex: parseEventIndex(record.eventIndex),
    time: parseTime(record.time),
    category,
    note: record.note,
  };
}

function parseUpdateInput(body: unknown): UpdateAnnotationInput {
  const record = asObject(body);
  const input: UpdateAnnotationInput = {};

  if ('category' in record) input.category = parseCategory(record.category);
  if ('status' in record) input.status = parseStatus(record.status);
  if ('note' in record) {
    if (typeof record.note !== 'string') {
      throw new HttpError(400, 'note 必须是字符串');
    }
    input.note = record.note;
  }

  return input;
}

const port = Number(process.env.PORT ?? 8789);
await app.listen({ port, host: '127.0.0.1' });

const shutdown = async (): Promise<void> => {
  await app.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
