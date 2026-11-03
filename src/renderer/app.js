'use strict';
/* global pulse */
// Pulse island renderer. All data coming from Claude Code is rendered with textContent (never innerHTML).

const $ = sel => document.querySelector(sel);
const island = $('#island');
let S = null;              // latest state from main
let open = false;
let tab = 'claude';
const drafts = {};         // input drafts keyed by data-key, survive re-renders
const picks = {};          // AskUserQuestion selections: sessionId -> { question: Set(labels) }
let lastError = '';

// ---------- tiny DOM helper ----------
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
const fmtDur = s => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(s % 60).padStart(2, '0')}`; };
const ago = t => { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : new Date(t).toLocaleDateString(); };
const resetIn = r => { if (!r) return ''; const ms = (typeof r === 'number' ? (r < 1e12 ? r * 1000 : r) : Date.parse(r)) - Date.now(); return ms > 0 ? `resets in ${fmtDur(ms / 1000)}` : ''; };
const level = p => (p >= 90 ? 'full' : p >= 70 ? 'hot' : '');

async function act(fn) {
  try { lastError = ''; await fn(); } catch (e) { lastError = e.message; }
  render();
}

// Keep focus and caret across re-renders.
function preserveFocus(fn) {
  const a = document.activeElement, key = a?.dataset?.key, start = a?.selectionStart, end = a?.selectionEnd;
  fn();
  if (!key) return;
  const el = document.querySelector(`[data-key="${CSS.escape(key)}"]`);
  if (el && el !== a) { el.focus(); try { el.setSelectionRange(start, end); } catch {} }
}
function draftInput(key, props = {}, multiline = false) {
  const el = h(multiline ? 'textarea' : 'input', { type: multiline ? null : 'text', 'data-key': key, ...props });
  el.value = drafts[key] || '';
  el.addEventListener('input', () => { drafts[key] = el.value; });
  return el;
}

// ---------- open / close ----------
// focus=true only for things you did yourself (click, shortcut, tray), so Pulse never steals your keyboard.
function setOpen(v, { focus = false } = {}) {
  if (v && focus) pulse.focus();
  if (open === v) return;
  open = v;
  island.classList.toggle('open', v);
  island.classList.toggle('pill', !v);
  pulse.interactive(v || hovering);
  if (!v && S && ['finished', 'failed'].includes(S.hub.mood)) pulse.ack();
  render();
}
$('#bar').addEventListener('click', () => setOpen(true, { focus: true }));
$('#close').addEventListener('click', () => setOpen(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
pulse.onOpen(() => setOpen(true, { focus: true }));
pulse.onToggle(() => setOpen(!open, { focus: true }));
pulse.onBlur(() => { if (!S?.hub.sessions.some(s => s.holding)) setOpen(false); });
pulse.onAttention(() => { if (S?.prefs.autoOpen !== false) { tab = 'claude'; setOpen(true); } chime('ask'); });
pulse.onFinished(kind => chime(kind === 'failed' ? 'fail' : 'done'));

// Click-through: the window ignores the mouse except while it's over the island.
let hovering = false;
document.addEventListener('mousemove', e => {
  const over = island.contains(e.target);
  if (over !== hovering) { hovering = over; pulse.interactive(over || open); }
});
document.addEventListener('mouseleave', () => { if (hovering) { hovering = false; pulse.interactive(open); } });

for (const b of document.querySelectorAll('#tabs [data-tab]')) b.addEventListener('click', () => { tab = b.dataset.tab; render(); });

// ---------- sound ----------
let audio;
function chime(kind) {
  if (S && S.prefs.sound === false) return;
  try {
    audio ||= new AudioContext();
    const notes = { done: [660, 880], ask: [880, 660, 880], fail: [440, 330] }[kind] || [660];
    notes.forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + i * 0.12;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.4);
    });
  } catch {}
}

// ---------- bar ----------
function renderBar() {
  const { hub, media } = S;
  const top = hub.sessions[0];
  island.dataset.mood = hub.mood;
  const text = top && top.state !== 'idle' ? `${top.project || 'Claude'} · ${top.label}` : !S.claude.connected ? 'Pulse · not connected' : 'Pulse';
  $('#bar-text').textContent = text;
  const bm = $('#bar-media');
  bm.hidden = !(media.active && media.playing && (!top || top.state === 'idle'));
  bm.textContent = media.active ? `♪ ${media.title || ''}` : '';
  const ring = $('#bar-ring'), used = hub.usage.fiveHour?.used;
  ring.hidden = used == null;
  if (used != null) {
    ring.querySelector('.ring-fg').style.strokeDashoffset = String(94.25 * (1 - used / 100));
    ring.setAttribute('class', `ring ${level(used)}`);
    ring.setAttribute('aria-label', `5-hour limit ${used}%`);
  }
}

// ---------- attention (always on top of the panel) ----------
function renderAttention() {
  const box = $('#attention');
  box.replaceChildren();
  for (const s of S.hub.sessions.filter(x => x.holding && x.pending)) box.append(askCard(s));
}

function askCard(s) {
  const p = s.pending;
  const head = h('div', { class: 'ask-head' }, h('span', { class: 'tag', text: s.project || 'Claude' }),
    h('span', { text: p.kind === 'plan' ? 'Plan ready for review' : p.kind === 'ask' ? 'Claude has a question' : `Allow ${p.tool}?` }));

  if (p.kind === 'tool') {
    return h('div', { class: 'ask' }, head, h('pre', { class: 'mono', text: p.detail }),
      h('div', { class: 'row end' },
        h('button', { class: 'btn bad', text: 'Deny', onclick: () => act(() => pulse.deny(s.id)) }),
        h('button', { class: 'btn good', text: 'Allow', onclick: () => act(() => pulse.allow(s.id)) })));
  }

  if (p.kind === 'plan') {
    const key = `plan:${s.id}`;
    return h('div', { class: 'ask' }, head, h('div', { class: 'plan', text: p.plan }),
      draftInput(key, { placeholder: 'Optional: what should change?' }),
      h('div', { class: 'row end' },
        h('button', { class: 'btn', text: 'Send feedback', onclick: () => act(async () => { await pulse.plan(s.id, false, drafts[key]); delete drafts[key]; }) }),
        h('button', { class: 'btn good', text: 'Approve plan', onclick: () => act(() => pulse.plan(s.id, true)) })));
  }

  // AskUserQuestion
  const sel = (picks[s.id] ||= {});
  const qs = p.questions.map((q, qi) => {
    const set = (sel[q.question] ||= new Set());
    const otherKey = `ask:${s.id}:${qi}`;
    return h('div', { class: 'q' },
      h('div', { class: 'q-title', text: q.question }),
      h('div', { class: 'opts' }, q.options.map(o => h('button', {
        class: `opt ${set.has(o.label) ? 'on' : ''}`,
        onclick: () => { if (!q.multiSelect) set.clear(); set.has(o.label) && q.multiSelect ? set.delete(o.label) : set.add(o.label); render(); },
      }, o.label, o.description ? h('small', { text: o.description }) : null))),
      draftInput(otherKey, { placeholder: 'Or type your own answer' }));
  });
  const submit = () => act(async () => {
    const answers = {};
    p.questions.forEach((q, qi) => {
      const own = (drafts[`ask:${s.id}:${qi}`] || '').trim();
      answers[q.question] = own || [...(sel[q.question] || [])];
    });
    await pulse.answer(s.id, answers);
    delete picks[s.id];
  });
  return h('div', { class: 'ask' }, head, qs,
    h('div', { class: 'row end' },
      h('button', { class: 'btn bad', text: 'Skip', onclick: () => act(() => pulse.deny(s.id)) }),
      h('button', { class: 'btn primary', text: 'Send answer', onclick: submit })));
}

// ---------- Claude view ----------
function usageMeters() {
  const u = S.hub.usage;
  if (!u.fiveHour && !u.sevenDay) return null;
  const meter = (name, w) => w && h('div', { class: 'meter' },
    h('div', { class: 'lbl' }, h('span', { text: `${name} · ${w.used}%` }), h('span', { text: resetIn(w.resetsAt) })),
    h('div', { class: 'track' }, h('div', { class: `fill ${level(w.used)}`, style: `width:${w.used}%` })));
  return h('div', { class: 'usage' }, meter('5-hour limit', u.fiveHour), meter('Weekly', u.sevenDay));
}

function sessionCard(s) {
  const elapsed = s.startedAt ? ((s.endedAt || Date.now()) - s.startedAt) / 1000 : 0;
  const card = h('div', { class: 'session' },
    h('div', { class: 's-head' },
      h('span', { class: `orb ${s.state}` }),
      h('span', { class: 's-title', text: s.project || 'Claude Code' }),
      h('span', { class: 's-label', text: s.label }),
      s.startedAt ? h('span', { class: 's-time', 'data-tick': s.endedAt ? null : s.startedAt, text: fmtDur(elapsed) }) : null,
      h('button', { class: 'link', text: '✕', title: 'Hide this session', onclick: () => act(() => pulse.dismiss(s.id)) })),
    s.prompt ? h('div', { class: 's-prompt', text: `“${s.prompt}”` }) : null);

  if (s.steps.length && s.state !== 'idle') {
    const icon = { running: '●', done: '✓', failed: '✕' };
    card.append(h('ul', { class: 'steps' }, s.steps.slice(-6).map(st => h('li', { class: st.status },
      h('span', { class: 'st', text: icon[st.status] }), h('span', { text: st.verb }), h('span', { class: 'tg mono', text: st.target })))));
  }
  if (s.diff && s.state === 'working') {
    card.append(h('div', { class: 'diff mono' }, h('div', { class: 'f', text: s.diff.file }),
      s.diff.removed.map(l => h('div', { class: 'del', text: '- ' + l })), s.diff.added.map(l => h('div', { class: 'add', text: '+ ' + l }))));
  }
  if (s.output?.tail.length && s.state === 'working') {
    card.append(h('div', { class: 'diff mono' }, h('div', { class: 'f', text: '$ ' + s.output.command }),
      s.output.tail.map(l => h('div', { class: s.output.failed ? 'del' : '', text: l }))));
  }
  const chips = [];
  if (s.files.length) chips.push(`${s.files.length} file${s.files.length > 1 ? 's' : ''} changed`);
  if (s.commands.length) chips.push(`${s.commands.length} command${s.commands.length > 1 ? 's' : ''}`);
  if (s.context != null) chips.push(`context ${s.context}%`);
  if (s.model) chips.push(s.model);
  if (chips.length) card.append(h('div', { class: 'chips' }, chips.map(c => h('span', { class: 'chip', text: c }))));

  if (s.lastMessage && ['finished', 'asking', 'failed'].includes(s.state) && !s.holding) card.append(h('div', { class: 'message', text: s.lastMessage }));
  if (s.canReply) {
    const key = `reply:${s.id}`;
    const input = draftInput(key, { placeholder: 'Reply to Claude…', onkeydown: e => { if (e.key === 'Enter') send(); } });
    const send = () => act(async () => { await pulse.reply(s.id, drafts[key]); delete drafts[key]; });
    card.append(h('div', { class: 'row' }, input, h('button', { class: 'btn primary', text: 'Send', onclick: send })));
  }
  if (s.cwd) card.append(h('div', { class: 'row' }, h('button', { class: 'link', style: 'margin:0', text: 'Open project folder', onclick: () => pulse.openFolder(s.cwd) })));
  return card;
}

function renderClaude() {
  const v = $('#view-claude');
  v.replaceChildren();
  if (!S.claude.connected) {
    v.append(h('div', { class: 'card' },
      h('h3', { text: 'Connect Claude Code' }),
      h('p', { class: 'muted', text: 'Pulse adds local hooks to your Claude Code settings so it can follow your sessions. Nothing leaves this PC. A backup of settings.json is kept.' }),
      h('button', { class: 'btn primary', text: 'Connect', onclick: () => act(() => pulse.connect()) })));
    if (!S.hub.sessions.length) return;
  }
  if (S.hub.error) v.append(h('div', { class: 'error', text: S.hub.error }));
  const meters = usageMeters(); if (meters) v.append(meters);
  const list = S.hub.sessions;
  if (!list.length) {
    v.append(h('div', { class: 'empty' }, S.hub.lastHeard ? 'No active sessions. Start a prompt in Claude Code.' : 'Waiting for Claude Code… (restart any Claude Code that was already open)'));
    return;
  }
  for (const s of list) v.append(sessionCard(s));
}

// ---------- Activity view ----------
function renderActivity() {
  const v = $('#view-activity');
  v.replaceChildren();
  if (!S.history.length) { v.append(h('div', { class: 'empty', text: 'Finished Claude Code turns will show up here.' })); return; }
  v.append(h('div', { class: 'row end' }, h('button', { class: 'link', text: 'Clear history', onclick: () => act(() => pulse.clearHistory()) })));
  for (const e of S.history) {
    const mood = e.result === 'error' ? 'failed' : e.result === 'question' ? 'asking' : 'finished';
    const row = h('div', { class: 'hist', title: e.summary || '' },
      h('span', { class: 'orb', style: `background:var(--${mood})` }),
      h('span', { class: 'p', text: e.prompt }),
      h('span', { class: 'muted', text: ago(e.at) }),
      h('span', { class: 'meta', text: [e.project, fmtDur(e.seconds), e.files ? `${e.files} files` : '', e.commands ? `${e.commands} cmds` : ''].filter(Boolean).join(' · ') }));
    v.append(row);
  }
}

// ---------- Media view ----------
let mediaBase = { at: 0, pos: 0 };
function renderMedia() {
  const v = $('#view-media'), m = S.media;
  v.replaceChildren();
  if (!m.active) { v.append(h('div', { class: 'empty', text: m.error ? `Media: ${m.error}` : 'Nothing is playing. Start Spotify, YouTube or any player.' })); return; }
  mediaBase = { at: m.updatedAt > 0 ? Math.min(m.updatedAt, Date.now()) : Date.now(), pos: m.position || 0 };
  const app = String(m.app || '').replace(/\.exe$/i, '').split(/[!.\\]/).filter(Boolean).pop() || '';
  const prog = h('div', { class: 'progress', onclick: e => {
    if (!m.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    pulse.media(`seek ${Math.round(((e.clientX - r.left) / r.width) * m.duration)}`);
  } }, h('div', { class: 'fill', id: 'media-fill' }));
  v.append(h('div', { class: 'player' },
    h('div', { class: 'art', style: m.art ? `background-image:url("${m.art.replace(/"/g, '')}")` : '' }),
    h('div', {},
      h('div', { class: 'track-title', text: m.title || 'Unknown' }),
      h('div', { class: 'muted', text: [m.artist, app].filter(Boolean).join(' · ') }),
      h('div', { class: 'controls' },
        h('button', { text: '⏮', title: 'Previous', onclick: () => pulse.media('prev') }),
        h('button', { class: 'big', text: m.playing ? '❚❚' : '▶', title: 'Play/pause', onclick: () => pulse.media('toggle') }),
        h('button', { text: '⏭', title: 'Next', onclick: () => pulse.media('next') })),
      m.duration ? prog : null,
      m.duration ? h('div', { class: 'times' }, h('span', { id: 'media-pos' }), h('span', { text: fmtDur(m.duration) })) : null)));
  tickMedia();
}
function tickMedia() {
  const m = S?.media; if (!m?.active || !m.duration) return;
  const pos = Math.min(m.duration, mediaBase.pos + (m.playing ? (Date.now() - mediaBase.at) / 1000 : 0));
  const fill = $('#media-fill'), lbl = $('#media-pos');
  if (fill) fill.style.width = `${(pos / m.duration) * 100}%`;
  if (lbl) lbl.textContent = fmtDur(pos);
}

