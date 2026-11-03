'use strict';
// Time-synced lyrics for the song that's playing, looked up on LRCLIB (https://lrclib.net), a free public
// lyrics database. Only the track name, artist and length are sent. Results are cached per song.
const { EventEmitter } = require('node:events');

const API = 'https://lrclib.net/api';
const HEADERS = { 'User-Agent': 'Pulse island (personal desktop app)' };

// "[01:02.34] text" -> [{ t: 62.34, text }]
function parseLrc(lrc) {
  const lines = [];
  for (const raw of String(lrc || '').split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of stamps) lines.push({ t: Number(m[1]) * 60 + Number(m[2]), text });
  }
  return lines.sort((a, b) => a.t - b.t);
}

// Player titles often carry extras that lyric databases don't: "Song - Remastered 2011", "Song (feat. X)".
const cleanTitle = t => String(t || '').replace(/\s+-\s+(.*remaster.*|.*version.*|live.*|mono|stereo)$/i, '').replace(/\s*[([](feat\.?|ft\.?|with)\s[^)\]]*[)\]]/i, '').trim();
const cleanArtist = a => String(a || '').split(/,|;| & | feat\.? /i)[0].trim();

class Lyrics extends EventEmitter {
  constructor({ fetchImpl = globalThis.fetch } = {}) {
    super();
    this.fetch = fetchImpl;
    this.cache = new Map(); // key -> lines[] | null
    this.key = '';
    this.current = null;    // { key, lines } | null
    this.enabled = true;
  }

  // Called whenever the media state changes; looks up lyrics when the song changes.
  async update(media) {
    if (!this.enabled || !media?.active || !media.title || !media.artist) { this.#set('', null); return; }
    const key = `${media.artist}\u0000${media.title}`;
    if (key === this.key) return;
    this.key = key;
    if (this.cache.has(key)) { this.#set(key, this.cache.get(key)); return; }
    this.#set(key, null);
    let lines = null;
    try { lines = await this.#lookup(cleanTitle(media.title), cleanArtist(media.artist), media.duration); } catch {}
    this.cache.set(key, lines);
    if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value);
    if (this.key === key) this.#set(key, lines);
  }

  async #lookup(title, artist, duration) {
    const get = async url => {
      const r = await this.fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(7000) });
      return r.ok ? r.json() : null;
    };
    const q = new URLSearchParams({ track_name: title, artist_name: artist });
    if (duration > 0) {
      const exact = await get(`${API}/get?${q}&duration=${Math.round(duration)}`);
      if (exact?.syncedLyrics) return parseLrc(exact.syncedLyrics);
    }
    const found = await get(`${API}/search?${q}`);
    if (!Array.isArray(found)) return null;
    const synced = found.filter(x => x.syncedLyrics);
    synced.sort((a, b) => Math.abs((a.duration || 0) - duration) - Math.abs((b.duration || 0) - duration));
    return synced[0] ? parseLrc(synced[0].syncedLyrics) : null;
  }

  #set(key, lines) {
    const next = lines?.length ? { key, lines } : null;
    if (next?.key === this.current?.key && Boolean(next) === Boolean(this.current)) return;
    this.current = next;
    this.emit('change');
  }
}

module.exports = { Lyrics, parseLrc, cleanTitle, cleanArtist };
