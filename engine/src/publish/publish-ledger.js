/**
 * PublishLedger — tracks publication cadence per target + detects
 * starvation (targets that haven't published within their floor).
 */

'use strict';

import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class PublishLedger {
  constructor({ path, starvationFloor = {} }) {
    if (!path) throw new Error('PublishLedger requires path');
    this.path = path;
    this.starvationFloor = starvationFloor;
    this._entries = this._load();
  }

  _load() {
    if (!existsSync(this.path)) return [];
    try {
      return readFileSync(this.path, 'utf8').split('\n').filter(Boolean).map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean);
    } catch { return []; }
  }

  async record({ target, artifact, at = Date.now() }) {
    try { mkdirSync(dirname(this.path), { recursive: true }); } catch {}
    const row = { target, artifact, at };
    this._entries.push(row);
    appendFileSync(this.path, JSON.stringify(row) + '\n');
  }

  lastAt(target) {
    for (let i = this._entries.length - 1; i >= 0; i -= 1) {
      if (this._entries[i].target === target) return this._entries[i].at;
    }
    return null;
  }

  listStarving({ now = Date.now() } = {}) {
    const starving = [];
    for (const [target, maxQuietMs] of Object.entries(this.starvationFloor)) {
      const last = this.lastAt(target);
      if (last === null || (now - last) > maxQuietMs) starving.push(target);
    }
    return starving;
  }
}
