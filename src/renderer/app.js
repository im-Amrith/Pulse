'use strict';
/* global pulse, Eyes, icon */
// Pulse island renderer. Data from Claude Code is always rendered with textContent, never innerHTML.

const $ = sel => document.querySelector(sel);
const island = $('#island'), page = $('#page');
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

// ---------- pages ----------
const PAGES = [
  { id: 'home', label: 'Home', icon: 'home', c: '#e6e6ea', title: ['', ''], h: 200 },
  { id: 'claude', label: 'Claude', icon: 'spark', c: '#ff8c5a', title: ['Claude', 'Code'], h: 210, hWork: 222 },
  { id: 'music', label: 'Music', icon: 'music', c: '#ff3b5c', title: ['Music', 'Player'], h: 170, hLyrics: 214 },
  { id: 'chat', label: 'Ask', icon: 'chat', c: '#34d07a', title: ['Ask', 'Pulse'], h: 250 },
  { id: 'focus', label: 'Focus', icon: 'timer', c: '#b56bff', title: ['Focus', 'Timer'], h: 200 },
  { id: 'tray', label: 'Tray', icon: 'tray', c: '#ffc533', title: ['File', 'Tray'], h: 190 },
  { id: 'clipboard', label: 'Clipboard', icon: 'copy', c: '#3fb6ff', title: ['Clip', 'board'], h: 200 },
  { id: 'note', label: 'Note', icon: 'note', c: '#ffd23f', title: ['Note', 'pad'], h: 200 },
  { id: 'settings', label: 'Settings', icon: 'gear', c: '#b8b8c0', title: ['Pulse', 'Settings'], h: 300, hidden: true },
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
const fmt = s => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`; };
const ago = t => { const s = (Date.now() - t) / 1000; return s < 60 ? 'now' : s < 3600 ? `${Math.floor(s / 60)} min` : s < 86400 ? new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' }); };
const resetMs = r => { if (!r) return 0; const t = typeof r === 'number' ? (r < 1e12 ? r * 1000 : r) : Date.parse(r); return Math.max(0, t - Date.now()); };
const isToday = t => new Date(t).toDateString() === new Date().toDateString();

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

// ---------- eyes ----------
const pillEyes = new Eyes($('#pill-eyes'), { reach: 3 });
const headEyes = new Eyes($('#head-eyes'), { reach: 1.5 });
const chatEyesEl = h('div', { 'data-pokeable': true });
const chatEyes = new Eyes(chatEyesEl, { reach: 9 }); // reused across renders so blinking and gaze stay smooth
pulse.onCursor(c => Eyes.follow(c));
let lastActivity = Date.now();

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
}
document.addEventListener('mousemove', () => { lastActivity = Date.now(); });

// ---------- open / close ----------
// focus=true only for things you did yourself, so Pulse never steals the keyboard from your app.
function setOpen(v, { focus = false, to } = {}) {
  if (to) current = to;
  if (v && focus) pulse.focus();
  if (open === v) { render(); return; }
  open = v; menuOpen = false;
  island.classList.toggle('open', v);
  island.classList.toggle('pill', !v);
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

// Hover to unfold, move away to fold. A short delay on both sides so passing the mouse over doesn't flicker it,
// and it stays open while you're typing, using the menu, dragging files, or Claude is waiting for an answer.
let hovering = false, hoverTimer = null;
const HOVER_OPEN_MS = 160, HOVER_CLOSE_MS = 420;
function keepOpen() {
  const typing = document.hasFocus() && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) && island.contains(document.activeElement);
  return typing || menuOpen || dragDepth > 0 || chat.busy || S?.hub.sessions.some(s => s.holding);
}
function onHover(over) {
  clearTimeout(hoverTimer);
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
document.addEventListener('dragenter', e => { if (!e.dataTransfer?.types.includes('Files')) return; e.preventDefault(); dragDepth++; island.classList.add('dropping'); if (!open) setOpen(true, { to: 'tray' }); else if (current !== 'tray') { current = 'tray'; render(); } });
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; island.classList.remove('dropping'); } });
document.addEventListener('drop', e => {
  e.preventDefault(); dragDepth = 0; island.classList.remove('dropping');
  const paths = Array.from(e.dataTransfer.files, f => pulse.pathFor(f)).filter(Boolean);
  if (paths.length) act(() => pulse.shelfAdd(paths));
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
function tickLyrics() {
  const lines = lyricLines(); if (!lines) return;
  const { now, next, i } = lyricAt(lines, mediaPos());
  const pl = $('#pill-lyric');
  if (pl && i !== lastLyric) {
    lastLyric = i;
    const old = pl.firstChild;
    if (old) { old.classList.add('out'); setTimeout(() => old.remove(), 250); }
    pl.append(h('span', { text: now || '♪' }));
  }
  const ln = $('#lyr-now'), lx = $('#lyr-next');
  if (ln && ln.textContent !== (now || '♪')) ln.textContent = now || '♪';
  if (lx && lx.textContent !== next) lx.textContent = next;
}

// ======================= collapsed pill =======================
function renderPill() {
  const { hub, media } = S;
  const top = hub.sessions[0];
  island.dataset.mood = hub.mood;
  const left = $('#pill-left'), right = $('#pill-right');
  left.replaceChildren(); right.replaceChildren();
  let wide = true, lyrics = false;
  if (top && top.state === 'working') {
    const verb = top.steps.at(-1)?.status === 'running' ? top.steps.at(-1).verb : 'Thinking';
    left.append(h('span', { class: 'spin' }, icon('spark', 16)), h('span', { class: 'pill-label', text: verb }));
    right.append(h('span', { 'data-tick': top.startedAt, text: fmt((Date.now() - top.startedAt) / 1000) }));
  } else if (top && top.state === 'asking') {
    left.append(h('span', { style: 'color:var(--asking)', text: '●' }));
    right.append(h('span', { style: 'color:var(--asking)', text: 'Needs you' }));
  } else if (top && top.state === 'finished') {
    left.append(h('span', { style: 'color:var(--finished)' }, icon('check', 15)));
    right.append(h('span', { style: 'color:var(--finished)', text: 'Done' }));
  } else if (top && top.state === 'failed') {
    left.append(h('span', { style: 'color:var(--failed)' }, icon('x', 15)));
    right.append(h('span', { style: 'color:var(--failed)', text: 'Failed' }));
  } else if (F.endsAt) {
    left.append(h('span', { style: 'color:#b56bff' }, icon('timer', 15)));
    right.append(h('span', { id: 'pill-focus', style: 'color:#c99bff', text: fmt(focusLeft()) }));
  } else if (media.active && media.playing) {
    left.append(media.art ? h('span', { class: 'pill-art', style: `background-image:url("${media.art.replace(/"/g, '')}")` })
      : h('span', { class: 'pill-art', style: 'display:grid;place-items:center;color:#ff3b5c' }, icon('music', 13)));
    right.append(h('span', { class: 'eq on' }, h('i'), h('i'), h('i')));
    lyrics = Boolean(showLyricsInPill());
  } else wide = false;
  island.classList.toggle('wide', wide && !lyrics);
  island.classList.toggle('lyrics', lyrics);
  if (!lyrics) { $('#pill-lyric').replaceChildren(); lastLyric = -2; } else tickLyrics();
}

