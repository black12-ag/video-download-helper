import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { execFileSync } from 'node:child_process';

const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const ffprobe = process.env.FFPROBE || 'ffprobe';
const playwright = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const chrome = process.env.CHROME_PATH;
const root = resolve(import.meta.dirname, '..');

function encode(args) { execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args], { timeout: 30_000 }); }

test('browser HLS remux writes playable AVC/AAC MP4 and rejects unsafe inputs', { timeout: 180_000 }, async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'browser-hls-'));
  const requests = [];
  encode(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000', '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '24', '-c:a', 'aac', '-f', 'hls', '-hls_time', '1', '-hls_list_size', '0', join(fixture, 'muxed.m3u8')]);
  encode(['-i', join(fixture, 'muxed.m3u8'), '-map', '0:v', '-c', 'copy', '-f', 'hls', '-hls_time', '1', '-hls_list_size', '0', join(fixture, 'video.m3u8')]);
  encode(['-i', join(fixture, 'muxed.m3u8'), '-map', '0:a', '-c', 'copy', '-f', 'hls', '-hls_time', '1', '-hls_list_size', '0', join(fixture, 'audio.m3u8')]);
  await writeFile(join(fixture, 'master.m3u8'), '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=300000,RESOLUTION=1920x1080,CODECS="avc1.64000c,mp4a.40.2",AUDIO="aud"\nvideo.m3u8\n');
  encode(['-i', join(fixture, 'muxed.m3u8'), '-c', 'copy', '-bsf:a', 'aac_adtstoasc', '-f', 'hls', '-hls_segment_type', 'fmp4', '-hls_time', '1', '-hls_list_size', '0', join(fixture, 'fragmented.m3u8')]);
  encode(['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=24', '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '24', '-f', 'hls', '-hls_time', '1', '-hls_list_size', '0', join(fixture, 'higher.m3u8')]);
  const master = await readFile(join(fixture, 'master.m3u8'), 'utf8');
  await writeFile(join(fixture, 'qualities.m3u8'), master + '#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360,CODECS="avc1.64001e,mp4a.40.2",AUDIO="aud"\nhigher.m3u8\n');
  await writeFile(join(fixture, 'unsupported.m3u8'), master.replace('avc1.64000c', 'hvc1.1.6.L93.B0'));
  await writeFile(join(fixture, 'mixed.m3u8'), master + '#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360,CODECS="hvc1.1.6.L93.B0,mp4a.40.2",AUDIO="aud"\nhigher.m3u8\n');
  await writeFile(join(fixture, 'cycle.m3u8'), '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\ncycle.m3u8\n');
  const muxed = await readFile(join(fixture, 'muxed.m3u8'), 'utf8');
  await writeFile(join(fixture, 'live.m3u8'), muxed.replace('#EXT-X-ENDLIST', ''));
  await writeFile(join(fixture, 'commented-protected.m3u8'), '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=300000,CODECS="avc1.64000c,mp4a.40.2"\n# An intervening comment URI=ignored\n\n# Another comment\naes-protected.m3u8\n');
  await writeFile(join(fixture, 'commented-live.m3u8'), '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=300000\n# An intervening comment\n\nlive.m3u8\n');
  await writeFile(join(fixture, 'hidden-playlist.m3u8'), muxed.replace('muxed0.ts', 'hidden.ts'));
  await writeFile(join(fixture, 'hidden.ts'), muxed);
  await writeFile(join(fixture, 'mime-playlist.m3u8'), muxed.replace('muxed0.ts', 'mime.ts'));
  await writeFile(join(fixture, 'mime.ts'), muxed);
  await writeFile(join(fixture, 'url-playlist.m3u8'), muxed.replace('muxed0.ts', 'protected.m3u8'));
  await writeFile(join(fixture, 'commented-good.m3u8'), '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=300000,CODECS="avc1.64000c,mp4a.40.2"\n# Comment\n\nmuxed.m3u8\n');
  await writeFile(join(fixture, 'aes-protected.m3u8'), muxed.replace('#EXTM3U', '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="license.key",IV=0x00000000000000000000000000000000'));
  await writeFile(join(fixture, 'protected.m3u8'), muxed.replace('#EXTM3U', '#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="license.key"'));
  const protectedAudio = muxed.replace('#EXTM3U', '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=0x00000000000000000000000000000000');
  const attributeCases = [
    'TYPE="AUDIO",URI="CHILD"', 'TYPE=AUDIO,uri="CHILD"', 'TYPE=AUDIO,URI ="CHILD"',
    'type=AUDIO,URI="CHILD"', 'TYPE=AUDIO,URI="CHILD",URI="CHILD"',
  ];
  const prefixCases = ['\ufeff', ' \n\t', '# an ordinary comment\n'];
  const boundaryCases = [];
  for (let style = 0; style < attributeCases.length; style++) {
    for (let prefix = 0; prefix < prefixCases.length; prefix++) {
      const name = `attribute-${style}-${prefix}`;
      const child = `audio-${style}-${prefix}.bin`;
      const fields = attributeCases[style].replaceAll('CHILD', child);
      boundaryCases.push({ name, canonical: style === 0 });
      await writeFile(join(fixture, child), prefixCases[prefix] + protectedAudio);
      await writeFile(join(fixture, `${name}.m3u8`), `#EXTM3U\n#EXT-X-MEDIA:${fields},GROUP-ID="aud",NAME="English"\n#EXT-X-STREAM-INF:BANDWIDTH=300000,CODECS="avc1.64000c,mp4a.40.2",AUDIO="aud"\nvideo.m3u8\n`);
    }
  }
  const prefixFallbacks = [];
  for (const [index, prefix] of [...prefixCases, ' '.repeat(4097)].entries()) {
    const name = `prefix-${index}`;
    prefixFallbacks.push(name);
    await writeFile(join(fixture, `${name}.bin`), prefix + protectedAudio);
    await writeFile(join(fixture, `${name}.m3u8`), muxed.replace('muxed0.ts', `${name}.bin`));
  }
  await writeFile(join(fixture, 'bad-url.m3u8'), muxed.replace('muxed0.ts', 'file:///etc/passwd'));
  await writeFile(join(fixture, 'malformed.m3u8'), '<html>sign in</html>');
  await writeFile(join(fixture, 'slow-media.m3u8'), muxed.replace('muxed0.ts', 'stalled.ts'));
  let stalled = false, canceledSegment = false;
  const server = createServer(async (req, res) => {
    requests.push(req.url);
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>HLS browser test</title>'); return; }
    try {
      if (path === '/slow.m3u8') {
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.write('#EXTM3U\n'); stalled = true; return;
      }
      if (path === '/redirect.m3u8') { res.writeHead(302, { Location: '/muxed.m3u8' }).end(); return; }
      if (path === '/stalled.ts') {
        const data = await readFile(join(fixture, 'muxed0.ts'));
        res.writeHead(200, { 'Content-Type': 'video/mp2t', 'Content-Length': data.length });
        res.on('close', () => { canceledSegment = true; });
        res.write(data.subarray(0, 188)); return;
      }
      const file = path.startsWith('/extension/') ? join(root, path) : join(fixture, path);
      const data = await readFile(file);
      res.setHeader('Content-Type', extname(file) === '.js' || extname(file) === '.mjs' ? 'text/javascript' : extname(file) === '.m3u8' || path === '/mime.ts' ? 'application/vnd.apple.mpegurl' : 'video/mp2t');
      res.setHeader('Content-Length', data.length);
      res.end(data);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright.chromium.launch({ channel: 'chromium', ...(chrome ? { executablePath: chrome } : {}), headless: true });
  try {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('pageerror', error => consoleErrors.push(error.message));
    await page.goto(origin);
    for (const name of ['muxed', 'master', 'fragmented', 'qualities']) {
      const result = await page.evaluate(async ({ origin, name }) => {
        const { inspectHls, remuxHls } = await import('/extension/hls-media.js');
        const source = `${origin}/${name}.m3u8`;
        const inspection = await inspectHls(source);
        const selected = inspection.variants.at(-1);
        const directory = await navigator.storage.getDirectory();
        const file = await directory.getFileHandle(`${name}.mp4`, { create: true });
        const progress = [];
        let closed = false;
        const writable = await file.createWritable();
        const output = await remuxHls(source, {
          ...selected, expected: selected,
          writable: { write: chunk => writable.write(chunk), async close() { await writable.close(); closed = true; }, abort: () => writable.abort() },
          onProgress: value => progress.push({ ...value, closed }),
        });
        const data = Array.from(new Uint8Array(await (await file.getFile()).arrayBuffer()));
        return { inspection, output, progress, data };
      }, { origin, name });
      assert.ok(result.inspection.duration >= 4 && result.inspection.duration < 5);
      const expectedWidth = name === 'qualities' ? 640 : 320;
      const expectedHeight = name === 'qualities' ? 360 : 180;
      assert.equal(result.inspection.variants.at(-1).width, expectedWidth, 'actual media dimensions override master declaration');
      assert.equal(result.inspection.variants.at(-1).height, expectedHeight);
      if (name === 'qualities') assert.equal(result.inspection.variants.length, 2);
      assert.ok(result.inspection.variants[0].audioId);
      assert.equal(result.output.bytesWritten, result.data.length);
      assert.ok(result.progress.every(item => item.percent !== 100 || item.closed));
      assert.equal(result.progress.at(-1).status, 'complete');
      assert.equal(result.progress.at(-1).percent, 100);
      assert.ok(result.progress.some(item => item.status === 'merging' && item.percent === null));
      const output = join(fixture, `${name}.mp4`);
      await writeFile(output, Buffer.from(result.data));
      const probe = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_name,codec_type,width,height:format=duration', '-of', 'json', output], { encoding: 'utf8' }));
      assert.deepEqual(probe.streams.map(track => track.codec_name).sort(), ['aac', 'h264']);
      assert.equal(probe.streams.find(track => track.codec_type === 'video').height, expectedHeight);
      assert.ok(Number(probe.format.duration) >= 3.9 && Number(probe.format.duration) < 5);
      // Decode every output packet to catch corrupt remuxes that merely contain track metadata.
      encode(['-i', output, '-f', 'null', '-']);
      console.log(`${name}: ${result.output.bytesWritten} bytes, ${probe.streams.map(track => track.codec_name).join('+')}, ${probe.format.duration}s; full decode passed`);
    }
    const rejected = await page.evaluate(async origin => {
      const { inspectHls, remuxHls } = await import('/extension/hls-media.js');
      const errors = {};
      for (const name of ['live', 'protected', 'bad-url', 'malformed', 'unsupported', 'cycle', 'redirect', 'commented-protected', 'commented-live', 'hidden-playlist', 'mime-playlist', 'url-playlist']) {
        try { await inspectHls(`${origin}/${name}.m3u8`); } catch (error) { errors[name] = error.message; }
      }
      errors.commentedGood = (await inspectHls(`${origin}/commented-good.m3u8`)).variants.length;
      errors.mixedCount = (await inspectHls(`${origin}/mixed.m3u8`)).variants.length;
      const selected = (await inspectHls(`${origin}/master.m3u8`)).variants[0];
      for (const [key, options] of Object.entries({ wrongAudio: { audioId: null }, changedQuality: { expected: { width: 1920, height: 1080 } } })) {
        let aborted = false, writes = 0;
        try {
          await remuxHls(`${origin}/master.m3u8`, { ...selected, ...options, writable: { write() { writes++; }, close() {}, abort() { aborted = true; } } });
        } catch (error) { errors[key] = { message: error.message, aborted, writes }; }
      }
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 100);
      try { await inspectHls(`${origin}/slow.m3u8`, { signal: controller.signal }); } catch (error) { errors.abort = error.name; }
      const segmentController = new AbortController();
      setTimeout(() => segmentController.abort(), 150);
      try { await inspectHls(`${origin}/slow-media.m3u8`, { signal: segmentController.signal }); } catch (error) { errors.segmentAbort = error.name; }
      let aborted = false, closed = false;
      const stop = new AbortController();
      try {
        await remuxHls(`${origin}/muxed.m3u8`, {
          ...(await inspectHls(`${origin}/muxed.m3u8`)).variants[0], signal: stop.signal,
          writable: { write() { stop.abort(); }, close() { closed = true; }, abort() { aborted = true; } },
        });
      } catch (error) { errors.midstream = { name: error.name, aborted, closed }; }
      return errors;
    }, origin);
    assert.match(rejected.live, /Live|unfinished/);
    assert.match(rejected.protected, /Encrypted|DRM/);
    assert.match(rejected['commented-protected'], /Encrypted|DRM/);
    assert.match(rejected['commented-live'], /Live|unfinished/);
    assert.equal(rejected.commentedGood, 1);
    for (const name of ['hidden-playlist', 'mime-playlist', 'url-playlist']) assert.match(rejected[name], /not validated before use/);
    assert.match(rejected['bad-url'], /HTTP/);
    assert.match(rejected.malformed, /not an HLS/);
    assert.match(rejected.unsupported, /No supported AVC/);
    assert.equal(rejected.mixedCount, 1);
    assert.match(rejected.redirect, /redirects are unsupported/);
    assert.equal(rejected.segmentAbort, 'AbortError');
    assert.equal(canceledSegment, true);
    assert.match(rejected.cycle, /cycle/);
    assert.deepEqual([rejected.wrongAudio.aborted, rejected.wrongAudio.writes], [true, 0]);
    assert.match(rejected.changedQuality.message, /quality changed/);
    assert.deepEqual([rejected.changedQuality.aborted, rejected.changedQuality.writes], [true, 0]);
    assert.equal(rejected.abort, 'AbortError');
    assert.deepEqual(rejected.midstream, { name: 'AbortError', aborted: true, closed: false });
    assert.equal(stalled, true);
    const boundaryRejections = await page.evaluate(async ({ origin, boundaryCases, prefixFallbacks }) => {
      const { inspectHls } = await import('/extension/hls-media.js');
      const errors = {};
      for (const { name } of boundaryCases) {
        try { await inspectHls(`${origin}/${name}.m3u8`); } catch (error) { errors[name] = error.message; }
      }
      for (const name of prefixFallbacks) {
        try { await inspectHls(`${origin}/${name}.m3u8`); } catch (error) { errors[name] = error.message; }
      }
      return errors;
    }, { origin, boundaryCases, prefixFallbacks });
    for (const { name, canonical } of boundaryCases) {
      assert.match(boundaryRejections[name], canonical ? /Encrypted|DRM|not an HLS/ : /canonical/);
    }
    for (const name of prefixFallbacks) assert.match(boundaryRejections[name], /not validated before use/);
    assert.ok(!requests.some(url => /license\.key|key\.bin/.test(url)), 'protected manifests never fetch keys');
    const security = await page.evaluate(async origin => {
      const { inspectHls, remuxHls } = await import('/extension/hls-media.js');
      const originalFetch = globalThis.fetch;
      const calls = [];
      const blocked = [];
      let canceledRejectedBodies = 0;
      const earlyErrors = [];
      const rootErrors = [];
      let rootFetches, rootAborted = false;
      try {
        globalThis.fetch = async (resource, init) => {
          const href = String(resource);
          calls.push({ url: href, credentials: init.credentials, redirect: init.redirect });
          if (href === 'https://public.example/oversize.m3u8' || href === 'https://public.example/forbidden.m3u8') {
            return new Response(new ReadableStream({ cancel() { canceledRejectedBodies++; } }), {
              status: href.includes('forbidden') ? 403 : 200,
              headers: { 'Content-Length': '3000000' },
            });
          }
          if (href.startsWith('https://public.example/')) {
            const target = new URL(href).searchParams.get('target');
            return new Response(`#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\n${target}\n`);
          }
          const localAlias = origin.replace('127.0.0.1', 'localhost');
          if (href === `${localAlias}/credentials.m3u8`) {
            const response = await originalFetch(`${origin}/muxed.m3u8`);
            const text = (await response.text()).replace(/^(muxed\d+\.ts)$/gm, `${origin}/$1`);
            const result = new Response(text);
            Object.defineProperty(result, 'url', { value: href });
            return result;
          }
          return originalFetch(resource, init);
        };
        const beforeRoots = calls.length;
        try { await inspectHls(`${origin}/muxed.m3u8`, { pageUrl: 'https://public.example/watch' }); } catch (error) { rootErrors.push(error.message); }
        try {
          await remuxHls(`${origin}/muxed.m3u8`, { pageUrl: 'https://public.example/watch', writable: {
            write() { throw new Error('unexpected write'); }, close() { throw new Error('unexpected close'); }, abort() { rootAborted = true; },
          } });
        } catch (error) { rootErrors.push(error.message); }
        rootFetches = calls.length - beforeRoots;
        for (const target of ['http://localhost/a.m3u8' , 'http://localhost./a.m3u8', 'http://127.1/a.m3u8', 'http://10.1.2.3/a.m3u8', 'http://169.254.169.254/a.m3u8', 'http://192.168.1.1/a.m3u8', 'http://[::1]/a.m3u8', 'http://[::ffff:127.0.0.1]/a.m3u8', 'http://printer.local/a.m3u8']) {
          try { await inspectHls(`https://public.example/master.m3u8?target=${encodeURIComponent(target)}`); }
          catch (error) { blocked.push(error.message); }
        }
        for (const path of ['oversize', 'forbidden']) {
          try { await inspectHls(`https://public.example/${path}.m3u8`); } catch (error) { earlyErrors.push(error.message); }
        }
        await inspectHls(`${origin.replace('127.0.0.1', 'localhost')}/credentials.m3u8`, { pageUrl: `${origin}/watch` });
        return { blocked, calls, canceledRejectedBodies, earlyErrors, rootErrors, rootFetches, rootAborted };
      } finally { globalThis.fetch = originalFetch; }
    }, origin);
    assert.equal(security.rootFetches, 0);
    assert.equal(security.rootAborted, true);
    assert.equal(security.rootErrors.length, 2);
    assert.ok(security.rootErrors.every(message => /private network/.test(message)));
    assert.equal(security.blocked.length, 9);
    assert.equal(security.canceledRejectedBodies, 2);
    assert.match(security.earlyErrors[0], /too large/);
    assert.match(security.earlyErrors[1], /HTTP 403/);
    assert.ok(security.blocked.every(message => /private network/.test(message)));
    assert.ok(security.calls.every(call => call.redirect === 'error'));
    assert.ok(security.calls.filter(call => call.url.includes('localhost')).every(call => call.credentials === 'include'));
    assert.ok(security.calls.filter(call => call.url.startsWith(origin)).every(call => call.credentials === 'omit'));
    assert.ok(!security.calls.some(call => /169\.254|192\.168|printer\.local/.test(call.url) && !call.url.startsWith('https://public.example')));
    assert.deepEqual(consoleErrors, []);
    console.log('Rejected live/encrypted/invalid URL/HTML/unsupported codec/cyclic playlists/redirects/wrong audio/changed quality; mixed AVC+HEVC master kept AVC. Canceled playlist and segment fetches plus mid-write. Same-origin cookies only; blocked nine private/local references and public-page/private-root fetches. Rejected15 MEDIA attribute/prefix cases and4 hidden textual prefixes; no key requested.');
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(fixture, { recursive: true, force: true });
  }
});
