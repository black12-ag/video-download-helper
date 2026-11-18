import { mediaInfo, mergeMedia, filename, groupMedia } from './media.js';
import { scanPage } from './scan.js';

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
    record.items = mergeMedia(record.items, [{ ...info, mime, size, title: tab.title, pageUrl: tab.url }]);
    await writeTab(details.tabId, record);
  });
}, { urls: ['http://*/*', 'https://*/*'] }, ['responseHeaders']);

chrome.tabs.onUpdated.addListener((id, change) => {
  if (change.status === 'loading') update(() => writeTab(id, { items: [], blobs: 0 }));
});
chrome.tabs.onRemoved.addListener(id => { update(() => chrome.storage.session.remove(tabKey(id))); });

async function handle(message) {
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
    record.items = mergeMedia(record.items, results.flatMap(frame => frame.result?.items || []));
    record.blobs = results.reduce((n, frame) => n + (frame.result?.blobs || 0), 0);
    await writeTab(message.tabId, record);
    return record;
  }
  const saved = (await chrome.storage.local.get('saved')).saved || [];
  const item = [...record.items, ...saved].find(item => item.url === message.url);
  if (!item || !mediaInfo(item.url, item.mime)) throw new Error('Video is no longer available. Scan the page again.');
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
    return chrome.downloads.download({ url: item.url, filename: filename(item, message.name || item.customName || ''), conflictAction: 'uniquify', saveAs: false });
  }
  throw new Error('Unknown action.');
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // Only extension UI may request downloads or access saved links.
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
  update(() => handle(message)).then(data => respond({ data }), error => respond({ error: error.message }));
  return true;
});
