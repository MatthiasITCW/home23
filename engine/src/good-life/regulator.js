'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const AUTO_ACT_MODES = new Set(['repair', 'recover', 'help']);
const DEFAULT_THROTTLE_MS = 60 * 60 * 1000;

class GoodLifeRegulator {
  constructor(opts = {}) {
    if (!opts.brainDir) throw new Error('GoodLifeRegulator requires brainDir');
    this.brainDir = opts.brainDir;
    this.logger = opts.logger || console;
    this.getAgendaStore = typeof opts.getAgendaStore === 'function' ? opts.getAgendaStore : (() => null);
    this.getMotorCortex = typeof opts.getMotorCortex === 'function' ? opts.getMotorCortex : (() => null);
    this.throttleMs = Number(opts.throttleMs || DEFAULT_THROTTLE_MS);
    this.statePath = path.join(this.brainDir, 'good-life-regulator-state.json');
    this.agendaPath = path.join(this.brainDir, 'agenda.jsonl');
  }

  async handleObservation(obs) {
    if (!obs || obs.channelId !== 'domain.good-life' || !obs.payload?.policy?.actionCard) {
      return { status: 'ignored' };
    }

    const evaluation = obs.payload;
    const agenda = this._agendaFromEvaluation(evaluation);
    if (!agenda) return { status: 'ignored' };

    const key = this._actionKey(evaluation);
    const state = this._readState();
    const last = state[key];
    const nowMs = Date.now();
    if (last?.at && nowMs - Date.parse(last.at) < this.throttleMs) {
      return { status: 'throttled', key };
    }

    const agendaStore = this.getAgendaStore();
    let record = null;
    if (agendaStore?.add) {
      record = agendaStore.add({
        sourceThoughtId: obs.traceId || obs.sourceRef || null,
        sourceCycleSessionId: `good-life:${evaluation.evaluatedAt || new Date().toISOString()}`,
        content: agenda.content,
        kind: agenda.kind,
        topicTags: agenda.topicTags,
        sourceSignal: 'good-life',
        temporalContext: {
          evaluatedAt: evaluation.evaluatedAt || null,
          summary: evaluation.summary || null,
          policy: evaluation.policy?.mode || null,
          lanes: agenda.lanes,
        },
      });
    } else {
      record = this._appendAgendaEvent(obs, agenda, evaluation);
    }

    if (!record) return { status: 'rejected', key };
    this._writeState({
      ...state,
      [key]: {
        at: new Date().toISOString(),
        agendaId: record.id,
        mode: evaluation.policy.mode,
        summary: evaluation.summary,
      },
    });

    const shouldAct = AUTO_ACT_MODES.has(evaluation.policy.mode)
      && evaluation.policy.actionCard.evidenceRequired
      && evaluation.policy.actionCard.riskTier <= 1
      && !['acted_on', 'discarded'].includes(record.status);
    if (!shouldAct) return { status: 'queued', key, agendaId: record.id };

    const motor = this.getMotorCortex();
    if (!motor?.actOnAgendaItem) {
      return { status: 'queued_no_motor', key, agendaId: record.id };
    }

    const action = await motor.actOnAgendaItem(record, {
      actor: 'good-life-regulator',
      origin: 'good-life',
      goodLife: evaluation.policy.actionCard,
    });
    return {
      status: action?.status === 'acted' ? 'acted' : 'queued',
      key,
      agendaId: record.id,
      action,
    };
  }

  _agendaFromEvaluation(evaluation) {
    const mode = evaluation.policy?.mode || 'observe';
    const lanes = Object.entries(evaluation.lanes || {})
      .filter(([, v]) => v?.status && v.status !== 'healthy')
      .map(([name, v]) => `${name}:${v.status}`);
    const laneText = lanes.length ? lanes.join(', ') : 'development:watch';
    const base = 'using instances/jerry/brain/good-life-state.json, instances/jerry/brain/good-life-ledger.jsonl, and engine logs';

    let content = null;
    if (mode === 'repair') {
      content = `Diagnose Good Life repair drift ${base}; restore verified Home23 engine evidence and clear the failing lane(s): ${laneText}.`;
    } else if (mode === 'recover') {
      content = `Diagnose Good Life recovery drift ${base}; clear crash recovery, reduce maintenance ratio, and return the autonomous loop to useful jtr-visible work.`;
    } else if (mode === 'help') {
      content = `Diagnose Good Life usefulness drift ${base}; route one bounded Home23 action that produces jtr-visible progress.`;
    } else if (mode === 'learn') {
      content = `Investigate Good Life learning progress ${base}; crystallize one grounded finding or discard the thread with evidence.`;
    } else if (mode === 'rest') {
      content = `Diagnose Good Life friction drift ${base}; reduce loop pressure without losing active obligations.`;
    } else if (mode === 'ask') {
      content = `Determine the blocked Good Life decision ${base}; surface one concrete missing preference only if it changes the next Home23 action.`;
    } else {
      return null;
    }

    return {
      content,
      kind: mode === 'ask' ? 'question' : 'idea',
      topicTags: ['good-life', `good-life:${mode}`, ...lanes.map(l => `good-life:${l.replace(':', '-')}`)],
      lanes,
    };
  }

  _appendAgendaEvent(obs, agenda, evaluation) {
    const now = new Date().toISOString();
    const id = `ag-gl-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const record = {
      id,
      content: agenda.content,
      kind: agenda.kind,
      topicTags: agenda.topicTags,
      sourceThoughtId: obs.traceId || obs.sourceRef || null,
      sourceCycleSessionId: `good-life:${evaluation.evaluatedAt || now}`,
      sourceSignal: 'good-life',
      referencedNodes: [],
      temporalContext: {
        evaluatedAt: evaluation.evaluatedAt || null,
        summary: evaluation.summary || null,
        policy: evaluation.policy?.mode || null,
        lanes: agenda.lanes,
      },
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
      seenCount: 1,
      status: 'candidate',
      history: [{ status: 'candidate', at: now, note: 'created by Good Life regulator' }],
    };
    fs.appendFileSync(this.agendaPath, JSON.stringify({ type: 'add', id, record }) + '\n', 'utf8');
    return record;
  }

  _actionKey(evaluation) {
    const mode = evaluation.policy?.mode || 'observe';
    const lanes = Object.entries(evaluation.lanes || {})
      .filter(([, v]) => v?.status && v.status !== 'healthy')
      .map(([name, v]) => `${name}:${v.status}`)
      .sort()
      .join('|');
    return `${mode}:${lanes || 'steady'}`;
  }

  _readState() {
    try {
      if (!fs.existsSync(this.statePath)) return {};
      return JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
    } catch {
      return {};
    }
  }

  _writeState(state) {
    try {
      fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2), 'utf8');
    } catch (err) {
      this.logger.warn?.('[good-life] regulator state write failed:', err?.message || err);
    }
  }
}

module.exports = { GoodLifeRegulator };
