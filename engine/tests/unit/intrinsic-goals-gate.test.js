const { expect } = require('chai');
const { IntrinsicGoalSystem } = require('../../src/goals/intrinsic-goals');

function mkSystem(opts = {}) {
  const logger = {
    warnCalls: [], infoCalls: [],
    debug: () => {}, info(...a) { this.infoCalls.push(a); },
    warn(...a) { this.warnCalls.push(a); }, error: () => {}
  };
  const config = {
    goals: { maxGoals: 100, doneWhen: opts.doneWhenCfg || {} },
    roleSystem: {}
  };
  const sys = new IntrinsicGoalSystem(config, logger);
  sys.logger = logger; // ensure the test can read the captured logs
  return sys;
}

describe('addGoal gate (doneWhen required)', () => {
  it('rejects a goal with no doneWhen', () => {
    const sys = mkSystem();
    const goal = sys.addGoal({ description: 'Design an evidence taxonomy schema' });
    expect(goal).to.equal(null);
    expect(sys.logger.warnCalls.length).to.be.greaterThan(0);
    const msg = sys.logger.warnCalls.map(c => JSON.stringify(c)).join(' ');
    expect(msg).to.match(/doneWhen/i);
  });

  it('accepts a goal with a valid file_exists doneWhen', () => {
    const sys = mkSystem();
    const goal = sys.addGoal({
      description: 'Produce the correlation view sketch',
      doneWhen: {
        version: 1,
        criteria: [{ type: 'file_exists', path: 'correlation-view.md' }]
      }
    });
    expect(goal).to.not.equal(null);
    expect(goal.doneWhen).to.be.an('object');
    expect(goal.progress).to.equal(0);
  });

  it('rejects a vague judged criterion', () => {
    const sys = mkSystem();
    const goal = sys.addGoal({
      description: 'Think deeply about the void',
      doneWhen: { version: 1, criteria: [{ type: 'judged', criterion: 'it is done' }] }
    });
    expect(goal).to.equal(null);
  });
});
