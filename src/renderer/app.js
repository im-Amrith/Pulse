'use strict';
/* global pulse, Eyes, icon */
// Pulse island renderer. Data from Claude Code is always rendered with textContent, never innerHTML.

const $ = sel => document.querySelector(sel);
const island = $('#island'), shell = $('#shell'), page = $('#page');
let S = null;          // latest state from main
let open = false;
let current = 'home';
let menuOpen = false;
let lastError = '';
const drafts = {};     // text drafts keyed by data-key, survive re-renders
const picks = {};      // AskUserQuestion selections: sessionId -> { question: Set }
const chat = { question: '', answer: '', error: '', busy: false };
let noteEditing = false;
let copiedAt = { text: '', at: 0 };

const PAGES = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'claude', label: 'Claude Code', icon: 'spark' },
  { id: 'music', label: 'Music', icon: 'music' },
  { id: 'chat', label: 'Ask Pulse', icon: 'chat' },
  { id: 'time', label: 'Time', icon: 'stopwatch' },
  { id: 'plan', label: 'Plan', icon: 'calendar' },
  { id: 'launcher', label: 'Launcher', icon: 'grid' },
  { id: 'tray', label: 'Tray', icon: 'tray' },
  { id: 'clipboard', label: 'Clipboard', icon: 'copy' },
  { id: 'settings', label: 'Settings', icon: 'gear', hidden: true },
];
const pageOf = id => PAGES.find(p => p.id === id) || PAGES[0];

// ---------- helpers ----------
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}
const svgEl = (tag, attrs = {}) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const fmt = s => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`; };
const ago = t => { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' }); };
const resetMs = r => { if (!r) return 0; const t = typeof r === 'number' ? (r < 1e12 ? r * 1000 : r) : Date.parse(r); return Math.max(0, t - Date.now()); };
const isToday = t => new Date(t).toDateString() === new Date().toDateString();
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const go = id => { current = id; menuOpen = false; render(); };
const artStyle = a => (a ? `background-image:url("${a.replace(/"/g, '')}")` : '');

async function act(fn) {
  try { lastError = ''; await fn(); } catch (e) { lastError = e.message; }
  render();
}
function preserveFocus(fn) {
  const a = document.activeElement, key = a?.dataset?.key, start = a?.selectionStart, end = a?.selectionEnd;
  fn();
  if (!key) return;
  const el = document.querySelector(`[data-key="${CSS.escape(key)}"]`);
  if (el && el !== a) { el.focus(); try { el.setSelectionRange(start, end); } catch {} }
}
function draftInput(key, props = {}) {
  const el = h('input', { type: 'text', 'data-key': key, ...props });
  el.value = drafts[key] || '';
  el.addEventListener('input', () => { drafts[key] = el.value; });
  return el;
}

// ---------- colours: a main (accent) and a secondary (body) colour, everything else is derived ----------
const THEMES = [
  { name: 'Ink', main: '#8d9bff', second: '#171a2e' },
  { name: 'Forest', main: '#79e0b6', second: '#132420' },
  { name: 'Plum', main: '#ff8a7a', second: '#24172a' },
  { name: 'Graphite', main: '#ffc861', second: '#1c1c22' },
  { name: 'Harbour', main: '#6cc6ff', second: '#0f1d2e' },
  { name: 'Wine', main: '#ff7aa8', second: '#26121c' },
];
const DEFAULT_THEME = THEMES[0];
const hexToHsl = hex => {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  const hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(hue * 60 + 360) % 360, s * 100, l * 100];
};
const hsl = (h, s, l) => `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%)`;
const luminance = hex => { const n = parseInt(hex.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const validHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
let appliedTheme = '';
let themePreview = false; // true while a colour picker is being dragged: don't let state pushes snap it back
function applyTheme(theme) {
  const main = validHex(theme?.main) ? theme.main : DEFAULT_THEME.main;
  const second = validHex(theme?.second) ? theme.second : DEFAULT_THEME.second;
  const key = main + second;
  if (key === appliedTheme) return;
  appliedTheme = key;
  // The body is always kept dark so text stays readable, whatever colour you pick.
  const [h, s] = hexToHsl(second), l = Math.min(Math.max(hexToHsl(second)[2], 7), 18), sat = Math.min(s, 45);
  const root = document.documentElement.style;
  root.setProperty('--brand', main);
  root.setProperty('--on-brand', luminance(main) > 0.35 ? '#11131f' : '#ffffff');
  root.setProperty('--ink', hsl(h, sat, l));
  root.setProperty('--ink-hi', hsl(h, sat, l + 5));
  root.setProperty('--well', hsl(h, sat, Math.max(l - 4.5, 3)));
  root.setProperty('--well-hi', hsl(h, sat, l + 1.5));
  root.setProperty('--mist', hsl(h, Math.min(sat, 22), 72));
  root.setProperty('--faint', hsl(h, Math.min(sat, 18), 50));
}
applyTheme(DEFAULT_THEME);

// ---------- the face ----------
const pillEyes = new Eyes($('#pill-eyes'), { reach: 3 });
const railEyes = new Eyes($('#rail-eyes'), { reach: 2 });
$('#rail-eyes').classList.add('mini');
const chatEyesEl = h('div', { 'data-pokeable': true, class: 'big' });
const chatEyes = new Eyes(chatEyesEl, { reach: 8 }); // reused across renders so blinking and gaze stay smooth
pulse.onCursor(c => Eyes.follow(c));
let lastActivity = Date.now();
document.addEventListener('mousemove', () => { lastActivity = Date.now(); });

function eyeMood() {
  if (!S) return 'idle';
  if (chat.busy) return 'working';
  const m = S.hub.mood;
  if (m !== 'idle') return m;
  return Date.now() - lastActivity > 5 * 60_000 && !S.media.playing ? 'sleepy' : 'idle';
}
function updateEyes() {
  const mood = eyeMood();
  for (const e of Eyes.all) { e.setMood(mood); e.setMusic(Boolean(S?.media.active && S.media.playing)); }
  drawTrace(mood);
}

// ---------- the pulse trace: a heartbeat line in the header that follows the mood ----------
// Each wave is a list of [x, height] points over one period; the path repeats it and scrolls left.
const WAVES = {
  idle: { period: 100, speed: 6, pts: Array.from({ length: 11 }, (_, i) => [i * 10, Math.sin(i / 10 * Math.PI * 2) * 2]) },
  sleepy: { period: 200, speed: 12, pts: Array.from({ length: 11 }, (_, i) => [i * 20, Math.sin(i / 10 * Math.PI * 2) * 0.8]) },
  working: { period: 100, speed: 2.2, pts: [[0, 0], [30, 0], [33, 2], [36, 0], [40, 0], [42, -2], [45, 12], [48, -6], [52, 0], [64, 0], [70, 3], [76, 0], [100, 0]] },
  asking: { period: 50, speed: 1.4, pts: [[0, 0], [8, 0], [11, 9], [14, -4], [17, 0], [22, 0], [25, 7], [28, -3], [31, 0], [50, 0]] },
  finished: { period: 200, speed: 7, pts: [[0, 0], [80, 0], [92, 3], [100, 5], [108, 3], [120, 0], [200, 0]] },
  failed: { period: 200, speed: 3, pts: [[0, 0], [20, 0], [24, 6], [27, -7], [31, 5], [34, -3], [38, 0], [110, 0], [113, -5], [117, 4], [120, 0], [200, 0]] },
};
let traceMood = '';
function drawTrace(mood) {
  if (mood === traceMood) return;
  traceMood = mood;
  const w = WAVES[mood] || WAVES.idle;
  const d = [];
  for (let base = 0; base < 600; base += w.period) for (const [x, y] of w.pts) d.push(`${d.length ? 'L' : 'M'}${(base + x).toFixed(1)} ${(15 - y).toFixed(1)}`);
  $('#trace-path').setAttribute('d', d.join(''));
  $('#trace').style.setProperty('--trace-speed', `${w.speed}s`);
}

// ---------- the morph: one shape, clipped between capsule and card ----------
const WIN_W = 720, WIN_H = 560, TOP = 10, CARD_W = 660;
let openH = 330, pillMode = 'idle';
function pillWidth() { return { idle: 252, wide: 340, notice: 420, lyrics: 470 }[pillMode] + (hovering && !open ? 14 : 0); }
function shape() {
  const w = open ? CARD_W : pillWidth();
  const hgt = open ? openH : hovering ? 40 : 38;
  const r = open ? 26 : hgt / 2;
  const l = (WIN_W - w) / 2;
  island.style.clipPath = `inset(${TOP}px ${WIN_W - l - w}px ${WIN_H - TOP - hgt}px ${l}px round ${r}px)`;
  island.style.setProperty('--pw', `${w}px`);
  island.style.setProperty('--ph', `${hgt}px`);
  island.style.setProperty('--open-h', `${openH}px`);
}

// ---------- open / close ----------
// focus=true only for things you did yourself, so Pulse never steals the keyboard from your app.
function setOpen(v, { focus = false, to } = {}) {
  if (to) current = to;
  if (v && focus) pulse.focus();
  if (open === v) { render(); return; }
  open = v; menuOpen = false;
  island.classList.toggle('opening', v);
  island.classList.toggle('is-open', v);
  pulse.interactive(v || hovering);
  if (!v && S && ['finished', 'failed'].includes(S.hub.mood)) pulse.ack();
  if (!v) noteEditing = false;
  render();
}
$('#pill').addEventListener('click', () => setOpen(true, { focus: true }));
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (menuOpen) { menuOpen = false; render(); } else setOpen(false); } });
pulse.onOpen(to => setOpen(true, { focus: true, to: typeof to === 'string' ? to : undefined }));
pulse.onToggle(() => setOpen(!open, { focus: true }));
pulse.onBlur(() => { if (!hovering && !S?.hub.sessions.some(s => s.holding) && !chat.busy) setOpen(false); });
pulse.onAttention(() => { if (S?.prefs.autoOpen !== false) setOpen(true, { to: 'claude' }); chime('ask'); });
pulse.onFinished(kind => { chime(kind === 'failed' ? 'fail' : 'done'); });
pulse.onReminder(() => { chime('ask'); render(); });
let downloadNotice = null;
pulse.onDownload(name => { downloadNotice = { name, at: Date.now() }; render(); setTimeout(render, 6100); });
pulse.onStats(s => {
  const el = $('#stats');
  if (el && s.cpu != null) el.replaceChildren('CPU ', h('b', { text: `${s.cpu}%` }), '  RAM ', h('b', { text: `${s.ram}%` }));
});

