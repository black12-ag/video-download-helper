import { filename, groupMedia } from './media.js';

const $ = id => document.getElementById(id);
let tabId, view = 'current', renderVersion = 0, refreshTimer;
const selections = new Map(), names = new Map();
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
const qualityLabel = item => `${item.format} · ${item.height ? `${item.height}p` : item.qualityLabel || 'Original'} · ${item.stream ? 'Needs merging' : sizeLabel(item.size)}`;
function videoCard(group) {
  const { key, items } = group;
  let item = items.find(item => item.url === selections.get(key)) || items[0];
  const card = element('article', '', 'video');
  card.setAttribute('aria-label', item.title || 'Video');
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
  const name = document.createElement('input');
  name.type = 'text'; name.className = 'filename'; name.maxLength = 180; name.setAttribute('aria-label', 'Filename');
  name.value = names.get(key) ?? item.customName ?? filename(item); name.title = name.value;
  name.addEventListener('input', () => { names.set(key, name.value); name.title = name.value; });
  name.addEventListener('keydown', event => { if (event.key === 'Enter') name.blur(); });
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
    status('Starting download…');
    await request('download', { url: item.url, name: name.value });
    status('Download started. Open Downloads for progress.');
  });
  const note = element('p', 'This stream needs merging, which is not supported yet.', 'stream-note');
  const update = () => { download.disabled = Boolean(item.stream); note.hidden = !item.stream; };
  quality.addEventListener('change', () => {
    item = items.find(item => item.url === quality.value);
    selections.set(key, item.url);
    if (names.has(key)) { name.value = filename(item, names.get(key)); names.set(key, name.value); }
    else name.value = item.customName || filename(item);
    name.title = name.value; details.textContent = new URL(item.url).hostname; update();
  });
  const save = button(view === 'saved' ? 'Remove' : 'Save', 'secondary', async () => {
    await request(view === 'saved' ? 'remove' : 'save', { url: item.url, name: name.value });
    status(view === 'saved' ? 'Removed from saved videos.' : 'Saved on this device.');
    await render();
  });
  actions.append(quality, download, save); card.append(actions, note); update();
  return card;
}
function editing() { return ['INPUT', 'SELECT'].includes(document.activeElement?.tagName); }
async function render() {
  if (editing()) return;
  const version = ++renderVersion;
  const record = view === 'current' ? await request('list') : { items: await request('saved') };
  if (version !== renderVersion || editing()) return;
  const groups = groupMedia(record.items);
  if (view === 'current') $('count').textContent = groups.length;
  $('summary').textContent = `${groups.length} ${groups.length === 1 ? 'video' : 'videos'} ${view === 'saved' ? 'saved' : 'found'}`;
  const nodes = groups.map(videoCard);
  if (!groups.length) {
    const empty = element('div', '', 'empty');
    empty.append(element('span', '↓', 'symbol'), element('h2', view === 'saved' ? 'No saved videos yet' : 'No videos found yet'), element('p', view === 'saved' ? 'Save a video from the page to find it here.' : 'Play a video on this website, then scan again.'));
    nodes.push(empty);
  }
  $('videos').replaceChildren(...nodes);
  $('hint').textContent = view === 'saved' ? 'Saved links may expire. Download videos you want to keep.' : record.blobs ? 'This player uses temporary video URLs. Some streams cannot be downloaded here.' : 'Edit a filename to rename. Only available source qualities are shown.';
}
function scheduleRender() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => render().catch(error => status(error.message, true)), 100);
}
$('videos').addEventListener('focusout', scheduleRender);
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
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes[`tab:${tabId}`] && view === 'current') scheduleRender();
});
try {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  $('site').textContent = tab?.url?.startsWith('http') ? new URL(tab.url).hostname : 'Open a website to find videos';
  await render();
  try { await request('scan'); await render(); } catch { status('Scanning is unavailable here. Try a website tab.', true); }
} catch (error) { status(error.message, true); }
