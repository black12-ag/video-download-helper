import test from 'node:test';
import assert from 'node:assert/strict';
import { browserProgress, transferSummary, formatTime, activeTransfer } from '../extension/transfers.js';

test('browser byte samples produce a real percentage, speed and ETA', () => {
  const result = browserProgress({ state: 'in_progress', bytesReceived: 500, totalBytes: 1000 }, { sampleAt: 1000, sampleBytes: 100 }, 3000);
  assert.equal(result.percent, 50);
  assert.equal(result.speed, 200);
  assert.equal(result.eta, 2.5);
});
test('unknown total stays indeterminate; paused and stopped transfers do not invent speed', () => {
  const result = browserProgress({ state: 'in_progress', bytesReceived: 500, totalBytes: -1, fileSize: -1, paused: true }, {}, 3000);
  assert.equal(result.percent, null);
  assert.equal(result.eta, null);
  assert.equal(result.speed, 0);
  assert.match(transferSummary(result), /Unknown total/);
  assert.equal(browserProgress({ state: 'interrupted', error: 'USER_CANCELED' }, {}).status, 'cancelled');
});
test('completion has final bytes and does not show a stale ETA', () => {
  const result = browserProgress({ state: 'complete', bytesReceived: 1048576, totalBytes: -1 }, {});
  assert.equal(result.percent, 100);
  assert.equal(result.totalBytes, 1048576);
  assert.equal(transferSummary(result), '1.0 MB · Saved');
  assert.equal(activeTransfer(result), false);
  assert.equal(formatTime(null), 'Calculating time…');
});
