import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Orchestrator } = require('../../../engine/src/core/orchestrator.js');
const { LiveProblemStore } = require('../../../engine/src/live-problems/store.js');

test('agenda Do it queues bounded operational items into live-problems diagnostics', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'home23-agenda-doit-'));
  try {
    const store = new LiveProblemStore({
      brainDir: dir,
      logger: { info() {}, warn() {}, error() {} },
    });
    const fake = {
      liveProblems: {
        store,
        processNow: async (id) => store.get(id),
      },
      isBoundedOperationalAgendaItem: Orchestrator.prototype.isBoundedOperationalAgendaItem,
      enqueueAgendaDiagnostic: Orchestrator.prototype.enqueueAgendaDiagnostic,
      inferAgendaAction: Orchestrator.prototype.inferAgendaAction,
    };

    const result = await Orchestrator.prototype.executeAgendaItem.call(fake, {
      id: 'ag-test',
      content: "Investigate why RECENT.md hasn't auto-generated in 9 days — is the generation trigger present but failing silently?",
    }, { actor: 'test' });

    assert.equal(result.action, 'diagnose_agenda');
    assert.equal(result.target, 'agenda_ag-test');

    const problem = store.get('agenda_ag-test');
    assert.ok(problem);
    assert.equal(problem.seedOrigin, 'agenda');
    assert.equal(problem.verifier.type, 'fix_recipe_recorded');
    assert.equal(problem.verifier.args.problemId, 'agenda_ag-test');
    assert.equal(problem.remediation[0].type, 'dispatch_to_agent');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