// ---------- Tools view ----------
const note = $('#note');
let noteTimer;
note.addEventListener('input', () => { clearTimeout(noteTimer); noteTimer = setTimeout(() => pulse.setPrefs({ note: note.value }), 400); });

const shelf = $('#shelf');
for (const ev of ['dragenter', 'dragover']) document.addEventListener(ev, e => { e.preventDefault(); if (e.dataTransfer?.types.includes('Files')) { setOpen(true); tab = 'tools'; render(); shelf.classList.add('drop'); } });
document.addEventListener('dragleave', e => { if (!e.relatedTarget) shelf.classList.remove('drop'); });
document.addEventListener('drop', e => { e.preventDefault(); shelf.classList.remove('drop'); if (e.dataTransfer.files.length) act(() => pulse.shelfAdd(e.dataTransfer.files)); });
$('#clip-clear').addEventListener('click', () => act(() => pulse.clearClipboard()));

function renderTools() {
  if (document.activeElement !== note) note.value = S.prefs.note || '';
  const sl = $('#shelf-list'); sl.replaceChildren();
  const files = S.prefs.shelf || [];
  if (!files.length) sl.append(h('li', { class: 'muted' }, h('span', { text: 'Drag files onto the island to park them here.' })));
  for (const f of files) {
    sl.append(h('li', { draggable: 'true', title: f.path, ondragstart: e => { e.preventDefault(); pulse.shelfDrag(f.path); }, ondblclick: () => pulse.shelfOpen(f.path) },
      h('span', { text: f.name }),
      h('button', { class: 'x', text: '↗', title: 'Show in folder', onclick: e => { e.stopPropagation(); pulse.shelfReveal(f.path); } }),
      h('button', { class: 'x', text: '✕', title: 'Remove', onclick: e => { e.stopPropagation(); act(() => pulse.shelfRemove(f.path)); } })));
  }
  const cl = $('#clip-list'); cl.replaceChildren();
  if (!S.clipboard.length) cl.append(h('li', { class: 'muted' }, h('span', { text: 'Copied text appears here.' })));
  for (const c of S.clipboard) cl.append(h('li', { title: 'Click to copy', onclick: () => pulse.copy(c.text) }, h('span', { class: 'mono', text: c.text.replace(/\s+/g, ' ') })));
  renderFocus();
}