// Hover to unfold, move away to fold. Short delays on both sides so passing over doesn't flicker it,
// and it stays open while you're typing, using the menu, dragging files, or Claude is waiting for an answer.
let hovering = false, hoverTimer = null;
const HOVER_OPEN_MS = 160, HOVER_CLOSE_MS = 420;
function keepOpen() {
  const typing = document.hasFocus() && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) && island.contains(document.activeElement);
  return typing || menuOpen || dragDepth > 0 || chat.busy || S?.hub.sessions.some(s => s.holding);
}
function onHover(over) {
  clearTimeout(hoverTimer);
  if (!open) { island.classList.add('springy'); shape(); }
  if (over && !open) hoverTimer = setTimeout(() => setOpen(true), HOVER_OPEN_MS);
  if (!over && open) hoverTimer = setTimeout(() => { if (!hovering && !keepOpen()) setOpen(false); }, HOVER_CLOSE_MS);
}
document.addEventListener('mousemove', e => {
  const over = island.contains(e.target);
  if (over !== hovering) { hovering = over; pulse.interactive(over || open); onHover(over); }
});
document.addEventListener('mouseleave', () => { if (hovering) { hovering = false; pulse.interactive(open); onHover(false); } });

// Dropping files anywhere on the island parks them in the tray.
let dragDepth = 0;
// On the Launcher page, dropped files become pins; anywhere else they go to the Tray.
document.addEventListener('dragenter', e => { if (!e.dataTransfer?.types.includes('Files')) return; e.preventDefault(); dragDepth++; island.classList.add('dropping'); if (!open) setOpen(true, { to: 'tray' }); else if (current !== 'tray' && current !== 'launcher') go('tray'); });
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; island.classList.remove('dropping'); } });
document.addEventListener('drop', e => {
  e.preventDefault(); dragDepth = 0; island.classList.remove('dropping');
  const paths = Array.from(e.dataTransfer.files, f => pulse.pathFor(f)).filter(Boolean);
  if (paths.length) act(() => (current === 'launcher' ? pulse.pinAddPaths(paths) : pulse.shelfAdd(paths)));
});

// ---------- sound ----------
let audio;
function chime(kind) {
  if (S && S.prefs.sound === false) return;
  try {
    audio ||= new AudioContext();
    const notes = { done: [784, 1047], ask: [988, 784, 988], fail: [392, 311], focus: [659, 784, 988] }[kind] || [784];
    notes.forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + i * 0.11;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.1, t + 0.015); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.45);
    });
  } catch {}
}

// ---------- focus timer (renderer-owned, survives reloads via localStorage) ----------
const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
let F = store.get('focus', {});
const focusLen = () => (S?.prefs.focusMinutes || 25) * 60;
const focusLeft = () => (F.endsAt ? Math.max(0, (F.endsAt - Date.now()) / 1000) : F.pausedLeft ?? focusLen());
function focusStart() { F = { endsAt: Date.now() + focusLeft() * 1000, total: F.total || focusLen() }; store.set('focus', F); render(); }
function focusPause() { F = { pausedLeft: focusLeft(), total: F.total }; store.set('focus', F); render(); }
function focusReset() { F = {}; store.set('focus', F); render(); }

// ---------- timers and stopwatch (also renderer-owned, kept in localStorage) ----------
let timers = store.get('timers', []);          // [{ id, name, total, endsAt | pausedLeft, done }]
let sw = store.get('stopwatch', { acc: 0, startedAt: 0, laps: [] });
const saveTimers = () => store.set('timers', timers);
const saveSw = () => store.set('stopwatch', sw);
const timerLeft = t => (t.done ? 0 : t.endsAt ? Math.max(0, (t.endsAt - Date.now()) / 1000) : t.pausedLeft ?? t.total);
const swMs = () => sw.acc + (sw.startedAt ? Date.now() - sw.startedAt : 0);
const fmtSw = ms => { const cs = Math.floor(ms / 10) % 100; return `${fmt(Math.floor(ms / 1000))}.${String(cs).padStart(2, '0')}`; };
function addTimer(name, minutes) {
  const total = Math.round(minutes * 60);
  if (!(total > 0) || total > 24 * 3600) { lastError = 'Pick a length between 1 second and 24 hours.'; render(); return; }
  timers = [...timers, { id: crypto.randomUUID(), name: name.trim() || `${minutes} min timer`, total, endsAt: Date.now() + total * 1000, done: false }];
  saveTimers(); render();
}
function updateTimer(id, fn) { timers = timers.map(t => (t.id === id ? fn({ ...t }) : t)).filter(Boolean); saveTimers(); render(); }
const nextTimer = () => timers.filter(t => t.endsAt && !t.done).sort((a, b) => a.endsAt - b.endsAt)[0];

// ---------- reminders (stored in prefs; the main process fires them) ----------
const reminders = () => S?.prefs.reminders || [];
const saveReminders = list => act(() => pulse.setPrefs({ reminders: list }));
const dueReminder = () => reminders().filter(r => r.fired && !r.done).sort((a, b) => b.at - a.at)[0];
const soonReminder = () => reminders().filter(r => !r.done && !r.fired && r.at - Date.now() < 10 * 60_000).sort((a, b) => a.at - b.at)[0];
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function whenLabel(t) {
  const ms = t - Date.now(), d = new Date(t);
  if (ms < 0) return 'due';
  if (ms < 60 * 60_000) return `in ${Math.max(1, Math.round(ms / 60_000))} min`;
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (isToday(t)) return `today ${time}`;
  if (dayKey(t) === dayKey(Date.now() + 86_400_000)) return `tomorrow ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`;
}

// ======================= music position + lyrics =======================
// The player reports a position at a moment (updatedAt); between reports we extrapolate.
function mediaPos() {
  const m = S?.media; if (!m?.active) return 0;
  const base = m.updatedAt > 0 ? Math.min(m.updatedAt, Date.now()) : Date.now();
  const pos = (m.position || 0) + (m.playing ? (Date.now() - base) / 1000 : 0);
  return m.duration ? Math.min(m.duration, pos) : pos;
}
const LYRIC_LEAD = 0.25; // show a line a hair early, it feels more in sync
function lyricLines() {
  const m = S?.media, l = S?.lyrics;
  if (!m?.active || !l || l.key !== `${m.artist}\u0000${m.title}`) return null;
  return l.lines;
}
function lyricAt(lines, pos) {
  let i = -1;
  for (let k = 0; k < lines.length; k++) { if (lines[k].t <= pos + LYRIC_LEAD) i = k; else break; }
  return { now: i >= 0 ? lines[i].text : '', next: lines[i + 1]?.text || '', i };
}
const showLyricsInPill = () => S && S.prefs.lyrics !== false && S.media.playing && lyricLines() && !open;
let lastLyric = -2;
// Lines sit in one grid cell: the old one slides up and out while the new one slides in. No reflow, no jitter.
function tickLyrics() {
  const lines = lyricLines(); if (!lines) return;
  const { now, next, i } = lyricAt(lines, mediaPos());
  const pl = $('#pill-lyric');
  if (pl && i !== lastLyric) {
    lastLyric = i;
    for (const old of pl.querySelectorAll('span:not(.out)')) { old.classList.add('out'); old.addEventListener('animationend', () => old.remove(), { once: true }); }
    pl.append(h('span', { text: now || '♪' }));
  }
  const ln = $('#lyr-now'), lx = $('#lyr-next');
  if (ln && ln.textContent !== (now || '♪')) ln.textContent = now || '♪';
  if (lx && lx.textContent !== next) lx.textContent = next;
}

