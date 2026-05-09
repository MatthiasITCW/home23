import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { MemorySummarizer } = require('../../../engine/src/memory/summarizer.js');

function makeLogger() {
  const entries = [];
  const logger = {
    entries,
    info(message, data) {
      entries.push({ level: 'info', message, data });
    },
    warn(message, data) {
      entries.push({ level: 'warn', message, data });
    },
    error(message, data) {
      entries.push({ level: 'error', message, data });
    },
    debug(message, data) {
      entries.push({ level: 'debug', message, data });
    },
  };
  return logger;
}

test('createConsolidatedMemoryGPT5 caps large clusters before sending model prompt', async () => {
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';
  const logger = makeLogger();
  const summarizer = new MemorySummarizer({}, logger, {});
  const sent = [];

  summarizer.gpt5 = {
    async generate(request) {
      sent.push(request);
      return { content: 'consolidated insight', reasoning: 'reasoned', model: 'test-model' };
    },
  };

  const cluster = Array.from({ length: 4688 }, (_, index) => ({
    id: `node-${index}`,
    concept: `memory concept ${index} ${'x'.repeat(500)}`,
    weight: index === 4687 ? 99999 : index,
  }));

  const result = await summarizer.createConsolidatedMemoryGPT5(cluster);

  assert.equal(result.content, 'consolidated insight');
  assert.equal(sent.length, 1);
  assert.ok(sent[0].messages[0].content.length < 60000);
  assert.ok(sent[0].messages[0].content.includes('memory concept 4687'));
  assert.ok(sent[0].messages[0].content.includes('omitted'));
  assert.ok(
    logger.entries.some((entry) =>
      entry.message === 'Large memory cluster compacted before consolidation' &&
      entry.data.clusterSize === 4688 &&
      entry.data.selected < 4688
    )
  );
});

test('consolidateMemories limits cluster work per run and records deferral', async () => {
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';
  const logger = makeLogger();
  const summarizer = new MemorySummarizer({}, logger, {
    memory: {
      consolidation: {
        maxClustersPerRun: 2,
      },
    },
  });

  const clusters = Array.from({ length: 5 }, (_, clusterIndex) =>
    Array.from({ length: 3 }, (_, nodeIndex) => ({
      id: `cluster-${clusterIndex}-node-${nodeIndex}`,
      concept: `cluster ${clusterIndex} memory ${nodeIndex}`,
      weight: nodeIndex,
    }))
  );
  const nodes = clusters.flat();
  const memoryNetwork = { nodes: new Map(nodes.map((node) => [node.id, node])) };
  const attempted = [];

  summarizer.clusterSimilarMemories = async () => clusters;
  summarizer.createConsolidatedMemoryGPT5 = async (cluster) => {
    attempted.push(cluster[0].id);
    return { content: `summary ${cluster[0].id}`, reasoning: null, model: 'test-model' };
  };

  const result = await summarizer.consolidateMemories(memoryNetwork);

  assert.equal(result.length, 2);
  assert.deepEqual(attempted, ['cluster-0-node-0', 'cluster-1-node-0']);
  assert.ok(nodes.slice(0, 6).every((node) => node.consolidatedAt));
  assert.ok(nodes.slice(6).every((node) => !node.consolidatedAt));
  assert.equal(summarizer.consolidationHistory.at(-1).eligibleClusters, 5);
  assert.equal(summarizer.consolidationHistory.at(-1).attemptedClusters, 2);
  assert.equal(summarizer.consolidationHistory.at(-1).deferredClusters, 3);
  assert.ok(
    logger.entries.some((entry) =>
      entry.message === 'Consolidation run deferred remaining clusters' &&
      entry.data.deferredClusters === 3
    )
  );
});
