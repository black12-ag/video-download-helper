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
    for (const key of ['pageUrl', 'width', 'height', 'size', 'mime', 'groupKey', 'poster', 'duration', 'qualityLabel']) if (item[key]) next[key] = item[key];
    if (item.title && (!old.title || (item.titleRank || 0) >= (old.titleRank || 0))) {
      next.title = item.title;
      next.titleRank = item.titleRank || 0;
    }
    items.set(info.url, next);
  }
  // shortcut: keep 200 findings per tab; add pagination if real pages need more.
  return [...items.values()].slice(-200);
}

export function filename(item, customName = '') {
  let title = (customName.trim() || item.title || 'video').replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, ' ').replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '').replace(/\.(mp4|webm|mkv|ogv|mov|m4v)$/i, '') || 'video';
  const chars = Array.from(title);
  while (new TextEncoder().encode(chars.join('')).length > 180) chars.pop();
  title = chars.join('').trim();
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(title)) title = `_${title}`;
  return `${title}${!customName.trim() && item.height ? `-${item.height}p` : ''}.${item.format.toLowerCase()}`;
}

export function groupMedia(items) {
  const groups = new Map();
  for (const item of items) {
    const key = item.groupKey || item.url;
    if (!groups.has(key)) groups.set(key, { key, items: [] });
    groups.get(key).items.push(item);
  }
  for (const group of groups.values()) group.items.sort((a, b) => Number(Boolean(a.stream)) - Number(Boolean(b.stream)) || (b.height || 0) - (a.height || 0));
  return [...groups.values()].sort((a, b) => (b.items[0].titleRank || 0) - (a.items[0].titleRank || 0) || (b.items[0].height || 0) - (a.items[0].height || 0));
}
