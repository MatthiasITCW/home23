import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PublishLedger } from '../../../engine/src/publish/publish-ledger.js';

test('PublishLedger records publications and detects starvation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pl-'));
  const ledger = new PublishLedger({
    path: join(dir, 'publish-ledger.jsonl'),
    starvationFloor: { workspace_insights: 6 * 3600 * 1000 },
  });
  await ledger.record({ target: 'workspace_insights', artifact: 'x.md', at: Date.now() - 7 * 3600 * 1000 });
  assert.ok(ledger.listStarving({ now: Date.now() }).includes('workspace_insights'));
  await ledger.record({ target: 'workspace_insights', artifact: 'y.md', at: Date.now() });
  assert.equal(ledger.listStarving({ now: Date.now() }).length, 0);
});