// Focus timer lives in the renderer; its end time is kept in localStorage so a reload doesn't lose it.
const focus = { load() { try { return JSON.parse(localStorage.getItem('focus')) || {}; } catch { return {}; } }, save(v) { try { localStorage.setItem('focus', JSON.stringify(v)); } catch {} } };
let F = focus.load();
function renderFocus() {
  const box = $('#focus'); box.replaceChildren();
  const minutes = S.prefs.focusMinutes || 25;
  const left = F.endsAt ? Math.max(0, (F.endsAt - Date.now()) / 1000) : F.pausedLeft ?? minutes * 60;
  box.append(h('div', { class: `focus-time ${F.endsAt ? 'running' : ''}`, id: 'focus-time', text: fmtDur(left) }),
    h('div', { class: 'row', style: 'justify-content:center' },
      F.endsAt
        ? h('button', { class: 'btn', text: 'Pause', onclick: () => { F = { pausedLeft: (F.endsAt - Date.now()) / 1000 }; focus.save(F); render(); } })
        : h('button', { class: 'btn primary', text: F.pausedLeft ? 'Resume' : 'Start', onclick: () => { F = { endsAt: Date.now() + (F.pausedLeft ?? minutes * 60) * 1000 }; focus.save(F); render(); } }),
      h('button', { class: 'btn', text: 'Reset', onclick: () => { F = {}; focus.save(F); render(); } }),
      h('button', { class: 'btn', text: `${minutes}m`, title: 'Change length', onclick: () => {
        const next = { 25: 50, 50: 15, 15: 5, 5: 25 }[minutes] || 25; F = {}; focus.save(F); act(() => pulse.setPrefs({ focusMinutes: next }));
      } })));
}
function tickFocus() {
  if (!F.endsAt) return;
  const left = (F.endsAt - Date.now()) / 1000;
  const el = $('#focus-time'); if (el) el.textContent = fmtDur(left);
  if (left <= 0) { F = {}; focus.save(F); chime('done'); new Notification('Focus session done', { body: 'Time for a break.', silent: true }); if (S) render(); }
}

