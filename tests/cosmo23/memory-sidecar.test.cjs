const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const { hydrateStateMemory } = require('../../cosmo23/lib/memory-sidecar');

function writeJsonlGz(filePath, records) {
  const body = records.map((record) => JSON.stringify(record)).join('\n') + '\n';
  fs.writeFileSync(filePath, zlib.gzipSync(body));
}

test('hydrates empty inline memory from Home23 sidecars', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cosmo23-sidecar-'));
  const nodes = [
    { id: 'n1', concept: 'first node', tag: 'test' },
    { id: 'n2', concept: 'second node', tag: 'test' }
  ];
  const edges = [{ source: 'n1', target: 'n2', weight: 1 }];

  writeJsonlGz(path.join(dir, 'memory-nodes.jsonl.gz'), nodes);
  writeJsonlGz(path.join(dir, 'memory-edges.jsonl.gz'), edges);
  fs.writeFileSync(path.join(dir, 'brain-snapshot.json'), JSON.stringify({
    nodeCount: nodes.length,
    edgeCount: edges.length,
    memorySource: 'sidecar'
  }));

  const state = { cycleCount: 7, memory: { nodes: [], edges: [] } };
  const result = await hydrateStateMemory(dir, state, { logger: { warn() {} } });

  assert.equal(result.source, 'sidecar');
  assert.equal(result.hydrated, true);
  assert.equal(result.nodes, 2);
  assert.equal(result.edges, 1);
  assert.deepEqual(state.memory.nodes, nodes);
  assert.deepEqual(state.memory.edges, edges);
  assert.equal(state.memorySource, 'sidecar');
});

test('keeps legacy inline memory when no sidecars exist', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cosmo23-inline-'));
  const state = {
    memory: {
      nodes: [{ id: 'legacy', concept: 'inline node' }],
      edges: []
    }
  };

  const result = await hydrateStateMemory(dir, state, { logger: { warn() {} } });

  assert.equal(result.source, 'inline');
  assert.equal(result.hydrated, false);
  assert.equal(result.nodes, 1);
  assert.equal(state.memory.nodes[0].id, 'legacy');
});
