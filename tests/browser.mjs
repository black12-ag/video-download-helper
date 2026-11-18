// Run with PLAYWRIGHT_MODULE pointing to an installed playwright module entry.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixture = await readFile(process.env.VIDEO_FIXTURE || '/tmp/open-video-fixture.mp4');
const lowFixture = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', process.env.VIDEO_FIXTURE || '/tmp/open-video-fixture.mp4', '-vf', 'scale=320:180', '-an', '-c:v', 'libx264', '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov', 'pipe:1']);
const webmFixture = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', process.env.VIDEO_FIXTURE || '/tmp/open-video-fixture.mp4', '-vf', 'scale=320:180', '-an', '-c:v', 'libvpx', '-b:v', '200k', '-f', 'webm', 'pipe:1']);
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/poster.svg') { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#3576a4"/><path d="M0 180L100 60 180 130 250 40 320 180" fill="#d1e2d6"/></svg>'); return; }
  if (path === '/forbidden.mp4') { res.writeHead(403); res.end('Denied'); return; }
  if (path.endsWith('.mp4') || path.endsWith('.webm') || path === '/opaque') {
    const video = path.endsWith('.webm') ? webmFixture : path.endsWith('low.mp4') ? lowFixture : fixture;
    res.writeHead(200, { 'Content-Type': path.endsWith('.webm') ? 'video/webm' : 'video/mp4', 'Content-Length': video.length }); res.end(video); return;
  }
  if (path === '/master.m3u8') { res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' }); res.end('#EXTM3U'); return; }
  const pages = {
    '/': '<title>Fixture movie</title><video title="Mountain trip" poster="/poster.svg" controls preload="auto"><source src="/mountain.mp4" type="video/mp4"><source src="/mountain-low.mp4" type="video/mp4" data-quality="180p"><source src="/mountain.webm" type="video/webm" data-quality="180p"></video><video controls preload="auto" src="/movie.mp4"></video><video controls preload="auto" src="/low.mp4"></video><a href="/movie.mp4">Duplicate</a><iframe src="http://localhost:PORT/frame"></iframe><script>fetch("/opaque");fetch("/master.m3u8");</script>',
    '/frame': '<title>Embedded video</title><video src="/embedded.mp4" preload="auto"></video>',
    '/empty': '<title>Empty page</title><h1>No videos</h1>',
    '/blob': '<title>Blob player</title><video></video><script>document.querySelector("video").src=URL.createObjectURL(new Blob(["test"],{type:"video/mp4"}));</script>',
    '/unsafe': '<title>&lt;img src=x onerror=alert(1)&gt;</title><a href="/forbidden.mp4">Forbidden video</a>',
  };
  res.writeHead(200, { 'Content-Type': 'text/html' }); res.end((pages[path] || '').replaceAll('PORT', server.address().port));
});
await new Promise(resolve => server.listen(0, '0.0.0.0', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'open-video-test-'));
await mkdir(join(profile, 'Default'));
await writeFile(join(profile, 'Default', 'Preferences'), JSON.stringify({ download: { default_directory: join(profile, 'downloads'), prompt_for_download: false } }));
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    headless: true, channel: 'chromium', acceptDownloads: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: [`--disable-extensions-except=${resolve('extension')}`, `--load-extension=${resolve('extension')}`],
  });
  console.log('Test browser launched');
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
  console.log('Extension worker loaded');
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await worker.evaluate(() => chrome.webRequest.onHeadersReceived.hasListeners())) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const errors = [];
  worker.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  const started = performance.now();
  await page.goto(origin, { waitUntil: 'networkidle' });
  const tabId = await worker.evaluate(async origin => (await chrome.tabs.query({})).find(t => t.url === `${origin}/`).id, origin);
  const ui = await context.newPage();
  // Exercise native filename handling; automation download overrides skip it.
  const downloadSession = await context.newCDPSession(ui);
  await downloadSession.send('Browser.setDownloadBehavior', { behavior: 'default', eventsEnabled: true });
  await page.bringToFront();
  await ui.goto(`chrome-extension://${id}/popup.html`);
  await ui.locator('.video').first().waitFor();
  await ui.waitForFunction(() => document.querySelector('#status').textContent !== 'Scanning…');
  const message = async (type, extra = {}) => ui.evaluate(async data => {
    const result = await chrome.runtime.sendMessage(data);
    if (result.error) throw new Error(result.error);
    return result.data;
  }, { type, tabId, ...extra });
  const waitDownload = async id => {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const item = await ui.evaluate(async id => (await chrome.downloads.search({ id }))[0], id);
      if (item && ['complete', 'interrupted'].includes(item.state)) return item;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Download did not finish within 30 seconds');
  };
  const record = await message('scan');
  assert.equal(record.items.filter(i => i.url.endsWith('/movie.mp4')).length, 1);
  assert.ok(record.items.some(i => i.url.endsWith('/opaque')), 'MIME-only response detected');
  assert.ok(record.items.some(i => i.url.includes('/embedded.mp4')), 'cross-origin iframe detected');
  assert.ok(record.items.some(i => i.stream), 'HLS recognized');
  assert.ok(record.items.some(i => i.height > 0), 'actual video dimensions');
  assert.equal(record.items.find(i => i.url.endsWith('/low.mp4')).height, 180);
  assert.ok(record.items.find(i => i.url.endsWith('/movie.mp4')).height > 180, 'distinct quality dimensions');
  console.log(`PASS direct MP4, MIME-only, cross-origin iframe, quality, deduplication, HLS; initial detection ${Math.round(performance.now() - started)}ms (includes page load)`);
  await ui.getByRole('button', { name: 'Scan page', exact: true }).click();
  await ui.getByRole('status').filter({ hasText: 'Scan complete' }).waitFor();
  const mountain = ui.getByRole('article', { name: 'Mountain trip', exact: true });
  await mountain.waitFor();
  assert.equal(await ui.locator('#count').innerText(), '6');
  assert.equal(await worker.evaluate(async tabId => chrome.action.getBadgeText({ tabId }), tabId), '6');
  assert.equal(await mountain.getByLabel('Video quality').locator('option').count(), 3);
  assert.match(await mountain.getByLabel('Filename').inputValue(), /^Mountain trip/);
  assert.equal(await mountain.locator('img').count(), 1);
  await mountain.getByRole('button', { name: 'Rename video' }).click();
  await mountain.getByLabel('Filename').fill('ጉዞ 2026.mp4');
  await message('scan');
  assert.equal(await mountain.getByLabel('Filename').inputValue(), 'ጉዞ 2026.mp4', 'auto-refresh preserves edits');
  await mountain.getByLabel('Video quality').selectOption(`${origin}/mountain-low.mp4`);
  await mountain.getByRole('button', { name: 'Download', exact: true }).click();
  await ui.getByRole('status').filter({ hasText: 'Download started' }).waitFor();
  const qualityId = await ui.evaluate(async url => (await chrome.downloads.search({ url }))[0].id, `${origin}/mountain-low.mp4`);
  const qualityDownload = await waitDownload(qualityId);
  assert.equal(qualityDownload.state, 'complete');
  assert.equal(hash(await readFile(qualityDownload.filename)), hash(lowFixture));
  assert.ok(qualityDownload.filename.endsWith('ጉዞ 2026.mp4'), 'renamed Unicode filename reaches disk');
  await mountain.getByLabel('Video quality').selectOption(`${origin}/mountain.webm`);
  assert.equal(await mountain.getByLabel('Filename').inputValue(), 'ጉዞ 2026.webm');
  await mountain.getByRole('button', { name: 'Download', exact: true }).click();
  await ui.getByRole('status').filter({ hasText: 'Download started' }).waitFor();
  const webmId = await ui.evaluate(async url => (await chrome.downloads.search({ url }))[0].id, `${origin}/mountain.webm`);
  const webmDownload = await waitDownload(webmId);
  assert.equal(webmDownload.state, 'complete');
  assert.ok(webmDownload.filename.endsWith('ጉዞ 2026.webm'));
  assert.equal(hash(await readFile(webmDownload.filename)), hash(webmFixture));
  console.log('PASS video-specific title, poster, grouped quality selection, typing survives updates, renamed Unicode filename and selected quality bytes');
  const item = record.items.find(i => i.url.endsWith('/movie.mp4'));
  await message('save', { url: item.url }); await message('save', { url: item.url });
  assert.equal((await message('saved')).length, 1);
  await ui.getByRole('button', { name: 'Saved videos' }).click();
  await ui.getByRole('button', { name: 'Download', exact: true }).waitFor();
  await ui.getByLabel('Filename').fill('My holiday.webm');
  await ui.getByLabel('Filename').press('Tab');
  assert.equal(await ui.getByLabel('Filename').inputValue(), 'My holiday.mp4', 'filename field matches real source format');
  assert.equal((await message('saved'))[0].customName, 'My holiday.mp4');
  const before = performance.now();
  await ui.getByRole('button', { name: 'Download', exact: true }).click();
  await ui.getByRole('status').filter({ hasText: 'Download started' }).waitFor();
  const downloadId = await ui.evaluate(async url => (await chrome.downloads.search({ url }))[0].id, item.url);
  const result = await waitDownload(downloadId);
  assert.equal(result.state, 'complete');
  assert.ok(result.filename.endsWith('My holiday.mp4'));
  const disk = await readFile(result.filename);
  assert.equal(hash(disk), hash(fixture), 'download bytes match source');
  console.log(`PASS native download completed, SHA-256 matches, ${disk.length} bytes in ${Math.round(performance.now() - before)}ms`);
  await message('remove', { url: item.url }); assert.equal((await message('saved')).length, 0);
  await assert.rejects(() => message('download', { url: 'https://example.org/unseen.mp4' }), /no longer available/);
  const stream = record.items.find(i => i.stream);
  await assert.rejects(() => message('download', { url: stream.url }), /merging/);
  await ui.getByRole('button', { name: /^On this page/ }).click();
  await ui.getByRole('article', { name: 'Mountain trip', exact: true }).waitFor();
  assert.ok(await ui.evaluate(() => document.body.scrollWidth <= document.body.clientWidth), 'popup has no horizontal overflow');
  assert.ok(await ui.evaluate(() => document.body.getBoundingClientRect().height <= 600), 'popup fits browser height');
  await mkdir('test-results', { recursive: true });
  await ui.locator('body').screenshot({ path: 'test-results/popup.png' });
  await page.goto(`${origin}/empty`);
  assert.equal((await message('scan')).items.length, 0, 'navigation clears old discoveries');
  await page.goto(`${origin}/blob`);
  assert.ok((await message('scan')).blobs > 0);
  await page.goto(`${origin}/unsafe`);
  const unsafe = (await message('scan')).items[0];
  const failed = await message('download', { url: unsafe.url });
  assert.equal((await waitDownload(failed)).state, 'interrupted');
  await ui.getByRole('article', { name: '<img src=x onerror=alert(1)>', exact: true }).waitFor();
  assert.equal(await ui.locator('img').count(), 0);
  console.log('PASS saved-list dedup/remove, rejected unknown URL, unsupported stream, navigation reset, blob notice, HTTP 403 failure');
  assert.deepEqual(errors, []);
  // Public smoke checks establish discovery only, not support for every site.
  for (const url of ['https://www.w3schools.com/html/html5_video.asp', 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', 'https://media.w3.org/2010/05/sintel/trailer.mp4']) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.locator('video').first().waitFor({ timeout: 10000 });
      const found = await message('scan');
      assert.ok(found.items.some(i => !i.stream));
      console.log(`PASS public page detection: ${url} (${found.items.length} media)`);
      const media = found.items.find(i => !i.stream);
      const publicId = await message('download', { url: media.url });
      const transfer = await waitDownload(publicId);
      console.log(`Public download state: ${transfer.state}, ${transfer.error || 'no error'}, ${transfer.finalUrl}`);
      assert.equal(transfer.state, 'complete', transfer.error);
      const bytes = await readFile(transfer.filename);
      assert.ok(bytes.length > 1000, 'non-empty public media downloaded');
      assert.ok(bytes.subarray(0, 32).includes(Buffer.from('ftyp')), 'download is MP4, not an HTML error page');
      assert.equal(bytes.length, transfer.totalBytes, 'all public media bytes received');
      const seconds = (Date.parse(transfer.endTime) - Date.parse(transfer.startTime)) / 1000;
      console.log(`PASS public native download: ${new URL(media.url).hostname}, ${bytes.length} bytes, ${seconds.toFixed(2)}s, ${(bytes.length / 1048576 / seconds).toFixed(2)} MiB/s`);
    } catch (error) { console.log(`UNVERIFIED public page ${url}: ${error.message.split('\n')[0]}`); }
  }
} finally {
  await context?.close(); server.close(); await rm(profile, { recursive: true, force: true });
}
