const { expect } = require('chai');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const { TaskStateQueue } = require('../../src/cluster/task-state-queue');

function logger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {}
  };
}

describe('TaskStateQueue replay safety', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'task-state-queue-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('persists processed flags so events do not replay after restart', async () => {
    const queue = new TaskStateQueue(tmpDir, logger());
    await queue.initialize();
    await queue.enqueue({
      type: 'UPDATE_TASK',
      taskId: 'task:phase1',
      task: {
        id: 'task:phase1',
        planId: 'plan:main',
        title: 'Current task',
        state: 'PENDING',
        createdAt: 2000
      }
    });

    const writes = [];
    const stateStore = {
      getPlan: async () => ({ id: 'plan:main', createdAt: 1000 }),
      upsertTask: async task => {
        writes.push(task);
        return true;
      }
    };

    await queue.processAll(stateStore, null);

    const restarted = new TaskStateQueue(tmpDir, logger());
    await restarted.initialize();

    expect(writes).to.have.length(1);
    expect(restarted.getPending()).to.have.length(0);
  });

  it('skips stale task events queued before the current plan was created', async () => {
    const queue = new TaskStateQueue(tmpDir, logger());
    await queue.initialize();
    await queue.enqueue({
      type: 'UPDATE_TASK',
      taskId: 'task:phase1',
      task: {
        id: 'task:phase1',
        planId: 'plan:main',
        title: 'Old web research task',
        state: 'DONE',
        createdAt: 1000
      }
    });

    queue.queue[0].queuedAt = 1000;

    let upsertCalled = false;
    const stateStore = {
      getPlan: async () => ({ id: 'plan:main', createdAt: 2000 }),
      upsertTask: async () => {
        upsertCalled = true;
        return true;
      }
    };

    const result = await queue.processAll(stateStore, null);

    expect(result.processed).to.equal(1);
    expect(upsertCalled).to.equal(false);
    expect(queue.getPending()).to.have.length(0);
  });
});
