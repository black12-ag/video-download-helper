import { filename } from './media.js';
import { browserProgress } from './transfers.js';

let pending = Promise.resolve();
function changeJobs(change) {
  const result = pending.then(async () => {
    const { browserJobs = {} } = await chrome.storage.session.get('browserJobs');
    const data = await change(browserJobs);
    await chrome.storage.session.set({ browserJobs });
    return data;
  });
  pending = result.catch(console.warn);
  return result;
}

export async function startBrowserDownload(item, name) {
  const id = await chrome.downloads.download({ url: item.url, filename: filename(item, name), conflictAction: 'uniquify', saveAs: false });
  await changeJobs(async jobs => {
    const finished = Object.keys(jobs).filter(key => !['downloading', 'paused', 'starting'].includes(jobs[key].status));
    for (const key of finished.slice(0, Math.max(0, finished.length - 19))) delete jobs[key];
    const initial = { jobId: `browser:${id}`, downloadId: id, backend: 'browser', sourceUrl: item.url, title: item.title, createdAt: Date.now() };
    const [download] = await chrome.downloads.search({ id });
    jobs[id] = download ? browserProgress(download, initial) : { ...initial, status: 'starting' };
  });
  return id;
}

export function refreshBrowserJobs(onlyId) {
  return changeJobs(async jobs => {
    for (const job of Object.values(jobs)) {
      if (onlyId !== undefined ? job.downloadId !== onlyId : !['starting', 'downloading', 'paused'].includes(job.status)) continue;
      const [item] = await chrome.downloads.search({ id: job.downloadId });
      jobs[job.downloadId] = item ? browserProgress(item, job) : { ...job, status: 'failed', error: 'Download is no longer in the browser history.' };
    }
  });
}

export async function stopBrowserDownload(jobId) {
  const { browserJobs = {} } = await chrome.storage.session.get('browserJobs');
  const job = Object.values(browserJobs).find(job => job.jobId === jobId);
  if (!job) throw new Error('This download is not managed by this extension.');
  const [item] = await chrome.downloads.search({ id: job.downloadId });
  if (item?.state === 'in_progress') await chrome.downloads.cancel(job.downloadId);
  await refreshBrowserJobs(job.downloadId);
  return true;
}

export async function pauseBrowserDownload(jobId) {
  const { browserJobs = {} } = await chrome.storage.session.get('browserJobs');
  const job = Object.values(browserJobs).find(job => job.jobId === jobId);
  if (!job) throw new Error('This download is not managed by this extension.');
  const [item] = await chrome.downloads.search({ id: job.downloadId });
  if (item?.state === 'in_progress') {
    if (item.paused) await chrome.downloads.resume(job.downloadId);
    else await chrome.downloads.pause(job.downloadId);
  }
  await refreshBrowserJobs(job.downloadId);
  return true;
}

chrome.downloads.onChanged.addListener(change => {
  if (change.state || change.paused || change.error) refreshBrowserJobs(change.id).catch(console.warn);
});
