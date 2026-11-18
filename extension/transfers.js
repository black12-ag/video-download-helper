export const activeTransfer = job => ['waiting', 'starting', 'downloading', 'paused', 'merging'].includes(job?.status);

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown size';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return 'Calculating time…';
  const value = Math.ceil(seconds);
  if (value < 60) return `${value}s left`;
  if (value < 3600) return `${Math.floor(value / 60)}m ${value % 60}s left`;
  return `${Math.floor(value / 3600)}h ${Math.ceil(value % 3600 / 60)}m left`;
}

export function browserProgress(item, previous, now = Date.now()) {
  const receivedBytes = Math.max(0, item.bytesReceived || 0);
  const totalBytes = Math.max(0, item.totalBytes > 0 ? item.totalBytes : item.fileSize || 0, item.state === 'complete' ? receivedBytes : 0);
  const status = item.state === 'complete' ? 'complete' : item.state === 'interrupted' ? item.error === 'USER_CANCELED' ? 'cancelled' : 'failed' : item.paused ? 'paused' : 'downloading';
  const elapsed = (now - (previous.sampleAt || Date.parse(item.startTime))) / 1000;
  const delta = receivedBytes - (previous.sampleBytes || 0);
  const overallElapsed = (now - Date.parse(item.startTime)) / 1000;
  const instant = elapsed >= .3 && delta >= 0 ? delta / elapsed : previous.speed || 0;
  let speed = previous.speed > 0 ? previous.speed * .65 + instant * .35 : overallElapsed > 0 ? receivedBytes / overallElapsed : instant;
  if (status !== 'downloading') speed = 0;
  const eta = status === 'downloading' && totalBytes > receivedBytes && speed > 0 ? (totalBytes - receivedBytes) / speed : null;
  return { ...previous, status, receivedBytes, totalBytes, speed, eta,
    percent: status === 'complete' ? 100 : totalBytes ? Math.min(100, receivedBytes / totalBytes * 100) : null,
    filename: item.filename, error: item.error, sampleAt: now, sampleBytes: receivedBytes };
}

export function transferSummary(job) {
  const total = job.totalBytes > 0 ? `${job.approximate ? '~' : ''}${formatBytes(job.totalBytes)}` : 'Unknown total';
  const size = `${formatBytes(job.receivedBytes || 0)} / ${total}`;
  if (job.status === 'complete') {
    const bytes = job.fileSize ?? job.receivedBytes ?? job.totalBytes;
    return Number.isFinite(bytes) ? `${formatBytes(bytes)} · Saved` : 'Saved';
  }
  if (job.status === 'cancelled') return `${size} · Stopped`;
  if (job.status === 'failed') return job.error || 'Download failed';
  if (job.status === 'merging') return `${size} · Combining video and audio…`;
  if (job.status === 'paused') return `${size} · Paused`;
  if (job.status === 'waiting') return 'Open the download tab and choose Save to start.';
  if (job.status === 'starting') return 'Starting download…';
  return `${size} · ${job.speed > 0 ? `${formatBytes(job.speed)}/s` : 'Measuring speed…'} · ${formatTime(job.eta)}`;
}
