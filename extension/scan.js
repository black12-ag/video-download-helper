// Serialized by scripting.executeScript; keep this function self-contained.
export function scanPage() {
  const items = [];
  let blobs = 0;
  const add = (url, extra = {}) => {
    if (url?.startsWith('blob:')) { blobs++; return; }
    if (url) items.push({ url, title: document.title, pageUrl: location.href, ...extra });
  };
  const pageTitle = document.querySelector('meta[property="og:title"]')?.content || document.title;
  const pagePoster = document.querySelector('meta[property="og:image"]')?.content || '';
  for (const video of document.querySelectorAll('video')) {
    const sources = [...video.querySelectorAll('source')];
    const urls = [...new Set([video.currentSrc, video.src, ...sources.map(source => source.src)].filter(Boolean))].sort();
    const ownTitle = video.getAttribute('aria-label') || video.title || video.closest('figure')?.querySelector('figcaption')?.textContent?.trim();
    const extra = {
      title: ownTitle || pageTitle, titleRank: ownTitle ? 3 : pageTitle !== document.title ? 1 : 0,
      width: video.videoWidth, height: video.videoHeight,
      groupKey: JSON.stringify([location.href, urls]), poster: video.poster || pagePoster,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
    };
    add(video.currentSrc || video.src, extra);
    for (const source of sources) add(source.src, {
      ...extra, ...(source.src === video.currentSrc ? {} : { width: 0, height: 0 }), mime: source.type,
      qualityLabel: source.getAttribute('label') || source.dataset.quality || '',
    });
  }
  for (const link of document.querySelectorAll('a[href]')) {
    if (/\.(mp4|webm|ogv|mov|m4v|mkv|avi|wmv|flv|3gp|m3u8|mpd)(\?|#|$)/i.test(link.href)) add(link.href, { title: link.getAttribute('download') || link.title || document.title, titleRank: link.getAttribute('download') || link.title ? 2 : 0 });
  }
  for (const entry of performance.getEntriesByType('resource')) add(entry.name);
  return { items: items.slice(-500), blobs, metadata: { title: pageTitle, poster: pagePoster, pageUrl: location.href } };
}
