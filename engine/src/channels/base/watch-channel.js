/**
 * WatchChannel — base class for filesystem-event channels.
 * Used by build/fswatch (design docs, config, code), os/fswatch-home23,
 * and work/goals (watches lifecycle directories).
 */

'use strict';

import chokidar from 'chokidar';
import { Channel } from '../contract.js';

export class WatchChannel extends Channel {
  constructor({ id, class: cls, paths, ignored }) {
    super({ id, class: cls });
    if (!Array.isArray(paths) || paths.length === 0) {
      throw new Error('WatchChannel requires at least one path');
    }
    this.paths = paths;
    this.ignored = ignored || /(^|[/\\])\.[^/\\]/;
    this._running = false;
    this._queue = [];
    this._waiters = [];
    this._watcher = null;
  }

  async start() {
    if (this._running) return;
    this._running = true;
    this._watcher = chokidar.watch(this.paths, {
      ignored: this.ignored,
      ignoreInitial: true,
      persistent: false,
      usePolling: true,
      interval: 250,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    });
    for (const type of ['add', 'change', 'unlink', 'addDir', 'unlinkDir']) {
      this._watcher.on(type, (path) => {
        const parsed = this.parseEvent({ type, path, ts: new Date().toISOString() });
        if (parsed) this._enqueue(parsed);
      });
    }
    await new Promise((resolve) => this._watcher.once('ready', resolve));
  }

  async stop() {
    this._running = false;
    if (this._watcher) {
      try { await this._watcher.close(); } catch {}
      this._watcher = null;
    }
    for (const w of this._waiters) w.resolve({ done: true, value: undefined });
    this._waiters = [];
  }

  _enqueue(item) {
    if (this._waiters.length) {
      const w = this._waiters.shift();
      w.resolve({ done: false, value: item });
    } else {
      this._queue.push(item);
    }
  }

  async *source() {
    while (this._running || this._queue.length) {
      if (this._queue.length) { yield this._queue.shift(); continue; }
      const next = await new Promise((resolve) => this._waiters.push({ resolve }));
      if (next.done) return;
      yield next.value;
    }
  }

  parseEvent(_evt) { throw new Error('WatchChannel.parseEvent() not implemented'); }
  parse(preParsed) { return preParsed; }
}
