import type { ConversationHistory } from '../agent/history.js';
import {
  type TurnEnvelope,
  type TurnEvent,
  type TurnStatus,
  isTurnEnvelope,
  isTurnEvent,
} from './turn-types.js';

/**
 * Turn lifecycle on top of the conversation JSONL.
 * All reads scan the file — fine until conversations get huge; defer an index sidecar until it hurts.
 */
export class TurnStore {
  constructor(private history: ConversationHistory) {}

  writeStart(chatId: string, turn_id: string, model?: string): TurnEnvelope {
    const env: TurnEnvelope = {
      type: 'turn',
      turn_id,
      chat_id: chatId,
      status: 'pending',
      role: 'assistant',
      started_at: new Date().toISOString(),
      model,
    };
    this.history.appendRecord(chatId, env);
    return env;
  }

  writeEnd(chatId: string, turn_id: string, status: Exclude<TurnStatus, 'pending'>, extras: { last_seq: number; stop_reason?: string; error?: string }): TurnEnvelope {
    const env: TurnEnvelope = {
      type: 'turn',
      turn_id,
      chat_id: chatId,
      status,
      role: 'assistant',
      started_at: '', // envelope records the END event — started_at lives on the start record
      ended_at: new Date().toISOString(),
      last_seq: extras.last_seq,
      stop_reason: extras.stop_reason,
      error: extras.error,
    };
    this.history.appendRecord(chatId, env);
    return env;
  }

  writeEvent(chatId: string, event: TurnEvent): void {
    this.history.appendRecord(chatId, event);
  }

  /** Return all events for a turn with seq > cursor, in order. */
  eventsSince(chatId: string, turn_id: string, cursor: number): TurnEvent[] {
    const all = this.history.loadRaw(chatId);
    const events: TurnEvent[] = [];
    for (const r of all) {
      if (isTurnEvent(r) && r.turn_id === turn_id && r.seq > cursor) events.push(r);
    }
    return events;
  }

  /** Find the final envelope for a turn, if any. */
  finalEnvelope(chatId: string, turn_id: string): TurnEnvelope | null {
    const all = this.history.loadRaw(chatId);
    let last: TurnEnvelope | null = null;
    for (const r of all) {
      if (isTurnEnvelope(r) && r.turn_id === turn_id && r.status !== 'pending') last = r;
    }
    return last;
  }

  /** List all turns in a chat, last-record-wins per turn_id. */
  listTurns(chatId: string): TurnEnvelope[] {
    const all = this.history.loadRaw(chatId);
    const byId = new Map<string, TurnEnvelope>();
    for (const r of all) {
      if (isTurnEnvelope(r)) byId.set(r.turn_id, r);
    }
    return [...byId.values()];
  }

  /** Any turn whose most recent envelope is still pending. */
  pendingTurns(chatId: string): TurnEnvelope[] {
    return this.listTurns(chatId).filter(t => t.status === 'pending');
  }

  /** Mark any pending turn older than maxAgeMs as orphaned. Returns the turn_ids marked. */
  sweepOrphans(chatId: string, maxAgeMs: number): string[] {
    const now = Date.now();
    const marked: string[] = [];
    for (const t of this.pendingTurns(chatId)) {
      const age = now - new Date(t.started_at).getTime();
      if (age >= maxAgeMs) {
        // Find the last event for this turn to get last_seq
        const events = this.eventsSince(chatId, t.turn_id, -1);
        const last_seq = events.length ? events[events.length - 1]!.seq : 0;
        this.writeEnd(chatId, t.turn_id, 'orphaned', { last_seq, error: 'process restarted or turn exceeded max age' });
        marked.push(t.turn_id);
      }
    }
    return marked;
  }
}
