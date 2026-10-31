const pad = (value: number, length = 2): string => value.toString().padStart(length, '0');

/** 秒 → hh:mm:ss.mmm（毫秒可关） */
export function formatTimecode(seconds: number, withMillis = true): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const millis = Math.round((safe - Math.floor(safe)) * 1000);

  const base = `${pad(hours)}:${pad(minutes)}:${pad(wholeSeconds)}`;
  return withMillis ? `${base}.${pad(millis, 3)}` : base;
}

/** 90kHz 时间戳 → hh:mm:ss.mmm */
export function formatPts(pts: number): string {
  return formatTimecode(pts / 90_000);
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  return `${seconds.toFixed(3)} s`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatPercent(value: number, total: number): string {
  if (total <= 0) return '0%';
  return `${((value / total) * 100).toFixed(1)}%`;
}
