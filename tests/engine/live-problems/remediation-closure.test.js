import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { LiveProblemStore } = require('../../../engine/src/live-problems/store.js');
const { seedAll } = require('../../../engine/src/live-problems/seed.js');
const { isRestartableProcess } = require('../../../engine/src/live-problems/remediators.js');
const { classifyDispatchRecipe } = require('../../../engine/src/live-problems/loop.js');

test('seedAll prunes obsolete generic agent live-problem seeds', () => {
  const dir = mkdtempSync(join(tmpdir(), 'home23-live-problems-'));
  try {
    writeFileSync(join(dir, 'live-problems.json'), JSON.stringify({
      problems: [{
        id: 'agent_harness_online',
        seedOrigin: 'system',
        state: 'chronic',
        claim: 'Harness process home23-agent-harness is running',
        verifier: { type: 'pm2_status', args: { name: 'home23-agent-harness' } },
        remediation: [{ type: 'pm2_restart', args: { name: 'home23-agent-harness' } }],
      }],
    }));

    const store = new LiveProblemStore({ brainDir: dir });
    seedAll(store, { agentName: 'forrest', dashboardPort: '5012', bridgePort: '5014' });

    assert.equal(store.get('agent_harness_online'), undefined);
    assert.equal(store.get('forrest_harness_online')?.verifier?.args?.name, 'home23-forrest-harness');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolved verification clears stale escalation state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'home23-live-problems-'));
  try {
    const store = new LiveProblemStore({ brainDir: dir });
    store.upsert({
      id: 'example',
      claim: 'example problem',
      verifier: { type: 'file_exists', args: { path: '/tmp/nope' } },
      remediation: [],
      escalated: true,
      escalatedAt: '2026-04-23T00:00:00.000Z',
    });

    store.recordVerification('example', { ok: true, detail: 'fixed' });

    const p = store.get('example');
    assert.equal(p.state, 'resolved');
    assert.equal(p.escalated, false);
    assert.equal(p.escalatedAt, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('completed unknown diagnostic advances instead of looping forever', () => {
  assert.deepEqual(
    classifyDispatchRecipe({
      dispatchOutcome: 'unknown',
      verifierStatus: 'unknown',
      summary: 'agent completed without proving the verifier passes',
    }),
    { outcome: 'failed', advance: true },
  );
});

test('home23 engine process names remain restartable, including self names', () => {
  const prev = process.env.INSTANCE_ID;
  process.env.INSTANCE_ID = 'home23-jerry';
  try {
    assert.equal(isRestartableProcess('home23-jerry'), true);
    assert.equal(isRestartableProcess('home23-jerry-harness'), true);
    assert.equal(isRestartableProcess('cosmo23-jtr'), false);
    assert.equal(isRestartableProcess('home23-jerry;rm -rf /'), false);
  } finally {
    if (prev === undefined) delete process.env.INSTANCE_ID;
    else process.env.INSTANCE_ID = prev;
  }
});
