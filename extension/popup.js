const $ = id => document.getElementById(id);
let tabId, view = 'current';
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
async function render() {
  const record = view === 'current' ? await request('list') : { items: await request('saved') };
  const items = record.items.toSorted((a, b) => (b.height || 0) - (a.height || 0));
  if (view === 'current') $('count').textContent = items.length;
  $('summary').textContent = `${items.length} ${view === 'saved' ? 'saved' : 'detected'} · ${items.filter(i => !i.stream).length} downloadable`;
  $('videos').replaceChildren();
  if (!items.length) {
    const empty = element('div', '', 'empty');
    empty.append(element('span', '↙', 'symbol'), element('h2', view === 'saved' ? 'Keep something good.' : 'Ready when you press play.'), element('p', view === 'saved' ? 'Save a video from the page to find it here later.' : 'Start a video on the website, then scan this page.'));
    $('videos').append(empty);
  }
  for (const item of items) {
    const card = element('article', '', 'video');
    const quality = item.height ? ` · ${item.height}p` : '';
    card.append(element('span', `${item.format}${quality}`, 'tag'), element('h2', item.title || 'Untitled video'));
    const size = item.size ? ` · ${(item.size / 1048576).toFixed(1)} MB` : ' · Size unknown';
    card.append(element('p', `${new URL(item.url).hostname}${size}`, 'details'));
    const actions = element('div', '', 'actions');
    if (item.stream) card.append(element('p', 'Segmented stream · merging is not supported yet.', 'stream-note'));
    else actions.append(button('↓ Download', 'primary', async () => { await request('download', { url: item.url }); status('Download started. Open Downloads to see progress or errors.'); }));
    actions.append(button(view === 'saved' ? 'Remove' : '+ Save for later', 'secondary', async () => {
      await request(view === 'saved' ? 'remove' : 'save', { url: item.url });
      status(view === 'saved' ? 'Removed from saved videos.' : 'Saved on this device. Links may expire; download soon.');
      await render();
    }));
    card.append(actions);
    $('videos').append(card);
  }
  $('hint').textContent = view === 'saved' ? 'Saved links stay on this device. Some expire or require the original page to be open.' : record.blobs ? 'This player also uses temporary blob URLs. These often represent segmented or protected streams and cannot be saved as a single file here.' : 'Play a video, then scan again. Some players reveal their files only after playback starts.';
}
for (const name of ['current', 'saved']) $(name).addEventListener('click', async () => {
  view = name; status('');
  for (const id of ['current', 'saved']) { $(id).classList.toggle('active', id === view); $(id).setAttribute('aria-pressed', String(id === view)); }
  $('scan').hidden = view === 'saved';
  try { await render(); } catch (error) { status(error.message, true); }
});
$('scan').addEventListener('click', async () => {
  $('scan').disabled = true; status('Scanning…');
  try { await request('scan'); await render(); status('Scan complete.'); }
  catch { status('This page cannot be scanned. Open a normal website, play a video and try again.', true); }
  finally { $('scan').disabled = false; }
});
$('downloads').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://downloads/' }));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes[`tab:${tabId}`] && view === 'current') render().catch(error => status(error.message, true));
});
try {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  $('site').textContent = tab?.url?.startsWith('http') ? new URL(tab.url).hostname : 'Open a website to find videos';
  await render();
  try { await request('scan'); await render(); } catch { status('Scanning is unavailable here. Try a website tab.', true); }
} catch (error) { status(error.message, true); }
