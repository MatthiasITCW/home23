/**
 * Home23 — Trigger Index (Step 20)
 *
 * Loads durable MemoryObject triggers on startup.
 * Evaluates trigger conditions against inbound messages per-turn.
 * Records trigger audit events.
 */

import type { MemoryObject, TriggerCondition, EventEnvelope } from '../types.js';
import type { MemoryObjectStore } from './memory-objects.js';
import type { EventLedger } from './event-ledger.js';

interface TriggerMatch {
  memoryId: string;
  trigger: TriggerCondition;
  memory: MemoryObject;
}

export class TriggerIndex {
  private entries: Array<{ memory: MemoryObject; trigger: TriggerCondition }> = [];

  /**
   * Load all durable memories with triggers.
   */
  loadFrom(store: MemoryObjectStore): void {
    const durable = store.getDurableWithTriggers();
    this.entries = [];
    for (const obj of durable) {
      for (const trigger of obj.triggers) {
        this.entries.push({ memory: obj, trigger });
      }
    }
    console.log(`[trigger-index] Loaded ${this.entries.length} trigger(s) from ${durable.length} durable memories`);
  }

  /**
   * Evaluate all triggers against the current message + context.
   * Returns matching memories.
   */
  evaluate(
    userText: string,
    context: { isFirstTurn: boolean; recentDomains?: string[] },
    ledger?: EventLedger,
    sessionId?: string,
  ): TriggerMatch[] {
    const matches: TriggerMatch[] = [];
    const textLower = userText.toLowerCase();

    for (const entry of this.entries) {
      let fired = false;

      switch (entry.trigger.trigger_type) {
        case 'keyword': {
          // OR-separated keywords
          const keywords = entry.trigger.condition.split(/\s+OR\s+/i).map(k => k.trim().toLowerCase());
          fired = keywords.some(kw => textLower.includes(kw));
          break;
        }
        case 'temporal': {
          if (entry.trigger.condition === 'first turn of new session') {
            fired = context.isFirstTurn;
          }
          break;
        }
        case 'domain_entry': {
          // Check if recent domains include the specified domain
          const domain = entry.trigger.condition.replace(/conversation enters\s+/i, '').replace(/\s+domain$/i, '').trim().toLowerCase();
          fired = context.recentDomains?.includes(domain) ?? false;
          break;
        }
        case 'workflow_stage': {
          // Simple keyword check for workflow stage
          const stage = entry.trigger.condition.toLowerCase();
          fired = textLower.includes(stage);
          break;
        }
        case 'recurrence': {
          // Recurrence matching is complex — defer to curator cycle
          fired = false;
          break;
        }
      }

      if (fired) {
        matches.push({
          memoryId: entry.memory.memory_id,
          trigger: entry.trigger,
          memory: entry.memory,
        });

        // Emit TriggerFired event
        if (ledger && sessionId) {
          ledger.record('TriggerFired', sessionId, {
            memory_id: entry.memory.memory_id,
            trigger_type: entry.trigger.trigger_type,
            trigger_condition: entry.trigger.condition,
            memory_title: entry.memory.title,
          }, { objectId: entry.memory.memory_id, actor: 'trigger-index' });
        }
      }
    }

    return matches;
  }
}
