import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DeepDive } = require('../../../engine/src/cognition/deep-dive.js');

test('DeepDive prompt includes bus observation payload when candidate has no graph nodes', () => {
  const deepDive = new DeepDive({
    unifiedClient: { generate: async () => ({ content: '' }) },
    memory: { nodes: new Map(), edges: new Map(), clusters: new Map() },
    logger: { warn() {} },
  });

  const candidate = {
    signal: 'observation-delta',
    score: 0.92,
    rationale: 'bus observation domain.health',
    nodeIds: [],
    observation: {
      channelId: 'domain.health',
      sourceRef: 'health:daily:2026-05-01',
      traceId: 'trace:0123456789abcdef01234567',
      flag: 'COLLECTED',
      confidence: 0.92,
      payload: {
        summary: 'Resting heart rate is 3 bpm above the 14-day average',
        metric: 'resting_hr',
      },
    },
  };

  const { input } = deepDive._buildPrompt(candidate, { nodes: [], edges: [], seedCount: 0 }, {}, null);

  assert.match(input, /Verified observation to think about/);
  assert.match(input, /domain\.health/);
  assert.match(input, /health:daily:2026-05-01/);
  assert.match(input, /Resting heart rate is 3 bpm above the 14-day average/);
  assert.doesNotMatch(input, /no node content retrievable/);
});