// ======================= capsule =======================
function renderPill() {
  const { hub, media } = S;
  const top = hub.sessions[0];
  island.dataset.mood = shell.dataset.mood = hub.mood;
  shell.classList.toggle('glow', hub.mood !== 'idle');
  const left = $('#pill-left'), right = $('#pill-right');
  left.replaceChildren(); right.replaceChildren();
  let mode = 'wide';
  const label = (text, color) => h('span', { style: `color:${color}`, text });
  if (top?.state === 'working') {
    const verb = top.steps.at(-1)?.status === 'running' ? top.steps.at(-1).verb : 'Thinking';
    left.append(h('span', { class: 'spin' }, icon('spark', 15)), h('span', { class: 'pill-verb', text: verb }));
    right.append(h('span', { 'data-tick': top.startedAt, text: fmt((Date.now() - top.startedAt) / 1000) }));
  } else if (top?.state === 'asking') {
    left.append(label('Needs you', 'var(--honey)'));
    right.append(label(top.project || 'Claude', 'var(--mist)'));
  } else if (top?.state === 'finished') {
    left.append(h('span', { style: 'color:var(--mint)' }, icon('check', 15)), label('Done', 'var(--mint)'));
    right.append(label(top.startedAt ? fmt(((top.endedAt || Date.now()) - top.startedAt) / 1000) : '', 'var(--mist)'));
  } else if (top?.state === 'failed') {
    left.append(h('span', { style: 'color:var(--rose)' }, icon('x', 15)), label('Failed', 'var(--rose)'));
    right.append(label(top.project || '', 'var(--mist)'));
  } else if (dueReminder()) {
    const r = dueReminder();
    mode = 'notice';
    left.append(h('span', { style: 'color:var(--honey)' }, icon('bell', 15)), h('span', { class: 'pill-text', style: 'color:var(--paper)', text: r.text }));
    right.append(label('Now', 'var(--honey)'));
  } else if (downloadNotice && Date.now() - downloadNotice.at < 6000) {
    mode = 'notice';
    left.append(h('span', { style: 'color:var(--mint)' }, icon('download', 15)), h('span', { class: 'pill-text', style: 'color:var(--paper)', text: downloadNotice.name }));
    right.append(label('In Tray', 'var(--mint)'));
  } else if (soonReminder()) {
    const r = soonReminder();
    mode = 'notice';
    left.append(h('span', { style: 'color:var(--brand)' }, icon('bell', 15)), h('span', { class: 'pill-text', text: r.text }));
    right.append(label(whenLabel(r.at), 'var(--mist)'));
  } else if (F.endsAt || nextTimer() || sw.startedAt) {
    const t = nextTimer();
    if (F.endsAt) { left.append(h('span', { style: 'color:var(--brand)' }, icon('timer', 15)), label('Focus', 'var(--brand)')); right.append(h('span', { 'data-live': 'focus', text: fmt(focusLeft()) })); }
    else if (t) { left.append(h('span', { style: 'color:var(--brand)' }, icon('timer', 15)), h('span', { class: 'pill-text', style: 'color:var(--brand)', text: t.name })); right.append(h('span', { 'data-live': `timer:${t.id}`, text: fmt(timerLeft(t)) })); }
    else { left.append(h('span', { style: 'color:var(--brand)' }, icon('stopwatch', 15)), label('Stopwatch', 'var(--brand)')); right.append(h('span', { 'data-live': 'sw', text: fmt(swMs() / 1000) })); }
  } else if (media.active && media.playing) {
    left.append(h('span', { class: 'pill-art', style: artStyle(media.art) }, media.art ? null : icon('music', 13)));
    right.append(h('span', { class: 'eq' }, h('i'), h('i'), h('i'), h('i')));
    if (showLyricsInPill()) mode = 'lyrics';
  } else mode = 'idle';
  if (mode !== pillMode) { pillMode = mode; island.classList.add('springy'); }
  island.classList.toggle('wide', mode === 'wide' || mode === 'notice');
  island.classList.toggle('lyrics', mode === 'lyrics');
  if (mode !== 'lyrics') { $('#pill-lyric').replaceChildren(); lastLyric = -2; } else tickLyrics();
  if (!open) shape();
}

// ======================= rail / header / menu =======================
function renderRail() {
  const box = $('#rail-pages'); box.replaceChildren();
  for (const p of PAGES.filter(x => !x.hidden)) {
    const busy = p.id === 'claude' && S.hub.mood !== 'idle';
    box.append(h('button', { class: `rbtn ${p.id === current ? 'active' : ''}`, title: p.label, 'aria-label': p.label, onclick: () => go(p.id) },
      icon(p.icon, 17), busy ? h('span', { class: 'badge-dot' }) : null));
  }
}
function renderHeader() {
  $('#title').textContent = pageOf(current).label;
  tickClock(); tickUsage();
  const mb = $('#menu-btn'); mb.replaceChildren(icon('dots', 18));
  if (!S.claude.connected) mb.append(h('i', { class: 'dot', title: 'Claude Code is not connected' }));
}
function renderMenu() {
  const m = $('#menu');
  m.hidden = !menuOpen;
  if (!menuOpen) return;
  m.replaceChildren();
  const v = S.volume;
  if (v.level != null) {
    const range = h('input', { type: 'range', min: 0, max: 100, value: v.level, style: `--p:${v.level}%`, 'aria-label': 'Volume' });
    range.addEventListener('input', () => { range.style.setProperty('--p', `${range.value}%`); pulse.media(`vol ${range.value}`); });
    m.append(h('div', { class: 'mitem', style: 'cursor:default' },
      h('button', { title: v.muted ? 'Unmute' : 'Mute', onclick: () => pulse.media(`mute ${v.muted ? 0 : 1}`) }, icon(v.muted ? 'mute' : 'volume', 18)), range), h('div', { class: 'msep' }));
  }
  const w = S.system;
  if (w.wifi !== 'none') m.append(h('div', { class: 'mitem', style: 'cursor:default;font-weight:500' }, icon(w.wifi === 'on' ? 'wifi' : 'wifiOff', 18), w.wifi === 'on' ? `${w.ssid}${w.signal != null ? `, ${w.signal}%` : ''}` : 'Wi-Fi is off'), h('div', { class: 'msep' }));
  const item = (ic, text, fn, cls = '') => h('button', { class: `mitem ${cls}`, onclick: () => { menuOpen = false; fn(); } }, icon(ic, 18), text);
  m.append(
    !S.claude.connected ? item('spark', 'Connect Claude Code', () => act(() => pulse.connect())) : null,
    item('gear', 'Settings', () => go('settings')),
    item('up', 'Fold in', () => setOpen(false)),
    h('div', { class: 'msep' }),
    item('power', 'Quit Pulse', () => pulse.quit(), 'danger'));
}
$('#menu-btn').addEventListener('click', e => { e.stopPropagation(); menuOpen = !menuOpen; render(); });
document.addEventListener('click', e => { if (menuOpen && !$('#menu').contains(e.target) && !$('#menu-btn').contains(e.target)) { menuOpen = false; render(); } });

// ======================= attention (permissions, questions, plans) =======================
function renderAttention() {
  const box = $('#attention'); box.replaceChildren();
  if (lastError) box.append(h('div', { class: 'error', text: lastError }));
  for (const s of S.hub.sessions.filter(x => x.holding && x.pending)) box.append(askCard(s));
}
function askCard(s) {
  const p = s.pending;
  const head = h('div', { class: 'ask-head' },
    h('b', { text: p.kind === 'plan' ? 'Review the plan' : p.kind === 'ask' ? 'Claude has a question' : `Allow ${p.tool}?` }),
    h('span', { text: s.project || 'Claude Code' }));
  if (p.kind === 'tool') {
    return h('div', { class: 'ask' }, head, h('pre', { text: p.detail }),
      h('div', { class: 'row end' },
        h('button', { class: 'btn no', text: 'Deny', onclick: () => act(() => pulse.deny(s.id)) }),
        h('button', { class: 'btn ok', text: 'Allow', onclick: () => act(() => pulse.allow(s.id)) })));
  }
  if (p.kind === 'plan') {
    const key = `plan:${s.id}`;
    return h('div', { class: 'ask' }, head, h('div', { class: 'plan', text: p.plan }),
      draftInput(key, { placeholder: 'What should change? (optional)' }),
      h('div', { class: 'row end' },
        h('button', { class: 'btn', text: 'Send feedback', onclick: () => act(async () => { await pulse.plan(s.id, false, drafts[key]); delete drafts[key]; }) }),
        h('button', { class: 'btn ok', text: 'Approve plan', onclick: () => act(() => pulse.plan(s.id, true)) })));
  }
  const sel = (picks[s.id] ||= {});
  const qs = p.questions.map((q, qi) => {
    const set = (sel[q.question] ||= new Set());
    return h('div', { class: 'q' }, h('div', { class: 'q-title', text: q.question }),
      h('div', { class: 'opts' }, q.options.map(o => h('button', {
        class: `opt ${set.has(o.label) ? 'on' : ''}`,
        onclick: () => { if (q.multiSelect) { set.has(o.label) ? set.delete(o.label) : set.add(o.label); } else { set.clear(); set.add(o.label); } render(); },
      }, o.label, o.description ? h('small', { text: o.description }) : null))),
      draftInput(`ask:${s.id}:${qi}`, { placeholder: 'Or type your own answer' }));
  });
  const submit = () => act(async () => {
    const answers = {};
    p.questions.forEach((q, qi) => { const own = (drafts[`ask:${s.id}:${qi}`] || '').trim(); answers[q.question] = own || [...(sel[q.question] || [])]; });
    await pulse.answer(s.id, answers); delete picks[s.id];
  });
  return h('div', { class: 'ask' }, head, qs, h('div', { class: 'row end' },
    h('button', { class: 'btn no', text: 'Skip', onclick: () => act(() => pulse.deny(s.id)) }),
    h('button', { class: 'btn ok', text: 'Send answer', onclick: submit })));
}

