const test = require('node:test');
const assert = require('node:assert/strict');

const { QueryEngine } = require('../../cosmo23/lib/query-engine');

test('quick query mode stays bounded on large brains', () => {
  const limit = QueryEngine.calculateMemoryNodeLimit({
    mode: 'quick',
    totalNodes: 56210,
    isMergedBrain: false,
    model: 'claude-opus-4-7'
  });

  assert.equal(limit, 50);
});

test('full query mode still uses adaptive coverage up to the model cap', () => {
  const limit = QueryEngine.calculateMemoryNodeLimit({
    mode: 'full',
    totalNodes: 56210,
    isMergedBrain: false,
    model: 'claude-opus-4-7'
  });

  assert.equal(limit, 900);
});
