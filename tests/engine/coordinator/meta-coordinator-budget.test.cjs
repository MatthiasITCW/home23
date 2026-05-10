const test = require('node:test');
const assert = require('node:assert/strict');
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';
const { MetaCoordinator } = require('../../../engine/src/coordinator/meta-coordinator');

function createCoordinator() {
  return new MetaCoordinator({
    logsDir: '/tmp/home23-test',
    coordinator: {
      maxTokens: 3000,
      reasoningEffort: 'low',
      verbosity: 'low',
    },
  }, {
    info() {},
    warn() {},
    error() {},
    debug() {},
  });
}

test('goal portfolio review honors configured coordinator LLM budget', async () => {
  const coordinator = createCoordinator();
  let captured = null;
  coordinator.gpt5 = {
    async generateWithRetry(args) {
      captured = args;
      return { content: '1. goal_1 - keep moving', reasoning: null };
    },
  };

  await coordinator.evaluateGoals({
    active: [['goal_1', {
      id: 'goal_1',
      description: 'Produce a small operational report.',
      priority: 0.4,
      progress: 0.1,
      pursuitCount: 1,
    }]],
  }, []);

  assert.equal(captured.maxTokens, 3000);
  assert.equal(captured.reasoningEffort, 'low');
  assert.equal(captured.verbosity, 'low');
});

test('strategic decision review honors configured coordinator LLM budget', async () => {
  const coordinator = createCoordinator();
  let captured = null;
  coordinator.gpt5 = {
    async generateWithRetry(args) {
      captured = args;
      return {
        content: [
          'TOP 5 GOALS TO PRIORITIZE',
          '1. goal_1 - continue',
          'KEY INSIGHTS',
          '- keep operator loop grounded',
          'STRATEGIC DIRECTIVES',
          '- close verified work before adding more',
        ].join('\n'),
        reasoning: null,
      };
    },
  };

  await coordinator.makeStrategicDecisions({
    cognitiveAnalysis: { content: 'Cognition is current.' },
    goalEvaluation: {
      content: 'goal_1 is the only active goal.',
      prioritizedGoals: [{ id: 'goal_1', description: 'one goal' }],
    },
    memoryAnalysis: { content: 'Memory is connected.' },
    agentResults: { agentCount: 0, agentSummaries: [], insights: [], findings: [] },
    deliverables: { totalFiles: 0, byAgentType: {}, recentFiles: [], gaps: [] },
    systemHealth: { cognitiveState: { curiosity: 1, mood: 1, energy: 1 } },
    previousContext: [],
  });

  assert.equal(captured.maxTokens, 3000);
  assert.equal(captured.reasoningEffort, 'low');
  assert.equal(captured.verbosity, 'low');
});
