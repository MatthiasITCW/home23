import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CronScheduler, type CronJob, type JobResult } from '../../src/scheduler/cron.ts';

function readJsonl(path: string): any[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function makeDueJob(overrides: Partial<CronJob> = {}): CronJob {
  return {
    id: 'job-1',
    name: 'Freshness watch',
    enabled: true,
    schedule: { kind: 'every', everyMs: 60_000, anchorMs: Date.parse('2026-05-11T00:00:00.000Z') },
    sessionTarget: 'isolated',
    wakeMode: 'now',
    payload: { kind: 'systemEvent', text: 'check freshness' },
    state: {
      nextRunAtMs: Date.now() - 1_000,
      consecutiveErrors: 0,
    },
    ...overrides,
  };
}

test('due cron jobs write a preflight decision receipt before the handler runs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'home23-cron-decision-'));
  const decisionsPath = join(dir, 'cron-decisions.jsonl');
  const job = makeDueJob();
  writeFileSync(join(dir, 'cron-jobs.json'), JSON.stringify([job], null, 2));
  const scheduler = new CronScheduler({ timezone: 'America/New_York', jobsFile: 'cron-jobs.json', runsDir: 'cron-runs' }, async (): Promise<JobResult> => {
    const decisions = readJsonl(decisionsPath);
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].action, 'run');
    assert.equal(decisions[0].durableState, 'allowed_after_decision');
    return { status: 'ok', response: 'fresh', durationMs: 2 };
  }, dir);

  await (scheduler as any).tick();

  await new Promise((resolve) => setTimeout(resolve, 25));
  const runLog = readJsonl(join(dir, 'cron-runs', 'job-1.jsonl'));
  assert.equal(runLog.length, 1);
  assert.equal(runLog[0].status, 'ok');
  assert.equal(runLog[0].decision.action, 'run');
});

test('due cron jobs with repeated errors escalate before executing again', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'home23-cron-escalate-'));
  let handlerCalls = 0;
  const job = makeDueJob({
    state: {
      nextRunAtMs: Date.now() - 10_000,
      lastStatus: 'error',
      consecutiveErrors: 3,
    },
  });
  writeFileSync(join(dir, 'cron-jobs.json'), JSON.stringify([job], null, 2));
  const scheduler = new CronScheduler({ timezone: 'America/New_York', jobsFile: 'cron-jobs.json', runsDir: 'cron-runs' }, async (): Promise<JobResult> => {
    handlerCalls++;
    return { status: 'ok', durationMs: 1 };
  }, dir);

  await (scheduler as any).tick();

  assert.equal(handlerCalls, 0);
  const decisions = readJsonl(join(dir, 'cron-decisions.jsonl'));
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].action, 'escalate');
  assert.match(decisions[0].reason, /3 consecutive error/);

  const runLog = readJsonl(join(dir, 'cron-runs', 'job-1.jsonl'));
  assert.equal(runLog.length, 1);
  assert.equal(runLog[0].status, 'error');
  assert.equal(runLog[0].withheld, true);
  assert.equal(runLog[0].decision.action, 'escalate');

  const savedJobs = JSON.parse(readFileSync(join(dir, 'cron-jobs.json'), 'utf8'));
  assert.equal(savedJobs[0].state.lastStatus, 'error');
  assert.ok(savedJobs[0].state.nextRunAtMs > Date.now());
});

test('background cron jobs defer under mixed due load without counting as failures', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'home23-cron-load-'));
  const scheduled = makeDueJob({
    id: 'scheduled-work',
    name: 'Scheduled work',
    queueClass: 'scheduled',
  } as Partial<CronJob>);
  const background = makeDueJob({
    id: 'background-work',
    name: 'Background work',
    queueClass: 'background',
  } as Partial<CronJob>);
  writeFileSync(join(dir, 'cron-jobs.json'), JSON.stringify([scheduled, background], null, 2));

  const calls: string[] = [];
  const scheduler = new CronScheduler({ timezone: 'America/New_York', jobsFile: 'cron-jobs.json', runsDir: 'cron-runs' }, async (job): Promise<JobResult> => {
    calls.push(job.id);
    return { status: 'ok', durationMs: 1 };
  }, dir);

  await (scheduler as any).tick();

  assert.deepEqual(calls, ['scheduled-work']);

  const decisions = readJsonl(join(dir, 'cron-decisions.jsonl'));
  const backgroundDecision = decisions.find((decision) => decision.jobId === 'background-work');
  assert.equal(backgroundDecision.action, 'defer');
  assert.equal(backgroundDecision.sourceIssue, 71);
  assert.match(backgroundDecision.reason, /background work deferred/i);

  const runLog = readJsonl(join(dir, 'cron-runs', 'background-work.jsonl'));
  assert.equal(runLog.length, 1);
  assert.equal(runLog[0].withheld, true);
  assert.equal(runLog[0].status, 'ok');

  const savedJobs = JSON.parse(readFileSync(join(dir, 'cron-jobs.json'), 'utf8'));
  const savedBackground = savedJobs.find((job: CronJob) => job.id === 'background-work');
  assert.equal(savedBackground.state.lastStatus, 'ok');
  assert.equal(savedBackground.state.consecutiveErrors, 0);
  assert.ok(savedBackground.state.nextRunAtMs > Date.now());
});
