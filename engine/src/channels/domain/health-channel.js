/**
 * HealthChannel — tails ~/.health_log.jsonl (HealthKit export bridge).
 * Extracts the metrics we care about (HRV, RHR, sleep, VO2, wrist temp,
 * steps, exercise minutes, oxygen sat) into a flat payload.
 */

'use strict';

import { TailChannel } from '../base/tail-channel.js';
import { ChannelClass, makeObservation } from '../contract.js';

export class HealthChannel extends TailChannel {
  constructor({ path, id = 'domain.health' }) {
    super({ id, class: ChannelClass.DOMAIN, path });
  }

  parseLine(line) {
    if (!line.trim()) return null;
    let obj;
    try { obj = JSON.parse(line); } catch { return null; }
    const m = obj.metrics || {};
    const get = (k) => (m[k] && typeof m[k].value !== 'undefined') ? m[k].value : null;
    const payload = {
      ts: obj.ts,
      hrv:          get('heartRateVariability'),
      rhr:          get('restingHeartRate'),
      sleepMin:     get('sleepTime'),
      vo2:          get('vo2Max'),
      wristTempF:   get('wristTemperature'),
      steps:        get('stepCount'),
      exerciseMin:  get('exerciseMinutes'),
      oxygenSat:    get('oxygenSaturation'),
      respiratoryRate: get('respiratoryRate'),
    };
    return { payload, sourceRef: `health:${obj.ts}`, producedAt: obj.ts };
  }

  verify(parsed) {
    return makeObservation({
      channelId: this.id, sourceRef: parsed.sourceRef, payload: parsed.payload,
      flag: 'COLLECTED', confidence: 0.95, producedAt: parsed.producedAt, verifierId: 'health:kit-export',
    });
  }

  crystallize() {
    return { method: 'sensor_primary', type: 'observation', topic: 'health', tags: ['domain', 'health'] };
  }
}
