import { Input, UrlSource, HLS_FORMATS, Output, Mp4OutputFormat, StreamTarget, Conversion } from './vendor/mediabunny-1.66.0.mjs';

const MANIFEST_LIMIT = 2 * 1024 * 1024;
const SEGMENT_LIMIT = 64 * 1024 * 1024;
const abortError = () => new DOMException('Download stopped.', 'AbortError');
const checkAbort = signal => { if (signal?.aborted) throw abortError(); };

function httpUrl(value, base) {
  const url = new URL(value, base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('HLS resources must use HTTP(S) URLs without embedded credentials.');
  }
  return url.href;
}

function privateHost(host) {
  const name = host.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (name === 'localhost' || name.endsWith('.localhost') || name.endsWith('.local')) return true;
  if (name.includes(':')) {
    if (name === '::' || name === '::1' || /^(?:fc|fd|fe|ff)/.test(name)) return true;
    if (name.startsWith('::ffff:')) {
      const parts = name.slice(7).split(':');
      if (parts.length === 2) {
        const address = (parseInt(parts[0], 16) * 65536 + parseInt(parts[1], 16)) >>> 0;
        return privateHost([address >>> 24, (address >>> 16) & 255, (address >>> 8) & 255, address & 255].join('.'));
      }
    }
    return false;
  }
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(name)) return false;
  const [a, b] = name.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19));
}

// This checks explicit hostnames/IPs; browsers provide no DNS pinning API.
function resourceUrl(value, base, root) {
  const url = httpUrl(value, base);
  if (!privateHost(new URL(root).hostname) && privateHost(new URL(url).hostname)) {
    throw new Error('Public HLS playlists cannot reference local or private network resources.');
  }
  return url;
}

function credentials(url, root) {
  return new URL(url).origin === new URL(root).origin ? 'include' : 'omit';
}

async function fetchResource(url, init) {
  try { return await fetch(url, { ...init, redirect: 'error' }); }
  catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('HLS request failed. Check site access or rescan the final media URL; HTTP redirects are unsupported.');
  }
}

async function readManifest(response, signal) {
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`HLS playlist request failed (HTTP ${response.status}).`);
  }
  if (Number(response.headers.get('content-length')) > MANIFEST_LIMIT) {
    await response.body?.cancel();
    throw new Error('HLS playlist is too large.');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      checkAbort(signal);
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MANIFEST_LIMIT) throw new Error('HLS playlist is too large.');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const data = new Uint8Array(bytes);
  let position = 0;
  for (const chunk of chunks) { data.set(chunk, position); position += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(data);
}

function attributeList(line) {
  const value = line.slice(line.indexOf(':') + 1);
  const fields = [];
  const names = new Set();
  const field = /([A-Z0-9-]+)=("[^"]*"|[^,"\s]+)(,|$)/y;
  let offset = 0;
  while (offset < value.length) {
    field.lastIndex = offset;
    const match = field.exec(value);
    if (!match || names.has(match[1])) throw new Error('HLS attributes require canonical uppercase names, no spacing, and no duplicates.');
    names.add(match[1]);
    fields.push([match[1], match[2]]);
    offset = field.lastIndex;
    if (match[3] && offset === value.length) throw new Error('HLS attributes cannot end with a comma.');
  }
  if (!fields.length) throw new Error('HLS attribute list is empty.');
  return fields;
}

