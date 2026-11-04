'use strict';
// Runs media.ps1 as a long-lived hidden child and exposes now-playing state + controls.
const { spawn } = require('node:child_process');
const path = require('node:path');
const { EventEmitter } = require('node:events');

class Media extends EventEmitter {
  constructor() { super(); this.state = { active: false }; this.volume = { level: null, muted: false }; this.child = null; this.stopped = false; this.restarts = 0; }

  start() {
    if (process.platform !== 'win32' || this.child) return;
    this.stopped = false;
    const script = path.join(__dirname, 'media.ps1');
    this.child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let buf = '';
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', chunk => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        this.restarts = 0;
        if (msg.type === 'volume') this.volume = { level: msg.level, muted: Boolean(msg.muted) };
        else this.state = msg;
        this.emit('change');
      }
    });
    this.child.on('exit', () => {
      this.child = null;
      if (!this.stopped && this.restarts++ < 5) setTimeout(() => this.start(), 3000 * this.restarts);
    });
  }

  command(cmd) {
    if (!/^(toggle|next|prev|seek \d+(\.\d+)?|vol \d{1,3}|mute [01])$/.test(cmd)) return;
    try { this.child?.stdin.write(cmd + '\n'); } catch {}
  }

  stop() { this.stopped = true; try { this.child?.stdin.end(); this.child?.kill(); } catch {} this.child = null; }
}

// The right bridge for this computer: Windows (media.ps1) or macOS (JXA); elsewhere a silent stub.
function createMedia() {
  if (process.platform === 'darwin') return new (require('./media-mac').MacMedia)();
  return new Media();
}

module.exports = { Media, createMedia };