// ======================= header / nav / menu =======================
function renderHeader() {
  const p = pageOf(current);
  document.documentElement.style.setProperty('--accent', p.c);
  const title = $('#title'); title.replaceChildren();
  if (current === 'home') {
    const w = S.system.wifi;
    if (w !== 'none') title.append(h('span', { title: w === 'on' ? `${S.system.ssid} · ${S.system.signal ?? '?'}%` : 'Wi-Fi off' }, icon(w === 'on' ? 'wifi' : 'wifiOff', 17)));
    title.append(h('span', { class: 'muted', style: 'font-weight:600', text: S.claude.connected ? '' : 'Not connected' }));
  } else {
    // "Claude Code" keeps its space; "Clipboard" / "Notepad" are one word with a coloured half.
    const joined = /^[a-z]/.test(p.title[1]);
    title.append(h('span', {}, p.title[0], joined ? '' : ' ', h('span', { class: 'hl', text: p.title[1] })));
  }
  tickClock();
  const u = S.hub.usage.fiveHour, pill = $('#usage');
  pill.hidden = !u;
  if (u) { pill.className = u.used >= 80 ? 'high' : u.used >= 50 ? 'mid' : ''; pill.title = '5-hour limit used · time until it resets'; tickUsage(); }
  const mb = $('#menu-btn'); mb.replaceChildren(icon('dots', 18));
  if (!S.claude.connected) mb.append(h('i', { class: 'dot', style: 'background:var(--asking)' }));
}

function renderNav() {
  const nav = $('#nav'); nav.replaceChildren();
  for (const p of PAGES.filter(x => !x.hidden)) {
    nav.append(h('button', { class: `navbtn ${p.id === current ? 'active' : ''}`, style: `--c:${p.c}`, title: p.label, onclick: () => { current = p.id; menuOpen = false; render(); } },
      icon(p.icon, 17), h('span', { text: p.label })));
  }
  const v = S.volume;
  nav.append(h('button', { class: 'iconbtn vol', title: v.level == null ? 'Volume' : `Volume ${v.level}%${v.muted ? ' (muted)' : ''}`, onclick: () => pulse.media(`mute ${v.muted ? 0 : 1}`) }, icon(v.muted ? 'mute' : 'volume', 17)));
}

function renderMenu() {
  const m = $('#menu');
  m.hidden = !menuOpen;
  if (!menuOpen) return;
  m.replaceChildren();
  const v = S.volume;
  if (v.level != null) {
    const range = h('input', { type: 'range', min: 0, max: 100, value: v.level, style: `--p:${v.level}%` });
    range.addEventListener('input', () => { range.style.setProperty('--p', `${range.value}%`); pulse.media(`vol ${range.value}`); });
    m.append(h('div', { class: 'mitem', style: 'cursor:default' }, icon(v.muted ? 'mute' : 'volume', 18), range), h('div', { class: 'msep' }));
  }
  const item = (ic, label, fn, cls = '') => h('button', { class: `mitem ${cls}`, onclick: () => { menuOpen = false; fn(); } }, icon(ic, 18), label);
  m.append(
    !S.claude.connected ? item('spark', 'Connect Claude Code', () => act(() => pulse.connect())) : null,
    item('gear', 'Settings', () => { current = 'settings'; render(); }),
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
  const head = h('div', { class: 'ask-head' }, h('span', { class: 'tag', text: s.project || 'Claude' }),
    h('span', { text: p.kind === 'plan' ? 'Plan ready for review' : p.kind === 'ask' ? 'Claude has a question' : `Allow ${p.tool}?` }));
  if (p.kind === 'tool') {
    return h('div', { class: 'ask' }, head, h('pre', { class: 'mono', text: p.detail }),
      h('div', { class: 'row end' },
        h('button', { class: 'btn no', text: 'Deny', onclick: () => act(() => pulse.deny(s.id)) }),
        h('button', { class: 'btn go', text: 'Allow', onclick: () => act(() => pulse.allow(s.id)) })));
  }
  if (p.kind === 'plan') {
    const key = `plan:${s.id}`;
    return h('div', { class: 'ask' }, head, h('div', { class: 'plan', text: p.plan }),
      draftInput(key, { placeholder: 'Optional: what should change?' }),
      h('div', { class: 'row end' },
        h('button', { class: 'btn', text: 'Send feedback', onclick: () => act(async () => { await pulse.plan(s.id, false, drafts[key]); delete drafts[key]; }) }),
        h('button', { class: 'btn go', text: 'Approve plan', onclick: () => act(() => pulse.plan(s.id, true)) })));
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
    h('button', { class: 'btn go', text: 'Send answer', onclick: submit })));
}