// Keep validated playlists fixed for this operation, including signed URLs and redirects.
async function playlists(root, signal) {
  const urlFor = (value, base) => resourceUrl(value, base, root);
  const cache = new Map();
  const active = new Set();
  let count = 0;
  async function visit(url, depth = 0) {
    checkAbort(signal);
    if (active.has(url)) throw new Error('HLS playlist contains a reference cycle.');
    if (cache.has(url)) return;
    if (++count > 32 || depth > 4) throw new Error('HLS playlist has too many variants or nested playlists.');
    const response = await fetchResource(url, { credentials: credentials(url, root), signal });
    const base = urlFor(response.url || url);
    active.add(url);
    active.add(base);
    const text = await readManifest(response, signal);
    const lines = text.trim().split(/\r?\n/).map(line => line.trim());
    if (lines[0] !== '#EXTM3U') throw new Error('This source is not an HLS playlist.');
    if (lines.some(line => /^#EXT-X-(?:SESSION-KEY|KEY):/.test(line) && !/^#EXT-X-KEY:METHOD=NONE(?:,|$)/.test(line))) {
      throw new Error('Encrypted or DRM-protected HLS downloads are not supported.');
    }
    if (lines.some(line => /^#EXT-X-(?:DEFINE|I-FRAME-STREAM-INF|GAP|SKIP|DISCONTINUITY)(?::|$)/.test(line))) {
      throw new Error('This HLS playlist uses unsupported variables, gaps, discontinuities, or partial variants.');
    }
    const master = lines.some(line => line.startsWith('#EXT-X-STREAM-INF:'));
    if (!master && !lines.includes('#EXT-X-ENDLIST')) throw new Error('Live or unfinished HLS streams are not supported.');
    if (!master && !lines.some(line => line.startsWith('#EXTINF:'))) throw new Error('HLS playlist contains no media.');
    const children = [];
    let pendingVariant = false;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || (line.startsWith('#') && !line.startsWith('#EXT'))) continue;
      const hasAttributes = /^#EXT-X-(?:MEDIA|STREAM-INF|MAP):/.test(line) || /[:,]\s*URI\s*=/i.test(line);
      if (hasAttributes) {
        const fields = attributeList(line);
        for (const field of fields) {
          if (field[0] !== 'URI') continue;
          if (!field[1].startsWith('"') || field[1].length <= 2) throw new Error('HLS resource URI must be quoted and nonempty.');
          const uri = urlFor(field[1].slice(1, -1), base);
          field[1] = `"${uri}"`;
          if (line.startsWith('#EXT-X-MEDIA:')) children.push(uri);
        }
        lines[i] = line.slice(0, line.indexOf(':') + 1) + fields.map(field => field.join('=')).join(',');
      }
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        if (pendingVariant) throw new Error('HLS variant is missing its playlist URI.');
        pendingVariant = true;
        continue;
      }
      if (pendingVariant && line.startsWith('#EXT')) throw new Error('HLS variant is missing its playlist URI.');
      if (line && !line.startsWith('#')) {
        lines[i] = urlFor(line, base);
        if (master && !pendingVariant) throw new Error('HLS variant URI has no stream declaration.');
        if (pendingVariant) children.push(lines[i]);
        pendingVariant = false;
      }
    }
    if (pendingVariant) throw new Error('HLS variant is missing its playlist URI.');
    const entry = { text: lines.join('\n') + '\n', url: base };
    cache.set(url, entry);
    cache.set(base, entry);
    for (const child of children) await visit(child, depth + 1);
    active.delete(url);
    active.delete(base);
  }
  await visit(urlFor(root));
  return cache;
}

