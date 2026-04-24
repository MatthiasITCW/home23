import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { Orchestrator } = require('../../../engine/src/core/orchestrator');

function makeHarness(dir, processAction) {
  const logs = [];
  const orchestrator = Object.create(Orchestrator.prototype);
  orchestrator.config = { logsDir: dir };
  orchestrator.cycleCount = 42;
  orchestrator.processAction = processAction;
  orchestrator.logger = {
    info: (message, meta) => logs.push({ level: 'info', message, meta }),
    warn: (message, meta) => logs.push({ level: 'warn', message, meta }),
    error: (message, meta) => logs.push({ level: 'error', message, meta }),
  };
  return { orchestrator, logs };
}

test('pollActionQueue writes completion receipts and skips duplicate idempotency keys', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'home23-actions-'));
  const queuePath = path.join(dir, 'actions-queue.json');
  fs.writeFileSync(queuePath, JSON.stringify({
    actions: [
      { actionId: 'a1', idempotencyKey: 'complete_task:t1', type: 'complete_task', status: 'pending' },
      { actionId: 'a2', idempotencyKey: 'complete_task:t1', type: 'complete_task', status: 'pending' },
    ],
  }), 'utf8');

  let calls = 0;
  const { orchestrator } = makeHarness(dir, async () => { calls++; });
  await orchestrator.pollActionQueue();

  const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  assert.equal(calls, 1);
  assert.equal(queue.actions[0].status, 'completed');
  assert.equal(queue.actions[1].status, 'completed');
  assert.equal(queue.actions[1].completedViaReceipt, true);

  const receipts = fs.readFileSync(path.join(dir, 'actions-receipts.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].actionId, 'a1');
  assert.equal(receipts[0].idempotencyKey, 'complete_task:t1');
});

test('pollActionQueue skips stale pending actions already present in receipt log', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'home23-actions-'));
  const queuePath = path.join(dir, 'actions-queue.json');
  const receiptsPath = path.join(dir, 'actions-receipts.jsonl');
  fs.writeFileSync(receiptsPath, JSON.stringify({
    at: '2026-04-24T12:00:00Z',
    actionId: 'a1',
    idempotencyKey: 'complete_plan:p1',
    type: 'complete_plan',
    status: 'completed',
  }) + '\n', 'utf8');
  fs.writeFileSync(queuePath, JSON.stringify({
    actions: [
      { actionId: 'a1', idempotencyKey: 'complete_plan:p1', type: 'complete_plan', status: 'pending' },
    ],
  }), 'utf8');

  let calls = 0;
  const { orchestrator } = makeHarness(dir, async () => { calls++; });
  await orchestrator.pollActionQueue();

  const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  assert.equal(calls, 0);
  assert.equal(queue.actions[0].status, 'completed');
  assert.equal(queue.actions[0].completedViaReceipt, true);
});
