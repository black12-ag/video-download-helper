import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaInfo, filename, mergeMedia } from '../extension/media.js';

test('recognizes signed files and extensionless video responses', () => {
  assert.equal(mediaInfo('https://a.test/movie.MP4?token=x').format, 'MP4');
  assert.equal(mediaInfo('https://a.test/file?id=2', 'video/webm').format, 'WEBM');
  assert.equal(mediaInfo('https://a.test/master.m3u8').stream, true);
  assert.equal(mediaInfo('https://a.test/file', 'application/dash+xml').stream, true);
});
test('rejects unsafe URLs, non-media and stream fragments', () => {
  for (const url of ['javascript:alert(1)', 'file:///a.mp4', 'blob:https://a.test/1', 'https://a.test/a.ts', 'https://a.test/a.m4s', 'https://a.test/a.html']) assert.equal(mediaInfo(url), null);
  assert.equal(mediaInfo('https://a.test/seg.m4s', 'video/mp4'), null);
});
test('keeps signed URLs distinct and merges repeated observations', () => {
  const a = { url: 'https://a.test/a.mp4?sig=1', title: 'Movie', size: 12 };
  const result = mergeMedia([a], [{ ...a, width: 1280 }, { ...a, url: 'https://a.test/a.mp4?sig=2' }]);
  assert.equal(result.length, 2);
  assert.equal(result[0].size, 12);
  assert.equal(result[0].width, 1280);
});
test('filenames cannot escape the downloads folder', () => {
  const name = filename({ title: '../ bad:/name\u0000', format: 'MP4' });
  assert.ok(!/[\\/:\u0000]/.test(name));
  assert.ok(!name.startsWith('.'));
  assert.ok(name.endsWith('.mp4'));
});
