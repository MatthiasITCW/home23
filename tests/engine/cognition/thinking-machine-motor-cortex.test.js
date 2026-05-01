import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ThinkingMachine } = require('../../../engine/src/cognition/thinking-machine.js');

const logger = { info() {}, warn() {}, error() {} };

test('kept thinking-machine agenda candidates are routed to motor cortex before persistence hooks', async () => {
  const ledger = [];
  const motorCalls = [];
  const emitted = [];
  const logged = [];

  const agendaRecord = {
    id: 'ag-motor-1',
    content: 'Investigate the 182-second field report cycle; verify whether a cron partition is stalled.',
    kind: 'question',
    topicTags: ['ops'],
  };

  const machine = new ThinkingMachine({
    unifiedClient: {},
    memory: {},
    discoveryEngine: { pop: () => [] },
    logger,
    emitThought: (thought) => emitted.push(thought),
    logThought: async (thought) => logged.push(thought),
    config: {
      eventLedger: {
        record: (eventType, sessionId, payload, meta) => ledger.push({ eventType, sessionId, payload, meta }),
      },
      agendaStore: {
        add(params) {
          assert.match(params.content, /182-second field report/);
          return agendaRecord;
        },
      },
      motorCortex: {
        async actOnAgendaItem(item, context) {
          motorCalls.push({ item, context });
          return {
            status: 'acted',
            action: {
              directAction: true,
              action: 'diagnose_agenda',
              problemId: 'agenda_ag-motor-1',
              status: 'open',
              detail: 'queued for diagnostic dispatch',
            },
          };
        },
      },
    },
  });

  machine.deepDive = {
    async think() {
      return {
        text: 'This operational thought is long enough to pass the empty-output guard and should be kept.',
        referencedNodes: ['node-1'],
        usage: { model: 'test-model', neighborhoodSize: 1 },
        reasoning: 'test reasoning',
      };
    },
  };
  machine.pgsAdapter = {
    getStats: () => ({}),
    async connect() {
      return {
        available: false,
        note: 'pgs unavailable in test',
        perspectives: [],
        candidateEdges: [],
        connectionNotes: [],
        usage: { partitionsTouched: 0, durationMs: 1 },
      };
    },
  };
  machine.critique = {
    async evaluate() {
      return {
        verdict: 'keep',
        confidence: 0.91,
        gaps: [],
        rationale: 'bounded operational action',
        agendaCandidates: [{
          content: agendaRecord.content,
          kind: agendaRecord.kind,
          topicTags: agendaRecord.topicTags,
        }],
      };
    },
  };

  await machine._runCycle({
    signal: 'ops-anomaly',
    score: 0.88,
    clusterId: 'cluster-1',
    rationale: 'field report latency anomaly',
  });

  assert.equal(motorCalls.length, 1);
  assert.equal(motorCalls[0].item.id, 'ag-motor-1');
  assert.equal(motorCalls[0].context.actor, 'motor-cortex');
  assert.deepEqual(emitted[0].agendaIds, ['ag-motor-1']);
  assert.equal(emitted[0].motorActions[0].status, 'acted');
  assert.deepEqual(logged[0].motorActions, emitted[0].motorActions);
  assert.equal(machine.recentThoughts[0].motorActions[0].target, 'agenda_ag-motor-1');
  assert.ok(ledger.some(e => e.eventType === 'MotorActionRouted' && e.payload.agendaId === 'ag-motor-1'));
});
