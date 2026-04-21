/**
 * Channel contract for the OS-engine universal bus.
 *
 * Every signal the engine observes — machine telemetry, OS state, domain
 * sensors, build events, work events, neighbor gossip — implements this
 * interface. See docs/design/STEP24-OS-ENGINE-REDESIGN.md for the design.
 */

'use strict';

export const ChannelClass = Object.freeze({
  MACHINE:  'machine',
  OS:       'os',
  DOMAIN:   'domain',
  BUILD:    'build',
  WORK:     'work',
  NEIGHBOR: 'neighbor',
});

export const VERIFICATION_FLAGS = Object.freeze([
  'COLLECTED', 'UNCERTIFIED', 'ZERO_CONTEXT', 'UNKNOWN',
]);

/**
 * Build a well-formed verified observation. Throws on invalid flag or
 * out-of-range confidence so bad data never leaves a channel.
 */
export function makeObservation({
  channelId,
  sourceRef,
  payload,
  flag,
  confidence,
  producedAt,
  verifierId,
}) {
  if (!VERIFICATION_FLAGS.includes(flag)) {
    throw new Error(`invalid verification flag: ${flag}`);
  }
  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
    throw new Error(`confidence must be 0..1, got ${confidence}`);
  }
  return {
    channelId,
    sourceRef,
    payload,
    flag,
    confidence,
    producedAt,
    receivedAt: new Date().toISOString(),
    verifierId: verifierId || null,
  };
}

/**
 * Base Channel. Concrete channels override source()/parse()/verify()/
 * crystallize(). Subclasses live in channels/base/ (shared shapes) or
 * per-class folders (build/, work/, domain/, machine/, os/, neighbor/).
 */
export class Channel {
  constructor({ id, class: cls }) {
    if (!id) throw new Error('Channel requires id');
    if (!cls) throw new Error('Channel requires class');
    this.id = id;
    this.class = cls;
  }

  async source() { throw new Error('Channel.source() not implemented'); }
  parse(_raw)    { throw new Error('Channel.parse() not implemented'); }

  // Default verify: trust the parse and tag as COLLECTED. Concrete
  // channels override to apply channel-specific evidence logic.
  verify(parsed, _ctx) {
    return makeObservation({
      channelId: this.id,
      sourceRef: parsed.sourceRef,
      payload: parsed.payload,
      flag: 'COLLECTED',
      confidence: 0.9,
      producedAt: parsed.producedAt,
    });
  }

  // Default crystallize: null (informational only). Concrete channels
  // override when observations should become MemoryObjects.
  crystallize(_verified) { return null; }
}
