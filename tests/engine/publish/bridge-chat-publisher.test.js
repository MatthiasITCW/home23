import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BridgeChatPublisher, computeSalience } from '../../../engine/src/publish/bridge-chat-publisher.js';

test('BridgeChatPublisher only publishes above salience threshold', async () => {
  const sent = [];
  const pub = new BridgeChatPublisher({
    salienceThreshold: 0.75,
    sender: async (m) => sent.push(m),
    ledger: { record: async () => {} },
  });
  await pub.onObservation({ salience: 0.6, summary: 'small' });
  assert.equal(sent.length, 0);
  await pub.onObservation({ salience: 0.9, summary: 'big' });
  assert.equal(sent.length, 1);
});

test('computeSalience weights COLLECTED higher than UNCERTIFIED', () => {
  const now = Date.now();
  const collected = { confidence: 0.9, flag: 'COLLECTED', receivedAt: new Date(now).toISOString() };
  const uncertified = { confidence: 0.9, flag: 'UNCERTIFIED', receivedAt: new Date(now).toISOString() };
  assert.ok(computeSalience(collected, { now }) > computeSalience(uncertified, { now }));
});

test('computeSalience decays with age', () => {
  const now = Date.now();
  const fresh = { confidence: 0.9, flag: 'COLLECTED', receivedAt: new Date(now).toISOString() };
  const old = { confidence: 0.9, flag: 'COLLECTED', receivedAt: new Date(now - 60 * 60_000).toISOString() };
  assert.ok(computeSalience(fresh, { now }) > computeSalience(old, { now }));
});
