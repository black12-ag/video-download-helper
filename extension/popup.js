import { filename, groupMedia } from './media.js';
import { activeTransfer, transferSummary, formatBytes } from './transfers.js';

const $ = id => document.getElementById(id);
let tabId, view = 'current', renderVersion = 0, transferVersion = 0, transferTimer, refreshTimer;
const selections = new Map(), names = new Map(), cardViews = new Map();
let transfers = [];
async function request(type, extra = {}) {
  const result = await chrome.runtime.sendMessage({ type, tabId, ...extra });
  if (!result) throw new Error('Extension did not respond. Reopen Video Download Helper and try again.');
  if (result.error) throw new Error(result.error);
  return result.data;
}
function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function element(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(text, className, action) {
  const node = element('button', text, className);
  node.addEventListener('click', async () => {
    node.disabled = true;
    try { await action(); } catch (error) { status(error.message, true); } finally { node.disabled = false; }
  });
  return node;
}
const sizeLabel = bytes => bytes ? bytes < 1048576 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB` : 'Size unknown';
const qualityLabel = item => `${item.format} · ${item.hls && item.qualityLabel ? item.qualityLabel.slice(0, 140) : item.width && item.height ? `${item.width}×${item.height}` : item.qualityLabel || 'Resolution unavailable'}${item.codec ? ` · ${item.codec}` : ''} · ${item.bitrate ? `${Math.round(item.bitrate)} kb/s bitrate` : item.stream ? 'Stream' : `${item.approximate && item.size ? '~' : ''}${sizeLabel(item.size)}`}`;
async function findFormats(url) {
  $('formats').disabled = true; status('Inspecting HLS video and audio…');
  try {
    let record;
    if (view === 'current') record = await request('scan');
    else record = { items: await request('saved') };
    const candidates = record.items.filter(item => url ? item.url === url : item.stream && item.format === 'HLS');
    if (!candidates.length) throw new Error('Play the video and scan for an HLS stream first. DASH and protected streams are unsupported.');
    const errors = []; let found = 0;
    for (const item of candidates.slice(0, 8)) {
      try { await request('hls-inspect', { url: item.url }); found++; }
      catch (error) { errors.push(error.message); }
    }
    if (found && view === 'saved') {
      view = 'current';
      for (const id of ['current', 'saved']) { $(id).classList.toggle('active', id === view); $(id).setAttribute('aria-pressed', String(id === view)); }
      $('scan').hidden = false;
    }
    await render();
    status(found ? `Qualities ready. Choose a quality, then Download.${errors.length ? ` ${errors.length} stream(s) unsupported: ${errors[0]}` : ''}` : errors[0], !found);
  } catch (error) { status(error.message, true); }
  finally { $('formats').disabled = false; }
}
function transferView() {
  let current;
  const node = element('div', '', 'transfer');
  node.hidden = true; node.setAttribute('role', 'group'); node.setAttribute('aria-label', 'Download status');
  const line = element('div', '', 'transfer-line');
  const meter = element('div', '', 'transfer-meter');
  const progress = document.createElement('progress'); progress.max = 100; progress.setAttribute('aria-label', 'Download progress');
  const percent = element('span', '', 'transfer-percent');
  const speed = element('span', '', 'transfer-speed');
  meter.append(progress, percent, speed);
  const stop = button('Stop', 'stop', async () => { await request('cancel-download', { jobId: current.jobId }); await loadTransfers(true); });
  const pause = button('Pause', 'pause', async () => { await request('pause-download', { jobId: current.jobId }); await loadTransfers(true); });
  line.append(meter, pause, stop);
  const detail = element('p', '', 'transfer-detail');
  node.append(line, detail);
  return { node, update(job) {
    current = job; node.hidden = !job;
    if (!job) return;
    node.dataset.state = job.status;
    if (job.status === 'waiting') { progress.value = 0; percent.textContent = 'Choose Save…'; }
    else if (Number.isFinite(job.percent)) { progress.value = job.percent; percent.textContent = `${job.approximate ? '~' : ''}${Math.floor(job.percent)}%`; }
    else { progress.removeAttribute('value'); percent.textContent = job.status === 'waiting' ? 'Choose Save…' : job.status === 'starting' ? 'Starting…' : 'Downloading…'; }
    speed.textContent = job.status === 'complete' ? 'Saved' : job.status === 'cancelled' ? 'Stopped' : job.status === 'failed' ? 'Failed' : job.status === 'merging' ? 'Combining…' : job.speed > 0 ? `${formatBytes(job.speed)}/s` : '';
    stop.hidden = !activeTransfer(job);
    pause.hidden = job.backend !== 'browser' || !['downloading', 'paused'].includes(job.status);
    pause.textContent = job.status === 'paused' ? 'Resume' : 'Pause';
    detail.textContent = transferSummary(job);
  } };
}
function applyTransfers() {
  const displayed = new Set();
  for (const view of cardViews.values()) {
    const urls = new Set(view.items.map(item => item.url));
    const newest = [...transfers].reverse();
    const job = newest.find(job => urls.has(job.sourceUrl) && activeTransfer(job)) || newest.find(job => job.sourceUrl === view.selectedUrl());
    view.update(job);
    if (job) displayed.add(job.jobId);
  }
  const other = transfers.filter(job => activeTransfer(job) && !displayed.has(job.jobId));
  $('jobs').replaceChildren(...other.map(job => {
    const row = element('div', '', 'job'); row.append(element('strong', job.title || 'Video'));
    const view = transferView(); view.update(job); row.append(view.node); return row;
  }));
}
async function loadTransfers(refresh = false) {
  const version = ++transferVersion;
  const jobs = await request('download-jobs', { refresh });
  if (version !== transferVersion) return;
  transfers = jobs; applyTransfers();
  if (jobs.some(activeTransfer) && !transferTimer) transferTimer = setTimeout(() => { transferTimer = null; loadTransfers(true).catch(error => status(error.message, true)); }, 500);
  if (!jobs.some(activeTransfer)) { clearTimeout(transferTimer); transferTimer = null; }
}
function videoCard(group) {
  const { key, items } = group;
  let item = items.find(item => item.url === selections.get(key)) || items[0];
  const card = element('article', '', 'video');
  card.setAttribute('aria-label', item.title || 'Video');
  if (view === 'current') {
    const dismiss = button('×', 'dismiss', async () => { await request('hide', { urls: items.map(item => item.url) }); await render(); });
    dismiss.setAttribute('aria-label', 'Dismiss video'); dismiss.title = 'Hide until the next page load'; card.append(dismiss);
  }
  const head = element('div', '', 'video-head');
  const preview = element('div', '▶', 'preview');
  preview.setAttribute('aria-hidden', 'true');
  try {
    const poster = new URL(item.poster);
    if (['https:', 'http:'].includes(poster.protocol) && !poster.username && !poster.password) {
      const img = document.createElement('img');
      img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer'; img.src = poster.href;
      img.addEventListener('error', () => img.remove());
      preview.append(img);
    }
  } catch { /* A missing poster uses the local play placeholder. */ }
  if (item.duration) {
    const seconds = Math.floor(item.duration);
    preview.append(element('span', `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, 'duration'));
  }
  const info = element('div', '', 'info');
  const nameRow = element('div', '', 'name-row');
  const name = document.createElement('textarea');
  name.rows = 2; name.className = 'filename'; name.maxLength = 180; name.setAttribute('aria-label', 'Filename');
  name.value = names.get(key) ?? item.customName ?? filename(item); name.title = name.value;
  name.addEventListener('input', () => { names.set(key, name.value); name.title = name.value; });
  name.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); name.blur(); } });
  name.addEventListener('change', async () => {
    name.value = filename(item, name.value); name.title = name.value; names.set(key, name.value);
    if (view === 'saved') {
      try { await request('save', { url: item.url, name: name.value }); } catch (error) { status(error.message, true); }
    }
  });
  const rename = button('✎', 'rename', () => { name.focus(); name.select(); });
  rename.setAttribute('aria-label', 'Rename video'); rename.title = 'Rename video';
  nameRow.append(name, rename);
  const details = element('p', new URL(item.url).hostname, 'details');
  info.append(nameRow, details); head.append(preview, info); card.append(head);
  const actions = element('div', '', 'actions');
  const quality = document.createElement('select');
  quality.className = 'quality'; quality.setAttribute('aria-label', 'Video quality');
  for (const source of items) { const option = element('option', qualityLabel(source)); option.value = source.url; quality.append(option); }
  quality.value = item.url;
  const download = button('Download', 'primary', async () => {
    if (item.stream) { await findFormats(item.url); return; }
    status('Starting download…');
    const result = await request('download', { url: item.url, name: name.value });
    status(result?.backend === 'stream' ? 'Download tab opened. Choose Save there and keep it open until finished.' : '');
    await loadTransfers(true);
    cardViews.get(key)?.focusStop();
  });
  const note = element('p', '', 'stream-note');
  const update = () => {
    download.textContent = item.stream ? 'Find qualities' : 'Download';
    note.textContent = item.native ? 'This saved format used the old local engine. Reopen the original video page and scan for supported HLS qualities.' : 'Find qualities for supported HLS recordings. Protected, live and DASH streams are unsupported.';
    note.hidden = !item.stream && !item.native;
  };
  quality.addEventListener('change', () => {
    item = items.find(item => item.url === quality.value);
    selections.set(key, item.url);
    if (names.has(key)) { name.value = filename(item, names.get(key)); names.set(key, name.value); }
    else name.value = item.customName || filename(item);
    name.title = name.value; details.textContent = new URL(item.url).hostname; update(); applyTransfers();
  });
  const save = button(view === 'saved' ? 'Remove' : 'Save', 'secondary', async () => {
    await request(view === 'saved' ? 'remove' : 'save', { url: item.url, name: name.value });
    status(view === 'saved' ? 'Removed from saved videos.' : 'Saved on this device.');
    await render();
  });
  actions.append(quality, download, save); card.append(actions, note); update();
  const transfer = transferView(); card.append(transfer.node);
  cardViews.set(key, { items, selectedUrl: () => item.url, focusStop: () => transfer.node.querySelector('.stop:not([hidden])')?.focus(), update(job) {
    transfer.update(job);
    const running = activeTransfer(job);
    actions.hidden = running; name.disabled = running; rename.disabled = running;
    const dismiss = card.querySelector('.dismiss'); if (dismiss) dismiss.disabled = running;
    note.hidden = running || (!item.stream && !item.native);
    download.textContent = item.stream ? 'Find qualities' : job?.status === 'complete' ? 'Download again' : ['failed', 'cancelled'].includes(job?.status) ? 'Retry' : 'Download';
  } });
  return card;
}
function editing() { return ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName); }
async function render() {
  if (editing()) return;
  const version = ++renderVersion;
  const record = view === 'current' ? await request('list') : { items: await request('saved') };
  if (version !== renderVersion || editing()) return;
  const groups = groupMedia(record.items);
  if (view === 'current') $('count').textContent = groups.length;
  $('summary').textContent = `${groups.length} ${groups.length === 1 ? 'video' : 'videos'} ${view === 'saved' ? 'saved' : 'found'}`;
  cardViews.clear();
  const nodes = groups.map(videoCard);
  if (!groups.length) {
    const empty = element('div', '', 'empty');
    empty.append(element('span', '↓', 'symbol'), element('h2', view === 'saved' ? 'No saved videos yet' : 'No videos found yet'), element('p', view === 'saved' ? 'Save a video from the page to find it here.' : 'Play a video on this website, then scan again.'));
    nodes.push(empty);
  }
  $('videos').replaceChildren(...nodes);
  applyTransfers();
  $('hint').textContent = view === 'saved' ? 'Saved links may expire. Download videos you want to keep.' : record.hlsUrls?.length ? 'HLS downloads open a tab. Choose Save there and keep it open until finished.' : record.blobs ? 'This player uses separate streams. Find all qualities supports unprotected HLS recordings.' : 'Edit a filename to rename. Only available source qualities are shown.';
}
function scheduleRender() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => render().catch(error => status(error.message, true)), 100);
}
$('videos').addEventListener('focusout', event => { if (event.target.matches('input, textarea, select')) scheduleRender(); });
for (const name of ['current', 'saved']) $(name).addEventListener('click', async () => {
  view = name; status('');
  for (const id of ['current', 'saved']) { $(id).classList.toggle('active', id === view); $(id).setAttribute('aria-pressed', String(id === view)); }
  $('scan').hidden = view === 'saved';
  try { await render(); } catch (error) { status(error.message, true); }
});
$('scan').addEventListener('click', async () => {
  $('scan').disabled = true; status('Scanning…');
  try { await request('scan'); await render(); status('Scan complete.'); }
  catch { status('Open a website and play a video to scan it.', true); }
  finally { $('scan').disabled = false; }
});
$('downloads').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://downloads/' }));
$('formats').addEventListener('click', () => findFormats());
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes[`tab:${tabId}`] && view === 'current') scheduleRender();
  if (area === 'session' && (changes.streamJobs || changes.browserJobs)) loadTransfers().catch(error => status(error.message, true));
});
try {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  $('site').textContent = tab?.url?.startsWith('http') ? new URL(tab.url).hostname : 'Open a website to find videos';
  await render();
  try {
    const scanned = await request('scan'); await render();
    if (scanned.items.some(item => !item.height && !item.native && !item.stream)) setTimeout(() => request('scan').catch(() => {}), 1500);
  } catch { status('Scanning is unavailable here. Try a website tab.', true); }
  await loadTransfers(true);
  request('probe-details').catch(() => {});
} catch (error) { status(error.message, true); }
