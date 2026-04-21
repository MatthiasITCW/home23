import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceInsightsPublisher } from '../../../engine/src/publish/workspace-insights.js';

test('WorkspaceInsightsPublisher only writes on cadence', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wi-'));
  const pub = new WorkspaceInsightsPublisher({
    outDir: dir,
    cadenceCycles: 3,
    selectCluster: () => ({ topic: 'test', observations: [], summary: 's' }),
    ledger: { record: async () => {} },
  });
  await pub.onCycle({ cycleIndex: 1 });
  assert.equal(readdirSync(dir).length, 0);
  await pub.onCycle({ cycleIndex: 3 });
  assert.equal(readdirSync(dir).length, 1);
});

test('WorkspaceInsightsPublisher skips when no cluster available', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wi2-'));
  const pub = new WorkspaceInsightsPublisher({
    outDir: dir, cadenceCycles: 1,
    selectCluster: () => null, ledger: { record: async () => {} },
  });
  assert.equal(await pub.onCycle({ cycleIndex: 1 }), null);
  assert.equal(readdirSync(dir).length, 0);
});
