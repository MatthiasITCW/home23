import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { GoodLifeRegulator } = require('../../../engine/src/good-life/regulator.js');

function recoverObservation() {
  return {
    traceId: 'trace-good-life-1',
    channelId: 'domain.good-life',
    sourceRef: 'good-life:recover:2026-05-01T14:34:20.161Z',
    payload: {
      evaluatedAt: '2026-05-01T14:34:20.161Z',
      summary: 'recover - critical recovery drift',
      lanes: {
        viability: { status: 'healthy', reasons: [] },
        continuity: { status: 'strained', reasons: ['118 pending agenda item(s)'] },
        recovery: { status: 'critical', reasons: ['crash recovery is active'] },
      },
      policy: {
        mode: 'recover',
        reason: 'critical recovery drift',
        actionCard: {
          intent: 'recover',
          goodLifeLanes: ['continuity', 'recovery'],
          evidenceRequired: true,
          riskTier: 1,
          reversible: true,
        },
      },
    },
  };
}

test('GoodLifeRegulator routes recover policy through agenda and motor cortex', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'home23-good-life-regulator-'));
  const added = [];
  const acted = [];
  const regulator = new GoodLifeRegulator({
    brainDir: dir,
    getAgendaStore: () => ({
      add(params) {
        added.push(params);
        return { id: 'ag-good-life-1', content: params.content, status: 'candidate' };
      },
    }),
    getMotorCortex: () => ({
      async actOnAgendaItem(item, context) {
        acted.push({ item, context });
        return { status: 'acted', agendaId: item.id, action: { action: 'diagnose_agenda' } };
      },
    }),
  });

  const result = await regulator.handleObservation(recoverObservation());

  assert.equal(result.status, 'acted');
  assert.equal(added.length, 1);
  assert.equal(added[0].sourceSignal, 'good-life');
  assert.match(added[0].content, /^Diagnose Good Life recovery drift/);
  assert.equal(acted.length, 1);
  assert.equal(acted[0].context.actor, 'good-life-regulator');
});

test('GoodLifeRegulator appends agenda event when AgendaStore is not ready', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'home23-good-life-regulator-'));
  const regulator = new GoodLifeRegulator({ brainDir: dir, throttleMs: 1 });

  const result = await regulator.handleObservation(recoverObservation());
  const agenda = readFileSync(join(dir, 'agenda.jsonl'), 'utf8').trim();

  assert.equal(result.status, 'queued_no_motor');
  assert.match(agenda, /Good Life recovery drift/);
  assert.match(agenda, /"sourceSignal":"good-life"/);
});

test('GoodLifeRegulator throttles repeated equivalent policy pulses', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'home23-good-life-regulator-'));
  let added = 0;
  const regulator = new GoodLifeRegulator({
    brainDir: dir,
    throttleMs: 60 * 60 * 1000,
    getAgendaStore: () => ({
      add(params) {
        added++;
        return { id: `ag-${added}`, content: params.content, status: 'candidate' };
      },
    }),
  });

  assert.equal((await regulator.handleObservation(recoverObservation())).status, 'queued_no_motor');
  assert.equal((await regulator.handleObservation(recoverObservation())).status, 'throttled');
  assert.equal(added, 1);
});