// ======================= Home =======================
const DOING = { read: 'Reading the code', search: 'Looking around', edit: 'Making changes', run: 'Running commands', web: 'Checking the web', agent: 'Delegating', mcp: 'Using tools' };
function limitBar() {
  const u = S.hub.usage.fiveHour;
  if (!u) return null;
  const lvl = u.used >= 80 ? 'high' : u.used >= 50 ? 'mid' : '';
  const ms = resetMs(u.resetsAt);
  return h('div', { class: 'limit' },
    h('div', { class: 'lbl' }, h('span', {}, '5-hour limit ', h('b', { text: `${u.used}%` })), h('span', { text: ms ? `resets in ${fmt(ms / 1000)}` : '' })),
    h('div', { class: `track ${lvl}` }, h('i', { style: `width:${u.used}%` })));
}
function renderHome() {
  const jobs = S.history.filter(e => isToday(e.at) && e.result === 'done').length;
  const top = S.hub.sessions.find(s => s.state !== 'idle');
  let say, sub, action = null;
  if (!S.claude.connected && !top) {
    say = 'Connect Claude Code to get started.'; sub = 'Pulse follows your sessions through local hooks. Nothing leaves this PC.';
    action = h('button', { class: 'btn primary', text: 'Connect Claude Code', onclick: () => act(() => pulse.connect()) });
  } else if (top?.state === 'working') {
    say = `${DOING[top.steps.at(-1)?.kind] || 'Thinking'} in ${top.project || 'your project'}`; sub = top.prompt ? `“${top.prompt}”` : '';
    action = h('button', { class: 'btn', text: 'Watch it work', onclick: () => go('claude') });
  } else if (top?.state === 'asking') {
    say = 'Claude is waiting for you.'; sub = top.label;
    action = h('button', { class: 'btn primary', text: 'Answer', onclick: () => go('claude') });
  } else if (top?.state === 'finished') {
    say = `Finished in ${fmt(((top.endedAt || Date.now()) - top.startedAt) / 1000)}.`; sub = top.prompt ? `“${top.prompt}”` : '';
    action = h('button', { class: 'btn', text: 'See what changed', onclick: () => go('claude') });
  } else if (top?.state === 'failed') {
    say = 'That run failed.'; sub = top.label;
    action = h('button', { class: 'btn', text: 'See details', onclick: () => go('claude') });
  } else {
    say = jobs ? `${plural(jobs, 'job')} finished today.` : 'All quiet.';
    sub = S.history[0] ? `Last one: “${S.history[0].prompt}”` : 'Start a prompt in Claude Code and Pulse will follow along.';
  }
  const m = S.media, playing = m.active && m.playing;
  page.append(h('div', { class: 'home' },
    h('div', { class: 'status' },
      h('h2', { class: 'say', text: say }),
      sub ? h('p', { class: 'sub ellipsis', text: sub }) : null,
      action ? h('div', { class: 'actions' }, action) : null,
      limitBar()),
    h('div', { class: 'side' },
      h('button', { class: 'well tile', onclick: () => go('music') },
        h('span', { class: 'art', style: artStyle(m.art) }, m.art ? null : icon('music', 18)),
        h('span', { class: 'grow' }, h('div', { class: 't1 ellipsis', text: m.active ? m.title || 'Unknown track' : 'Nothing playing' }),
          h('div', { class: 't2 ellipsis', text: m.active ? m.artist || '' : 'Spotify or any player' })),
        m.active ? h('span', { class: 'round', title: playing ? 'Pause' : 'Play', onclick: e => { e.stopPropagation(); pulse.media('toggle'); } }, icon(playing ? 'pause' : 'play', 15)) : null),
      timeTile(),
      reminderTile())));
}
// Shows whichever clock is busy: a running timer, the stopwatch, or the focus session.
function timeTile() {
  const t = nextTimer();
  if (t && !F.endsAt) return h('button', { class: 'well tile', onclick: () => { timeTab = 'timers'; go('time'); } },
    h('span', { class: 'grow' }, h('div', { class: 'big', 'data-live': `timer:${t.id}`, text: fmt(timerLeft(t)) }), h('div', { class: 't2 ellipsis', text: t.name })));
  if (sw.startedAt && !F.endsAt) return h('button', { class: 'well tile', onclick: () => { timeTab = 'stopwatch'; go('time'); } },
    h('span', { class: 'grow' }, h('div', { class: 'big', 'data-live': 'sw', text: fmt(swMs() / 1000) }), h('div', { class: 't2', text: 'Stopwatch running' })));
  return h('button', { class: 'well tile', onclick: () => { timeTab = 'focus'; go('time'); } },
    h('span', { class: 'grow' }, h('div', { class: 'big', 'data-focus': true, text: fmt(focusLeft()) }),
      h('div', { class: 't2', text: F.endsAt ? 'Focus session running' : F.pausedLeft ? 'Focus paused' : 'Focus session' })),
    h('span', { class: 'round', title: F.endsAt ? 'Pause' : 'Start', onclick: e => { e.stopPropagation(); F.endsAt ? focusPause() : focusStart(); } }, icon(F.endsAt ? 'pause' : 'play', 15)));
}
function reminderTile() {
  const r = dueReminder() || reminders().filter(x => !x.done && !x.fired).sort((a, b) => a.at - b.at)[0];
  return h('button', { class: 'well tile copy', onclick: () => go('plan') },
    h('div', { class: 't2', style: 'color:var(--faint);font-size:11.5px', text: r ? (r.fired ? 'Reminder, due now' : `Next reminder, ${whenLabel(r.at)}`) : 'Reminders' }),
    h('div', { class: 't2', text: r ? r.text : 'Nothing coming up. Add one in Plan.' }));
}

