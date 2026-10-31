import type {
  Annotation,
  AssetDetail,
  AssetSummary,
  CreateAnnotationInput,
  UpdateAnnotationInput,
} from '@sup-viewer/shared';

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, init);
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body?.message) message = body.message;
    } catch {
      // 错误体不是 JSON 时保留状态码描述
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function assetFileUrl(assetId: string): string {
  return `${BASE}/assets/${assetId}/file`;
}

export function listAssets(): Promise<AssetSummary[]> {
  return request<AssetSummary[]>('/assets');
}

export function getAsset(assetId: string): Promise<AssetDetail> {
  return request<AssetDetail>(`/assets/${assetId}`);
}

export function deleteAsset(assetId: string): Promise<void> {
  return request<void>(`/assets/${assetId}`, { method: 'DELETE' });
}

export function listAnnotations(assetId: string): Promise<Annotation[]> {
  return request<Annotation[]>(`/assets/${assetId}/annotations`);
}

export function createAnnotation(
  assetId: string,
  input: CreateAnnotationInput,
): Promise<Annotation> {
  return request<Annotation>(`/assets/${assetId}/annotations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateAnnotation(
  annotationId: string,
  input: UpdateAnnotationInput,
): Promise<Annotation> {
  return request<Annotation>(`/annotations/${annotationId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function deleteAnnotation(annotationId: string): Promise<void> {
  return request<void>(`/annotations/${annotationId}`, { method: 'DELETE' });
}

/**
 * 用 XHR 上传，以便在上传大文件时给出真实进度。
 * invoke 使用 `file` 字段，服务端按 multipart 解析。
 */
export function uploadAssetFile(
  file: File,
  onProgress: (percent: number) => void,
): Promise<AssetDetail> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file, file.name);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/assets`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as AssetDetail);
        } catch (error) {
          reject(new Error(`服务端返回了无法解析的响应：${String(error)}`));
        }
        return;
      }
      let message = `${xhr.status} ${xhr.statusText}`;
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string };
        if (body?.message) message = body.message;
      } catch {
        // 保留状态码描述
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error('网络错误，无法连接服务端'));
    xhr.send(form);
  });
}
