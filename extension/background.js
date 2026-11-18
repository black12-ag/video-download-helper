import { mediaInfo, mergeMedia, filename, groupMedia } from './media.js';
import { scanPage } from './scan.js';
import { engineReady, engineRequest, startEngineDownload } from './engine.js';
import { startBrowserDownload, refreshBrowserJobs, stopBrowserDownload, pauseBrowserDownload } from './downloads.js';

// Serialize storage changes to prevent lost discoveries from simultaneous responses.
let pending = Promise.resolve();
function update(task) {
  const result = pending.then(task);
  pending = result.catch(error => console.warn('Video Download Helper:', error.message));
  return result;
}
const tabKey = id => `tab:${id}`;
async function readTab(id) {
  return (await chrome.storage.session.get(tabKey(id)))[tabKey(id)] || { items: [], blobs: 0 };
}
async function writeTab(id, record) {
  await chrome.storage.session.set({ [tabKey(id)]: record });
  const count = groupMedia(record.items).length;
  await chrome.action.setBadgeText({ tabId: id, text: count ? String(count) : '' }).catch(() => {});
  await chrome.action.setBadgeBackgroundColor({ tabId: id, color: '#216557' }).catch(() => {});
}

chrome.webRequest.onHeadersReceived.addListener(details => {
  if (details.tabId < 0 || details.statusCode < 200 || details.statusCode >= 300) return;
  const header = name => details.responseHeaders?.find(h => h.name.toLowerCase() === name)?.value || '';
  const mime = header('content-type');
  const info = mediaInfo(details.url, mime);
  if (!info) return;
  // Range responses describe a chunk; Content-Range carries the total file size.
  const total = header('content-range').match(/\/(\d+)$/)?.[1];
  const size = Number(total || (details.statusCode === 200 ? header('content-length') : 0)) || 0;
  update(async () => {
    const tab = await chrome.tabs.get(details.tabId).catch(() => null);
    if (!tab) return;
    const record = await readTab(details.tabId);
    if (record.engineUrl === tab.url && /(^|\.)googlevideo\.com$/.test(new URL(info.url).hostname)) return;
    const youtube = /(^|\.)youtube\.com$/.test(new URL(tab.url).hostname) && /(^|\.)googlevideo\.com$/.test(new URL(info.url).hostname);
    if (record.hidden?.includes(info.url)) return;
    record.items = mergeMedia(record.items, [{ ...info, mime, size, title: record.metadata?.title || tab.title, pageUrl: tab.url,
      poster: record.metadata?.poster, ...(youtube ? { groupKey: `youtube:${tab.url}` } : {}) }]);
    await writeTab(details.tabId, record);
  });
}, { urls: ['http://*/*', 'https://*/*'] }, ['responseHeaders']);

chrome.tabs.onUpdated.addListener((id, change) => {
  if (change.status === 'loading') update(() => writeTab(id, { items: [], blobs: 0 }));
});
chrome.tabs.onRemoved.addListener(id => { update(() => chrome.storage.session.remove(tabKey(id))); });

