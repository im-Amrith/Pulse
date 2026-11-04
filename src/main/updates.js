'use strict';
// Checks the public Pulse-releases repo for a newer version (a version number only; nothing about you is sent).
const { EventEmitter } = require('node:events');

const REPO = 'im-Amrith/Pulse-releases';
const EVERY_MS = 6 * 60 * 60 * 1000;

// "0.2.0" > "0.1.9"; ignores a leading "v" and anything after a hyphen (pre-release tags count as older)
function isNewer(latest, current) {
  const parse = v => String(v || '').replace(/^v/i, '').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
  const a = parse(latest), b = parse(current);
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return false;
}

class Updates extends EventEmitter {
  constructor(current, { fetchImpl = globalThis.fetch } = {}) {
    super();
    this.fetch = fetchImpl;
    this.state = { current, latest: null, url: `https://github.com/${REPO}/releases/latest`, available: false, checkedAt: 0 };
    this.timer = null;
  }
  async check() {
    try {
      const r = await this.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Pulse' }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) return this.state;
      const j = await r.json();
      const latest = String(j.tag_name || '').replace(/^v/i, '');
      if (!latest) return this.state;
      this.state = { ...this.state, latest, url: j.html_url || this.state.url, available: isNewer(latest, this.state.current), checkedAt: Date.now() };
      this.emit('change');
    } catch { /* offline: try again later */ }
    return this.state;
  }
  start() { this.check(); this.timer = setInterval(() => this.check(), EVERY_MS); }
  stop() { clearInterval(this.timer); }
}

module.exports = { Updates, isNewer, REPO };
