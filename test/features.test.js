'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseWhen } = require('../src/renderer/when');
const { DownloadsWatcher, isPartial } = require('../src/main/downloads');
const { cpuPercent } = require('../src/main/system');

const NOW = new Date(2026, 10, 4, 14, 30, 0); // 4 Nov 2026, 14:30 local

test('parseWhen: relative times', () => {
  assert.equal(parseWhen('in 20 min', NOW), NOW.getTime() + 20 * 60_000);
  assert.equal(parseWhen('in 2 hours', NOW), NOW.getTime() + 2 * 3_600_000);
  assert.equal(parseWhen('In 1.5 h', NOW), NOW.getTime() + 1.5 * 3_600_000);
});

test('parseWhen: clock times', () => {
  const at = (h, m, dayOffset = 0) => new Date(2026, 10, 4 + dayOffset, h, m).getTime();
  assert.equal(parseWhen('at 5pm', NOW), at(17, 0));
  assert.equal(parseWhen('17:45', NOW), at(17, 45));
  assert.equal(parseWhen('9am', NOW), at(9, 0, 1), 'a time already past today means tomorrow');
  assert.equal(parseWhen('tomorrow 9:15am', NOW), at(9, 15, 1));
  assert.equal(parseWhen('tomorrow at 8', NOW), at(8, 0, 1));
  assert.equal(parseWhen('12am', NOW), at(0, 0, 1));
});

test('parseWhen: rejects nonsense', () => {
  for (const s of ['', 'soon', '5', '25:00', '13pm', 'in min']) assert.equal(parseWhen(s, NOW), null, s);
});

test('downloads: skips partial files and reports finished ones once', async () => {
  for (const n of ['a.crdownload', 'b.part', '~$doc.docx', 'c.tmp']) assert.equal(isPartial(n), true, n);
  assert.equal(isPartial('slides.pptx'), false);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-dl-'));
  fs.writeFileSync(path.join(dir, 'old.txt'), 'already here');
  const w = new DownloadsWatcher(dir, { settleMs: 120 });
  const got = [];
  w.on('file', f => got.push(path.basename(f)));
  w.start();
  fs.writeFileSync(path.join(dir, 'report.pdf.crdownload'), 'half');
  await new Promise(r => setTimeout(r, 60));
  fs.renameSync(path.join(dir, 'report.pdf.crdownload'), path.join(dir, 'report.pdf')); // browser finishes
  await new Promise(r => setTimeout(r, 700));
  w.stop();
  assert.deepEqual(got, ['report.pdf']);
});

test('update check compares versions and reads the latest release', async () => {
  const { isNewer, Updates } = require('../src/main/updates');
  assert.equal(isNewer('0.2.0', '0.1.9'), true);
  assert.equal(isNewer('v1.0.0', '0.9.9'), true);
  assert.equal(isNewer('0.1.0', '0.1.0'), false);
  assert.equal(isNewer('0.1.0', '0.2.0'), false);
  assert.equal(isNewer('0.2.0-beta', '0.2.0'), false);
  const u = new Updates('0.1.0', { fetchImpl: async () => ({ ok: true, json: async () => ({ tag_name: 'v0.2.0', html_url: 'https://example.test/r' }) }) });
  const st = await u.check();
  assert.deepEqual([st.latest, st.available, st.url], ['0.2.0', true, 'https://example.test/r']);
  const offline = new Updates('0.1.0', { fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal((await offline.check()).available, false);
});

test('macOS: now-playing and volume parsing', () => {
  const { parseMacMedia } = require('../src/main/media-mac');
  // Spotify paused, Music playing: the one actually playing wins; Spotify durations arrive in ms and were converted by the script
  const out = 'Spotify\tpaused\tSong A\tArtist A\t200.5\t12\thttps://i.example/a.jpg\nMusic\tplaying\tSong B\tArtist B\t180\t42.7\t\nVOL\t35\tfalse';
  const { state, volume } = parseMacMedia(out, 1000);
  assert.deepEqual([state.app, state.title, state.playing, state.duration, state.position, state.updatedAt], ['Music', 'Song B', true, 180, 43, 1000]);
  assert.deepEqual(volume, { level: 35, muted: false });
  assert.equal(parseMacMedia('VOL\t0\ttrue').state.active, false);
  assert.deepEqual(parseMacMedia('VOL\t0\ttrue').volume, { level: 0, muted: true });
  assert.equal(parseMacMedia('Spotify\tpaused\tX\tY\t100\t5\thttps://i.example/x.jpg').state.artUrl, 'https://i.example/x.jpg');
});

test('macOS: Wi-Fi device and status parsing', () => {
  const { macWifiDevice, parseMacWifi } = require('../src/main/system');
  const ports = 'Hardware Port: Ethernet\nDevice: en1\n\nHardware Port: Wi-Fi\nDevice: en0\nEthernet Address: aa:bb\n';
  assert.equal(macWifiDevice(ports), 'en0');
  assert.equal(macWifiDevice('Hardware Port: Thunderbolt Bridge\nDevice: bridge0\n'), null);
  assert.deepEqual(parseMacWifi('Wi-Fi Power (en0): On', 'Current Wi-Fi Network: Home'), { wifi: 'on', ssid: 'Home', signal: null });
  assert.deepEqual(parseMacWifi('Wi-Fi Power (en0): On', 'You are not associated with an AirPort network.'), { wifi: 'on', ssid: '', signal: null });
  assert.deepEqual(parseMacWifi('Wi-Fi Power (en0): Off', ''), { wifi: 'off' });
});

test('macOS: RAM use counts app, wired and compressed memory, not file cache', () => {
  const { parseVmStat } = require('../src/main/system');
  // a 16 GB Mac with lots of file cache: almost nothing is "free", but under half is really in use
  const vm = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                9000.
Pages active:                            300000.
Pages inactive:                          290000.
Pages speculative:                         5000.
Pages wired down:                        150000.
Pages purgeable:                          10000.
Anonymous pages:                         280000.
File-backed pages:                       330000.
Pages occupied by compressor:             60000.`;
  const total = 16 * 1024 ** 3;
  assert.equal(parseVmStat(vm, total), 46); // (280000 - 10000 + 150000 + 60000) pages of 16 KB
  assert.equal(parseVmStat('garbage', total), null);
});

test('claude config notices Pulse entries that point at an old location', () => {
  const { createClaudeConfig } = require('../src/main/claude-config');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-move-'));
  const file = path.join(dir, 'settings.json');
  const before = createClaudeConfig({ token: 'b'.repeat(48), node: '"C:/old/Pulse.exe"', settingsFile: file });
  before.connect();
  const after = createClaudeConfig({ token: 'b'.repeat(48), node: '"D:/new/Pulse.exe"', settingsFile: file });
  assert.equal(after.hasOurs(), true);
  assert.equal(after.status().connected, false, 'reply hook still points at the old exe');
  after.connect();
  assert.equal(after.status().connected, true);
  assert.equal(createClaudeConfig({ token: 'c'.repeat(48), settingsFile: path.join(dir, 'none.json') }).hasOurs(), false);
});

test('cpuPercent from two samples', () => {
  assert.equal(cpuPercent({ idle: 100, total: 200 }, { idle: 150, total: 400 }), 75);
  assert.equal(cpuPercent({ idle: 0, total: 0 }, { idle: 0, total: 0 }), 0);
});
