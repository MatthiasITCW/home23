import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildWorkerContextSection } from '../../src/agent/context-assembly.js';

test('buildWorkerContextSection shows roster and recent receipts without transcripts', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'home23-worker-context-'));
  mkdirSync(path.join(root, 'instances', 'workers', 'systems'), { recursive: true });
  mkdirSync(path.join(root, 'instances', 'jerry', 'brain'), { recursive: true });
  writeFileSync(path.join(root, 'instances', 'workers', 'systems', 'worker.yaml'), [
    'kind: worker',
    'name: systems',
    'displayName: Systems',
    'ownerAgent: jerry',
    'class: ops',
    'purpose: Diagnose host issues.',
    'visibleTo:',
    '  - jerry'
  ].join('\n'));
  writeFileSync(path.join(root, 'instances', 'jerry', 'brain', 'worker-runs.jsonl'), JSON.stringify({
    runId: 'wr_1',
    worker: 'systems',
    status: 'no_change',
    verifierStatus: 'pass',
    summary: 'Checked host signal.',
    transcriptIncluded: false
  }) + '\n');

  const section = buildWorkerContextSection(root, 'jerry');
  assert.match(section, /systems/);
  assert.match(section, /Checked host signal/);
  assert.doesNotMatch(section, /transcript\.md/);
});
