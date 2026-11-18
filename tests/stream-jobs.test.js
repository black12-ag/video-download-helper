import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { activeTransfer, transferSummary } from '../extension/transfers.js';

test('stream jobs bind a session job to its download tab, validate progress, and cancel only owned jobs', async () => {
  const data = {};
  let nextTab = 10;
  const opened = [];
  globalThis.chrome = {
    storage: { session: {
      get: async key => ({ [key]: structuredClone(data[key]) }),
      set: async value => Object.assign(data, structuredClone(value)),
    } },
    tabs: {
      create: async options => { opened.push(options); return { id: nextTab++ }; },
      update: async (id, options) => opened.push({ id, ...options }),
    },
    runtime: { id: 'extension', getURL: path => `chrome-extension://extension/${path}`, sendMessage: async () => {} },
  };
  const { startStreamJob, getStreamJob, reportStreamProgress, stopStreamJob, closeStreamTab } = await import('../extension/stream-jobs.js');
  const item = { url: 'https://media.example/master.m3u8#vdh-hls=1', hls: { url: 'https://media.example/master.m3u8', videoId: 1, audioId: 2 }, title: 'Video', width: 1920, height: 1080 };
  const job = await startStreamJob(item, 'video.mp4');
  assert.equal(job.status, 'waiting');
  assert.equal(job.backend, 'stream');
  assert.equal(activeTransfer(job), true);
  assert.match(transferSummary(job), /choose Save/);
  assert.deepEqual(opened[0], { url: 'about:blank', active: false });
  assert.equal(opened[1].url, `chrome-extension://extension/stream.html#${job.jobId}`);
  assert.equal(opened[1].url.includes('media.example'), false);
  const sender = { id: 'extension', tab: { id: job.tabId }, url: opened[1].url };
  assert.equal((await getStreamJob(job.jobId, sender)).filename, 'video.mp4');
  await assert.rejects(getStreamJob(job.jobId, { ...sender, tab: { id: 999 } }), /not registered/);
  await assert.rejects(getStreamJob(job.jobId, { ...sender, url: 'chrome-extension://extension/popup.html' }), /not registered/);
  await assert.rejects(reportStreamProgress(job.jobId, { status: 'complete' }, sender), /not started/);
  await assert.rejects(reportStreamProgress(job.jobId, { status: 'downloading', percent: NaN }, sender), /Invalid stream progress/);
  await assert.rejects(reportStreamProgress(job.jobId, { status: 'downloading', receivedBytes: -1 }, sender), /Invalid stream progress/);
  await reportStreamProgress(job.jobId, { status: 'downloading', receivedBytes: 25, totalBytes: null, percent: null, speed: null, eta: null }, sender);
  await assert.rejects(stopStreamJob('stream:someone-elses'), /not managed/);
  await stopStreamJob(job.jobId);
  assert.equal((await reportStreamProgress(job.jobId, { status: 'complete', percent: 100 }, sender)).status, 'cancelled');
  const reconciled = await reportStreamProgress(job.jobId, { status: 'complete', fileSaved: true, fileSize: 30, receivedBytes: 25, totalBytes: null, percent: 100 }, sender);
  assert.equal(reconciled.status, 'complete', 'successful atomic close wins a cancellation racing after save');
  assert.equal(reconciled.fileSize, 30);
  assert.equal(reconciled.receivedBytes, 25, 'output size is separate from received traffic');
  await stopStreamJob(job.jobId);
  assert.equal(data.streamJobs[job.jobId].status, 'complete');
  const second = await startStreamJob(item, 'second.mp4');
  await closeStreamTab(second.tabId);
  assert.equal(data.streamJobs[second.jobId].status, 'cancelled');
  const active = await Promise.all(Array.from({ length: 8 }, () => startStreamJob(item, 'active.mp4')));
  await assert.rejects(startStreamJob(item, 'over-limit.mp4'), /maximum 8/);
  for (const entry of active) await stopStreamJob(entry.jobId);
  for (let i = 0; i < 23; i++) { const entry = await startStreamJob(item, 'history.mp4'); await stopStreamJob(entry.jobId); }
  assert.equal(Object.values(data.streamJobs).length, 20, 'bounded finished history');
});

test('stored extensionless HLS qualities can be saved and downloaded without trusting client metadata', async () => {
  const source = { url: 'https://media.example/manifest?token=fixture', mime: 'application/vnd.apple.mpegurl', format: 'HLS', stream: true, title: 'Extensionless recording' };
  let item = source;
  const session = { 'tab:5': { items: [item], blobs: 0 } }, local = {};
  let listener;
  const area = data => ({ get: async key => ({ [key]: structuredClone(data[key]) }), set: async value => Object.assign(data, structuredClone(value)) });
  globalThis.chrome = {
    storage: { session: area(session), local: area(local) },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    tabs: { get: async () => ({ id: 5, url: 'https://media.example/page' }), create: async () => ({ id: 12 }), update: async () => {}, onUpdated: { addListener() {} }, onRemoved: { addListener() {} } },
    runtime: { id: 'extension', getURL: path => `chrome-extension://extension/${path}`, onMessage: { addListener(fn) { listener = fn; } } },
    downloads: { onChanged: { addListener() {} } },
    webRequest: { onHeadersReceived: { addListener() {} } },
  };
  const catalog = { duration: 10, variants: [{ id: '1', videoId: 1, audioId: 2, width: 1280, height: 720, bitrate: 256000 }, { id: '2', videoId: 2, audioId: 2, width: 640, height: 360 }] };
  const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === './hls-media.js' && context.parentURL.endsWith('/background.js')) return { url: `data:text/javascript,${encodeURIComponent(`export async function inspectHls() { return ${JSON.stringify(catalog)}; }`)}`, shortCircuit: true };
    return next(specifier, context);
  } });
  try { await import('../extension/background.js'); } finally { hooks.deregister(); }
  const request = message => new Promise((resolve, reject) => {
    listener({ tabId: 5, ...message }, { id: 'extension', url: 'chrome-extension://extension/popup.html' }, result => result.error ? reject(new Error(result.error)) : resolve(result.data));
  });
  const inspected = await request({ type: 'hls-inspect', url: source.url });
  item = inspected.items[0];
  assert.equal(item.bitrate, 256, 'catalog bits/sec become popup kb/s');
  assert.equal(inspected.items[1].bitrate, 0, 'missing bitrate stays unknown');
  assert.equal(await request({ type: 'save', url: item.url, name: 'Saved recording' }), true);
  assert.equal(local.saved[0].hls.url, item.hls.url);
  const job = await request({ type: 'download', url: item.url });
  assert.equal(job.backend, 'stream');
  assert.equal(job.status, 'waiting');
  assert.equal(job.hls.url, item.hls.url);
  await assert.rejects(request({ type: 'download', url: 'https://unseen.example/manifest', hls: item.hls }), /no longer available/);
});
