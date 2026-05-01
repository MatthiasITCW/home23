import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { runVerifier } = require('../../../engine/src/live-problems/verifiers.js');

test('jsonl_metric_date_fresh fails when wrapper writes are fresh but metric date is stale', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verifier-health-'));
  const file = path.join(dir, 'health.jsonl');
  fs.writeFileSync(file, JSON.stringify({
    ts: new Date().toISOString(),
    metrics: {
      heartRateVariability: { date: '2026-04-21', unit: 'ms', value: 28.5 },
    },
  }) + '\n');

  const result = await runVerifier({
    type: 'jsonl_metric_date_fresh',
    args: {
      path: file,
      metricDateField: 'metrics.heartRateVariability.date',
      maxAgeDays: 3,
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.detail, /stale/);
  assert.equal(result.observed.newestMetricDate, '2026-04-21');
});

test('jsonl_metric_date_fresh passes for a current metric date', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verifier-health-'));
  const file = path.join(dir, 'health.jsonl');
  fs.writeFileSync(file, JSON.stringify({
    ts: new Date().toISOString(),
    metrics: {
      heartRateVariability: { date: new Date().toISOString().slice(0, 10), unit: 'ms', value: 42 },
    },
  }) + '\n');

  const result = await runVerifier({
    type: 'jsonl_metric_date_fresh',
    args: {
      path: file,
      metricDateField: 'metrics.heartRateVariability.date',
      maxAgeDays: 3,
    },
  });

  assert.equal(result.ok, true);
});