async function handle(message) {
  if (message.type === 'download-jobs') {
    if (message.refresh) await refreshBrowserJobs();
    const { browserJobs = {}, engineJobs = {} } = await chrome.storage.session.get(['browserJobs', 'engineJobs']);
    if (message.refresh && Number.isInteger(message.tabId)) await update(async () => {
      const record = await readTab(message.tabId);
      const sizes = new Map(Object.values(browserJobs).filter(job => job.totalBytes > 0).map(job => [job.sourceUrl, job.totalBytes]));
      let changed = false;
      for (const item of record.items) if (!item.size && !item.native && sizes.has(item.url)) { item.size = sizes.get(item.url); changed = true; }
      if (changed) await writeTab(message.tabId, record);
    });
    return [...Object.values(browserJobs), ...Object.values(engineJobs)].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }
  if (message.type === 'cancel-download') {
    if (typeof message.jobId !== 'string') throw new Error('Invalid download');
    return message.jobId.startsWith('browser:') ? stopBrowserDownload(message.jobId) : engineRequest('cancel', { jobId: message.jobId });
  }
  if (message.type === 'pause-download') return pauseBrowserDownload(message.jobId);
  if (message.type === 'engine-status') return { ready: await engineReady() };
  if (message.type === 'engine-jobs') return (await chrome.storage.session.get('engineJobs')).engineJobs || {};
  if (message.type === 'engine-cancel') return engineRequest('cancel', { jobId: message.jobId });
  if (message.type === 'saved') return (await chrome.storage.local.get('saved')).saved || [];
  if (message.type === 'remove') {
    const saved = (await chrome.storage.local.get('saved')).saved || [];
    await chrome.storage.local.set({ saved: saved.filter(item => item.url !== message.url) });
    return true;
  }
  if (!Number.isInteger(message.tabId) || message.tabId < 0) throw new Error('Select a website tab first.');
  const record = await readTab(message.tabId);
  if (message.type === 'list') return record;
  if (message.type === 'scan') {
    const results = await chrome.scripting.executeScript({ target: { tabId: message.tabId, allFrames: true }, func: scanPage });
    record.metadata = results.find(frame => frame.frameId === 0)?.result?.metadata;
    const items = results.flatMap(frame => frame.result?.items || []).filter(item => !record.hidden?.includes(item.url) &&
      !(record.engineUrl === record.metadata?.pageUrl && /(^|\.)googlevideo\.com$/.test(new URL(item.url).hostname)));
    record.items = mergeMedia(record.items, items);
    if (record.metadata) for (const item of record.items) {
      if (item.pageUrl === record.metadata.pageUrl && !item.poster) item.poster = record.metadata.poster;
      if (!item.native && /(^|\.)youtube\.com$/.test(new URL(record.metadata.pageUrl).hostname) && /(^|\.)googlevideo\.com$/.test(new URL(item.url).hostname)) item.groupKey = `youtube:${record.metadata.pageUrl}`;
    }
    record.blobs = results.reduce((n, frame) => n + (frame.result?.blobs || 0), 0);
    await writeTab(message.tabId, record);
    return record;
  }
  if (message.type === 'hide') {
    if (!Array.isArray(message.urls) || message.urls.some(url => typeof url !== 'string')) throw new Error('Invalid video list');
    record.hidden = [...new Set([...(record.hidden || []), ...message.urls])].slice(-200);
    record.items = record.items.filter(item => !record.hidden.includes(item.url));
    await writeTab(message.tabId, record);
    return true;
  }
  const saved = (await chrome.storage.local.get('saved')).saved || [];
  const item = [...record.items, ...saved].find(item => item.url === message.url);
  if (!item || (!item.native && !mediaInfo(item.url, item.mime))) throw new Error('Video is no longer available. Scan the page again.');
  if (message.type === 'save') {
    if (message.name !== undefined && typeof message.name !== 'string') throw new Error('Enter a valid video name.');
    const entry = { ...item, customName: message.name?.trim() ? filename(item, message.name) : item.customName };
    const index = saved.findIndex(entry => entry.url === item.url);
    if (index >= 0) saved[index] = entry;
    else {
      if (saved.length >= 200) throw new Error('Saved list is full (200). Remove a video first.');
      saved.push(entry);
    }
    await chrome.storage.local.set({ saved });
    return true;
  }
  if (message.type === 'download') {
    if (item.stream) throw new Error('This stream needs merging, which is outside version 1.');
    if (message.name !== undefined && typeof message.name !== 'string') throw new Error('Enter a valid video name.');
    if (item.native) return startEngineDownload(item, filename(item, message.name || item.customName || ''));
    return startBrowserDownload(item, message.name || item.customName || '');
  }
  throw new Error('Unknown action.');
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // Only extension UI may request downloads or access saved links.
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
  if (typeof message?.type !== 'string') return false;
  const action = message.type === 'engine-inspect' ? inspectWithEngine(message) : message.type === 'probe-details' ? probeDetails(message.tabId) : message.type.startsWith('engine-') || ['download', 'download-jobs', 'cancel-download', 'pause-download'].includes(message.type) ? handle(message) : update(() => handle(message));
  action.then(data => respond({ data }), error => respond({ error: error.message }));
  return true;
});

async function probeDetails(tabId) {
  const record = await readTab(tabId);
  const candidates = record.items.filter(item => !item.size && !item.native && !item.stream).slice(0, 6);
  const sizes = new Map();
  for (let offset = 0; offset < candidates.length; offset += 3) await Promise.all(candidates.slice(offset, offset + 3).map(async item => {
    try {
      const response = await fetch(item.url, { method: 'HEAD', credentials: 'omit', signal: AbortSignal.timeout(4000) });
      const type = response.headers.get('content-type') || '';
      const size = Number(response.headers.get('content-range')?.match(/\/(\d+)$/)?.[1] || response.headers.get('content-length'));
      if (response.ok && /^(video\/|application\/octet-stream)/i.test(type) && Number.isSafeInteger(size) && size > 0) sizes.set(item.url, size);
    } catch { /* Some servers refuse HEAD; retain an honest unknown size. */ }
  }));
  if (sizes.size) await update(async () => {
    const latest = await readTab(tabId);
    for (const item of latest.items) if (sizes.has(item.url)) item.size = sizes.get(item.url);
    await writeTab(tabId, latest);
  });
  return true;
}

async function inspectWithEngine(message) {
  const tab = await chrome.tabs.get(message.tabId);
  const record = await readTab(message.tabId);
  const target = message.url ? record.items.find(item => item.url === message.url)?.url : tab.url;
  if (!target || !/^https?:/.test(target)) throw new Error('Open a video page first.');
  if (!await engineReady()) throw new Error('Connect the free local engine first. Open Local engine for setup.');
  const catalog = await engineRequest('inspect', { url: target });
  return update(async () => {
    const current = await chrome.tabs.get(message.tabId);
    if (current.url !== tab.url) throw new Error('The page changed. Scan the new video.');
    const latest = await readTab(message.tabId);
    const sources = catalog.formats.map(format => ({
      url: `${target.split('#')[0]}#vdh-format=${encodeURIComponent(format.id)}`, native: { url: target, formatId: format.id },
      format: format.ext.toUpperCase(), stream: false, title: catalog.title, titleRank: 4,
      groupKey: `engine:${target}`, pageUrl: tab.url, poster: catalog.poster, duration: catalog.duration,
      width: format.width, height: format.height, size: format.size, approximate: format.approximate,
      bitrate: format.bitrate, codec: format.codec,
    }));
    latest.items = latest.items.filter(item => item.groupKey !== `engine:${target}` && item.url !== target &&
      !(target === tab.url && /(^|\.)youtube\.com$/.test(new URL(target).hostname) && /(^|\.)googlevideo\.com$/.test(new URL(item.url).hostname)));
    latest.items = [...latest.items, ...sources].slice(-200);
    latest.engineUrl = target;
    await writeTab(message.tabId, latest);
    return latest;
  });
}
