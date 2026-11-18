import { remuxHls } from './hls-media.js';
import { filename } from './media.js';
import { activeTransfer, transferSummary } from './transfers.js';

const $ = id => document.getElementById(id);
const jobId = location.hash.slice(1);
let job, controller, writable, choosing = false, fileSaved = false, receivedBytes = 0, lastProgress = 0, pending = Promise.resolve();
async function request(type, extra = {}) {
  const result = await chrome.runtime.sendMessage({ type, jobId, ...extra });
  if (!result || result.error) throw new Error(result?.error || 'Extension did not respond.');
  return result.data;
}
function show(current) {
  if (fileSaved && current.status !== 'complete') return;
  job = current;
  $('status').textContent = transferSummary(job);
  $('status').classList.toggle('error', job.status === 'failed');
  if (job.status === 'waiting') $('progress').value = 0;
  else if (Number.isFinite(job.percent)) $('progress').value = job.percent;
  else $('progress').removeAttribute('value');
  $('save').disabled = job.status !== 'waiting' || choosing;
  $('stop').disabled = !activeTransfer(job);
  $('filename').disabled = job.status !== 'waiting' || choosing;
  if (!activeTransfer(job)) $('instructions').textContent = job.status === 'complete' ? 'Video saved. You can close this tab.' : 'Download ended. You can close this tab and retry from the popup.';
}
function report(progress) {
  const result = pending.then(async () => { const current = await request('stream-progress', { progress }); if (!activeTransfer(current) && !fileSaved) controller?.abort(); show(current); return current; });
  pending = result.catch(() => {});
  return result;
}
chrome.runtime.onMessage.addListener((message, sender) => {
  if (!fileSaved && sender.id === chrome.runtime.id && message.type === 'stream-cancel' && message.jobId === jobId) {
    controller?.abort();
    if (job) show({ ...job, status: 'cancelled', speed: 0 });
  }
});
$('stop').addEventListener('click', async () => {
  if (fileSaved) return;
  controller?.abort();
  $('stop').disabled = true;
  try { await request('cancel-download'); show(await request('stream-get')); }
  catch (error) { $('status').textContent = error.message; }
});
$('save').addEventListener('click', async () => {
  // The picker must be called before any await to retain this trusted click's activation.
  const suggestedName = filename({ format: 'MP4', title: job.title }, $('filename').value);
  let choice;
  try { choice = window.showSaveFilePicker({ suggestedName, types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }] }); }
  catch (error) { $('status').textContent = error.message; return; }
  choosing = true; show(job);
  controller = new AbortController();
  try {
    const handle = await choice;
    const latest = await request('stream-get');
    if (controller.signal.aborted || !activeTransfer(latest)) { show(latest); return; }
    await report({ status: 'starting' });
    if (controller.signal.aborted || !activeTransfer(job)) return;
    writable = await handle.createWritable();
    if (controller.signal.aborted) { await writable.abort(); return; }
    await report({ status: 'downloading' });
    const startedAt = Date.now();
    const result = await remuxHls(job.hls.url, { pageUrl: job.pageUrl, videoId: job.hls.videoId, audioId: job.hls.audioId,
      expected: { width: job.width, height: job.height }, writable, signal: controller.signal,
      onProgress(progress) {
        receivedBytes = progress.receivedBytes;
        if (progress.status === 'complete') { fileSaved = true; $('stop').disabled = true; return; }
        if (Date.now() - lastProgress < 250) return;
        lastProgress = Date.now();
        report({ ...progress, speed: receivedBytes / Math.max(.001, (Date.now() - startedAt) / 1000), status: progress.status === 'merging' ? 'merging' : 'downloading' }).catch(error => { controller.abort(); $('status').textContent = error.message; });
      } });
    writable = null; fileSaved = true;
    await report({ status: 'complete', fileSaved: true, receivedBytes, totalBytes: null, fileSize: result.bytesWritten, percent: 100, eta: null, speed: 0, approximate: false });
  } catch (error) {
    if (fileSaved) {
      show({ ...job, status: 'complete', percent: 100, speed: 0, eta: null });
      $('status').textContent = `Video saved. Could not update the popup: ${error.message}`;
      return;
    }
    if (writable) await writable.abort().catch(() => {});
    writable = null;
    if (error.name === 'AbortError' && job.status === 'waiting' && !controller.signal.aborted) {
      $('status').textContent = 'No file selected. Choose Save when ready.';
    } else {
      await report({ status: controller.signal.aborted ? 'cancelled' : 'failed', error: error.message, speed: 0, eta: null }).catch(() => { $('status').textContent = error.message; });
    }
  } finally {
    choosing = false;
    if (job) { const text = $('status').textContent; if (!fileSaved || job.status !== 'complete') show(job); if (job.status === 'waiting') $('status').textContent = text; }
  }
});
try {
  job = await request('stream-get');
  $('filename').value = job.filename;
  $('quality').textContent = `MP4 · ${job.width}×${job.height}${job.duration ? ` · ${Math.round(job.duration)} seconds` : ''}`;
  $('source').textContent = new URL(job.hls.url).hostname;
  if (!window.showSaveFilePicker) throw new Error('This browser does not support saving streams to a file. Use a current desktop Chromium browser.');
  if (activeTransfer(job) && job.status !== 'waiting') {
    job = await report({ status: 'failed', error: 'The download tab was reloaded. Retry from the popup.' });
  }
  show(job);
  if (job.status === 'waiting') $('save').focus();
} catch (error) {
  $('status').textContent = error.message; $('status').classList.add('error');
  request('stream-progress', { progress: { status: 'failed', error: error.message } }).catch(() => {});
}