// ======================= Home =======================
function ringSvg(pct, color) {
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'r'); svg.setAttribute('viewBox', '0 0 52 52');
  const mk = (stroke, dash) => { const c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', 26); c.setAttribute('cy', 26); c.setAttribute('r', 24); c.setAttribute('stroke', stroke); if (dash != null) { c.setAttribute('stroke-dasharray', '150.8'); c.setAttribute('stroke-dashoffset', String(150.8 * (1 - dash))); c.setAttribute('stroke-linecap', 'round'); } return c; };
  svg.append(mk('rgba(255,255,255,.15)'), mk(color, pct));
  return svg;
}
function renderHome() {
  const jobs = S.history.filter(e => isToday(e.at) && e.result === 'done').length;
  const top = S.hub.sessions[0], live = top && top.state !== 'idle';
  const used = S.hub.usage.fiveHour?.used;
  const claudeFab = h('span', { class: 'fab ring-btn' }, icon('spark', 20), used != null ? ringSvg(used / 100, used >= 80 ? '#ff6f86' : '#fff') : null);
  const m = S.media;
  const left = focusLeft();
  page.append(h('div', { class: 'cards' },
    h('button', { class: 'hcard c-claude', onclick: () => { current = 'claude'; render(); } },
      h('span', { class: 'lbl', text: 'Claude Code' }), claudeFab,
      h('div', { class: 'big', text: live ? { working: 'Working', asking: 'Needs you', finished: 'Done', failed: 'Failed' }[top.state] : String(jobs) }),
      h('div', { class: 'sub', text: live ? (top.project || top.label) : !S.claude.connected ? 'not connected yet' : jobs === 1 ? 'job today' : 'jobs today' })),
    h('button', { class: 'hcard c-music', onclick: () => { current = 'music'; render(); } },
      h('span', { class: 'lbl', text: 'Music' }),
      h('span', { class: 'fab', onclick: e => { if (m.active) { e.stopPropagation(); pulse.media('toggle'); } } }, icon(m.active ? (m.playing ? 'pause' : 'play') : 'music', 18)),
      h('div', { class: 'big', text: m.active ? m.title || 'Unknown' : 'Quiet' }),
      h('div', { class: 'sub', text: m.active ? m.artist || '' : 'Nothing playing' })),
    h('button', { class: 'hcard c-focus', onclick: () => { current = 'focus'; render(); } },
      h('span', { class: 'lbl', text: 'Focus' }),
      h('span', { class: 'fab white', onclick: e => { e.stopPropagation(); F.endsAt ? focusPause() : focusStart(); } }, icon(F.endsAt ? 'pause' : 'play', 20)),
      h('div', { class: 'big', 'data-focus': true, text: fmt(left) }),
      h('div', { class: 'sub', text: F.endsAt ? 'Stay with it' : F.pausedLeft ? 'Paused' : 'Ready to start' }))));
}

