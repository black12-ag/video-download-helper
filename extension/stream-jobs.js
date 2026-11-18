import { activeTransfer } from './transfers.js';

let pending = Promise.resolve();
function changeJobs(change) {
  const result = pending.then(async () => {
    const { streamJobs = {} } = await chrome.storage.session.get('streamJobs');
    const data = await change(streamJobs);
    const finished = Object.values(streamJobs).filter(job => !activeTransfer(job)).sort((a, b) => a.createdAt - b.createdAt);
    for (const job of finished.slice(0, Math.max(0, finished.length - 20))) delete streamJobs[job.jobId];
    await chrome.storage.session.set({ streamJobs });
    return data;
  });
  pending = result.catch(() => {});
  return result;
}
export async function startStreamJob(item, filename) {
  const job = await changeJobs(jobs => {
    if (Object.values(jobs).filter(activeTransfer).length >= 8) throw new Error('Finish or stop a stream download before opening another (maximum 8).');
    const jobId = `stream:${crypto.randomUUID()}`;
    return jobs[jobId] = { jobId, backend: 'stream', sourceUrl: item.url, pageUrl: item.pageUrl, hls: item.hls, filename, title: item.title,
      width: item.width, height: item.height, duration: item.duration, tabId: null, status: 'waiting', createdAt: Date.now(),
      receivedBytes: 0, totalBytes: null, percent: null, speed: 0, eta: null };
  });
  try {
    const tab = await chrome.tabs.create({ url: 'about:blank', active: false });
    await changeJobs(jobs => { jobs[job.jobId].tabId = tab.id; job.tabId = tab.id; });
    await chrome.tabs.update(tab.id, { url: `${chrome.runtime.getURL('stream.html')}#${job.jobId}`, active: true });
    return job;
  } catch (error) {
    await changeJobs(jobs => { jobs[job.jobId].status = 'failed'; jobs[job.jobId].error = 'Could not open the download tab.'; });
    throw error;
  }
}
function trusted(job, sender) {
  return sender.id === chrome.runtime.id && sender.tab?.id === job.tabId && sender.url === `${chrome.runtime.getURL('stream.html')}#${job.jobId}`;
}
export function getStreamJob(jobId, sender) {
  return changeJobs(jobs => {
    const job = jobs[jobId];
    if (!job || !trusted(job, sender)) throw new Error('This download tab is not registered for this job. Open Download from the popup.');
    return job;
  });
}
export function reportStreamProgress(jobId, progress, sender) {
  return changeJobs(jobs => {
    const job = jobs[jobId];
    if (!job || !trusted(job, sender)) throw new Error('Invalid download tab.');
    const savedAfterCancel = job.status === 'cancelled' && progress?.status === 'complete' && progress.fileSaved === true && Number.isFinite(progress.fileSize) && progress.fileSize >= 0;
    if (!activeTransfer(job) && !savedAfterCancel) return job;
    if (!progress || !['starting', 'downloading', 'merging', 'complete', 'failed', 'cancelled'].includes(progress.status)) throw new Error('Invalid stream status.');
    for (const key of ['percent', 'receivedBytes', 'totalBytes', 'speed', 'eta', 'fileSize']) {
      const value = progress[key];
      if (value !== undefined && !(value === null && ['percent', 'totalBytes', 'speed', 'eta'].includes(key)) && (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER || (key === 'percent' && value > 100))) throw new Error('Invalid stream progress.');
    }
    if (job.status === 'waiting' && progress.status === 'complete') throw new Error('The stream has not started.');
    for (const key of ['status', 'percent', 'receivedBytes', 'totalBytes', 'speed', 'eta', 'fileSize']) if (progress[key] !== undefined) job[key] = progress[key];
    if (job.speed === null) job.speed = 0;
    if (typeof progress.approximate === 'boolean') job.approximate = progress.approximate;
    if (typeof progress.error === 'string') job.error = progress.error.slice(0, 500);
    if (!activeTransfer(job)) job.speed = 0;
    return job;
  });
}
export async function stopStreamJob(jobId) {
  const stopped = await changeJobs(jobs => {
    const job = jobs[jobId];
    if (!job) throw new Error('This download is not managed by this extension.');
    if (!activeTransfer(job)) return false;
    job.status = 'cancelled'; job.speed = 0; job.eta = null;
    return true;
  });
  if (stopped) await chrome.runtime.sendMessage({ type: 'stream-cancel', jobId }).catch(() => {});
  return true;
}
export function closeStreamTab(tabId) {
  return changeJobs(jobs => {
    for (const job of Object.values(jobs)) if (job.tabId === tabId && activeTransfer(job)) { job.status = 'cancelled'; job.speed = 0; job.eta = null; }
  });
}
