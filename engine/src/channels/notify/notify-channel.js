/**
 * NotifyChannel — tails the cognition NOTIFY stream (notifications.jsonl)
 * as a bus channel. First consumer of the bus contract — proves the pattern
 * works for verifier-gated ingest without changing existing promoter behavior.
 *
 * Observations are emitted flagged UNCERTIFIED because notify records are
 * free-form agent-reported concerns that require downstream classification
 * (the harness-side PromoterWorker does that in parallel). crystallize()
 * returns null — the promoter owns the decision to write to live-problems.
 *
 * Class is WORK (agent's own work-stream signal about its work), not NOTIFY.
 */

'use strict';

import { TailChannel } from '../base/tail-channel.js';
import { ChannelClass, makeObservation } from '../contract.js';

export class NotifyChannel extends TailChannel {
  constructor({ path, id = 'notify.cognition' }) {
    super({ id, class: ChannelClass.WORK, path });
  }

  parseLine(line) {
    if (!line.trim()) return null;
    let obj;
    try { obj = JSON.parse(line); } catch { return null; }
    const ts = obj.ts || obj.timestamp || new Date().toISOString();
    const kindSlice = (obj.kind || '').slice(0, 16);
    return {
      payload: obj,
      sourceRef: `notify:${obj.id || ts}:${kindSlice}`,
      producedAt: ts,
    };
  }

  verify(parsed) {
    return makeObservation({
      channelId: this.id,
      sourceRef: parsed.sourceRef,
      payload: parsed.payload,
      flag: 'UNCERTIFIED',
      confidence: 0.5,
      producedAt: parsed.producedAt,
      verifierId: 'notify:basic',
    });
  }

  // Promoter decides promotion; the channel only emits.
  crystallize() { return null; }
}
