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

test('rejects model error strings as failed partition sweeps', async () => {
  const engine = makeEngine();
  const client = {
    generate: async () => ({
      content: '[Error: No content received from GPT-5.2 (response.incomplete)]',
      hadError: true,
      errorType: 'response.incomplete'
    })
  };
  engine.qe = {
    resolveQueryRuntime: () => ({ client, effectiveModel: 'claude-sonnet-4-6' })
  };

  const nodeMap = new Map([
    ['n1', { id: 'n1', concept: 'real evidence', tag: 'test', weight: 1 }]
  ]);

  await assert.rejects(
    () => engine.sweepPartition(
      'query',
      { id: 1, nodeIds: ['n1'], summary: 'test partition', nodeCount: 1 },
      nodeMap,
      [],
      [],
      'claude-sonnet-4-6',
      { sweepMaxTokens: 1000 }
    ),
    /no usable content/
  );
});

test('counts failed partition sweeps instead of passing them to synthesis', async () => {
  const engine = makeEngine();
  engine.qe = {
    loadBrainState: async () => ({
      memory: {
        nodes: [
          { id: 'n1', concept: 'first evidence', tag: 'test', weight: 1 },
          { id: 'n2', concept: 'second evidence', tag: 'test', weight: 1 }
        ],
        edges: []
      }
    }),
    getEmbedding: async () => null,
    executeQuery: async () => {
      throw new Error('standard fallback should not run');
    },
    modelDefaults: { pgsSweepModel: 'claude-sonnet-4-6' }
  };
  engine.getOrCreatePartitions = async () => [
    { id: 1, nodeIds: ['n1'], summary: 'ok', nodeCount: 1 },
    { id: 2, nodeIds: ['n2'], summary: 'bad', nodeCount: 1 }
  ];
  engine.sweepPartition = async (_query, partition) => {
    if (partition.id === 2) return null;
    return {
      partitionId: 1,
      partitionSummary: 'ok',
      nodeCount: 1,
      nodesIncluded: 1,
      keywords: [],
      adjacentPartitions: [],
      sweepOutput: 'finding from real evidence'
    };
  };
  engine.synthesize = async (_query, sweeps) => {
    assert.equal(sweeps.length, 1);
    return 'synthesis from one good sweep';
  };

  const result = await engine.execute('query', {
    model: 'claude-opus-4-5',
    pgsFullSweep: true,
    pgsSessionId: 'test',
    pgsConfig: { directQueryMaxNodes: 0 }
  });

  assert.equal(result.answer, 'synthesis from one good sweep');
  assert.equal(result.metadata.pgs.successfulSweeps, 1);
  assert.equal(result.metadata.pgs.failedSweeps, 1);
});

test('uses direct enhanced query path for small PGS brains', async () => {
  const engine = makeEngine();
  const events = [];
  const priorContext = { query: 'previous', answer: 'previous answer' };
  let enhancedOptions = null;

  engine.qe = {
    loadBrainState: async () => ({
      memory: {
        nodes: Array.from({ length: 24 }, (_, i) => ({ id: `n${i}`, concept: `node ${i}` })),
        edges: []
      }
    }),
    executeEnhancedQuery: async (_query, options) => {
      enhancedOptions = options;
      return { answer: 'direct answer', metadata: { mode: 'full' } };
    }
  };
  engine.getOrCreatePartitions = async () => {
    throw new Error('small graph should not partition');
  };

  const result = await engine.execute('query', {
    model: 'claude-opus-4-7',
    mode: 'full',
    includeFiles: true,
    includeCoordinatorInsights: true,
    priorContext,
    onChunk: event => events.push(event)
  });

  assert.equal(result.answer, 'direct answer');
  assert.equal(enhancedOptions.enablePGS, false);
  assert.equal(enhancedOptions.includeFiles, true);
  assert.equal(enhancedOptions.priorContext, priorContext);
  assert.ok(events.some(event => /Using direct query path/.test(event.message || '')));
});

test('skips cross-partition synthesis for a single partition PGS sweep', async () => {
  const engine = makeEngine();
  const events = [];

  engine.qe = {
    loadBrainState: async () => ({
      memory: {
        nodes: [
          { id: 'n1', concept: 'first evidence', tag: 'test', weight: 1 },
          { id: 'n2', concept: 'second evidence', tag: 'test', weight: 1 },
          { id: 'n3', concept: 'third evidence', tag: 'test', weight: 1 }
        ],
        edges: []
      }
    }),
    getEmbedding: async () => null,
    executeEnhancedQuery: async () => {
      throw new Error('direct fallback should be disabled');
    },
    modelDefaults: { pgsSweepModel: 'claude-sonnet-4-6' }
  };
  engine.getOrCreatePartitions = async () => [
    { id: 1, nodeIds: ['n1', 'n2', 'n3'], summary: 'single domain', nodeCount: 3 }
  ];
  engine.sweepPartition = async () => ({
    partitionId: 1,
    partitionSummary: 'single domain',
    nodeCount: 3,
    nodesIncluded: 3,
    keywords: [],
    adjacentPartitions: [],
    sweepOutput: 'single partition answer'
  });
  engine.synthesize = async () => {
    throw new Error('single partition should not run cross-partition synthesis');
  };

  const result = await engine.execute('query', {
    model: 'claude-opus-4-5',
    pgsSessionId: 'test',
    pgsFullSweep: true,
    pgsConfig: { directQueryMaxNodes: 0 },
    onChunk: event => events.push(event)
  });

  const updated = events.find(event => event.type === 'pgs_session_updated');
  assert.equal(result.answer, 'single partition answer');
  assert.equal(result.metadata.pgs.synthesisSkipped, true);
  assert.equal(result.metadata.pgs.singlePartition, true);
  assert.equal(updated.searched, 1);
  assert.equal(updated.remaining, 0);
});
