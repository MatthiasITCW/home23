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

test('BridgeChatPublisher suppresses ambient high-salience observations', async () => {
  const sent = [];
  const pub = new BridgeChatPublisher({
    salienceThreshold: 0.75,
    sender: async (m) => sent.push(m),
    ledger: { record: async () => {} },
    logger: { info: () => {}, warn: () => {} },
  });

  const result = await pub.onObservation({
    salience: 0.95,
    summary: 'routine pressure sample',
    observation: {
      flag: 'COLLECTED',
      confidence: 0.99,
      payload: { severity: 'routine', pressure_pa: 101234 },
    },
  });

  assert.equal(result, null);
  assert.equal(sent.length, 0);
});

test('BridgeChatPublisher sends action-required high-salience observations', async () => {
  const sent = [];
  const pub = new BridgeChatPublisher({
    salienceThreshold: 0.75,
    sender: async (m) => sent.push(m),
    ledger: { record: async () => {} },
  });

  await pub.onObservation({
    salience: 0.95,
    summary: 'bridge needs owner decision',
    observation: {
      flag: 'COLLECTED',
      confidence: 0.99,
      payload: { severity: 'normal', requiresAction: true },
    },
  });

  assert.equal(sent.length, 1);
});

test('BridgeChatPublisher does not record success when no sender is configured', async () => {
  let records = 0;
  const pub = new BridgeChatPublisher({
    salienceThreshold: 0.75,
    ledger: { record: async () => { records += 1; } },
  });

  const result = await pub.onObservation({ salience: 0.9, summary: 'big' });

  assert.equal(result, null);
  assert.equal(records, 0);
});

test('BridgeChatPublisher does not record success when sender fails', async () => {
  let records = 0;
  const warnings = [];
  const pub = new BridgeChatPublisher({
    salienceThreshold: 0.75,
    sender: async () => { throw new Error('HTTP 503 bridge-chat not configured'); },
    ledger: { record: async () => { records += 1; } },
    logger: { warn: (...args) => warnings.push(args), info: () => {} },
  });

  const result = await pub.onObservation({ salience: 0.9, summary: 'big' });

  assert.equal(result, false);
  assert.equal(records, 0);
  assert.ok(warnings.some((args) => String(args[0]).includes('bridge-chat failed')));
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
