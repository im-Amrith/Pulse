'use strict';
// Watches the Downloads folder and reports files once they're really finished: browsers write to a
// temporary name (.crdownload, .part…) first, so we skip those and wait until the size stops changing.
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const PARTIAL = /\.(crdownload|part|partial|tmp|download|opdownload|!ut|dtapart)$/i;
const isPartial = name => PARTIAL.test(name) || name.startsWith('~$') || name.startsWith('.');

class DownloadsWatcher extends EventEmitter {
  constructor(dir, { settleMs = 1500 } = {}) {
    super();
    this.dir = dir; this.settleMs = settleMs;
    this.watcher = null; this.pending = new Map(); this.seen = new Set(); this.startedAt = 0;
  }

  start() {
    if (this.watcher) return;
    this.startedAt = Date.now();
    try { for (const name of fs.readdirSync(this.dir)) this.seen.add(name); } catch {}
    try {
      this.watcher = fs.watch(this.dir, (_type, name) => { if (name) this.#check(String(name)); });
      this.watcher.on('error', () => this.stop());
    } catch { this.watcher = null; }
  }

  stop() { try { this.watcher?.close(); } catch {} this.watcher = null; for (const t of this.pending.values()) clearTimeout(t); this.pending.clear(); }

  #check(name) {
    if (isPartial(name) || this.seen.has(name)) return;
    clearTimeout(this.pending.get(name));
    let lastSize = -1;
    const probe = () => {
      let st;
      try { st = fs.statSync(path.join(this.dir, name)); } catch { this.pending.delete(name); return; } // renamed away / deleted
      if (!st.isFile() || st.mtimeMs < this.startedAt - 5000) { this.pending.delete(name); return; }
      if (st.size !== lastSize || st.size === 0) { lastSize = st.size; this.pending.set(name, setTimeout(probe, this.settleMs)); return; }
      this.pending.delete(name); this.seen.add(name);
      this.emit('file', path.join(this.dir, name));
    };
    this.pending.set(name, setTimeout(probe, this.settleMs));
  }
}

module.exports = { DownloadsWatcher, isPartial };
