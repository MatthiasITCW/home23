import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
process.env.OPENAI_API_KEY ||= 'test-key';
const { MetaCoordinator } = require('../../../engine/src/coordinator/meta-coordinator.js');

const logger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
};

test('MetaCoordinator stores context under the agent-local logs directory', () => {
  const logsDir = path.join(os.tmpdir(), `home23-coordinator-${Date.now()}`);
  const coordinator = new MetaCoordinator({ logsDir, coordinator: { enabled: true } }, logger);

  assert.equal(coordinator.coordinatorDir, path.join(logsDir, 'coordinator'));
});
