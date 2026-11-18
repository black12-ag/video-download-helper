// Serialized by scripting.executeScript; keep this function self-contained.
export function scanPage() {
  const items = [];
  let blobs = 0;
  const add = (url, extra = {}) => {
    if (url?.startsWith('blob:')) { blobs++; return; }
    if (url) items.push({ url, title: document.title, pageUrl: location.href, ...extra });
  };
  for (const video of document.querySelectorAll('video')) {
    const extra = { width: video.videoWidth, height: video.videoHeight };
    add(video.currentSrc || video.src, extra);
    for (const source of video.querySelectorAll('source')) add(source.src, { ...(source.src === video.currentSrc ? extra : {}), mime: source.type });
  }
  for (const link of document.querySelectorAll('a[href]')) {
    if (/\.(mp4|webm|ogv|mov|m4v|m3u8|mpd)(\?|#|$)/i.test(link.href)) add(link.href);
  }
  for (const entry of performance.getEntriesByType('resource')) add(entry.name);
  return { items: items.slice(-500), blobs };
}
