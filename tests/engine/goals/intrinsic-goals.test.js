import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
process.env.OPENAI_API_KEY ||= 'test-key';
const { IntrinsicGoalSystem } = require('../../../engine/src/goals/intrinsic-goals');

function makeGoals() {
  return new IntrinsicGoalSystem({
    goals: {
      maxGoals: 20,
      doneWhen: { autoSynthesizeLegacy: true },
    },
    roleSystem: {},
    cluster: {},
  }, {
    warn() {},
    info() {},
    debug() {},
    error() {},
  });
}

test('archived goal descriptions suppress rediscovery loops', () => {
  const goals = makeGoals();
  const first = goals.addGoal({
    description: 'Investigate why clusters exist without nodes.',
    source: 'meta_coordinator_strategic',
  });

  assert.ok(first);
  assert.equal(goals.archiveGoal(first.id, 'false premise'), true);

  const duplicate = goals.addGoal({
    description: 'Investigate why clusters exist without nodes.',
    source: 'meta_coordinator_strategic',
  });

  assert.equal(duplicate, null);
  assert.equal(goals.getGoals().length, 0);
  assert.equal(goals.archivedGoals.length, 1);
});

test('completed goal descriptions suppress rediscovery loops', () => {
  const goals = makeGoals();
  const first = goals.addGoal({
    description: 'Produce outputs/digest-6410.md.',
    source: 'orchestrator',
  });

  assert.ok(first);
  goals.completeGoal(first.id, 'done');

  const duplicate = goals.addGoal({
    description: 'Produce outputs/digest-6410.md.',
    source: 'orchestrator',
  });

  assert.equal(duplicate, null);
  assert.equal(goals.getGoals().length, 0);
  assert.equal(goals.completedGoals.length, 1);
});