// ======================= Claude =======================
function renderClaude() {
  if (!S.claude.connected && !S.hub.sessions.length) {
    page.append(h('div', { class: 'claude' },
      h('div', { class: 'claude-left' },
        h('h2', { class: 'say', text: 'Follow every Claude Code session from here.' }),
        h('p', { class: 'mist', text: 'Pulse adds local hooks to ~/.claude/settings.json and keeps a backup. Nothing leaves this PC.' }),
        h('div', {}, h('button', { class: 'btn primary', text: 'Connect Claude Code', onclick: () => act(() => pulse.connect()) }))),
      claudeSide()));
    return;
  }
  const top = S.hub.sessions.find(s => s.state !== 'idle');
  if (top?.state === 'working') { renderWork(top); return; }
  const jobs = S.history.filter(e => isToday(e.at) && e.result === 'done').length;
  const left = h('div', { class: 'claude-left' });
  if (top) {
    left.append(h('div', { class: 'where', text: top.project || 'Claude Code' }),
      h('h2', { class: 'say sm', text: { asking: 'Waiting for you', finished: 'Finished', failed: 'Failed' }[top.state] || top.label }));
    if (top.lastMessage && !top.holding) left.append(h('div', { class: 'well live-msg', text: top.lastMessage }));
    if (top.canReply) {
      const key = `reply:${top.id}`;
      const send = () => act(async () => { await pulse.reply(top.id, drafts[key]); delete drafts[key]; });
      left.append(h('div', { class: 'reply' }, draftInput(key, { placeholder: 'Reply to Claude', onkeydown: e => { if (e.key === 'Enter') send(); } }),
        h('button', { class: 'round', title: 'Send reply', onclick: send }, icon('send', 15))));
    }
  } else {
    left.append(h('h2', { class: 'say sm', text: jobs ? `${plural(jobs, 'job')} finished today` : 'Nothing finished yet today' }));
    if (S.hub.error) left.append(h('div', { class: 'error', text: S.hub.error }));
    else if (!S.hub.lastHeard) left.append(h('p', { class: 'faint', text: 'Waiting to hear from Claude Code. Restart any session that was already open.' }));
    left.append(h('div', { class: 'jobs' }, S.history.slice(0, 6).map(e => h('div', { class: 'job', title: e.summary || e.prompt },
      h('i', { class: e.result }), h('span', { class: 'ellipsis', text: e.prompt }), h('time', { text: ago(e.at) })))));
  }
  page.append(h('div', { class: 'claude' }, left, claudeSide()));
}
function claudeSide() {
  const model = h('select', { onchange: e => act(() => pulse.setModel(e.target.value)) },
    [['', 'Claude Code default'], ['opus', 'Opus'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku'], ['opusplan', 'Opus for planning']].map(([v, l]) => h('option', { value: v, text: l })));
  model.value = ['', 'opus', 'sonnet', 'haiku', 'opusplan'].includes(S.claude.model) ? S.claude.model : '';
  const u = S.hub.usage;
  const meter = (name, w) => w && h('div', {}, h('div', { class: 'row', style: 'justify-content:space-between;font-size:12px;color:var(--mist);margin-bottom:5px' }, name, h('b', { class: 'num', style: 'color:var(--paper)', text: `${w.used}%` })),
    h('div', { class: `track ${w.used >= 80 ? 'high' : w.used >= 50 ? 'mid' : ''}` }, h('i', { style: `width:${w.used}%` })));
  return h('div', { class: 'claude-side' },
    h('div', { class: 'well' }, h('label', {}, 'Model for new sessions', model)),
    u.fiveHour || u.sevenDay ? h('div', { class: 'well' }, meter('5-hour limit', u.fiveHour), meter('Weekly limit', u.sevenDay)) : null,
    S.history.length ? h('div', { class: 'row end' }, h('button', { class: 'link', text: 'Clear history', onclick: () => act(() => pulse.clearHistory()) })) : null);
}

// While Claude works: elapsed time, what it's doing, the code it's touching, and one tick per tool call.
const EXT = { js: ['JS', '#f0d64a', '#1d1800'], cjs: ['JS', '#f0d64a', '#1d1800'], mjs: ['JS', '#f0d64a', '#1d1800'], jsx: ['JSX', '#5fd3f3', '#00222b'],
  ts: ['TS', '#4c8fe0', '#fff'], tsx: ['TSX', '#4c8fe0', '#fff'], py: ['PY', '#5b8fd1', '#fff'], css: ['CSS', '#8d9bff', '#10132a'],
  html: ['HTML', '#f0805a', '#2a0e00'], json: ['JSON', '#79e0b6', '#062218'], md: ['MD', '#a9aecb', '#141733'], ps1: ['PS', '#5b8fd1', '#fff'],
  ppt: ['PPT', '#f0805a', '#2a0e00'], pptx: ['PPT', '#f0805a', '#2a0e00'], pdf: ['PDF', '#ff6b86', '#2a0010'], doc: ['DOC', '#5b8fd1', '#fff'], docx: ['DOC', '#5b8fd1', '#fff'],
  xls: ['XLS', '#79e0b6', '#062218'], xlsx: ['XLS', '#79e0b6', '#062218'], png: ['IMG', '#c79bff', '#1d0b33'], jpg: ['IMG', '#c79bff', '#1d0b33'], jpeg: ['IMG', '#c79bff', '#1d0b33'], zip: ['ZIP', '#ffc861', '#2a1d00'] };
const ftype = ext => { const [label, bg, fg] = EXT[ext] || [(ext || '•').slice(0, 3).toUpperCase(), '#262b48', '#d6d9f0']; return h('span', { class: 'ftype', style: `background:${bg};color:${fg}`, text: label }); };
function renderWork(s) {
  const last = s.steps.at(-1);
  let card;
  if (last?.kind === 'run' && s.output) {
    card = h('div', { class: 'well code' },
      h('div', { class: 'code-head' }, h('span', { class: 'ftype', style: 'background:#262b48;color:#d6d9f0', text: '>_' }), h('b', { text: 'Terminal' }),
        h('small', { text: s.output.tail.length ? (s.output.failed ? 'failed' : 'finished') : 'running' })),
      h('div', { class: 'ln cmd' }, h('em', { text: '$' }), h('span', { text: s.output.command })),
      s.output.tail.slice(-3).map(l => h('div', { class: `ln ${s.output.failed ? 'del' : 'out'}` }, h('em'), h('span', { text: l }))));
  } else if (s.diff) {
    const start = s.diff.start ?? null;
    const row = (cls, sign, text, n) => h('div', { class: `ln ${cls}` }, h('em', { text: n == null ? '' : String(n) }), h('i', { text: sign }), h('span', { text }));
    const removed = s.diff.removed.slice(0, 3), added = s.diff.added.slice(0, removed.length ? 3 : 5);
    card = h('div', { class: 'well code' },
      h('div', { class: 'code-head' }, ftype(s.diff.ext), h('b', { class: 'ellipsis', text: s.diff.file }),
        h('small', { text: last?.kind === 'edit' && last.status === 'running' ? 'editing now' : 'last edit' })),
      removed.map((l, i) => row('del', '−', l, start == null ? null : start + i)),
      added.map((l, i) => row('add', '+', l, start == null ? null : start + i)));
  } else {
    card = h('div', { class: 'well code' },
      h('div', { class: 'code-head' }, h('span', { class: 'ftype', style: 'background:#262b48;color:#d6d9f0' }, icon(last?.kind === 'search' ? 'globe' : 'file', 12)), h('b', { text: last?.verb || 'Thinking' })),
      h('div', { class: 'ln out' }, h('em'), h('span', { text: last?.target || 'Working out a plan' })));
  }
  const total = s.stepCount || s.steps.length;
  page.append(h('div', { class: 'work' },
    h('div', { class: 'work-left' },
      h('div', { class: 'where', text: s.project || 'Claude Code' }),
      h('div', { class: 'timer', 'data-tick': s.startedAt, text: fmt((Date.now() - s.startedAt) / 1000) }),
      h('div', { class: 'doing' }, DOING[last?.kind] || 'Thinking', h('span', { text: total ? `, step ${total}` : '' })),
      s.prompt ? h('div', { class: 'asked ellipsis', text: `“${s.prompt}”` }) : null),
    card,
    h('div', { class: 'ticks', title: 'One mark per step: short for reading, tall for edits, green for commands' },
      s.steps.map((st, i) => h('i', { class: `${st.kind} ${st.status === 'failed' ? 'failed' : ''} ${i === s.steps.length - 1 && st.status === 'running' ? 'now' : ''}` })),
      h('span', { class: 'legend', text: plural(s.files.length, 'file') + ' changed' }))));
}

// ======================= Music =======================
function renderMusic() {
  const m = S.media;
  const app = String(m.app || '').replace(/\.exe$/i, '').split(/[!.\\]/).filter(Boolean).pop() || '';
  const lines = S.prefs.lyrics !== false ? lyricLines() : null;
  const bar = h('div', { class: 'bar', onclick: e => { if (!m.duration) return; const r = e.currentTarget.getBoundingClientRect(); pulse.media(`seek ${Math.round(((e.clientX - r.left) / r.width) * m.duration)}`); } }, h('i', { id: 'm-fill', style: 'width:0' }));
  page.append(h('div', { class: 'music' },
    h('div', { class: 'art', style: artStyle(m.art) }, m.art ? null : icon('music', 34)),
    h('div', { style: 'min-width:0' },
      h('h2', { class: 'say ellipsis', text: m.active ? m.title || 'Unknown track' : 'Nothing is playing' }),
      h('div', { class: 'mist ellipsis', text: m.active ? m.artist || '' : 'Start something in Spotify, a browser or any player.' }),
      lines ? h('div', { class: 'lyr' }, h('div', { class: 'now ellipsis', id: 'lyr-now', text: '♪' }), h('div', { class: 'next ellipsis', id: 'lyr-next' })) : null,
      h('div', { class: 'prog' }, h('span', { id: 'm-pos', text: '0:00' }), bar, h('span', { text: fmt(m.duration || 0) })),
      h('div', { class: 'ctrls' },
        h('button', { class: 'skip', title: 'Previous', onclick: () => pulse.media('prev') }, icon('prev', 20)),
        h('button', { class: 'round', style: 'width:42px;height:42px', title: m.playing ? 'Pause' : 'Play', onclick: () => pulse.media('toggle') }, icon(m.active && m.playing ? 'pause' : 'play', 18)),
        h('button', { class: 'skip', title: 'Next', onclick: () => pulse.media('next') }, icon('next', 20)),
        app ? h('span', { class: 'src' }, icon('laptop', 13), app) : null))));
  tickMedia(); tickLyrics();
}
function tickMedia() {
  const m = S?.media; if (!m?.active || !m.duration) return;
  const pos = mediaPos();
  const f = $('#m-fill'), l = $('#m-pos');
  if (f) f.style.width = `${(pos / m.duration) * 100}%`;
  if (l) l.textContent = fmt(pos);
}

// ======================= Ask Pulse =======================
async function askPulse(prompt, withScreen = false) {
  if (chat.busy || !prompt.trim()) return;
  Object.assign(chat, { question: prompt, answer: '', error: '', busy: true });
  render();
  try { chat.answer = await pulse.ask(prompt, withScreen); chime('done'); } catch (e) { chat.error = e.message; }
  chat.busy = false; render();
}
function onClipboard(make) {
  const text = S.clipboard[0]?.text;
  if (!text) { Object.assign(chat, { question: '', answer: '', error: 'Copy some text first, then pick this again.' }); render(); return; }
  askPulse(make(text));
}
const QUICK = [
  ['screen', 'Look at my screen', 'Uses a screenshot', () => askPulse('What is on my screen? Point out anything that looks wrong or needs my attention.', true)],
  ['bulb', 'Explain it', 'Your last copy', () => onClipboard(t => `Explain this simply:\n\n${t}`)],
  ['check', 'Fix spelling', 'Your last copy', () => onClipboard(t => `Fix the spelling and grammar. Reply with only the corrected text:\n\n${t}`)],
  ['globe', 'Translate to English', 'Your last copy', () => onClipboard(t => `Translate this into English. Reply with only the translation:\n\n${t}`)],
  ['lines', 'Summarize', 'Your last copy', () => onClipboard(t => `Summarize in 3 short bullet points:\n\n${t}`)],
  ['note', 'Say it more clearly', 'Your last copy', () => onClipboard(t => `Rewrite this so it is clearer and shorter. Reply with only the rewrite:\n\n${t}`)],
];
function renderChat() {
  chatEyesEl.className = 'eyes big';
  const right = h('div', { class: 'ask-right' });
  const key = 'chat';
  const send = () => { const v = (drafts[key] || '').trim(); if (v) { drafts[key] = ''; askPulse(v); } };
  if (chat.busy) {
    right.append(h('h2', { class: 'say sm', text: 'Thinking it over' }), h('div', { class: 'asked-q ellipsis', text: chat.question }),
      h('div', {}, h('button', { class: 'btn', onclick: () => { pulse.cancelAsk(); chat.busy = false; render(); } }, icon('stop', 12), 'Stop')));
  } else {
    right.append(h('div', { class: 'askbar' }, draftInput(key, { placeholder: 'Ask anything', onkeydown: e => { if (e.key === 'Enter') send(); } }),
      h('button', { class: 'round', title: 'Ask', onclick: send }, icon('send', 15))));
    if (chat.answer || chat.error) {
      right.append(chat.question ? h('div', { class: 'asked-q ellipsis', text: chat.question }) : null,
        h('div', { class: 'well answer', style: chat.error ? 'color:var(--rose)' : '', text: chat.answer || chat.error }),
        h('div', { class: 'row' },
          chat.answer ? h('button', { class: 'btn', onclick: () => pulse.copy(chat.answer) }, icon('copy', 13), 'Copy answer') : null,
          h('button', { class: 'link', style: 'margin-left:auto', text: 'Back to quick actions', onclick: () => { Object.assign(chat, { answer: '', error: '', question: '' }); render(); } })));
    } else {
      right.append(h('div', { class: 'quick' }, QUICK.map(([ic, t, sub, fn]) => h('button', { class: 'qa', onclick: fn }, icon(ic, 16), h('span', {}, t, h('small', { text: sub }))))));
    }
  }
  page.append(h('div', { class: 'ask-page' },
    h('div', { class: 'well face' }, chatEyesEl, h('small', { text: 'Answers come from your own Claude Code.' })),
    right));
}

// ======================= Time: focus, timers, stopwatch =======================
let timeTab = 'focus';
function renderTime() {
  const tabs = h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Time tools' }, [['focus', 'Focus'], ['timers', 'Timers'], ['stopwatch', 'Stopwatch']].map(([id, label]) =>
    h('button', { class: timeTab === id ? 'on' : '', role: 'tab', 'aria-selected': String(timeTab === id), onclick: () => { timeTab = id; render(); } }, label,
      id === 'timers' && timers.some(t => !t.done && t.endsAt) ? h('i', { class: 'live-dot' }) : null,
      id === 'stopwatch' && sw.startedAt ? h('i', { class: 'live-dot' }) : null)));
  const body = h('div', { class: 'time-body' });
  page.append(h('div', { class: 'time' }, tabs, body));
  ({ focus: renderFocus, timers: renderTimers, stopwatch: renderStopwatch })[timeTab](body);
}

function renderTimers(box) {
  const nameKey = 'timer-name', minKey = 'timer-min';
  const start = mins => { const n = drafts[nameKey] || ''; drafts[nameKey] = ''; drafts[minKey] = ''; addTimer(n, mins); };
  const custom = () => { const v = parseFloat(drafts[minKey]); if (v > 0) start(v); else { lastError = 'Type how many minutes, like 12 or 2.5.'; render(); } };
  const list = h('div', { class: 'tlist' });
  if (!timers.length) list.append(h('p', { class: 'faint', text: 'No timers yet. Start one on the left; several can run at once.' }));
  for (const t of timers) {
    const left = timerLeft(t), running = Boolean(t.endsAt) && !t.done;
    list.append(h('div', { class: `trow ${t.done ? 'done' : ''}` },
      h('div', { class: 'grow' },
        h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', { class: 'ellipsis', text: t.name }),
          h('span', { class: 'num tleft', 'data-live': `timer:${t.id}`, text: t.done ? 'Done' : fmt(left) })),
        h('div', { class: 'track' }, h('i', { 'data-live-bar': t.id, style: `width:${t.done ? 100 : (1 - left / t.total) * 100}%` }))),
      t.done ? h('button', { class: 'btn', text: 'Dismiss', onclick: () => updateTimer(t.id, () => null) })
        : h('button', { class: 'iconbtn', title: running ? 'Pause' : 'Resume', onclick: () => updateTimer(t.id, x => (running ? { ...x, pausedLeft: timerLeft(x), endsAt: 0 } : { ...x, endsAt: Date.now() + timerLeft(x) * 1000, pausedLeft: undefined })) }, icon(running ? 'pause' : 'play', 14)),
      t.done ? null : h('button', { class: 'iconbtn', title: 'Remove timer', onclick: () => updateTimer(t.id, () => null) }, icon('x', 14))));
  }
  box.append(h('div', { class: 'timers' },
    h('div', { class: 'well tnew' },
      draftInput(nameKey, { placeholder: 'Name (optional)', 'aria-label': 'Timer name' }),
      h('div', { class: 'presets' }, [1, 5, 10, 15, 30].map(m => h('button', { class: 'len', text: `${m} min`, onclick: () => start(m) }))),
      h('div', { class: 'row' }, draftInput(minKey, { placeholder: 'Minutes', 'aria-label': 'Custom minutes', onkeydown: e => { if (e.key === 'Enter') custom(); } }),
        h('button', { class: 'btn primary', onclick: custom }, icon('play', 12), 'Start'))),
    list));
}

