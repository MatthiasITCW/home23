import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkerHandlers } from '../../src/workers/connector.js';

test('worker handlers list workers through injected dependencies', async () => {
  const handlers = createWorkerHandlers({
    projectRoot: '/tmp/home23',
    listWorkers: () => [{ name: 'systems', displayName: 'Systems', ownerAgent: 'jerry', class: 'ops', purpose: 'Diagnose' }],
    listTemplates: () => [],
    runWorker: async () => { throw new Error('not used'); },
    readRunReceipt: async () => { throw new Error('not used'); }
  });

  const result = await handlers.listWorkers();
  assert.equal(result.workers[0].name, 'systems');
});

test('worker handlers start a run through injected runner', async () => {
  const handlers = createWorkerHandlers({
    projectRoot: '/tmp/home23',
    listWorkers: () => [],
    listTemplates: () => [],
    runWorker: async request => ({
      runId: 'wr_1',
      runPath: '/tmp/home23/instances/workers/systems/runs/wr_1',
      receipt: {
        schema: 'home23.worker-run.v1',
        runId: 'wr_1',
        worker: 'systems',
        ownerAgent: 'jerry',
        requestedBy: request.requestedBy,
        startedAt: '2026-05-02T00:00:00.000Z',
        finishedAt: '2026-05-02T00:01:00.000Z',
        status: 'no_change',
        verifierStatus: 'pass',
        summary: request.prompt,
        actions: [],
        evidence: [],
        artifacts: [],
        memoryCandidates: []
      }
    }),
    readRunReceipt: async () => { throw new Error('not used'); }
  });

  const result = await handlers.startRun('systems', { prompt: 'check host', requestedBy: 'api' });
  assert.equal(result.runId, 'wr_1');
  assert.equal(result.receipt.summary, 'check host');
});

test('worker handlers promote memory candidates for an existing receipt', async () => {
  const handlers = createWorkerHandlers({
    projectRoot: '/tmp/home23',
    listWorkers: () => [],
    listTemplates: () => [],
    runWorker: async () => { throw new Error('not used'); },
    readRunReceipt: async () => ({
      schema: 'home23.worker-run.v1',
      runId: 'wr_1',
      worker: 'systems',
      ownerAgent: 'jerry',
      requestedBy: 'api',
      startedAt: '2026-05-02T00:00:00.000Z',
      finishedAt: '2026-05-02T00:01:00.000Z',
      status: 'no_change',
      verifierStatus: 'pass',
      summary: 'checked',
      actions: [],
      evidence: [],
      artifacts: [],
      memoryCandidates: [{ text: 'Use scoped PM2 checks first.', confidence: 0.9 }]
    })
  });

  const result = await handlers.promoteMemory('wr_1');
  assert.equal(result.runId, 'wr_1');
  assert.equal(result.candidates, 1);
  assert.equal(result.status, 'ready_for_memory_curator');
});
