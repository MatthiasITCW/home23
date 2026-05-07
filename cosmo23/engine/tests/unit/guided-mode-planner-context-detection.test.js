const { expect } = require('chai');

const { GuidedModePlanner } = require('../../src/core/guided-mode-planner');

function createPlanner(overrides = {}) {
  const logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {}
  };

  const config = {
    logsDir: '/tmp/cosmo-context-detection-test',
    architecture: {
      roleSystem: {
        explorationMode: 'guided',
        guidedFocus: {
          domain: 'Test Domain',
          context: 'Test context',
          executionMode: 'mixed',
          depth: 'deep'
        }
      }
    },
    coordinator: {
      agentTypeWeights: { research: 1, ide: 1 }
    },
    ideFirst: { enabled: true },
    models: { fast: 'test-fast-model' },
    mcp: { client: { enabled: false, servers: [] } },
    ...overrides.config
  };

  const subsystems = {
    client: {
      generate: async () => ({ content: '{"strategy":"plan","agentMissions":[],"initialGoals":[]}' })
    },
    memory: {
      query: async () => [],
      nodes: new Map()
    },
    goals: {
      getGoals: () => []
    },
    clusterStateStore: {
      getPlan: async () => null,
      listTasks: async () => [],
      listMilestones: async () => []
    },
    agentExecutor: {
      registry: { getActiveCount: () => 0 },
      resultsQueue: { queue: [], history: [], processed: [] }
    },
    ...overrides.subsystems
  };

  return new GuidedModePlanner(config, subsystems, logger);
}