function renderStopwatch(box) {
  const running = Boolean(sw.startedAt);
  const laps = sw.laps.map((ms, i) => ({ n: i + 1, ms, split: ms - (sw.laps[i - 1] || 0) })).reverse();
  box.append(h('div', { class: 'stopwatch' },
    h('div', {},
      h('div', { class: 'sw-time', 'data-live': 'sw-full', text: fmtSw(swMs()) }),
      h('div', { class: 'row', style: 'margin-top:14px' },
        h('button', { class: 'btn primary', onclick: () => { sw = running ? { ...sw, acc: swMs(), startedAt: 0 } : { ...sw, startedAt: Date.now() }; saveSw(); render(); } }, icon(running ? 'pause' : 'play', 12), running ? 'Stop' : swMs() ? 'Resume' : 'Start'),
        h('button', { class: 'btn', disabled: !running || null, onclick: () => { sw = { ...sw, laps: [...sw.laps, swMs()] }; saveSw(); render(); } }, 'Lap'),
        h('button', { class: 'btn', onclick: () => { sw = { acc: 0, startedAt: 0, laps: [] }; saveSw(); render(); } }, icon('reset', 12), 'Reset'))),
    h('div', { class: 'laps' }, laps.length ? laps.map(l => h('div', { class: 'lap' }, h('span', { class: 'faint', text: `Lap ${l.n}` }), h('span', { class: 'num', text: fmtSw(l.split) }), h('span', { class: 'num faint', text: fmtSw(l.ms) })))
      : h('p', { class: 'faint', text: 'Laps show up here.' }))));
}

// ======================= Focus =======================
function renderFocus(box = page) {
  const left = focusLeft(), total = F.total || focusLen();
  const svg = svgEl('svg', { viewBox: '0 0 200 200' });
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2 - Math.PI / 2, long = i % 5 === 0;
    svg.append(svgEl('line', { x1: 100 + Math.cos(a) * (long ? 82 : 86), y1: 100 + Math.sin(a) * (long ? 82 : 86), x2: 100 + Math.cos(a) * 94, y2: 100 + Math.sin(a) * 94, 'data-i': i }));
  }
  const minutes = S.prefs.focusMinutes || 25;
  box.append(h('div', { class: 'focus' },
    h('div', { class: 'dial', id: 'dial' }, svg, h('div', { class: 't', 'data-focus': true, text: fmt(left) })),
    h('div', { style: 'display:grid;gap:14px;align-content:center' },
      h('h2', { class: 'say sm', text: F.endsAt ? 'Heads down.' : F.pausedLeft ? 'Paused.' : 'Ready when you are.' }),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Session length' }, [5, 15, 25, 50].map(n => h('button', { class: n === minutes ? 'on' : '', text: `${n} min`,
        onclick: () => { F = {}; store.set('focus', F); act(() => pulse.setPrefs({ focusMinutes: n })); } }))),
      h('div', { class: 'row' },
        F.endsAt ? h('button', { class: 'btn primary', onclick: focusPause }, icon('pause', 13), 'Pause')
          : h('button', { class: 'btn primary', onclick: focusStart }, icon('play', 13), F.pausedLeft ? 'Resume' : 'Start'),
        h('button', { class: 'btn', onclick: focusReset }, icon('reset', 13), 'Reset')))));
  litDial(left / total);
}
function litDial(frac) {
  const lit = Math.ceil(frac * 60);
  for (const l of document.querySelectorAll('#dial line')) l.classList.toggle('lit', Number(l.dataset.i) < lit);
}

// ======================= Tray =======================
function renderTray() {
  const ph = S.phone, files = S.prefs.shelf || [];
  if (ph.on) {
    page.append(h('div', { class: 'phone' },
      h('div', { class: 'qr' }, h('img', { src: ph.qr, alt: 'QR code for your phone' })),
      h('div', {},
        h('h2', { class: 'say sm', text: 'Scan with your phone' }),
        h('p', { class: 'mist', text: 'Your phone needs to be on the same Wi-Fi.' }),
        h('div', { class: 'checks' },
          h('div', { class: ph.connected ? 'ok' : '' }, h('i'), ph.connected ? 'Phone connected' : 'Waiting for your phone'),
          h('div', { class: ph.received ? 'ok' : '' }, h('i'), ph.received ? `${plural(ph.received, 'file')} received in Downloads\\Pulse` : 'Files on the shelf can be downloaded on the phone')),
        h('div', { class: 'row' }, h('span', { class: 'faint', style: 'font-size:12px', text: 'Local network only. Stops after an hour.' }),
          h('button', { class: 'btn', style: 'margin-left:auto', text: 'Stop sharing', onclick: () => act(() => pulse.phoneStop()) })))));
    return;
  }
  const list = h('div', { class: 'files' });
  if (!files.length) list.append(h('p', { class: 'faint', style: 'margin:8px 0', text: 'Nothing parked yet. Files you drop wait here until you drag them out.' }));
  for (const f of files) {
    list.append(h('div', { class: 'file', draggable: 'true', title: `${f.path}\nDrag out, double-click to open, right-click to show in folder`,
      ondragstart: e => { e.preventDefault(); pulse.shelfDrag(f.path); }, ondblclick: () => pulse.shelfOpen(f.path), oncontextmenu: () => pulse.shelfReveal(f.path) },
    ftype(f.name.split('.').pop().toLowerCase()), h('span', { class: 'ellipsis', text: f.name }),
    h('button', { class: 'x', title: 'Remove from tray', onclick: e => { e.stopPropagation(); act(() => pulse.shelfRemove(f.path)); } }, icon('x', 12))));
  }
  page.append(h('div', { class: 'tray' },
    h('div', { class: 'drop' }, icon('tray', 30), h('b', { text: 'Drop files here' }), h('span', { style: 'font-size:12px', text: 'Drag them out again whenever you need them.' }),
      h('button', { class: 'link', style: 'margin-top:6px', onclick: () => act(() => pulse.phoneStart()) }, 'Send to or from your phone')),
    h('div', { style: 'display:flex;flex-direction:column;min-height:0' }, list,
      files.length ? h('div', { class: 'row end', style: 'margin-top:auto;padding-top:6px' }, h('button', { class: 'link danger', text: 'Clear tray', onclick: () => act(() => pulse.shelfClear()) })) : null)));
}

// ======================= Clipboard =======================
function renderClipboard() {
  page.classList.add('scroll');
  if (!S.clipboard.length) { page.append(h('p', { class: 'empty', text: 'Text you copy shows up here. Click a line to copy it again.' })); return; }
  page.append(h('div', { class: 'clips' }, S.clipboard.map(c => {
    const copied = copiedAt.text === c.text && Date.now() - copiedAt.at < 1500;
    return h('button', { class: `clip ${copied ? 'copied' : ''}`, title: 'Copy again', onclick: () => { pulse.copy(c.text); copiedAt = { text: c.text, at: Date.now() }; render(); setTimeout(render, 1600); } },
      h('span', { class: 'ellipsis', text: c.text.replace(/\s+/g, ' ') }), h('time', { text: copied ? 'Copied' : ago(c.at) }));
  })), h('div', { style: 'padding:10px' }, h('button', { class: 'link danger', text: 'Clear history', onclick: () => act(() => pulse.clearClipboard()) })));
}

