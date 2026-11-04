'use strict';
// macOS now-playing + volume for Pulse, using JavaScript for Automation (osascript -l JavaScript).
// Reads Spotify and Apple Music (other players can't be read by third-party apps on recent macOS).
// Apps are looked up by bundle id inside try/catch, so a missing app never triggers a "Where is …?" dialog,
// and running() is checked first, so Pulse never launches a player by itself.
const { execFile } = require('node:child_process');
const { EventEmitter } = require('node:events');

const PLAYERS = [
  { name: 'Spotify', id: 'com.spotify.client', durationMs: true },
  { name: 'Music', id: 'com.apple.Music', durationMs: false },
];

// One poll: a line per player that is playing or paused, then a VOL line.
const READ = `function run() {
  const out = [];
  for (const [name, id, ms] of ${JSON.stringify(PLAYERS.map(p => [p.name, p.id, p.durationMs]))}) {
    try {
      const app = Application(id);
      if (!app.running()) continue;
      const st = app.playerState();
      if (st !== 'playing' && st !== 'paused') continue;
      const t = app.currentTrack;
      const dur = Number(t.duration()) || 0;
      let art = '';
      if (name === 'Spotify') { try { art = t.artworkUrl() || ''; } catch (e) {} }
      out.push([name, st, t.name(), t.artist(), ms ? dur / 1000 : dur, Number(app.playerPosition()) || 0, art].join('\\t'));
    } catch (e) {}
  }
  try {
    const me = Application.currentApplication(); me.includeStandardAdditions = true;
    const v = me.getVolumeSettings();
    out.push(['VOL', v.outputVolume, v.outputMuted].join('\\t'));
  } catch (e) {}
  return out.join('\\n');
}`;

// Parses the poll output into the same shapes the Windows bridge produces.
function parseMacMedia(stdout, now = Date.now()) {
  let volume = null;
  const players = [];
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const f = line.split('\t');
    if (f[0] === 'VOL') { const level = parseInt(f[1], 10); volume = { level: Number.isFinite(level) ? level : null, muted: f[2] === 'true' }; continue; }
    if (f.length < 6) continue;
    players.push({ type: 'media', active: true, app: f[0], playing: f[1] === 'playing', title: f[2] || '', artist: f[3] || '',
      duration: Math.round(Number(f[4]) || 0), position: Math.round(Number(f[5]) || 0), updatedAt: now, artUrl: f[6] || '' });
  }
  // whatever is actually playing wins; otherwise the first paused player
  const state = players.find(p => p.playing) || players[0] || { type: 'media', active: false };
  return { state, volume };
}

const jxa = (script, cb) => execFile('osascript', ['-l', 'JavaScript', '-e', script], { timeout: 5000 }, cb);

class MacMedia extends EventEmitter {
  constructor({ fetchImpl = globalThis.fetch } = {}) {
    super();
    this.fetch = fetchImpl;
    this.state = { active: false }; this.volume = { level: null, muted: false };
    this.timer = null; this.busy = false; this.lastKey = ''; this.artCache = new Map();
  }

  start() {
    if (this.timer) return;
    this.poll();
    this.timer = setInterval(() => this.poll(), 1000);
  }

  poll() {
    if (this.busy) return;
    this.busy = true;
    jxa(READ, (err, stdout) => {
      this.busy = false;
      if (err) return;
      const { state, volume } = parseMacMedia(stdout);
      if (state.artUrl) state.art = this.artCache.get(state.artUrl) || '';
      // only report changes: track, play state, a seek (position jump), or volume
      const expected = this.state.active && this.state.playing ? this.state.position + (Date.now() - this.state.updatedAt) / 1000 : this.state.position;
      const jumped = state.active && Math.abs((state.position || 0) - (expected || 0)) > 2.5;
      const key = JSON.stringify([state.app, state.title, state.artist, state.playing, state.art]);
      let changed = false;
      if (key !== this.lastKey || jumped) { this.lastKey = key; this.state = state; changed = true; }
      if (volume && (volume.level !== this.volume.level || volume.muted !== this.volume.muted)) { this.volume = volume; changed = true; }
      if (changed) this.emit('change');
      if (state.artUrl && !this.artCache.has(state.artUrl)) this.loadArt(state.artUrl);
    });
  }

  // Artwork comes as an https URL; turn it into a data URL so the page's strict content policy still applies.
  async loadArt(url) {
    if (!/^https:\/\//.test(url)) return;
    this.artCache.set(url, '');
    try {
      const r = await this.fetch(url, { signal: AbortSignal.timeout(6000) });
      const buf = Buffer.from(await r.arrayBuffer());
      if (!r.ok || buf.length > 800_000) return;
      this.artCache.set(url, `data:${r.headers.get('content-type') || 'image/jpeg'};base64,${buf.toString('base64')}`);
      if (this.state.artUrl === url) { this.state = { ...this.state, art: this.artCache.get(url) }; this.lastKey = ''; this.emit('change'); }
    } catch {}
  }

  command(cmd) {
    if (!/^(toggle|next|prev|seek \d+(\.\d+)?|vol \d{1,3}|mute [01])$/.test(cmd)) return;
    const [verb, arg] = cmd.split(' ');
    let body;
    if (verb === 'vol') body = `const me = Application.currentApplication(); me.includeStandardAdditions = true; me.setVolume(null, { outputVolume: ${Math.min(100, Number(arg))} });`;
    else if (verb === 'mute') body = `const me = Application.currentApplication(); me.includeStandardAdditions = true; me.setVolume(null, { outputMuted: ${arg === '1'} });`;
    else {
      const player = PLAYERS.find(p => p.name === this.state.app);
      if (!player) return;
      const action = { toggle: 'app.playpause();', next: 'app.nextTrack();', prev: 'app.previousTrack();', seek: `app.playerPosition = ${Number(arg)};` }[verb];
      body = `const app = Application(${JSON.stringify(player.id)}); if (app.running()) { ${action} }`;
    }
    jxa(`function run() { try { ${body} } catch (e) {} return ''; }`, () => { this.lastKey = ''; setTimeout(() => this.poll(), 150); });
  }

  stop() { clearInterval(this.timer); this.timer = null; }
}

module.exports = { MacMedia, parseMacMedia, READ };
