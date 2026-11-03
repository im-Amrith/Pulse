'use strict';
// Wi-Fi status for the header, read from `netsh wlan show interfaces` every few seconds.
const { execFile } = require('node:child_process');
const { EventEmitter } = require('node:events');

function parseWlan(out) {
  const field = name => (out.match(new RegExp(`^\\s*${name}\\s*:\\s*(.+)$`, 'mi')) || [])[1]?.trim() || '';
  const state = field('State').toLowerCase();
  if (!state) return { wifi: 'none' };
  const signal = parseInt(field('Signal'), 10);
  return { wifi: state === 'connected' ? 'on' : 'off', ssid: field('SSID'), signal: Number.isFinite(signal) ? signal : null };
}

class SystemStatus extends EventEmitter {
  constructor() { super(); this.state = { wifi: 'none' }; this.timer = null; }
  start() {
    if (process.platform !== 'win32') return;
    const poll = () => execFile('netsh', ['wlan', 'show', 'interfaces'], { windowsHide: true, timeout: 4000 }, (err, out) => {
      const next = err ? { wifi: 'none' } : parseWlan(String(out));
      if (JSON.stringify(next) !== JSON.stringify(this.state)) { this.state = next; this.emit('change'); }
    });
    poll();
    this.timer = setInterval(poll, 15000);
  }
  stop() { clearInterval(this.timer); }
}

module.exports = { SystemStatus, parseWlan };