// ======================= Note =======================
// The note text lives here; state pushes from main may briefly carry an older copy while a save is pending.
let noteTimer, noteText = null;
function saveNote(text) { noteText = text; clearTimeout(noteTimer); noteTimer = setTimeout(() => pulse.setPrefs({ note: text }), 300); }
// One editor element for the whole session. While you type, render() leaves the Note page alone
// (see render), so background updates (clipboard, music, Claude) can't steal the cursor.
const noteTa = h('textarea', { id: 'note-edit', placeholder: 'Write anything. Start a line with [ ] to make it a checkbox.', 'aria-label': 'Note' });
noteTa.addEventListener('input', () => saveNote(noteTa.value));
// Deferred: removing the focused editor (switching page) fires blur in the middle of a render.
noteTa.addEventListener('blur', () => setTimeout(() => {
  if (!document.hasFocus() || !noteEditing || current !== 'plan') return;
  noteEditing = false; render();
}, 0));
function renderNote(box) {
  noteText ??= S.prefs.note || '';
  const text = noteText;
  if (noteEditing) {
    noteTa.value = text;
    box.append(noteTa);
    requestAnimationFrame(() => { noteTa.focus(); noteTa.setSelectionRange(noteTa.value.length, noteTa.value.length); });
    return;
  }
  const view = h('div', { class: 'pad', onclick: () => { noteEditing = true; render(); } });
  if (!text.trim()) view.append(h('div', { class: 'note-ph', text: 'Click to write. Start a line with [ ] to make it a checkbox.' }));
  else text.split('\n').forEach((line, i) => {
    const m = line.match(/^\s*\[( |x|X)\]\s?(.*)$/);
    if (!m) { view.append(h('div', { class: 'note-line' }, h('span', { text: line || ' ' }))); return; }
    const done = m[1] !== ' ';
    view.append(h('div', { class: `note-line ${done ? 'done' : ''}` },
      h('span', { class: `circle ${done ? 'done' : ''}`, role: 'checkbox', 'aria-checked': String(done), onclick: e => {
        e.stopPropagation();
        const lines = text.split('\n'); lines[i] = line.replace(/\[( |x|X)\]/, done ? '[ ]' : '[x]');
        saveNote(lines.join('\n')); render();
      } }, done ? icon('check', 11) : null), h('span', { text: m[2] })));
  });
  box.append(view);
}

// ======================= Plan: note on the left, reminders (and a calendar) on the right =======================
let calOpen = false, calMonth = new Date(), calDay = null; // calDay: a selected day (timestamp of its midnight) or null
const midnight = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
function renderPlan() {
  const left = h('div', { class: 'plan-note' });
  renderNote(left);
  const right = h('div', { class: 'plan-side' });
  calOpen ? renderCalendar(right) : renderReminders(right);
  page.append(h('div', { class: 'plan-page' }, left, right));
}

function renderReminders(box) {
  const textKey = 'rem-text', whenKey = 'rem-when';
  const base = calDay && calDay !== midnight(Date.now()) ? new Date(calDay) : new Date();
  const preview = h('span', { class: 'when-preview' });
  const showPreview = () => {
    const at = parseWhen(drafts[whenKey], base);
    preview.textContent = drafts[whenKey] ? (at ? whenLabel(at) : 'Try “in 20 min”, “5pm” or “tomorrow 9am”') : '';
    preview.classList.toggle('bad', Boolean(drafts[whenKey]) && !at);
  };
  const add = () => {
    const text = (drafts[textKey] || '').trim(), at = parseWhen(drafts[whenKey], base);
    if (!text) { lastError = 'Write what to remind you about.'; render(); return; }
    if (!at) { lastError = 'Pulse didn’t understand that time. Try “in 20 min”, “5pm” or “tomorrow 9am”.'; render(); return; }
    drafts[textKey] = ''; drafts[whenKey] = '';
    saveReminders([...reminders(), { id: crypto.randomUUID(), text: text.slice(0, 200), at, done: false, fired: false }]);
  };
  const whenInput = draftInput(whenKey, { placeholder: calDay ? 'What time? e.g. 5pm' : 'When? e.g. in 20 min', 'aria-label': 'When', onkeydown: e => { if (e.key === 'Enter') add(); } });
  whenInput.addEventListener('input', showPreview);
  const shown = reminders().filter(r => (calDay ? midnight(r.at) === calDay : !r.done || Date.now() - r.at < 12 * 3600_000)).sort((a, b) => (a.done - b.done) || a.at - b.at);
  box.append(
    h('div', { class: 'row side-head' },
      h('b', { class: 'grow', text: calDay ? new Date(calDay).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }) : 'Reminders' }),
      calDay ? h('button', { class: 'link', text: 'All', onclick: () => { calDay = null; render(); } }) : null,
      h('button', { class: 'iconbtn', title: 'Open calendar', 'aria-label': 'Open calendar', onclick: () => { calOpen = true; calMonth = new Date(calDay || Date.now()); render(); } }, icon('calendar', 16))),
    h('div', { class: 'rem-form' }, draftInput(textKey, { placeholder: 'Remind me to…', 'aria-label': 'Reminder', onkeydown: e => { if (e.key === 'Enter') whenInput.focus(); } }),
      h('div', { class: 'row' }, whenInput, h('button', { class: 'round', title: 'Add reminder', onclick: add }, icon('plus', 15))), preview),
    h('div', { class: 'rems' }, shown.length ? shown.map(r => h('div', { class: `rem ${r.done ? 'done' : r.fired ? 'due' : ''}` },
      h('span', { class: `circle ${r.done ? 'done' : ''}`, role: 'checkbox', 'aria-checked': String(r.done), title: r.done ? 'Mark as not done' : 'Mark as done',
        onclick: () => saveReminders(reminders().map(x => (x.id === r.id ? { ...x, done: !x.done } : x))) }, r.done ? icon('check', 11) : null),
      h('span', { class: 'grow ellipsis', text: r.text }),
      h('time', { text: r.done ? 'done' : whenLabel(r.at) }),
      h('button', { class: 'x', title: 'Delete reminder', onclick: () => saveReminders(reminders().filter(x => x.id !== r.id)) }, icon('x', 12))))
      : h('p', { class: 'faint', text: calDay ? 'Nothing on this day yet.' : 'No reminders. Add one above.' })));
  showPreview();
}

function renderCalendar(box) {
  const y = calMonth.getFullYear(), mo = calMonth.getMonth();
  const first = new Date(y, mo, 1), startDay = (first.getDay() + 6) % 7; // weeks start on Monday
  const days = new Date(y, mo + 1, 0).getDate();
  const busy = new Set(reminders().filter(r => !r.done).map(r => midnight(r.at)));
  const today = midnight(Date.now());
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(h('span'));
  for (let d = 1; d <= days; d++) {
    const t = new Date(y, mo, d).getTime();
    cells.push(h('button', { class: `day ${t === today ? 'today' : ''} ${t === calDay ? 'sel' : ''}`, 'aria-label': new Date(t).toDateString(),
      onclick: () => { calDay = t; calOpen = false; render(); } }, String(d), busy.has(t) ? h('i') : null));
  }
  box.append(
    h('div', { class: 'row side-head' },
      h('button', { class: 'iconbtn', title: 'Previous month', onclick: () => { calMonth = new Date(y, mo - 1, 1); render(); } }, icon('left', 15)),
      h('b', { class: 'grow', style: 'text-align:center', text: first.toLocaleDateString([], { month: 'long', year: 'numeric' }) }),
      h('button', { class: 'iconbtn', title: 'Next month', onclick: () => { calMonth = new Date(y, mo + 1, 1); render(); } }, icon('right', 15)),
      h('button', { class: 'iconbtn', title: 'Back to reminders', onclick: () => { calOpen = false; render(); } }, icon('x', 15))),
    h('div', { class: 'cal' }, ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => h('span', { class: 'dow', text: d })), cells));
}

// ======================= Launcher =======================
let launcherEdit = false, addingUrl = false, pinIconMap = {}, pinIconKey = '';
const hue = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
function renderLauncher() {
  const pins = S.prefs.pins || [];
  const key = pins.map(p => p.id).join();
  if (key !== pinIconKey) { pinIconKey = key; pulse.pinIcons().then(m => { pinIconMap = m || {}; render(); }).catch(() => {}); }
  const move = (i, d) => { const l = [...pins]; const [p] = l.splice(i, 1); l.splice(Math.max(0, Math.min(l.length, i + d)), 0, p); act(() => pulse.pinSet(l)); };
  const tools = h('div', { class: 'row launch-tools' },
    h('button', { class: 'btn', onclick: () => act(() => pulse.pinPick('file')) }, icon('plus', 13), 'App or file'),
    h('button', { class: 'btn', onclick: () => act(() => pulse.pinPick('folder')) }, icon('folder', 13), 'Folder'),
    h('button', { class: 'btn', onclick: () => { addingUrl = !addingUrl; render(); } }, icon('link', 13), 'Website'),
    pins.length ? h('button', { class: `btn ${launcherEdit ? 'primary' : ''}`, style: 'margin-left:auto', onclick: () => { launcherEdit = !launcherEdit; render(); } }, icon('pencil', 13), launcherEdit ? 'Done' : 'Edit') : null);
  page.append(tools);
  if (addingUrl) {
    const add = () => act(async () => { await pulse.pinAddUrl(drafts['pin-name'], drafts['pin-url'] || ''); drafts['pin-name'] = ''; drafts['pin-url'] = ''; addingUrl = false; });
    page.append(h('div', { class: 'row url-form' }, draftInput('pin-name', { placeholder: 'Name', style: 'width:150px' }),
      draftInput('pin-url', { placeholder: 'Address, e.g. github.com', onkeydown: e => { if (e.key === 'Enter') add(); } }),
      h('button', { class: 'btn primary', text: 'Pin', onclick: add })));
  }
  if (!pins.length) {
    page.append(h('div', { class: 'drop', style: 'height:150px;margin-top:10px' }, icon('grid', 26), h('b', { text: 'Pin what you open all the time' }),
      h('span', { style: 'font-size:12px', text: 'Use the buttons above, or drop apps, files and folders here.' })));
    return;
  }
  page.classList.add('scroll');
  page.append(h('div', { class: `pins ${launcherEdit ? 'editing' : ''}` }, pins.map((p, i) => {
    const img = pinIconMap[p.id];
    const face = p.type === 'url' || !img
      ? h('span', { class: 'pin-letter', style: `--h:${hue(p.name)}` }, p.type === 'folder' && !img ? icon('folder', 20) : p.name.slice(0, 1).toUpperCase())
      : h('img', { src: img, alt: '' });
    if (!launcherEdit) return h('button', { class: 'pin', title: p.type === 'url' ? p.target : p.target, onclick: () => act(() => pulse.pinOpen(p.id)) }, face, h('span', { class: 'ellipsis', text: p.name }));
    const name = h('input', { type: 'text', value: p.name, 'aria-label': `Rename ${p.name}` });
    name.addEventListener('change', () => act(() => pulse.pinSet(pins.map(x => (x.id === p.id ? { ...x, name: name.value.trim() || x.name } : x)))));
    return h('div', { class: 'pin' }, face, name,
      h('div', { class: 'pin-tools' },
        h('button', { title: 'Move left', disabled: i === 0 || null, onclick: () => move(i, -1) }, icon('left', 12)),
        h('button', { title: 'Remove', onclick: () => act(() => pulse.pinSet(pins.filter(x => x.id !== p.id))) }, icon('x', 12)),
        h('button', { title: 'Move right', disabled: i === pins.length - 1 || null, onclick: () => move(i, 1) }, icon('right', 12))));
  })));
}