async function openInput(url, signal, received = () => {}, pageUrl) {
  url = httpUrl(url);
  const page = pageUrl ? new URL(pageUrl) : null;
  if (page && ['http:', 'https:'].includes(page.protocol)) url = resourceUrl(url, undefined, page.href);
  const cache = await playlists(url, signal);
  checkAbort(signal);
  const source = new UrlSource(httpUrl(url), {
    requestInit: { redirect: 'error' },
    maxCacheSize: 16 * 1024 * 1024,
    parallelism: 1,
    getRetryDelay: () => null,
    fetchFn: async (resource, init) => {
      checkAbort(signal);
      const href = resourceUrl(resource instanceof Request ? resource.url : String(resource), undefined, url);
      const playlist = cache.get(href);
      if (playlist) {
        const result = new Response(playlist.text, { headers: { 'Content-Type': 'application/vnd.apple.mpegurl' } });
        Object.defineProperty(result, 'url', { value: playlist.url });
        return result;
      }
      if (/\.m3u8?$/i.test(new URL(href).pathname)) throw new Error('An HLS playlist was not validated before use.');
      const response = await fetchResource(href, { ...init, credentials: credentials(href, url) });
      resourceUrl(response.url || href, undefined, url);
      if (/mpegurl/i.test(response.headers.get('content-type') || '')) {
        await response.body?.cancel();
        throw new Error('An HLS playlist was not validated before use.');
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`HLS media request failed (HTTP ${response.status}).`);
      }
      if (Number(response.headers.get('content-length')) > SEGMENT_LIMIT) {
        await response.body?.cancel();
        throw new Error('HLS segment exceeds the 64 MiB browser limit.');
      }
      let bytes = 0;
      let prefix = new Uint8Array(0);
      let checkedPrefix = false;
      const body = response.body.pipeThrough(new TransformStream({
        transform(chunk, controller) {
          checkAbort(signal);
          bytes += chunk.byteLength;
          if (bytes > SEGMENT_LIMIT) throw new Error('HLS segment exceeds the 64 MiB browser limit.');
          received(chunk.byteLength);
          if (!checkedPrefix) {
            const consumed = Math.min(4096 - prefix.byteLength, chunk.byteLength);
            const next = new Uint8Array(prefix.byteLength + consumed);
            next.set(prefix);
            next.set(chunk.subarray(0, consumed), prefix.byteLength);
            prefix = next;
            const start = new TextDecoder().decode(prefix, { stream: true }).trimStart();
            if (!start && prefix.byteLength < 4096) return;
            if (!start || start.startsWith('#')) throw new Error('An HLS playlist was not validated before use.');
            checkedPrefix = true;
            controller.enqueue(prefix);
            chunk = chunk.subarray(consumed);
          }
          if (chunk.byteLength) controller.enqueue(chunk);
        },
        flush() { if (!checkedPrefix) throw new Error('HLS media resource has no supported binary content.'); },
      }));
      const result = new Response(body, { status: response.status, headers: response.headers });
      Object.defineProperty(result, 'url', { value: response.url });
      return result;
    },
  });
  const input = new Input({ formats: HLS_FORMATS, source });
  const stop = () => input.dispose();
  signal?.addEventListener('abort', stop, { once: true });
  return { input, dispose() { signal?.removeEventListener('abort', stop); input.dispose(); } };
}

async function describe(input, signal) {
  const videos = await input.getVideoTracks();
  const audios = await input.getAudioTracks();
  if (!videos.length || videos.length + audios.length > 32) throw new Error('HLS has no supported video or too many tracks.');
  const variants = [];
  let duration = 0;
  for (const video of videos) {
    checkAbort(signal);
    if (await video.isLive()) throw new Error('Live HLS streams are not supported.');
    if (await video.getCodec() !== 'avc') continue;
    const config = await video.getDecoderConfig();
    if (!config?.codedWidth || !config?.codedHeight) throw new Error('HLS video dimensions could not be verified.');
    const pairs = [];
    const candidates = audios.filter(audio => video.canBePairedWith(audio));
    for (const audio of candidates) {
      if (await audio.isLive()) throw new Error('Live HLS streams are not supported.');
      if (await audio.getCodec() === 'aac' && await audio.getDecoderConfig()) pairs.push(audio);
    }
    if (audios.length && !pairs.length) continue;
    const trackDuration = await video.getDurationFromMetadata();
    if (!Number.isFinite(trackDuration) || trackDuration <= 0) throw new Error('HLS duration could not be verified.');
    duration = Math.max(duration, trackDuration);
    for (const audio of pairs.length ? pairs : [null]) {
      const width = config.codedWidth;
      const height = config.codedHeight;
      const language = audio ? await audio.getName() || await audio.getLanguageCode() : '';
      variants.push({
        id: `${video.id}:${audio?.id ?? 0}`,
        name: `${width} × ${height}${language && language !== 'und' ? ` · ${language}` : ''}`,
        width, height, bitrate: await video.getBitrate(), codec: audio ? 'AVC + AAC' : 'AVC',
        videoId: video.id, audioId: audio?.id ?? null, format: 'MP4',
      });
    }
  }
  if (!variants.length) throw new Error('No supported AVC (H.264) video with compatible AAC audio was found.');
  return { duration, variants };
}

