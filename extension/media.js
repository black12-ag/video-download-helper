export function mediaInfo(value, mime = '') {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  const ext = url.pathname.match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase();
  if (['ts', 'm4s', 'm4a', 'aac', 'vtt', 'key'].includes(ext)) return null;
  mime = mime.split(';')[0].trim().toLowerCase();
  const stream = ['m3u8', 'mpd'].includes(ext) || ['application/vnd.apple.mpegurl', 'application/x-mpegurl', 'application/dash+xml'].includes(mime);
  const formats = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/ogg': 'ogv', 'video/quicktime': 'mov' };
  const format = stream ? (ext === 'mpd' || mime.includes('dash') ? 'DASH' : 'HLS') : formats[mime] || (['mp4', 'webm', 'ogv', 'mov', 'm4v'].includes(ext) ? ext : null);
  return format ? { url: url.href, format: format.toUpperCase(), stream } : null;
}

export function mergeMedia(existing, incoming) {
  const items = new Map(existing.map(item => [item.url, item]));
  for (const item of incoming) {
    const info = mediaInfo(item.url, item.mime);
    if (!info) continue;
    const old = items.get(info.url) || {};
    const next = { ...old, ...info };
    for (const key of ['title', 'pageUrl', 'width', 'height', 'size', 'mime']) if (item[key]) next[key] = item[key];
    items.set(info.url, next);
  }
  // shortcut: keep 200 findings per tab; add pagination if real pages need more.
  return [...items.values()].slice(-200);
}

export function filename(item) {
  const title = (item.title || 'video').replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, ' ').replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '').slice(0, 120) || 'video';
  return `${title.replace(/\.(mp4|webm|ogv|mov|m4v)$/i, '')}${item.height ? `-${item.height}p` : ''}.${item.format.toLowerCase()}`;
}
