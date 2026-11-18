import test from 'node:test';
import assert from 'node:assert/strict';

for (const version of [1, 2]) test(`engine progress protocol ${version} compatibility`, async () => {
  let listener, disconnected = false;
  globalThis.chrome = {
    permissions: { contains: async () => true },
    runtime: { connectNative: () => ({
      onMessage: { addListener: fn => { listener = fn; } },
      onDisconnect: { addListener: () => {} },
      postMessage: message => queueMicrotask(() => listener({ id: message.id, data: { ready: true, progressVersion: version } })),
      disconnect: () => { disconnected = true; },
    }) },
  };
  const { engineReady } = await import(`../extension/engine.js?protocol=${version}`);
  assert.equal(await engineReady(), version === 2);
  assert.equal(disconnected, version === 1, 'old helper must reconnect after an update');
});