// ======================= Claude =======================
const ICON_STEP = { running: '●', done: '✓', failed: '✕' };
function renderClaude() {
  if (!S.claude.connected && !S.hub.sessions.length) {
    page.append(h('div', { class: 'claude' },
      h('div', { class: 'claude-left' },
        h('div', { class: 'brand' }, h('span', { class: 'logo' }, icon('spark', 15)), 'Claude Code'),
        h('div', { class: 'live-label', style: 'margin-top:18px', text: 'Connect to follow your sessions' }),
        h('p', { class: 'muted', text: 'Pulse adds local hooks to ~/.claude/settings.json (a backup is kept). Nothing leaves this PC.' }),
        h('div', {}, h('button', { class: 'btn acc', text: 'Connect Claude Code', onclick: () => act(() => pulse.connect()) }))),
      recentBox()));
    return;
  }
  const top = S.hub.sessions.find(s => s.state !== 'idle');
  if (top && top.state === 'working') { renderWork(top); return; }
  const left = h('div', { class: 'claude-left' }, h('div', { class: 'brand' }, h('span', { class: 'logo' }, icon('spark', 15)), top ? top.project || 'Claude Code' : 'Claude Code',
    top ? h('span', { class: 'muted', style: 'font-weight:600;margin-left:auto', 'data-tick': top.endedAt ? null : top.startedAt, text: top.startedAt ? fmt(((top.endedAt || Date.now()) - top.startedAt) / 1000) : '' }) : null));
  if (!top) {
    const jobs = S.history.filter(e => isToday(e.at) && e.result === 'done').length;
    left.append(h('div', { class: 'count', text: String(jobs) }), h('div', { class: 'muted', text: jobs === 1 ? 'job done today' : 'jobs done today' }));
    if (S.hub.error) left.append(h('div', { class: 'error', text: S.hub.error }));
    else if (!S.hub.lastHeard) left.append(h('div', { class: 'dim', style: 'margin-top:8px', text: 'Waiting for Claude Code… restart any session that was already open.' }));
  } else {
    const live = h('div', { class: 'live' }, h('div', { class: 'live-label ellipsis', text: top.label }));
    if (top.prompt) live.append(h('div', { class: 'live-prompt ellipsis', text: `“${top.prompt}”` }));
    if (top.state === 'working' && top.diff) {
      live.append(h('div', { class: 'diff mono' }, h('div', { class: 'f', text: top.diff.file }),
        top.diff.removed.slice(0, 2).map(l => h('div', { class: 'del', text: '- ' + l })), top.diff.added.slice(0, 2).map(l => h('div', { class: 'add', text: '+ ' + l }))));
    } else if (top.state === 'working' && top.output?.tail.length) {
      live.append(h('div', { class: 'diff mono' }, h('div', { class: 'f', text: '$ ' + top.output.command }), top.output.tail.slice(-2).map(l => h('div', { class: top.output.failed ? 'del' : '', text: l }))));
    } else if (top.steps.length && top.state === 'working') {
      live.append(h('ul', { class: 'steps' }, top.steps.slice(-3).map(st => h('li', { class: st.status }, h('span', { class: 'st', text: ICON_STEP[st.status] }), h('span', { text: st.verb }), h('span', { class: 'muted mono ellipsis', text: st.target })))));
    } else if (top.lastMessage && !top.holding) {
      live.append(h('div', { class: 'diff', style: 'max-height:62px;overflow:auto;white-space:pre-wrap;user-select:text', text: top.lastMessage }));
    }
    if (top.canReply) {
      const key = `reply:${top.id}`;
      const send = () => act(async () => { await pulse.reply(top.id, drafts[key]); delete drafts[key]; });
      live.append(h('div', { class: 'reply' }, draftInput(key, { placeholder: 'Reply to Claude…', onkeydown: e => { if (e.key === 'Enter') send(); } }), h('button', { class: 'sendbtn', onclick: send }, icon('send', 16))));
    } else {
      const chips = [top.files.length && `${top.files.length} file${top.files.length > 1 ? 's' : ''}`, top.commands.length && `${top.commands.length} cmd`, top.context != null && `ctx ${top.context}%`, top.model].filter(Boolean);
      if (chips.length) live.append(h('div', { class: 'muted', style: 'font-size:12px', text: chips.join(' · ') }));
    }
    left.append(live);
  }
  const model = h('select', { onchange: e => act(() => pulse.setModel(e.target.value)) },
    [['', 'Default'], ['opus', 'Opus'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku'], ['opusplan', 'Opus plan']].map(([v, l]) => h('option', { value: v, text: l })));
  model.value = ['', 'opus', 'sonnet', 'haiku', 'opusplan'].includes(S.claude.model) ? S.claude.model : '';
  page.append(h('div', { class: 'claude' }, left,
    h('div', { style: 'display:grid;grid-template-rows:1fr auto;gap:10px;min-height:0' }, recentBox(), h('label', { class: 'model' }, 'Model', model))));
}
// While Claude works: big timer, what it's doing, how far along, and the code it's touching.
const DOING = { read: 'Reading the code', search: 'Looking around', edit: 'Making changes', run: 'Running commands', web: 'Checking the web', agent: 'Delegating', mcp: 'Using tools' };
const EXT = { js: ['JS', '#f7df1e', '#1a1600'], jsx: ['JSX', '#61dafb', '#00222b'], ts: ['TS', '#3178c6', '#fff'], tsx: ['TSX', '#3178c6', '#fff'],
  py: ['PY', '#3776ab', '#fff'], css: ['CSS', '#2965f1', '#fff'], html: ['HTML', '#e34c26', '#fff'], json: ['{ }', '#8bc34a', '#102000'],
  md: ['MD', '#9a9aa2', '#111'], ps1: ['PS', '#2b6cb0', '#fff'], cjs: ['JS', '#f7df1e', '#1a1600'], mjs: ['JS', '#f7df1e', '#1a1600'] };
function renderWork(s) {
  const last = s.steps.at(-1);
  const doing = DOING[last?.kind] || 'Thinking';
  const phase = s.phase ?? 0;
  const phases = ['Explore', 'Edit', 'Verify', 'Done'].map((name, i) =>
    h('div', { class: `ph ${i < phase ? 'full' : i === phase ? 'now' : ''}` }, h('i'), h('span', { text: name })));

  let card;
  if (last?.kind === 'run' && s.output) {
    card = h('div', { class: 'code' },
      h('div', { class: 'code-head' }, h('span', { class: 'badge', style: 'background:#2b2b31;color:#ddd' }, '>_'), h('b', { class: 'ellipsis', text: 'Terminal' }), h('span', { class: 'muted', text: s.output.tail.length ? (s.output.failed ? 'failed' : 'finished') : 'running' })),
      h('div', { class: 'ln cmd' }, h('em', { text: '$' }), h('span', { text: s.output.command })),
      s.output.tail.slice(-3).map(l => h('div', { class: `ln ${s.output.failed ? 'del' : 'out'}` }, h('em', { text: '' }), h('span', { text: l }))));
  } else if (s.diff) {
    const [label, bg, fg] = EXT[s.diff.ext] || [s.diff.ext.slice(0, 3).toUpperCase() || '•', '#3a3a42', '#eee'];
    const start = s.diff.start ?? null;
    const row = (cls, sign, text, n) => h('div', { class: `ln ${cls}` }, h('em', { text: n == null ? '' : String(n) }), h('i', { text: sign }), h('span', { text }));
    const removed = s.diff.removed.slice(0, 3), added = s.diff.added.slice(0, removed.length ? 3 : 4);
    card = h('div', { class: 'code' },
      h('div', { class: 'code-head' }, h('span', { class: 'badge', style: `background:${bg};color:${fg}`, text: label }), h('b', { class: 'ellipsis', text: s.diff.file }),
        h('span', { class: 'muted', text: last?.kind === 'edit' && last.status === 'running' ? 'being edited' : 'edited' })),
      removed.map((l, i) => row('del', '−', l, start == null ? null : start + i)),
      added.map((l, i) => row('add', '+', l, start == null ? null : start + i)));
  } else {
    card = h('div', { class: 'code' },
      h('div', { class: 'code-head' }, h('span', { class: 'badge', style: 'background:#2b2b31;color:#ddd' }, icon(last?.kind === 'search' ? 'globe' : 'file', 13)), h('b', { text: last?.verb || 'Thinking' })),
      h('div', { class: 'ln out' }, h('em', { text: '' }), h('span', { text: last?.target || (s.prompt ? `“${s.prompt}”` : 'Working out a plan…') })));
  }

  page.append(h('div', { class: 'work' },
    h('div', { class: 'work-left' },
      h('div', { class: 'brand' }, h('span', { class: 'logo' }, icon('spark', 15)), s.project || 'Claude Code'),
      h('div', { class: 'timer', 'data-tick': s.startedAt, text: fmt((Date.now() - s.startedAt) / 1000) }),
      h('div', { class: 'doing' }, doing, h('span', { class: 'muted', text: ` · step ${s.stepCount || s.steps.length || 1}` })),
      s.prompt ? h('div', { class: 'live-prompt ellipsis', text: `“${s.prompt}”` }) : null),
    card,
    h('div', { class: 'phases' }, phases)));
}

function recentBox() {
  const items = S.history.slice(0, 4);
  return h('div', { class: 'recent' }, h('h4', { text: 'RECENTLY' }),
    items.length ? items.map(e => h('div', { class: 'rrow', title: e.summary || e.prompt },
      h('span', { class: `chk ${e.result}` }, icon(e.result === 'error' ? 'x' : e.result === 'question' ? 'chat' : 'check', 12)),
      h('span', { class: 'grow ellipsis', text: e.prompt }), h('time', { text: ago(e.at) })))
      : h('div', { class: 'dim', style: 'padding:6px 0', text: 'Finished jobs show up here.' }),
    items.length ? h('div', { class: 'row end' }, h('button', { class: 'link', style: 'font-size:11px', text: 'Clear', onclick: () => act(() => pulse.clearHistory()) })) : null);
}

// ======================= Music =======================
function renderMusic() {
  const m = S.media;
  const app = String(m.app || '').replace(/\.exe$/i, '').split(/[!.\\]/).filter(Boolean).pop() || 'This PC';
  const lines = S.prefs.lyrics !== false ? lyricLines() : null;
  const bar = h('div', { class: 'bar', onclick: e => { if (!m.duration) return; const r = e.currentTarget.getBoundingClientRect(); pulse.media(`seek ${Math.round(((e.clientX - r.left) / r.width) * m.duration)}`); } }, h('i', { id: 'm-fill', style: 'width:0' }));
  page.append(h('div', { class: 'music' },
    h('div', { class: 'track' },
      h('div', { class: 'art', style: m.art ? `background-image:url("${m.art.replace(/"/g, '')}")` : '' }, m.art ? null : icon('music', 26)),
      h('div', { class: 'grow' },
        h('div', { class: 'ttl ellipsis', text: m.active ? m.title || 'Unknown' : 'Nothing is playing' }),
        h('div', { class: 'muted ellipsis', text: m.active ? m.artist || '' : 'Start music in Spotify, a browser or any player.' })),
      h('div', { class: `eq ${m.active && m.playing ? 'on' : ''}` }, ...Array.from({ length: 6 }, () => h('i')))),
    lines ? h('div', { class: 'lyr' }, h('div', { class: 'now', id: 'lyr-now', text: '♪' }), h('div', { class: 'next', id: 'lyr-next' })) : null,
    h('div', { class: 'prog' }, h('span', { id: 'm-pos', text: '0:00' }), bar, h('span', { text: fmt(m.duration || 0) })),
    h('div', { class: 'ctrls' },
      h('button', { title: 'Previous', onclick: () => pulse.media('prev') }, icon('prev', 24)),
      h('button', { title: 'Play / pause', onclick: () => pulse.media('toggle') }, icon(m.active && m.playing ? 'pause' : 'play', 30)),
      h('button', { title: 'Next', onclick: () => pulse.media('next') }, icon('next', 24)),
      h('span', { class: 'src' }, icon('laptop', 14), app))));
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
async function onClipboard(make) {
  const text = S.clipboard[0]?.text;
  if (!text) { chat.error = 'Copy some text first, then pick this.'; render(); return; }
  askPulse(make(text));
}
function renderChat() {
  const eyes = chatEyesEl;
  eyes.className = 'eyes big'; chatEyes.reach = 9;
  const wrap = h('div', { class: 'chat' }, eyes);
  if (chat.busy) {
    wrap.append(h('h2', { text: 'Thinking…' }), h('div', { class: 'question ellipsis', text: chat.question }),
      h('div', { style: 'margin-top:14px' }, h('button', { class: 'btn', onclick: () => { pulse.cancelAsk(); chat.busy = false; render(); } }, icon('stop', 12), 'Stop')));
  } else if (chat.answer || chat.error) {
    eyes.className = 'eyes mini'; chatEyes.reach = 1.5;
    wrap.append(h('div', { class: 'question ellipsis', text: chat.question }),
      h('div', { class: 'answer', style: chat.error ? 'color:var(--failed)' : '', text: chat.answer || chat.error }),
      h('div', { class: 'row', style: 'margin-top:8px' },
        chat.answer ? h('button', { class: 'btn', onclick: () => pulse.copy(chat.answer) }, icon('copy', 14), 'Copy') : null,
        h('button', { class: 'btn', onclick: () => { Object.assign(chat, { answer: '', error: '', question: '' }); render(); } }, 'New question')));
  } else {
    const chip = (ic, c, label, fn) => h('button', { class: 'chip', style: `--c:${c}`, onclick: fn }, icon(ic, 15), label);
    wrap.append(h('h2', { text: 'What can I do for you?' }), h('div', { class: 'muted', text: 'The quick actions use your last copied text. Answers come from your own Claude Code.' }),
      h('div', { class: 'chips' },
        chip('screen', '#3fb6ff', 'Look at my screen', () => askPulse('What is on my screen? Point out anything that looks wrong or needs my attention.', true)),
        chip('bulb', '#ffd23f', 'Explain', () => onClipboard(t => `Explain this simply:\n\n${t}`)),
        chip('check', '#34d07a', 'Check spelling', () => onClipboard(t => `Fix the spelling and grammar. Reply with only the corrected text:\n\n${t}`)),
        chip('globe', '#5aa9ff', 'Translate', () => onClipboard(t => `Translate this into English. Reply with only the translation:\n\n${t}`)),
        chip('lines', '#c48bff', 'Summarize', () => onClipboard(t => `Summarize in 3 short bullet points:\n\n${t}`))));
  }
  const key = 'chat';
  const send = () => { const v = (drafts[key] || '').trim(); if (v) { drafts[key] = ''; askPulse(v); } };
  if (!chat.busy) wrap.append(h('div', { class: 'askbar' }, draftInput(key, { placeholder: 'Ask Pulse something…', onkeydown: e => { if (e.key === 'Enter') send(); } }),
    h('button', { class: 'sendbtn', title: 'Ask', onclick: send }, icon('send', 16))));
  page.append(wrap);
}

// ======================= Focus =======================
function renderFocus() {
  const left = focusLeft(), total = F.total || focusLen();
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 170 170');
  const c = (stroke, frac) => { const e = document.createElementNS(ns, 'circle'); e.setAttribute('cx', 85); e.setAttribute('cy', 85); e.setAttribute('r', 78); e.setAttribute('stroke', stroke); if (frac != null) { e.id = 'dial-fg'; e.setAttribute('stroke-dasharray', '490'); e.setAttribute('stroke-dashoffset', String(490 * (1 - frac))); e.setAttribute('stroke-linecap', 'round'); } return e; };
  svg.append(c('#1d1d21'), c('var(--accent)', left / total));
  const minutes = S.prefs.focusMinutes || 25;
  page.append(h('div', { class: 'focus' },
    h('div', { class: 'dial' }, svg, h('div', { class: 't', 'data-focus': true, text: fmt(left) })),
    h('div', { class: 'focus-side' },
      h('div', { style: 'font-size:18px;font-weight:800', text: F.endsAt ? 'Deep work' : F.pausedLeft ? 'Paused' : 'Ready when you are' }),
      h('div', { class: 'row' },
        F.endsAt ? h('button', { class: 'btn acc', onclick: focusPause }, icon('pause', 14), 'Pause')
          : h('button', { class: 'btn acc', onclick: focusStart }, icon('play', 14), F.pausedLeft ? 'Resume' : 'Start'),
        h('button', { class: 'btn', onclick: focusReset }, icon('reset', 14), 'Reset')),
      h('div', { class: 'lens' }, [5, 15, 25, 50].map(n => h('button', { class: `len ${n === minutes ? 'on' : ''}`, text: `${n}m`,
        onclick: () => { F = {}; store.set('focus', F); act(() => pulse.setPrefs({ focusMinutes: n })); } }))))));
}

// ======================= Tray =======================
function renderTray() {
  const ph = S.phone, files = S.prefs.shelf || [];
  if (ph.on) {
    page.append(h('div', { class: 'phone' },
      h('div', { class: 'qr' }, h('img', { src: ph.qr, alt: 'QR code' })),
      h('div', {},
        h('div', { style: 'font-size:18px;font-weight:800', text: 'Scan with your phone' }),
        h('div', { class: 'muted', text: 'Same Wi-Fi needed. Open the link from your camera.' }),
        h('div', { class: 'steps2' },
          h('div', { class: ph.connected ? 'ok' : '' }, h('i'), ph.connected ? 'Phone connected' : 'Waiting for your phone…'),
          h('div', { class: ph.received ? 'ok' : '' }, h('i'), ph.received ? `${ph.received} file${ph.received > 1 ? 's' : ''} received (in Downloads\\Pulse)` : 'Drop files on the island to offer them to your phone')),
        h('div', { class: 'row' }, h('span', { class: 'dim', style: 'font-size:12px', text: 'Local network only · stops after an hour' }),
          h('button', { class: 'btn', style: 'margin-left:auto', text: 'Stop', onclick: () => act(() => pulse.phoneStop()) })))));
    return;
  }
  if (!files.length) {
    page.append(h('div', { class: 'tray-empty' },
      h('div', { class: 'tray-icon' }, icon('tray', 46)),
      h('div', {},
        h('div', { style: 'font-size:18px;font-weight:800', text: 'Drop files here' }),
        h('div', { class: 'muted', text: 'They wait here until you drag them out · double-click to open' }),
        h('button', { class: 'pill-btn', onclick: () => act(() => pulse.phoneStart()) }, icon('phone', 15), 'Or swap files with your phone'))));
    return;
  }
  page.classList.add('scroll');
  page.append(h('div', { class: 'row', style: 'margin-bottom:8px' },
    h('span', { class: 'muted grow', text: `${files.length} file${files.length > 1 ? 's' : ''} · drag out, double-click to open` }),
    h('button', { class: 'pill-btn', style: 'margin:0', onclick: () => act(() => pulse.phoneStart()) }, icon('phone', 14), 'Phone'),
    h('button', { class: 'link danger', text: 'Clear', onclick: () => act(() => pulse.shelfClear()) })),
  h('div', { class: 'files' }, files.map(f => h('div', { class: 'ftile', draggable: 'true', title: f.path,
    ondragstart: e => { e.preventDefault(); pulse.shelfDrag(f.path); }, ondblclick: () => pulse.shelfOpen(f.path), oncontextmenu: () => pulse.shelfReveal(f.path) },
  icon('file', 28), h('span', { class: 'name', text: f.name }),
  h('button', { class: 'x', title: 'Remove', onclick: e => { e.stopPropagation(); act(() => pulse.shelfRemove(f.path)); } }, icon('x', 11))))));
}

// ======================= Clipboard =======================
function renderClipboard() {
  page.classList.add('scroll');
  if (!S.clipboard.length) { page.append(h('div', { class: 'empty', text: 'Text you copy shows up here. Click one to copy it again.' })); return; }
  page.append(h('div', { class: 'clips' }, S.clipboard.map(c => {
    const copied = copiedAt.text === c.text && Date.now() - copiedAt.at < 1500;
    return h('button', { class: `clip ${copied ? 'copied' : ''}`, onclick: () => { pulse.copy(c.text); copiedAt = { text: c.text, at: Date.now() }; render(); setTimeout(render, 1600); } },
      icon('lines', 14), h('span', { class: 'grow ellipsis', text: c.text.replace(/\s+/g, ' ') }), h('time', { text: copied ? 'Copied' : ago(c.at) }));
  })), h('div', { style: 'padding:10px 6px' }, h('button', { class: 'link danger', text: 'Clear history', onclick: () => act(() => pulse.clearClipboard()) })));
}

// ======================= Note =======================
// The note text lives here; state pushes from main may briefly carry an older copy while a save is pending.
let noteTimer, noteText = null;
function saveNote(text) { noteText = text; clearTimeout(noteTimer); noteTimer = setTimeout(() => pulse.setPrefs({ note: text }), 300); }
// One editor element for the whole session. While you type, render() leaves the Note page alone
// (see render), so background updates (clipboard, music, Claude) can't steal the cursor.
const noteTa = h('textarea', { id: 'note-edit', placeholder: 'Type… start a line with [ ] to make a checkbox' });
noteTa.addEventListener('input', () => saveNote(noteTa.value));
// Deferred: removing the focused editor (switching page) fires blur in the middle of a render.
noteTa.addEventListener('blur', () => setTimeout(() => {
  if (!document.hasFocus() || !noteEditing || current !== 'note') return;
  noteEditing = false; render();
}, 0));
function renderNote() {
  noteText ??= S.prefs.note || '';
  const text = noteText;
  if (noteEditing) {
    noteTa.value = text;
    page.append(noteTa);
    requestAnimationFrame(() => { noteTa.focus(); noteTa.setSelectionRange(noteTa.value.length, noteTa.value.length); });
    return;
  }
  const view = h('div', { class: 'note-view', onclick: () => { noteEditing = true; render(); } });
  if (!text.trim()) view.append(h('div', { class: 'note-ph', text: 'Click to type' }), h('div', { class: 'dim', text: 'Saved automatically · [ ] at the start of a line makes a check circle' }));
  text.split('\n').forEach((line, i) => {
    if (!text.trim()) return;
    const m = line.match(/^\s*\[( |x|X)\]\s?(.*)$/);
    if (!m) { view.append(h('div', { class: 'note-line' }, h('span', { text: line || ' ' }))); return; }
    const done = m[1] !== ' ';
    view.append(h('div', { class: `note-line ${done ? 'done' : ''}` },
      h('span', { class: `circle ${done ? 'done' : ''}`, onclick: e => {
        e.stopPropagation();
        const lines = text.split('\n'); lines[i] = line.replace(/\[( |x|X)\]/, done ? '[ ]' : '[x]');
        saveNote(lines.join('\n')); render();
      } }, done ? icon('check', 12) : null), h('span', { text: m[2] })));
  });
  page.append(view);
}

// ======================= Settings =======================
function renderSettings() {
  page.classList.add('scroll');
  const p = S.prefs;
  const toggle = (on, fn) => h('button', { class: `toggle ${on ? 'on' : ''}`, onclick: fn });
  const row = (title, sub, ctl) => h('div', { class: 'set' }, h('div', { class: 'grow' }, h('b', { text: title }), sub ? h('span', { text: sub }) : null), ctl);
  page.append(h('div', { class: 'settings' },
    row('Claude Code', S.claude.connected ? `Connected · ${S.claude.statusLine === 'custom' ? 'your own status line is kept, so usage meters stay off' : 'hooks + status line in settings.json'}` : 'Not connected',
      S.claude.connected ? h('button', { class: 'btn no', text: 'Disconnect', onclick: () => act(() => pulse.disconnect()) }) : h('button', { class: 'btn go', text: 'Connect', onclick: () => act(() => pulse.connect()) })),
    row('Start with Windows', null, toggle(S.startWithWindows, () => act(() => pulse.setLogin(!S.startWithWindows)))),
    row('Open on questions', 'Unfold when Claude asks for permission or input', toggle(p.autoOpen !== false, () => act(() => pulse.setPrefs({ autoOpen: p.autoOpen === false })))),
    row('Sounds', 'A soft chime when Claude finishes or needs you', toggle(p.sound !== false, () => act(() => pulse.setPrefs({ sound: p.sound === false })))),
    row('Lyrics', 'Synced lyrics in the island · looks songs up on lrclib.net', toggle(p.lyrics !== false, () => act(() => pulse.setPrefs({ lyrics: p.lyrics === false })))),
    row('Windows notifications', 'Only when Pulse is not focused', toggle(p.notifications !== false, () => act(() => pulse.setPrefs({ notifications: p.notifications === false })))),
    row('Shortcut', 'Ctrl+Alt+P unfolds the island · Esc folds it in · poke the eyes', null)));
}

// ======================= render =======================
function render() {
  if (!S) return;
  renderPill();
  updateEyes();
  if (!open) return;
  renderHeader();
  renderNav();
  renderMenu();
  if (current !== 'note') noteEditing = false;
  if (current === 'note' && noteEditing && page.contains(noteTa)) { renderAttention(); return; } // never interrupt typing
  preserveFocus(() => {
    renderAttention();
    page.replaceChildren(); page.className = '';
    const hasAsk = $('#attention').childElementCount > 0;
    if (!hasAsk || current !== 'claude') ({ home: renderHome, claude: renderClaude, music: renderMusic, chat: renderChat, focus: renderFocus, tray: renderTray, clipboard: renderClipboard, note: renderNote, settings: renderSettings })[current]();
    island.classList.toggle('warm', Boolean(page.querySelector('.work')));
    const base = 46 + 52 + 10;
    const pg = pageOf(current);
    const pageH = hasAsk && current === 'claude' ? 0 : current === 'music' && page.querySelector('.lyr') ? pg.hLyrics : current === 'claude' && page.querySelector('.work') ? pg.hWork : pg.h;
    island.style.setProperty('--open-h', `${Math.min(540, base + $('#attention').offsetHeight + pageH)}px`);
  });
  updateEyes();
}

// ---------- ticking bits (no full re-render) ----------
function tickClock() {
  const d = new Date();
  const el = $('#clock'); if (!el) return;
  el.replaceChildren(d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }), ' ', h('b', { text: d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }));
}
function tickUsage() {
  const u = S?.hub.usage.fiveHour; if (!u) return;
  const ms = resetMs(u.resetsAt);
  $('#usage').textContent = ms ? `${u.used}% · ${fmt(ms / 1000)}` : `${u.used}%`;
}
function tickFocus() {
  if (!F.endsAt) return;
  const left = focusLeft();
  for (const el of document.querySelectorAll('[data-focus], #pill-focus')) el.textContent = fmt(left);
  const fg = $('#dial-fg'); if (fg) fg.setAttribute('stroke-dashoffset', String(490 * (1 - left / (F.total || focusLen()))));
  if (left <= 0) { F = {}; store.set('focus', F); chime('focus'); new Notification('Focus session done', { body: 'Nice work. Take a short break.', silent: true }); render(); }
}
setInterval(() => {
  for (const el of document.querySelectorAll('[data-tick]')) if (el.dataset.tick) el.textContent = fmt((Date.now() - Number(el.dataset.tick)) / 1000);
  if (open) { tickClock(); tickUsage(); tickMedia(); }
  tickFocus();
  if (S && !open && island.classList.contains('lyrics') !== Boolean(showLyricsInPill())) renderPill();
  if (eyeMood() !== pillEyes.mood) updateEyes();
}, 1000);

setInterval(() => { if (S?.media.playing) tickLyrics(); }, 200); // lyric lines change faster than once a second
pulse.onState(st => { S = st; render(); });
pulse.state().then(st => { S = st; render(); });
