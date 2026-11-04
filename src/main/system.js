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

// macOS: find the Wi-Fi device ("Hardware Port: Wi-Fi" → "Device: en0") in `networksetup -listallhardwareports`
function macWifiDevice(out) {
  const m = String(out).match(/Hardware Port:\s*(?:Wi-Fi|AirPort)\s*\r?\nDevice:\s*(\S+)/i);
  return m ? m[1] : null;
}
// …then read `networksetup -getairportpower <dev>` and `-getairportnetwork <dev>`.
// Newer macOS may hide the network name without location permission; then we still know Wi-Fi is on.
function parseMacWifi(powerOut, networkOut) {
  if (!/:\s*On\b/i.test(String(powerOut))) return { wifi: /:\s*Off\b/i.test(String(powerOut)) ? 'off' : 'none' };
  const ssid = (String(networkOut).match(/Current Wi-Fi Network:\s*(.+)/i) || [])[1]?.trim() || '';
  return { wifi: 'on', ssid, signal: null };
}

// macOS: os.freemem() only counts completely unused pages, and macOS fills spare memory with file cache,
// so it reads ~99% almost always. Activity Monitor's "Memory Used" is app memory + wired + compressed;
// we take the same from `vm_stat` (app memory = anonymous pages minus purgeable ones).
function parseVmStat(out, total = os.totalmem()) {
  const text = String(out);
  const page = Number((text.match(/page size of (\d+) bytes/) || [])[1]) || 4096;
  const n = name => { const m = text.match(new RegExp(`^${name}:\\s+(\\d+)`, 'mi')); return m ? Number(m[1]) : null; };
  const wired = n('Pages wired down'), compressed = n('Pages occupied by compressor'), anon = n('Anonymous pages'), active = n('Pages active');
  if (wired == null || !total) return null;
  const app = anon != null ? Math.max(0, anon - (n('Pages purgeable') || 0)) : (active || 0);
  return Math.round(Math.max(0, Math.min(100, ((app + wired + (compressed || 0)) * page / total) * 100)));
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
    const mac = process.platform === 'darwin';
    let macRam = null, tick = 0;
    const readVm = () => execFile('/usr/bin/vm_stat', { timeout: 3000 }, (err, out) => { if (!err) macRam = parseVmStat(out); });
    if (mac) readVm();
    this.timers.push(setInterval(() => {
      const now = cpuTimes();
      if (mac && ++tick % 3 === 0) readVm(); // every 6 s is plenty for a percentage
      const ram = mac && macRam != null ? macRam : Math.round((1 - os.freemem() / os.totalmem()) * 100);
      this.stats = { cpu: cpuPercent(last, now), ram };
      last = now;
      this.emit('stats', this.stats);
    }, 2000));
    const set = next => { if (JSON.stringify(next) !== JSON.stringify(this.state)) { this.state = next; this.emit('change'); } };
    let poll;
    if (process.platform === 'win32') {
      poll = () => execFile('netsh', ['wlan', 'show', 'interfaces'], { windowsHide: true, timeout: 4000 }, (err, out) => set(err ? { wifi: 'none' } : parseWlan(String(out))));
    } else if (process.platform === 'darwin') {
      let dev = null;
      const ns = (args, cb) => execFile('/usr/sbin/networksetup', args, { timeout: 4000 }, (err, out) => cb(err ? '' : String(out)));
      poll = () => {
        const read = d => ns(['-getairportpower', d], power => ns(['-getairportnetwork', d], net => set(parseMacWifi(power, net))));
        if (dev) read(dev); else ns(['-listallhardwareports'], out => { dev = macWifiDevice(out); if (dev) read(dev); else set({ wifi: 'none' }); });
      };
    } else return;
    poll();
    this.timers.push(setInterval(poll, 15000));
  }
  stop() { for (const t of this.timers) clearInterval(t); }
}

module.exports = { SystemStatus, parseWlan, parseMacWifi, macWifiDevice, cpuPercent, parseVmStat };
