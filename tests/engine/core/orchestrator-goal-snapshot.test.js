import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  compactActiveGoalsForSnapshot,
  persistArchivedGoalsToState,
} = require('../../../engine/src/core/orchestrator.js');
const { StateCompression } = require('../../../engine/src/core/state-compression.js');

test('compactActiveGoalsForSnapshot writes bounded lightweight active goal summaries', () => {
  const goals = compactActiveGoalsForSnapshot([
    ['goal_old', {
      id: 'goal_old',
      description: 'Older goal',
      source: { label: 'meta' },
      priority: 0.4,
      progress: 0.1,
      createdAt: '2026-05-08T10:00:00.000Z',
    }],
    ['goal_new', {
      id: 'goal_new',
      description: 'Newer goal'.repeat(100),
      source: 'operator',
      priority: '0.9',
      progress: '0.25',
      createdAt: '2026-05-08T11:00:00.000Z',
    }],
  ]);

  assert.equal(goals.length, 2);
  assert.equal(goals[0].id, 'goal_new');
  assert.equal(goals[0].description.length, 500);
  assert.equal(goals[0].source, 'operator');
  assert.equal(goals[0].priority, 0.9);
  assert.equal(goals[0].progress, 0.25);
  assert.equal(goals[1].source, 'meta');
});

test('persistArchivedGoalsToState patches goals without full orchestrator save', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'home23-goal-state-patch-'));
  try {
    await StateCompression.saveCompressed(path.join(dir, 'state.json'), {
      cycleCount: 42,
      memory: { nodes: [], edges: [] },
      goals: {
        active: [
          ['goal_keep', { id: 'goal_keep', description: 'Keep this goal', status: 'active' }],
          ['goal_archive', { id: 'goal_archive', description: 'Archive this goal', status: 'active' }],
        ],
        completed: [{ id: 'goal_done' }],
        archived: [],
      },
    }, { compress: true, pretty: false });

    const result = await persistArchivedGoalsToState(dir, ['goal_archive'], 'test_archive');
    const state = await StateCompression.loadCompressed(path.join(dir, 'state.json'));
    const snapshot = JSON.parse(fs.readFileSync(path.join(dir, 'brain-snapshot.json'), 'utf8'));

    assert.equal(result.saved, true);
    assert.equal(state.goals.active.length, 1);
    assert.equal(state.goals.archived.length, 1);
    assert.equal(state.goals.archived[0].archiveReason, 'test_archive');
    assert.deepEqual(snapshot.goalCounts, { active: 1, completed: 1, archived: 1 });
    assert.equal(snapshot.activeGoalSummaries[0].id, 'goal_keep');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
