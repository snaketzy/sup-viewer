import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseSup } from '@sup-viewer/shared';
import type {
  Annotation,
  AssetDetail,
  AssetSummary,
  CreateAnnotationInput,
  SupEvent,
  SupMetadata,
  UpdateAnnotationInput,
} from '@sup-viewer/shared';
import { HttpError } from './http-error';

export interface AssetRecord {
  id: string;
  name: string;
  size: number;
  sha256: string;
  createdAt: string;
  filePath: string;
  metadata: SupMetadata;
  events: SupEvent[];
}

interface PersistedState {
  version: 1;
  assets: AssetRecord[];
  annotations: Annotation[];
}

/**
 * 所有资产与批注的内存状态 + 磁盘 I/O。
 *
 * 文件本体落在 filesDir 下（以 sha256 去重），元数据与批注持久化到 stateFile。
 * state.json 只是本地缓存，损坏或缺失时按空状态启动，绝不抛错。
 */
export class AssetStore {
  private readonly filesDir: string;
  private readonly stateFile: string;
  private assets: AssetRecord[] = [];
  private annotations: Annotation[] = [];
  /** 串行化写入，避免并发 persist 交错破坏 state.json */
  private writeChain: Promise<void> = Promise.resolve();

  constructor({ filesDir, stateFile }: { filesDir: string; stateFile: string }) {
    this.filesDir = filesDir;
    this.stateFile = stateFile;
  }

  async init(): Promise<void> {
    await mkdir(this.filesDir, { recursive: true });

    try {
      const raw = await readFile(this.stateFile, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      const assets = Array.isArray(parsed.assets) ? parsed.assets : [];
      const annotations = Array.isArray(parsed.annotations) ? parsed.annotations : [];

      // 丢掉文件已被删除的资产，以及它们名下的批注
      this.assets = assets.filter((asset) => existsSync(asset.filePath));
      const keptIds = new Set(this.assets.map((asset) => asset.id));
      this.annotations = annotations.filter((annotation) => keptIds.has(annotation.assetId));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.warn('[asset-store] 读取 state.json 失败，已按空状态启动：', error);
      }
    }
  }

  listSummaries(): AssetSummary[] {
    return [...this.assets]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((asset) => this.toSummary(asset));
  }

  getDetail(id: string): AssetDetail | null {
    const record = this.getRecord(id);
    return record ? this.toDetail(record) : null;
  }

  getRecord(id: string): AssetRecord | null {
    return this.assets.find((asset) => asset.id === id) ?? null;
  }

  async saveUpload(input: { name: string; buffer: Buffer }): Promise<{ detail: AssetDetail; deduped: boolean }> {
    const sha256 = createHash('sha256').update(input.buffer).digest('hex');

    const existing = this.assets.find((asset) => asset.sha256 === sha256);
    if (existing) {
      return { detail: this.toDetail(existing), deduped: true };
    }

    const result = parseSup(new Uint8Array(input.buffer));
    if (result.metadata.displaySetCount === 0) {
      throw new HttpError(400, '该文件里没有找到任何 PGS display set，请确认它是裸 .sup 流');
    }

    const id = randomUUID();
    const filePath = path.join(this.filesDir, `${id}.sup`);
    await writeFile(filePath, input.buffer);

    const record: AssetRecord = {
      id,
      name: input.name,
      size: input.buffer.length,
      sha256,
      createdAt: new Date().toISOString(),
      filePath,
      metadata: result.metadata,
      events: result.events,
    };
    this.assets.push(record);
    await this.persist();

    return { detail: this.toDetail(record), deduped: false };
  }

  async delete(id: string): Promise<boolean> {
    const index = this.assets.findIndex((asset) => asset.id === id);
    if (index === -1) return false;

    const [record] = this.assets.splice(index, 1);
    this.annotations = this.annotations.filter((annotation) => annotation.assetId !== id);

    try {
      await unlink(record.filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    await this.persist();
    return true;
  }

  getAnnotations(assetId: string): Annotation[] {
    return this.annotations
      .filter((annotation) => annotation.assetId === assetId)
      .sort((a, b) => a.time - b.time);
  }

  async createAnnotation(assetId: string, input: CreateAnnotationInput): Promise<Annotation> {
    if (!this.getRecord(assetId)) {
      throw new HttpError(404, '资产不存在');
    }

    const now = new Date().toISOString();
    const annotation: Annotation = {
      id: randomUUID(),
      assetId,
      eventIndex: input.eventIndex,
      time: input.time,
      category: input.category,
      status: 'open',
      note: input.note,
      createdAt: now,
      updatedAt: now,
    };
    this.annotations.push(annotation);
    await this.persist();
    return annotation;
  }

  async updateAnnotation(id: string, input: UpdateAnnotationInput): Promise<Annotation | null> {
    const annotation = this.annotations.find((item) => item.id === id);
    if (!annotation) return null;

    if (input.category !== undefined) annotation.category = input.category;
    if (input.status !== undefined) annotation.status = input.status;
    if (input.note !== undefined) annotation.note = input.note;
    annotation.updatedAt = new Date().toISOString();

    await this.persist();
    return annotation;
  }

  async deleteAnnotation(id: string): Promise<boolean> {
    const index = this.annotations.findIndex((annotation) => annotation.id === id);
    if (index === -1) return false;

    this.annotations.splice(index, 1);
    await this.persist();
    return true;
  }

  private toSummary(asset: AssetRecord): AssetSummary {
    const { metadata } = asset;
    return {
      id: asset.id,
      name: asset.name,
      size: asset.size,
      sha256: asset.sha256,
      createdAt: asset.createdAt,
      width: metadata.width,
      height: metadata.height,
      frameRate: metadata.frameRate,
      durationSeconds: metadata.durationSeconds,
      contentEventCount: metadata.contentEventCount,
      pcsTimestampsMissing: metadata.pcsTimestampsMissing,
      annotationCount: this.annotations.filter((annotation) => annotation.assetId === asset.id).length,
    };
  }

  private toDetail(asset: AssetRecord): AssetDetail {
    return { ...this.toSummary(asset), metadata: asset.metadata, events: asset.events };
  }

  private persist(): Promise<void> {
    const state: PersistedState = {
      version: 1,
      assets: this.assets,
      annotations: this.annotations,
    };
    const payload = JSON.stringify(state, null, 2);

    const run = this.writeChain.then(() => this.writeStateFile(payload));
    // 一次写入失败不应让后续写入永远被拒绝
    this.writeChain = run.catch(() => undefined);
    return run;
  }

  private async writeStateFile(payload: string): Promise<void> {
    const tmpFile = `${this.stateFile}.tmp`;
    await mkdir(path.dirname(this.stateFile), { recursive: true });
    await writeFile(tmpFile, payload, 'utf8');
    await rename(tmpFile, this.stateFile);
  }
}
