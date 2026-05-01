const test = require('node:test');
const assert = require('node:assert/strict');

const { PGSEngine } = require('../../cosmo23/lib/pgs-engine');

function makeEngine() {
  const engine = Object.create(PGSEngine.prototype);
  engine.qe = { cosineSimilarity: () => 0 };
  return engine;
}

test('coalesces singleton-heavy partition output into bounded usable partitions', () => {
  const engine = makeEngine();
  const nodes = Array.from({ length: 1000 }, (_, i) => ({
    id: `n${i}`,
    tag: i < 500 ? 'alpha' : 'beta'
  }));
  const partitions = nodes.map((node, id) => ({ id, nodeIds: [node.id] }));

  const coalesced = engine.coalesceSmallPartitions(partitions, nodes, {
    minSize: 50,
    maxSize: 200
  });
  const counts = coalesced.map(p => p.nodeIds.length);

  assert.equal(coalesced.length, 6);
  assert.equal(counts.filter(c => c === 1).length, 0);
  assert.ok(counts.every(c => c <= 200));
});

test('routes at least maxSweepPartitions when similarities fall below threshold', () => {
  const engine = makeEngine();
  const partitions = Array.from({ length: 20 }, (_, id) => ({
    id,
    centroidEmbedding: null,
    nodeIds: [`n${id}`]
  }));

  const routed = engine.routeQuery('specific operational query', [1, 2], partitions, {
    maxSweepPartitions: 15,
    minSweepPartitions: 0,
    partitionRelevanceThreshold: 0.25
  });

  assert.equal(routed.length, 15);
});
