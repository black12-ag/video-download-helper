import { activeTransfer } from './transfers.js';
const HOST = 'org.video_download_helper.local';
let port;
const requests = new Map();
let jobChanges = Promise.resolve();
function changeJobs(change) {
  const result = jobChanges.then(async () => {
    const { engineJobs = {} } = await chrome.storage.session.get('engineJobs');
    change(engineJobs);
    await chrome.storage.session.set({ engineJobs });
  });
  jobChanges = result.catch(console.warn);
  return result;
}

function connection() {
  if (port) return port;
  if (!chrome.runtime.connectNative) throw new Error('This browser does not expose native messaging. Use Chrome or a compatible browser for the local engine.');
  const created = chrome.runtime.connectNative(HOST);
  port = created;
  port.onMessage.addListener(message => {
    if (message.event === 'progress') {
      changeJobs(jobs => { if (jobs[message.jobId]) jobs[message.jobId] = { ...jobs[message.jobId], ...message }; }).catch(console.warn);
      return;
    }
    const request = requests.get(message.id);
    if (!request) return;
    requests.delete(message.id);
    clearTimeout(request.timer);
    message.error ? request.reject(new Error(message.error)) : request.resolve(message.data);
  });
  port.onDisconnect.addListener(() => {
    const error = chrome.runtime.lastError?.message || 'Local engine disconnected';
    if (port !== created) return;
    port = null;
    for (const request of requests.values()) { clearTimeout(request.timer); request.reject(new Error(error)); }
    requests.clear();
  });
  return port;
}

export function engineRequest(op, data = {}, id = crypto.randomUUID().replaceAll('-', '')) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { requests.delete(id); reject(new Error('Local engine timed out. Check its installation and the website connection.')); }, op === 'download' ? 86400000 : 100000);
    requests.set(id, { resolve, reject, timer });
    try { connection().postMessage({ ...data, id, op }); }
    catch (error) { clearTimeout(timer); requests.delete(id); reject(error); }
  });
}

export async function engineReady() {
  if (!await chrome.permissions.contains({ permissions: ['nativeMessaging'] })) return false;
  try {
    const info = await engineRequest('ping');
    if (info.ready && info.progressVersion >= 2) return true;
    const old = port; port = null; old?.disconnect();
    return false;
  } catch { return false; }
}

export async function startEngineDownload(item, name) {
  if (!await engineReady()) throw new Error('Install or update the local engine from this release, then reconnect in Local engine.');
  const id = crypto.randomUUID().replaceAll('-', '');
  await changeJobs(jobs => {
    if (Object.values(jobs).filter(activeTransfer).length >= 2) throw new Error('Two local downloads are running. Wait or cancel one first.');
    const finished = Object.keys(jobs).filter(key => !activeTransfer(jobs[key]));
    for (const key of finished.slice(0, Math.max(0, finished.length - 19))) delete jobs[key];
    jobs[id] = { jobId: id, backend: 'engine', sourceUrl: item.url, title: item.title, createdAt: Date.now(), totalBytes: item.size || 0, approximate: item.approximate, receivedBytes: 0, status: 'starting', percent: 0 };
  });
  engineRequest('download', { url: item.native.url, formatId: item.native.formatId, name }, id).catch(error =>
    changeJobs(jobs => { jobs[id] = { ...jobs[id], status: /cancelled|canceled/i.test(error.message) ? 'cancelled' : 'failed', error: error.message }; }).catch(console.warn));
  return { jobId: id };
}