// ---------- Settings view ----------
function renderSettings() {
  const v = $('#view-settings'); v.replaceChildren();
  const p = S.prefs;
  const toggle = (key, title, sub, dflt = true) => h('div', { class: 'setting' },
    h('div', { class: 'txt' }, h('b', { text: title }), h('span', { text: sub })),
    h('button', { class: `toggle ${(p[key] ?? dflt) ? 'on' : ''}`, onclick: () => act(() => pulse.setPrefs({ [key]: !(p[key] ?? dflt) })) }));
  v.append(
    h('div', { class: 'setting' },
      h('div', { class: 'txt' }, h('b', { text: 'Claude Code' }),
        h('span', { text: S.claude.connected ? `Connected via ${S.claude.settingsFile}` : 'Not connected' }),
        S.claude.statusLine === 'custom' ? h('span', { text: ' · You have your own status line, so usage meters stay off.' }) : null,
        S.claude.error ? h('div', { class: 'error', text: S.claude.error }) : null),
      S.claude.connected
        ? h('button', { class: 'btn bad', text: 'Disconnect', onclick: () => act(() => pulse.disconnect()) })
        : h('button', { class: 'btn primary', text: 'Connect', onclick: () => act(() => pulse.connect()) })),
    toggle('autoOpen', 'Open on questions', 'Expand the island when Claude asks for permission or input'),
    toggle('sound', 'Sounds', 'A short chime when Claude finishes or needs you'),
    toggle('notifications', 'Windows notifications', 'When Pulse is not focused'),
    h('div', { class: 'setting' },
      h('div', { class: 'txt' }, h('b', { text: 'Accent colour' })),
      h('div', { class: 'swatches' }, ['#7c5cff', '#4da3ff', '#3ddc84', '#ff6b9a', '#ffb020', '#e8e8f0'].map(c =>
        h('button', { class: `swatch ${p.accent === c ? 'on' : ''}`, style: `background:${c}`, onclick: () => act(() => pulse.setPrefs({ accent: c })) })))),
    h('div', { class: 'setting' },
      h('div', { class: 'txt' }, h('b', { text: 'Shortcut' }), h('span', { text: 'Ctrl+Alt+P toggles the island · Esc collapses it' })),
      h('button', { class: 'btn bad', text: 'Quit Pulse', onclick: () => pulse.quit() })));
}

// ---------- main render ----------
function render() {
  if (!S) return;
  document.documentElement.style.setProperty('--accent', S.prefs.accent || '#7c5cff');
  renderBar();
  if (!open) return;
  for (const b of document.querySelectorAll('#tabs [data-tab]')) b.classList.toggle('active', b.dataset.tab === tab);
  for (const v of document.querySelectorAll('.view')) v.hidden = v.dataset.view !== tab;
  preserveFocus(() => {
    renderAttention();
    if (lastError) $('#attention').prepend(h('div', { class: 'error', text: lastError }));
    ({ claude: renderClaude, activity: renderActivity, media: renderMedia, tools: renderTools, settings: renderSettings })[tab]();
  });
}

pulse.onState(st => { S = st; render(); });
pulse.state().then(st => { S = st; render(); });
setInterval(() => {
  for (const el of document.querySelectorAll('[data-tick]')) el.textContent = fmtDur((Date.now() - Number(el.dataset.tick)) / 1000);
  tickMedia(); tickFocus();
}, 1000);