describe('GuidedModePlanner — Semantic Context Change Detection', () => {

  describe('_isContextDirectionChanged()', () => {

    it('returns false for identical strings (fast path, no LLM call)', async () => {
      let llmCalled = false;
      const planner = createPlanner({
        subsystems: {
          client: {
            generate: async () => {
              llmCalled = true;
              return { content: 'different' };
            }
          }
        }
      });

      const result = await planner._isContextDirectionChanged(
        'Investigate market trends in healthcare',
        'Investigate market trends in healthcare',
        'Healthcare'
      );

      expect(result).to.equal(false);
      expect(llmCalled).to.equal(false);
    });

    it('returns true when old context is empty (fast path)', async () => {
      let llmCalled = false;
      const planner = createPlanner({
        subsystems: {
          client: {
            generate: async () => {
              llmCalled = true;
              return { content: 'same' };
            }
          }
        }
      });

      const result = await planner._isContextDirectionChanged(
        '',
        'Investigate market trends in healthcare',
        'Healthcare'
      );

      expect(result).to.equal(true);
      expect(llmCalled).to.equal(false);
    });

    it('returns true when new context is empty (fast path)', async () => {
      let llmCalled = false;
      const planner = createPlanner({
        subsystems: {
          client: {
            generate: async () => {
              llmCalled = true;
              return { content: 'same' };
            }
          }
        }
      });

      const result = await planner._isContextDirectionChanged(
        'Investigate market trends in healthcare',
        '',
        'Healthcare'
      );

      expect(result).to.equal(true);
      expect(llmCalled).to.equal(false);
    });

    it('returns false when LLM says "same"', async () => {
      const planner = createPlanner({
        subsystems: {
          client: {
            generate: async () => ({ content: 'same' })
          }
        }
      });

      const result = await planner._isContextDirectionChanged(
        'Investigate market trends in healthcare',
        'Look into healthcare market trends',
        'Healthcare'
      );

      expect(result).to.equal(false);
    });

    it('returns true when LLM says "different"', async () => {
      const planner = createPlanner({
        subsystems: {
          client: {
            generate: async () => ({ content: 'different' })
          }
        }
      });

      const result = await planner._isContextDirectionChanged(
        'Investigate market trends in healthcare',
        'Build a mobile app for patient scheduling',
        'Healthcare'
      );

      expect(result).to.equal(true);
    });

    it('returns true when LLM says "Different" (case-insensitive)', async () => {
      const planner = createPlanner({
        subsystems: {
          client: {
            generate: async () => ({ content: 'Different' })
          }
        }
      });

      const result = await planner._isContextDirectionChanged(
        'Investigate market trends',
        'Build a new product',
        'Business'
      );

      expect(result).to.equal(true);
    });

    it('falls back to exact comparison (returns true) when LLM throws', async () => {
      let warnCalled = false;
      const planner = createPlanner({
        subsystems: {
          client: {
            generate: async () => { throw new Error('API timeout'); }
          }
        }
      });
      planner.logger = {
        info: () => {},
        debug: () => {},
        error: () => {},
        warn: (msg) => { warnCalled = true; }
      };

      const result = await planner._isContextDirectionChanged(
        'Investigate market trends in healthcare',
        'Look into healthcare market trends',
        'Healthcare'
      );

      // Strings differ, so fallback exact comparison returns true
      expect(result).to.equal(true);
      expect(warnCalled).to.equal(true);
    });

    it('passes correct parameters to client.generate', async () => {
      let capturedArgs = null;
      const planner = createPlanner({
        subsystems: {
          client: {
            generate: async (args) => {
              capturedArgs = args;
              return { content: 'same' };
            }
          }
        }
      });

      await planner._isContextDirectionChanged(
        'Old context here',
        'New context here',
        'TestDomain'
      );

      expect(capturedArgs).to.not.be.null;
      expect(capturedArgs.component).to.equal('planner');
      expect(capturedArgs.purpose).to.equal('context_comparison');
      expect(capturedArgs.model).to.equal('test-fast-model');
      expect(capturedArgs.maxTokens).to.equal(10);
      expect(capturedArgs.reasoningEffort).to.equal('low');
      expect(capturedArgs.messages).to.have.length(1);
      expect(capturedArgs.messages[0].role).to.equal('user');
      expect(capturedArgs.messages[0].content).to.include('Old context here');
      expect(capturedArgs.messages[0].content).to.include('New context here');
      expect(capturedArgs.messages[0].content).to.include('TestDomain');
    });
  });

  describe('_isDomainDirectionChanged()', () => {
    it('does not treat a leading continuation cue as a new domain', () => {
      const planner = createPlanner();

      const result = planner._isDomainDirectionChanged(
        'Apply the substrate pressure-test criterion as a verdict, not a description.',
        'Now Apply the substrate pressure-test criterion as a verdict, not a description.'
      );

      expect(result).to.equal(false);
    });

    it('still treats unrelated short domains as different', () => {
      const planner = createPlanner();

      const result = planner._isDomainDirectionChanged('Healthcare', 'Finance');

      expect(result).to.equal(true);
    });
  });

  describe('Full detection block behavior', () => {

    it('true thread pivot triggers contextRedirect', async () => {
      const logMessages = [];
      const planner = createPlanner({
        subsystems: {
          client: {
            generate: async () => ({ content: '{"relation":"pivot","confidence":0.9,"rationale":"different subject"}' })
          }
        }
      });
      planner.logger = {
        info: (msg, meta) => { logMessages.push({ msg, meta }); },
        warn: () => {},
        error: () => {},
        debug: () => {}
      };

      // Simulate the detection block logic directly
      const guidedFocus = { context: 'Build a bond-pricing model', domain: 'Finance' };
      const existingPlan = {
        _sourceContext: 'Investigate clinical adoption',
        _sourceDomain: 'Healthcare'
      };

      const relation = await planner.assessThreadRelation(existingPlan, guidedFocus, []);

      expect(relation.relation).to.equal('pivot');
      expect(relation.shouldRedirect).to.equal(true);
    });

    it('same domain + semantically same context does NOT trigger replan', async () => {
      const planner = createPlanner({
        subsystems: {
          client: {
            generate: async () => ({ content: 'same' })
          }
        }
      });

      const guidedFocus = { context: 'Investigate market trends', domain: 'Healthcare' };
      const existingPlan = {
        _sourceContext: 'Look into market trends',
        _sourceDomain: 'Healthcare'
      };

      const relation = await planner.assessThreadRelation(existingPlan, guidedFocus, []);

      expect(['same_thread', 'refinement']).to.include(relation.relation);
      expect(relation.shouldRedirect).to.equal(false);
    });

    it('same domain + semantically different context triggers replan', async () => {
      const planner = createPlanner({
        subsystems: {
          client: {
            generate: async () => ({ content: '{"relation":"pivot","confidence":0.9,"rationale":"same broad domain but different objective"}' })
          }
        }
      });

      const guidedFocus = { context: 'Build a mobile app', domain: 'Healthcare' };
      const existingPlan = {
        _sourceContext: 'Investigate market trends',
        _sourceDomain: 'Healthcare'
      };

      const relation = await planner.assessThreadRelation(existingPlan, guidedFocus, []);

      expect(relation.relation).to.equal('pivot');
      expect(relation.shouldRedirect).to.equal(true);
    });

    it('domain comparison is case-insensitive', () => {
      const planner = createPlanner({
        subsystems: {
          client: {
            generate: async () => ({ content: 'same' })
          }
        }
      });

      const currentDomain = 'Healthcare';
      const planDomain = 'healthcare';

      const domainChanged = planner._isDomainDirectionChanged(planDomain, currentDomain);

      expect(domainChanged).to.equal(false);
    });

    it('does not rely on semantic comparison for a clear pivot', async () => {
      let llmCalled = false;
      const planner = createPlanner({
        subsystems: {
          client: {
            generate: async () => {
              llmCalled = true;
              return { content: 'different' };
            }
          }
        }
      });

      const relation = await planner.assessThreadRelation(
        { _sourceDomain: 'Healthcare', _sourceContext: 'Investigate clinical market trends' },
        { domain: 'Finance', context: 'Build a bond-pricing spreadsheet' },
        []
      );

      expect(relation.shouldRedirect).to.equal(true);
      expect(llmCalled).to.equal(false);
    });

    it('identical context strings skip LLM check even with same domain', async () => {
      let llmCalled = false;
      const planner = createPlanner({
        subsystems: {
          client: {
            generate: async () => {
              llmCalled = true;
              return { content: 'different' };
            }
          }
        }
      });

      const relation = await planner.assessThreadRelation(
        { _sourceDomain: 'Healthcare', _sourceContext: 'Same context text' },
        { domain: 'Healthcare', context: 'Same context text' },
        []
      );

      // The outer `currentContext !== planContext` guard prevents the call
      expect(llmCalled).to.equal(false);
      expect(relation.shouldRedirect).to.equal(false);
    });

    it('treats a verdict instruction as a refinement of the same substrate thread', async () => {
      let llmCalled = false;
      const planner = createPlanner({
        subsystems: {
          client: {
            generate: async () => {
              llmCalled = true;
              return { content: '{"relation":"pivot","confidence":0.9,"rationale":"should not be needed"}' };
            }
          }
        }
      });

      const relation = await planner.assessThreadRelation(
        {
          _sourceDomain: 'Apply the substrate pressure-test criterion as a verdict, not a description.',
          _sourceContext: 'Classify compact moves as spine, facet, or artifact.'
        },
        {
          domain: 'Now Apply the substrate pressure-test criterion as a verdict, not a description.',
          context: 'Produce the final <=5-move spine from the local artifacts.'
        },
        [{ state: 'PENDING' }]
      );

      expect(relation.shouldRedirect).to.equal(false);
      expect(['same_thread', 'refinement']).to.include(relation.relation);
      expect(llmCalled).to.equal(false);
    });
  });
});
