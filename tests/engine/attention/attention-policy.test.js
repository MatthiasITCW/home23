import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyAttentionRequest,
  classifyObservationAttention,
  shouldInterrupt,
} from '../../../engine/src/attention/attention-policy.cjs';

test('attention policy keeps routine telemetry ambient', () => {
  const decision = classifyAttentionRequest({
    severity: 'routine',
    pressure_pa: 101234,
  });

  assert.equal(decision.mode, 'ambient');
  assert.equal(decision.reason, 'severity_routine');
});

test('attention policy treats action-required observations as interruptive', () => {
  const decision = classifyObservationAttention({
    payload: {
      severity: 'normal',
      requiresAction: true,
      text: 'Pick the bridge owner.',
    },
  });

  assert.equal(decision.mode, 'interruptive');
  assert.equal(decision.reason, 'action_required');
});

test('attention policy allows explicit ambient unless action is required', () => {
  const ambient = classifyAttentionRequest({
    attentionMode: 'ambient',
    severity: 'normal',
  });
  const action = classifyAttentionRequest({
    attentionMode: 'ambient',
    userInterventionRequired: true,
  });

  assert.equal(ambient.mode, 'ambient');
  assert.equal(action.mode, 'interruptive');
  assert.equal(shouldInterrupt({ payload: { userInterventionRequired: true } }), true);
});

test('attention policy suppresses non-action observations during deep-work', () => {
  const temporalContext = { jtrTime: { activeRhythms: ['deep-work'] } };
  const routine = classifyAttentionRequest({
    severity: 'normal',
    temporalContext,
  });
  const action = classifyAttentionRequest({
    severity: 'normal',
    requiresAction: true,
    temporalContext,
  });
  const anomaly = classifyAttentionRequest({
    kind: 'anomaly',
    temporalContext,
  });

  assert.equal(routine.mode, 'ambient');
  assert.equal(routine.reason, 'deep_work_suppresses_non_action');
  assert.equal(action.mode, 'interruptive');
  assert.equal(anomaly.mode, 'interruptive');
});