export async function inspectHls(url, { signal, pageUrl } = {}) {
  let opened;
  try {
    opened = await openInput(url, signal, undefined, pageUrl);
    return await describe(opened.input, signal);
  } catch (error) { if (signal?.aborted) throw abortError(); throw error; }
  finally { opened?.dispose(); }
}

// Ownership of writable transfers here: success closes it; any failure aborts it.
export async function remuxHls(url, { videoId, audioId = null, writable, signal, expected, pageUrl, onProgress = () => {} }) {
  if (!writable || !['write', 'close', 'abort'].every(method => typeof writable[method] === 'function')) {
    throw new TypeError('A writable file with write, close, and abort is required.');
  }
  let opened, conversion, bytesWritten = 0, receivedBytes = 0, stop;
  const report = (percent, status = 'downloading') => onProgress({
    percent, receivedBytes, totalBytes: null, speed: null, eta: null, approximate: true, status,
  });
  try {
    checkAbort(signal);
    opened = await openInput(url, signal, bytes => { receivedBytes += bytes; }, pageUrl);
    const description = await describe(opened.input, signal);
    const selected = description.variants.find(item => item.videoId === videoId && item.audioId === audioId);
    if (!selected) {
      throw new Error('This video/audio selection is unavailable. Rescan the original page.');
    }
    if (expected && (expected.width !== selected.width || expected.height !== selected.height)) {
      throw new Error('The selected quality changed. Rescan the original page.');
    }
    const output = new Output({
      // Write media chunks directly; the small MP4 sample tables are finalized at the end.
      format: new Mp4OutputFormat({ fastStart: false }),
      target: new StreamTarget(new WritableStream({
        async write(chunk) {
          checkAbort(signal);
          await writable.write(chunk);
          bytesWritten = Math.max(bytesWritten, chunk.position + chunk.data.byteLength);
        },
      }), { chunked: true, chunkSize: 1024 * 1024 }),
    });
    conversion = await Conversion.init({
      input: opened.input, output, tracks: 'all', copy: { mode: 'forced' }, showWarnings: false,
      video: track => ({ discard: track.id !== videoId }),
      audio: track => ({ discard: track.id !== audioId }),
    });
    if (!conversion.isValid || conversion.utilizedTracks.length !== (audioId === null ? 1 : 2)
      || conversion.discardedTracks.some(item => item.reason !== 'discarded_by_user')) {
      throw new Error('These HLS tracks cannot be copied to MP4 without transcoding.');
    }
    stop = () => { void conversion.cancel().catch(() => {}); };
    signal?.addEventListener('abort', stop, { once: true });
    checkAbort(signal);
    conversion.onProgress = fraction => report(fraction >= 1 ? null : Math.max(0, fraction * 100), fraction >= 1 ? 'merging' : 'downloading');
    report(0);
    await conversion.execute();
    checkAbort(signal);
    report(null, 'merging');
    await writable.close();
    report(100, 'complete');
    return { bytesWritten };
  } catch (error) {
    opened?.dispose();
    await conversion?.cancel().catch(() => {});
    try { await writable.abort(); } catch {}
    if (signal?.aborted) throw abortError();
    throw error;
  } finally {
    signal?.removeEventListener('abort', stop);
    opened?.dispose();
  }
}
