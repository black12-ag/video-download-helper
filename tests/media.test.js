import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaInfo, filename, mergeMedia, groupMedia } from '../extension/media.js';

test('recognizes signed files and extensionless video responses', () => {
  assert.equal(mediaInfo('https://a.test/movie.MP4?token=x').format, 'MP4');
  assert.equal(mediaInfo('https://a.test/file?id=2', 'video/webm').format, 'WEBM');
  assert.equal(mediaInfo('https://a.test/master.m3u8').stream, true);
  assert.equal(mediaInfo('https://a.test/file', 'application/dash+xml').stream, true);
});
test('rejects unsafe URLs, non-media and stream fragments', () => {
  for (const url of ['javascript:alert(1)', 'file:///a.mp4', 'blob:https://a.test/1', 'https://a.test/a.ts', 'https://a.test/a.m4s', 'https://a.test/a.html']) assert.equal(mediaInfo(url), null);
  assert.equal(mediaInfo('https://a.test/seg.m4s', 'video/mp4'), null);
  assert.equal(mediaInfo('https://a.test/clip.mp4?range=100-200', 'video/mp4'), null);
  assert.equal(mediaInfo('https://a.test/master.m3u8', 'text/html'), null);
  assert.equal(mediaInfo('https://a.test/clip.cmfa', 'video/mp4'), null);
});
test('recognizes additional whole-file video formats', () => {
  assert.equal(mediaInfo('https://a.test/clip.mkv').format, 'MKV');
  assert.equal(mediaInfo('https://a.test/file', 'video/x-msvideo').format, 'AVI');
  assert.equal(filename({ title: 'Holiday.avi', format: 'AVI' }), 'Holiday.avi');
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
test('rename keeps the real format, handles blank names and preserves Unicode', () => {
  const item = { title: 'Original', height: 720, format: 'MP4' };
  assert.equal(filename(item, 'My holiday.webm'), 'My holiday.mp4');
  assert.equal(filename(item, '  '), 'Original-720p.mp4');
  assert.equal(filename(item, 'ጉዞ 2026'), 'ጉዞ 2026.mp4');
  assert.ok(new TextEncoder().encode(filename(item, '🎥'.repeat(120))).length < 240);
  assert.equal(filename(item, 'CON'), '_CON.mp4');
});
test('specific media titles and metadata survive later network responses', () => {
  const url = 'https://a.test/movie.mp4';
  const result = mergeMedia([{ url, title: 'Actual video', titleRank: 3, duration: 60, groupKey: 'video-1' }], [{ url, title: 'Website', titleRank: 0, size: 100 }]);
  assert.equal(result[0].title, 'Actual video');
  assert.equal(result[0].duration, 60);
  assert.equal(result[0].groupKey, 'video-1');
  assert.equal(result[0].size, 100);
});
test('groups only explicitly related alternatives and selects highest direct quality first', () => {
  const groups = groupMedia([
    { url: 'https://a.test/low.mp4', groupKey: 'a', height: 360 },
    { url: 'https://a.test/master.m3u8', groupKey: 'a', stream: true },
    { url: 'https://a.test/high.mp4', groupKey: 'a', height: 1080 },
    { url: 'https://a.test/other.mp4', title: 'Same page' },
    { url: 'https://a.test/ad.mp4', title: 'Same page' },
  ]);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].items[0].height, 1080);
  assert.equal(groups[0].items.length, 3);
});
