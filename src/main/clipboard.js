'use strict';
// Polls the clipboard and keeps the last few distinct text copies.
const { clipboard } = require('electron');
const { EventEmitter } = require('node:events');

class ClipboardHistory extends EventEmitter {
  constructor(limit = 12) { super(); this.limit = limit; this.items = []; this.last = ''; this.timer = null; }
  start() {
    this.last = clipboard.readText();
    this.timer = setInterval(() => {
      const text = clipboard.readText();
      if (!text || text === this.last) return;
      this.last = text;
      if (text.length > 20000) return;
      this.items = [{ text, at: Date.now() }, ...this.items.filter(i => i.text !== text)].slice(0, this.limit);
      this.emit('change', this.items);
    }, 800);
  }
  copy(text) { this.last = text; clipboard.writeText(text); }
  clear() { this.items = []; this.emit('change', this.items); }
  stop() { clearInterval(this.timer); }
}

module.exports = { ClipboardHistory };
