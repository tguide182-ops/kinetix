export function formatBytes(bytes: number | undefined, approximate = false): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const n = v >= 100 || i === 0 ? Math.round(v).toString() : v.toFixed(1);
  return `${approximate ? '≈ ' : ''}${n} ${units[i]}`;
}

export function formatSpeed(bps: number | undefined): string {
  return bps && bps > 0 ? `${formatBytes(bps)}/s` : '';
}

export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export function formatEta(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return `${Math.ceil(seconds)}s left`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} min left`;
  return `${(seconds / 3600).toFixed(1)} h left`;
}

export function formatBitrate(bps: number | undefined): string {
  if (!bps || bps <= 0) return '';
  return bps >= 1e6 ? `${(bps / 1e6).toFixed(1)} Mbps` : `${Math.round(bps / 1e3)} kbps`;
}
