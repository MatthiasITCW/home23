import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { verifyArtifactLoop } = require('../../../engine/src/artifacts/artifact-loop-verifier.js');
const { ArtifactRegistry } = require('../../../engine/src/artifacts/artifact-registry.js');

test('Home23 artifact loop registers files, reuse, committed outputs, and memory promotions', async () => {
  const result = await verifyArtifactLoop();
  try {
    assert.equal(result.status, 'pass');
    assert.equal(result.audit.status, 'pass');
    assert.ok(result.audit.registered >= 3);
    assert.ok(result.audit.memoryArtifacts >= 1);
    assert.ok(result.audit.committed >= 1);
    assert.ok(result.memoryNodes >= 3);
    assert.ok(result.memoryEdges >= 1);
    const raw = JSON.parse(await fs.readFile(result.registryPath, 'utf8'));
    assert.equal(raw.schema, 'home23.artifacts.v1');
    assert.ok(raw.records.some(r => r.id === result.sourceArtifactId && r.reusedBy.length === 1));
    assert.ok(raw.records.some(r => r.id === result.derivedArtifactId && r.status === 'committed'));
  } finally {
    await fs.rm(result.logsDir, { recursive: true, force: true });
  }
});

test('ArtifactRegistry can select reusable goal/task artifacts', async () => {
  const result = await verifyArtifactLoop();
  try {
    const registry = new ArtifactRegistry({ logsDir: result.logsDir });
    await registry.initialize();
    assert.equal(registry.find({ goalId: 'goal_artifact_loop' }).length >= 2, true);
    assert.equal(registry.find({ taskId: 'task_source' }).length, 1);
  } finally {
    await fs.rm(result.logsDir, { recursive: true, force: true });
  }
});
