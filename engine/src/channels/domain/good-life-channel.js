/**
 * GoodLifeChannel - first-class Home23 engine self-regulation channel.
 *
 * It turns current engine evidence into a Good Life state vector and policy
 * decision. The observation then flows through the same bus, memory,
 * discovery, thinking, and motor path as every other real signal.
 */

'use strict';

import { createRequire } from 'node:module';
import { PollChannel } from '../base/poll-channel.js';
import { ChannelClass, makeObservation } from '../contract.js';

const require = createRequire(import.meta.url);
const { GoodLifeObjective } = require('../../good-life/objective.js');
const { GoodLifeLedger } = require('../../good-life/ledger.js');

export class GoodLifeChannel extends PollChannel {
  constructor({
    id = 'domain.good-life',
    intervalMs = 5 * 60 * 1000,
    objective = null,
    ledger = null,
    getSnapshot = null,
    brainDir = null,
    logger = null,
  } = {}) {
    super({ id, class: ChannelClass.DOMAIN, intervalMs });
    this.objective = objective || new GoodLifeObjective();
    this.ledger = ledger || (brainDir ? new GoodLifeLedger({ brainDir, logger }) : null);
    this.getSnapshot = typeof getSnapshot === 'function' ? getSnapshot : (() => ({}));
    this.logger = logger || console;
  }

  async poll() {
    const snapshot = await this.getSnapshot();
    const evaluation = this.objective.evaluate({
      ...(snapshot || {}),
      now: new Date().toISOString(),
    });
    if (this.ledger) this.ledger.append(evaluation);
    return [evaluation];
  }

  parse(raw) {
    return {
      payload: raw,
      sourceRef: `good-life:${raw.policy?.mode || 'observe'}:${raw.evaluatedAt}`,
      producedAt: raw.evaluatedAt,
    };
  }

  verify(parsed) {
    return makeObservation({
      channelId: this.id,
      sourceRef: parsed.sourceRef,
      payload: parsed.payload,
      flag: 'COLLECTED',
      confidence: 0.88,
      producedAt: parsed.producedAt,
      verifierId: 'home23:good-life-objective',
    });
  }

  crystallize() {
    return {
      method: 'good_life',
      type: 'observation',
      topic: 'good-life',
      tags: ['domain', 'good-life', 'self-regulation'],
    };
  }
}
