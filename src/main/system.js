'use strict';
// System status: Wi-Fi (from `netsh wlan show interfaces`, every 15 s) and CPU / RAM use (every 2 s).
const { execFile } = require('node:child_process');
const os = require('node:os');
const { EventEmitter } = require('node:events');

function parseWlan(out) {
  const field = name => (out.match(new RegExp(`^\\s*${name}\\s*:\\s*(.+)$`, 'mi')) || [])[1]?.trim() || '';
  const state = field('State').toLowerCase();
  if (!state) return { wifi: 'none' };
  const signal = parseInt(field('Signal'), 10);
  return { wifi: state === 'connected' ? 'on' : 'off', ssid: field('SSID'), signal: Number.isFinite(signal) ? signal : null };
}

// CPU use is the share of non-idle time across all cores between two samples.
function cpuTimes(cpus = os.cpus()) {
  let idle = 0, total = 0;
  for (const c of cpus) { const t = c.times; idle += t.idle; total += t.user + t.nice + t.sys + t.irq + t.idle; }
  return { idle, total };
}
function cpuPercent(a, b) {
  const total = b.total - a.total, idle = b.idle - a.idle;
  return total > 0 ? Math.round(Math.max(0, Math.min(100, (1 - idle / total) * 100))) : 0;
}

class SystemStatus extends EventEmitter {
  constructor() { super(); this.state = { wifi: 'none' }; this.stats = { cpu: null, ram: null }; this.timers = []; }
  start() {
    let last = cpuTimes();
    this.timers.push(setInterval(() => {
      const now = cpuTimes();
      this.stats = { cpu: cpuPercent(last, now), ram: Math.round((1 - os.freemem() / os.totalmem()) * 100) };
      last = now;
      this.emit('stats', this.stats);
    }, 2000));
    if (process.platform !== 'win32') return;
    const poll = () => execFile('netsh', ['wlan', 'show', 'interfaces'], { windowsHide: true, timeout: 4000 }, (err, out) => {
      const next = err ? { wifi: 'none' } : parseWlan(String(out));
      if (JSON.stringify(next) !== JSON.stringify(this.state)) { this.state = next; this.emit('change'); }
    });
    poll();
    this.timers.push(setInterval(poll, 15000));
  }
  stop() { for (const t of this.timers) clearInterval(t); }
}

module.exports = { SystemStatus, parseWlan, cpuPercent };