// ======================= Settings =======================
function renderSettings() {
  page.classList.add('scroll');
  const p = S.prefs;
  const toggle = (on, fn, label) => h('button', { class: `toggle ${on ? 'on' : ''}`, role: 'switch', 'aria-checked': String(Boolean(on)), 'aria-label': label, onclick: fn });
  const row = (title, sub, ctl) => h('div', { class: 'set' }, h('div', { class: 'grow' }, h('b', { text: title }), sub ? h('span', { text: sub }) : null), ctl);
  const pref = (key, title, sub) => row(title, sub, toggle(p[key] !== false, () => act(() => pulse.setPrefs({ [key]: p[key] === false })), title));
  page.append(h('div', { class: 'settings' },
    colourSettings(),
    row('Claude Code', S.claude.connected ? (S.claude.statusLine === 'custom' ? 'Connected. Your own status line is kept, so usage limits are not shown.' : 'Connected through hooks and a status line in settings.json.') : 'Not connected.',
      S.claude.connected ? h('button', { class: 'btn no', text: 'Disconnect', onclick: () => act(() => pulse.disconnect()) }) : h('button', { class: 'btn primary', text: 'Connect', onclick: () => act(() => pulse.connect()) })),
    row('Start with Windows', null, toggle(S.startWithWindows, () => act(() => pulse.setLogin(!S.startWithWindows)), 'Start with Windows')),
    pref('autoOpen', 'Open when Claude needs you', 'Unfolds for permission requests and questions.'),
    pref('sound', 'Sounds', 'A soft chime when Claude finishes or needs you.'),
    pref('lyrics', 'Lyrics', 'Shows synced lyrics while music plays. Songs are looked up on lrclib.net.'),
    pref('notifications', 'Windows notifications', 'Only while Pulse is not in focus.'),
    pref('watchDownloads', 'Watch Downloads', 'Finished downloads go to the Tray and flash in the island.'),
    row('Shortcut', 'Ctrl+Alt+P unfolds Pulse and Esc folds it in.', null)));
}

// Colours: six ready-made pairs, or pick your own main and secondary colour.
function colourSettings() {
  const t = { main: S.prefs.theme?.main || DEFAULT_THEME.main, second: S.prefs.theme?.second || DEFAULT_THEME.second };
  const save = theme => act(() => pulse.setPrefs({ theme }));
  const presets = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Colour presets' }, THEMES.map(p => {
    const on = p.main.toLowerCase() === t.main.toLowerCase() && p.second.toLowerCase() === t.second.toLowerCase();
    return h('button', { class: `swatch ${on ? 'on' : ''}`, role: 'radio', 'aria-checked': String(on), title: p.name, 'aria-label': p.name,
      style: `--a:${p.main};--b:${p.second}`, onclick: () => { applyTheme(p); save({ main: p.main, second: p.second }); } });
  }));
  const picker = (key, label, hint) => {
    const input = h('input', { type: 'color', value: t[key], 'aria-label': `${label} colour` });
    const hex = h('span', { class: 'hex num', text: t[key].toUpperCase() });
    input.addEventListener('input', () => { themePreview = true; hex.textContent = input.value.toUpperCase(); applyTheme({ ...t, [key]: input.value }); });
    input.addEventListener('change', () => { themePreview = false; save({ ...t, [key]: input.value }); });
    return h('label', { class: 'pick' }, h('span', { class: 'chip-colour' }, input), h('span', {}, h('b', { text: label }), h('small', { text: hint })), hex);
  };
  return h('div', { class: 'set colours' },
    h('div', { class: 'grow' },
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', { text: 'Colours' }),
        (t.main !== DEFAULT_THEME.main || t.second !== DEFAULT_THEME.second) ? h('button', { class: 'link', text: 'Reset', onclick: () => { applyTheme(DEFAULT_THEME); save(null); } }) : null),
      h('span', { text: 'Pick a pair, or choose your own main and secondary colour.' }),
      presets,
      h('div', { class: 'picks' },
        picker('main', 'Main', 'Buttons, the pulse line, the eyes'),
        picker('second', 'Secondary', 'The body of the island'))));
}

// ======================= render =======================
const PAGE_H = { settings: 470, plan: 298, time: 298, launcher: 298 };
function render() {
  if (!S) return;
  renderPill();
  updateEyes();
  if (!open) { shape(); return; }
  island.classList.remove('springy');
  renderHeader();
  renderRail();
  renderMenu();
  if (current !== 'plan') noteEditing = false;
  if (current === 'plan' && noteEditing && page.contains(noteTa)) { renderAttention(); return; } // never interrupt typing
  preserveFocus(() => {
    renderAttention();
    page.replaceChildren(); page.className = '';
    const hasAsk = $('#attention').childElementCount > 0;
    if (!hasAsk || current !== 'claude') ({ home: renderHome, claude: renderClaude, music: renderMusic, chat: renderChat, time: renderTime, plan: renderPlan, launcher: renderLauncher, tray: renderTray, clipboard: renderClipboard, settings: renderSettings })[current]();
    const att = $('#attention').offsetHeight;
    const body = hasAsk && current === 'claude' ? 6 : (PAGE_H[current] || 278);
    openH = Math.min(540, Math.max(350, 52 + att + body));
  });
  shape();
  updateEyes();
}

// ---------- ticking bits (no full re-render) ----------
function tickClock() { const el = $('#clock'); if (el) el.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
function tickUsage() {
  const u = S?.hub.usage.fiveHour, el = $('#usage');
  el.hidden = !u; if (!u) return;
  const ms = resetMs(u.resetsAt);
  el.className = u.used >= 80 ? 'high' : u.used >= 50 ? 'mid' : '';
  el.title = `5-hour limit: ${u.used}% used${ms ? `, resets in ${fmt(ms / 1000)}` : ''}`;
  el.replaceChildren(h('b', { text: `${u.used}%` }), ms ? ` ${fmt(ms / 1000)}` : '');
}
function tickFocus() {
  if (!F.endsAt) return;
  const left = focusLeft();
  for (const el of document.querySelectorAll('[data-focus], #pill-focus')) el.textContent = fmt(left);
  if ($('#dial')) litDial(left / (F.total || focusLen()));
  if (left <= 0) { F = {}; store.set('focus', F); chime('focus'); new Notification('Focus session done', { body: 'Nice work. Take a short break.', silent: true }); render(); }
}
setInterval(() => {
  for (const el of document.querySelectorAll('[data-tick]')) if (el.dataset.tick) el.textContent = fmt((Date.now() - Number(el.dataset.tick)) / 1000);
  if (open) { tickClock(); tickUsage(); tickMedia(); }
  tickFocus();
  if (S && !open && (pillMode === 'lyrics') !== Boolean(showLyricsInPill())) renderPill();
  if (eyeMood() !== pillEyes.mood) updateEyes();
}, 1000);
setInterval(() => { if (S?.media.playing) tickLyrics(); }, 200); // lyric lines change faster than once a second

// Timers, stopwatch and anything marked data-live update in place, without re-rendering the page.
setInterval(() => {
  let finished = false;
  for (const t of timers) {
    if (t.done || !t.endsAt || t.endsAt > Date.now()) continue;
    t.done = true; t.endsAt = 0; finished = true;
    chime('focus');
    try { new Notification('Timer done', { body: t.name, silent: true }); } catch {}
  }
  if (finished) { saveTimers(); render(); return; }
  for (const el of document.querySelectorAll('[data-live]')) {
    const k = el.dataset.live;
    if (k === 'sw') el.textContent = fmt(swMs() / 1000);
    else if (k === 'sw-full') el.textContent = fmtSw(swMs());
    else if (k === 'focus') el.textContent = fmt(focusLeft());
    else if (k.startsWith('timer:')) { const t = timers.find(x => x.id === k.slice(6)); if (t) el.textContent = t.done ? 'Done' : fmt(timerLeft(t)); }
  }
  for (const el of document.querySelectorAll('[data-live-bar]')) { const t = timers.find(x => x.id === el.dataset.liveBar); if (t) el.style.width = `${t.done ? 100 : (1 - timerLeft(t) / t.total) * 100}%`; }
}, 100);
// Reminders coming up within 10 minutes show in the capsule; re-check the capsule each half minute.
setInterval(() => { if (S && !open) renderPill(); }, 30_000);

pulse.onState(st => { S = st; if (!themePreview) applyTheme(st.prefs.theme); render(); });
pulse.state().then(st => { S = st; applyTheme(st.prefs.theme); render(); });
shape();
