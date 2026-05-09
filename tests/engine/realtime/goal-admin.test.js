import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { RealtimeServer } = require('../../../engine/src/realtime/websocket-server.js');

function makeRequest({ url, body = {} }) {
  const req = Readable.from([Buffer.from(JSON.stringify(body), 'utf8')]);
  req.method = 'POST';
  req.url = url;
  return req;
}

function makeResponse() {
  return {
    statusCode: null,
    headers: null,
    body: '',
    writeHead(code, headers) {
      this.statusCode = code;
      this.headers = headers;
    },
    end(payload) {
      this.body = payload || '';
    },
    json() {
      return JSON.parse(this.body);
    },
  };
}

test('goal admin archives a live active goal and saves state', async () => {
  const server = new RealtimeServer(0, { info: () => {}, warn: () => {}, error: () => {} });
  let archived = null;
  let saved = false;
  server.setOrchestrator({
    goals: {
      getGoal(id) {
        return id === 'goal_1' ? { id, status: 'active', description: 'stale force-output digest' } : null;
      },
      archiveGoal(id, reason) {
        archived = { id, reason };
        return true;
      },
    },
    async saveState() {
      saved = true;
    },
  });

  const res = makeResponse();
  await server._handleGoalAdmin(makeRequest({
    url: '/admin/goals/goal_1/archive',
    body: { reason: 'operator reviewed stale back-pressure' },
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().ok, true);
  assert.deepEqual(archived, { id: 'goal_1', reason: 'operator reviewed stale back-pressure' });
  assert.equal(saved, true);
});

test('goal admin refuses to archive missing or inactive goals', async () => {
  const server = new RealtimeServer(0, { info: () => {}, warn: () => {}, error: () => {} });
  server.setOrchestrator({
    goals: {
      getGoal() {
        return { id: 'goal_done', status: 'completed', description: 'done' };
      },
      archiveGoal() {
        throw new Error('should not archive');
      },
    },
  });

  const res = makeResponse();
  await server._handleGoalAdmin(makeRequest({
    url: '/admin/goals/goal_done/archive',
    body: {},
  }), res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.json().ok, false);
});
