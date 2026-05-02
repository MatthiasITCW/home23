import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { runRemediator } = require('../../../engine/src/live-problems/remediators.js');

test('dispatch_to_worker posts to worker connector', async () => {
  let body = '';
  const server = http.createServer((req, res) => {
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/api/workers/systems/runs');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ runId: 'wr_1', receipt: { status: 'no_change', verifierStatus: 'pass', summary: 'checked' } }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const result = await runRemediator(
    { type: 'dispatch_to_worker', args: { worker: 'systems', budgetHours: 4 } },
    {
      workerConnectorBaseUrl: `http://127.0.0.1:${port}`,
      problem: { id: 'lp_1', title: 'host check', severity: 'warn', description: 'CPU signal' },
    }
  );

  server.close();
  assert.equal(result.outcome, 'dispatched');
  assert.equal(result.turnId, 'wr_1');
  assert.match(body, /host check/);
  assert.match(body, /live-problems/);
});
