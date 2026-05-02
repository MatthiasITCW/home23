import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { writeWorkerReceipt } from '../../src/workers/receipts.js';
import type { WorkerRunReceipt } from '../../src/workers/types.js';

function receipt(runId = 'wr_20260502_143000_systems_ab12'): WorkerRunReceipt {
  return {
    schema: 'home23.worker-run.v1',
    runId,
    worker: 'systems',
    ownerAgent: 'jerry',
    requestedBy: 'live-problems',
    startedAt: '2026-05-02T14:30:00.000Z',
    finishedAt: '2026-05-02T14:42:00.000Z',
    status: 'fixed',
    verifierStatus: 'pass',
    summary: 'Scoped process check passed.',
    rootCause: 'Dashboard process needed scoped restart.',
    actions: [{ type: 'pm2_restart', target: 'home23-jerry-dash' }],
    evidence: [{ type: 'http', detail: 'GET /api/state returned 200', status: 'pass' }],
    artifacts: ['instances/workers/systems/runs/wr_20260502_143000_systems_ab12/transcript.md'],
    memoryCandidates: [{ text: 'Dashboard state checks should use port 5002.', confidence: 0.9, appliesTo: ['dashboard'] }]
  };
}

test('writeWorkerReceipt writes run receipt, owner workspace markdown, and brain jsonl', () => {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'home23-receipts-'));
  const runPath = path.join(projectRoot, 'instances', 'workers', 'systems', 'runs', receipt().runId);
  const written = writeWorkerReceipt(projectRoot, runPath, receipt());

  assert.equal(existsSync(written.receiptPath), true);
  assert.equal(existsSync(path.join(projectRoot, 'instances', 'jerry', 'workspace', 'worker-runs', `${receipt().runId}.md`)), true);
  assert.equal(existsSync(path.join(projectRoot, 'instances', 'jerry', 'brain', 'worker-runs.jsonl')), true);

  const brainLine = readFileSync(path.join(projectRoot, 'instances', 'jerry', 'brain', 'worker-runs.jsonl'), 'utf8').trim();
  const parsed = JSON.parse(brainLine);
  assert.equal(parsed.runId, receipt().runId);
  assert.equal(parsed.summary, 'Scoped process check passed.');
  assert.equal(parsed.transcriptIncluded, false);
});
