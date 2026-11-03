'use strict';
// Pulse hub: a tiny HTTP server on 127.0.0.1 that receives Claude Code hook events,
// keeps a live model of every session, and can hold a PermissionRequest open until
// you answer it from the island.
const http = require('node:http');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { timingSafeEqual } = require('node:crypto');

const PORT = 47900;
const ROUTES = { hook: '/pulse/hook', status: '/pulse/status', wait: '/pulse/wait' };
const PERMISSION_TIMEOUT_S = 300;
const REPLY_TIMEOUT_S = 1800;
const MAX_BODY = 1_000_000;
// Higher number = needs you more = shown first.
const PRIORITY = { asking: 4, failed: 3, working: 2, finished: 1, idle: 0 };

const TOOL_KIND = {
  Read: 'read', Glob: 'search', Grep: 'search', LS: 'read',
  Edit: 'edit', MultiEdit: 'edit', Write: 'edit', NotebookEdit: 'edit',
  Bash: 'run', PowerShell: 'run',
  WebFetch: 'web', WebSearch: 'web',
  Task: 'agent', Agent: 'agent',
};
const kindOf = tool => TOOL_KIND[tool] || (String(tool).startsWith('mcp__') ? 'mcp' : 'other');

function describe(tool, input = {}) {
  const file = input.file_path || input.notebook_path || input.path;
  switch (kindOf(tool)) {
    case 'read': return { verb: 'Reading', target: file ? path.basename(file) : '' };
    case 'search': return { verb: 'Searching', target: input.pattern || '' };
    case 'edit': return { verb: tool === 'Write' ? 'Writing' : 'Editing', target: file ? path.basename(file) : '' };
    case 'run': return { verb: 'Running', target: input.command || '' };
    case 'web': return { verb: 'Browsing', target: input.url || input.query || '' };
    case 'agent': return { verb: 'Delegating', target: input.description || '' };
    case 'mcp': return { verb: 'Using', target: tool.split('__').slice(1).join(' / ') };
    default: return { verb: 'Using', target: tool };
  }
}

const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const lines = (s, n, w = 100) => String(s ?? '').split(/\r?\n/).map(l => l.trimEnd()).filter(Boolean).slice(-n).map(l => clip(l, w));

// Does the final assistant message end by asking the user something?
function endsWithQuestion(text) {
  const tail = String(text || '').trim().split(/\r?\n/).filter(l => l.trim()).slice(-2).join(' ');
  return /\?\s*[*_)`]*\s*$/.test(tail);
}

function newSession(id) {
  return {
    id, state: 'idle', label: 'Ready', project: '', cwd: '', prompt: '', model: '',
    startedAt: 0, endedAt: 0, updatedAt: Date.now(), context: null,
    steps: [], files: [], commands: [], diff: null, output: null,
    pending: null, // { kind: 'tool'|'ask'|'plan', tool, detail, input, questions?, plan? }
    lastMessage: '', canReply: false,
  };
}

class Hub extends EventEmitter {
  constructor({ token, history, port = PORT, ignoreCwd = null } = {}) {
    super();
    this.ignoreCwd = ignoreCwd ? path.resolve(ignoreCwd).toLowerCase() : null; // Pulse's own "Ask" sessions
    this.token = Buffer.from(String(token));
    this.port = port;
    this.history = history; // { add(entry) } or undefined
    this.sessions = new Map();
    this.holds = new Map();   // session id -> { res, timer } for PermissionRequest
    this.replies = new Map(); // session id -> { res, timer } for the Stop reply hook
    this.usage = { fiveHour: null, sevenDay: null, at: 0 };
    this.server = null;
    this.error = '';
    this.lastHeard = 0;
  }

  // ---------- server ----------
  start() {
    if (this.server) return Promise.resolve();
    return new Promise(resolve => {
      this.server = http.createServer((req, res) => this.#onRequest(req, res));
      this.server.on('error', err => {
        this.error = err.code === 'EADDRINUSE' ? `Port ${this.port} is already in use (is Pulse running twice?)` : err.message;
        this.server = null; this.#changed(); resolve();
      });
      this.server.listen(this.port, '127.0.0.1', () => { this.error = ''; this.#changed(); resolve(); });
    });
  }

  stop() {
    for (const id of [...this.holds.keys()]) this.#release(id);
    for (const id of [...this.replies.keys()]) this.#sendReply(id, '');
    return new Promise(resolve => { if (!this.server) return resolve(); this.server.close(() => resolve()); this.server.closeAllConnections?.(); this.server = null; });
  }

  get listening() { return Boolean(this.server?.listening); }

  #authorized(req) {
    const given = Buffer.from(String(req.headers['x-pulse-token'] || ''));
    return given.length === this.token.length && timingSafeEqual(given, this.token);
  }

  #onRequest(req, res) {
    const route = String(req.url).split('?')[0];
    if (req.method !== 'POST' || !Object.values(ROUTES).includes(route) || !this.#authorized(req)) {
      req.resume(); res.writeHead(403).end(); return;
    }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; if (body.length > MAX_BODY) req.destroy(); });
    req.on('end', () => {
      let held = false;
      try {
        const data = JSON.parse(body || '{}');
        if (route === ROUTES.hook) held = this.handleEvent(data, res);
        else if (route === ROUTES.status) this.handleStatus(data);
        else if (route === ROUTES.wait) held = this.#holdReply(String(data.session_id || ''), res);
      } catch { /* malformed: let Claude Code continue */ }
      if (!held) res.writeHead(200).end();
    });
  }

  // ---------- events ----------
  // Returns true when the response is being held open (PermissionRequest).
  handleEvent(ev, res = null) {
    const id = typeof ev.session_id === 'string' ? ev.session_id : '';
    const name = ev.hook_event_name;
    if (!id || !name) return false;
    if (this.ignoreCwd && typeof ev.cwd === 'string' && path.resolve(ev.cwd).toLowerCase() === this.ignoreCwd) return false;
    this.lastHeard = Date.now();

    // Anything after a permission request (other than more pre-tool calls) means it was answered in the terminal.
    if (!['PermissionRequest', 'Notification', 'PreToolUse'].includes(name)) this.#release(id);
    if (name === 'UserPromptSubmit' || name === 'SessionEnd') this.#sendReply(id, '');
    if (name === 'SessionEnd') { this.sessions.delete(id); this.#changed(); return false; }

    const s = this.sessions.get(id) || newSession(id);
    const now = Date.now();
    s.updatedAt = now;
    if (typeof ev.cwd === 'string' && ev.cwd) { s.cwd = ev.cwd; s.project = path.basename(ev.cwd); }
    const begin = () => { if (!s.startedAt || s.endedAt) s.startedAt = now; s.endedAt = 0; };
    let held = false;

    switch (name) {
      case 'SessionStart':
        s.state = 'idle'; s.label = 'Ready'; break;

      case 'UserPromptSubmit':
        Object.assign(s, { state: 'working', label: 'Thinking', startedAt: now, endedAt: 0, pending: null,
          steps: [], files: [], commands: [], diff: null, output: null, lastMessage: '', canReply: false,
          prompt: clip(String(ev.prompt || '').replace(/\s+/g, ' ').trim(), 280) });
        break;

      case 'PreToolUse': {
        begin();
        const tool = String(ev.tool_name || '');
        const input = ev.tool_input && typeof ev.tool_input === 'object' ? ev.tool_input : {};
        if (tool === 'AskUserQuestion' || tool === 'ExitPlanMode') break;
        const { verb, target } = describe(tool, input);
        s.steps.push({ tool, kind: kindOf(tool), verb, target: clip(target, 120), status: 'running', at: now });
        if (s.steps.length > 15) s.steps.shift();
        const file = input.file_path ? path.basename(String(input.file_path)) : '';
        if (kindOf(tool) === 'edit' && file) {
          if (!s.files.includes(file)) s.files.push(file);
          const edit = Array.isArray(input.edits) ? input.edits[0] || {} : input;
          const before = lines(edit.old_string, 4, 90), after = lines(edit.new_string ?? edit.content, before.length ? 4 : 8, 90);
          s.diff = { file, removed: before, added: after };
        }
        if (kindOf(tool) === 'run' && input.command) {
          s.commands.push(clip(input.command, 100));
          s.output = { command: clip(input.command, 100), tail: [], failed: false };
        }
        if (!this.holds.has(id)) { s.state = 'working'; s.label = `${verb} ${clip(target, 50)}`.trim(); s.pending = null; }
        break;
      }

      case 'PostToolUse':
      case 'PostToolUseFailure': {
        begin();
        const failed = name === 'PostToolUseFailure';
        const tool = String(ev.tool_name || '');
        const step = [...s.steps].reverse().find(x => x.status === 'running' && x.tool === tool) || s.steps.find(x => x.status === 'running');
        if (step) step.status = failed ? 'failed' : 'done';
        if (kindOf(tool) === 'run' && s.output) {
          const r = ev.tool_response ?? {};
          const text = typeof r === 'string' ? r : [r.stdout, r.stderr, r.output, r.error].filter(Boolean).join('\n');
          s.output.tail = lines(text, 4); s.output.failed = failed;
        }
        s.state = 'working'; s.pending = null;
        break;
      }

      case 'PermissionRequest': {
        this.#release(id); // a previous open request for this session is stale
        const tool = String(ev.tool_name || '');
        const input = ev.tool_input && typeof ev.tool_input === 'object' ? ev.tool_input : {};
        const { verb, target } = describe(tool, input);
        s.state = 'asking';
        if (tool === 'AskUserQuestion' && Array.isArray(input.questions)) {
          s.label = 'Has a question';
          s.pending = { kind: 'ask', tool, input, questions: input.questions.slice(0, 4).map(q => ({
            question: String(q?.question || ''), header: clip(q?.header, 24), multiSelect: Boolean(q?.multiSelect),
            options: (Array.isArray(q?.options) ? q.options : []).slice(0, 6).map(o => ({ label: String(o?.label || ''), description: String(o?.description || '') })),
          })) };
        } else if (tool === 'ExitPlanMode') {
          s.label = 'Plan ready for review';
          s.pending = { kind: 'plan', tool, input, plan: clip(input.plan, 20000) };
        } else {
          s.label = 'Wants permission';
          s.pending = { kind: 'tool', tool, input, verb, detail: clip(input.command || input.file_path || input.url || target || JSON.stringify(input), 600) };
        }
        if (res) {
          const timer = setTimeout(() => { this.#release(id); this.#changed(); }, PERMISSION_TIMEOUT_S * 1000);
          this.holds.set(id, { res, timer });
          res.on('close', () => { if (this.holds.get(id)?.res === res) { clearTimeout(timer); this.holds.delete(id); this.#changed(); } });
          held = true;
        }
        this.emit('attention', s);
        break;
      }

      case 'Notification': {
        const type = String(ev.notification_type || '');
        if (['elicitation_dialog', 'agent_needs_input', 'idle_prompt'].includes(type) && s.state !== 'asking') {
          s.state = 'asking'; s.label = clip(ev.message || 'Needs you', 80);
          this.emit('attention', s);
        }
        break;
      }

      case 'Stop': {
        const msg = String(ev.last_assistant_message || '');
        const question = endsWithQuestion(msg);
        s.endedAt = now; s.pending = null;
        s.state = question ? 'asking' : 'finished';
        s.label = question ? 'Asked you something' : 'Done';
        s.lastMessage = msg.length > 3000 ? '…' + msg.slice(-3000) : msg;
        for (const step of s.steps) if (step.status === 'running') step.status = 'done';
        this.#record(s, question ? 'question' : 'done');
        this.emit('finished', s);
        break;
      }

      case 'StopFailure':
        s.endedAt = now; s.pending = null; s.state = 'failed';
        s.label = 'Failed: ' + clip(ev.error_type || ev.error || 'unknown error', 60);
        this.#record(s, 'error');
        this.emit('finished', s);
        break;
    }
    this.sessions.set(id, s);
    this.#changed();
    return held;
  }

  // From the status line script: account-wide limits plus per-session context use.
  handleStatus(d) {
    const win = w => (w && Number.isFinite(w.used) ? { used: Math.max(0, Math.min(100, w.used)), resetsAt: w.resets_at ?? null } : null);
    this.usage = { fiveHour: win(d.five_hour) || this.usage.fiveHour, sevenDay: win(d.seven_day) || this.usage.sevenDay, at: Date.now() };
    const s = this.sessions.get(String(d.session_id || ''));
    if (s) {
      if (Number.isFinite(d.context)) s.context = d.context;
      if (d.model) s.model = clip(d.model, 40);
    }
    this.lastHeard = Date.now();
    this.#changed();
  }

  #record(s, result) {
    // Prompts starting with "<" are Claude Code's own (e.g. <task-notification>), not something you asked.
    if (!this.history || !s.prompt || s.prompt.startsWith('<')) return;
    this.history.add({ at: Date.now(), project: s.project, cwd: s.cwd, prompt: s.prompt, result,
      files: s.files.length, commands: s.commands.length, seconds: s.startedAt ? Math.round((Date.now() - s.startedAt) / 1000) : 0,
      summary: clip(s.lastMessage, 600) });
  }

  // ---------- answers from the island ----------
  #release(id, decision) {
    const hold = this.holds.get(id);
    if (!hold) return false;
    this.holds.delete(id); clearTimeout(hold.timer);
    const body = decision ? JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision } }) : '';
    try { hold.res.writeHead(200, body ? { 'content-type': 'application/json' } : {}).end(body); } catch {}
    return true;
  }

  #settle(id, decision, label) {
    const s = this.sessions.get(id);
    if (!this.#release(id, decision)) throw new Error('That request was already answered (maybe in the terminal).');
    if (s) { s.pending = null; s.state = 'working'; s.label = label; }
    this.#changed();
  }

  allow(id) { this.#settle(id, { behavior: 'allow', updatedInput: this.sessions.get(id)?.pending?.input || {} }, 'Allowed, continuing'); }
  deny(id, reason) { this.#settle(id, { behavior: 'deny', message: reason || 'Denied from Pulse.' }, 'Denied'); }

  answer(id, answers) {
    const p = this.sessions.get(id)?.pending;
    if (p?.kind !== 'ask') throw new Error('No open question.');
    const out = {};
    for (const q of p.questions) {
      const v = answers?.[q.question];
      const text = Array.isArray(v) ? v.filter(Boolean).join(', ') : String(v || '').trim();
      if (!text) throw new Error('Answer every question first.');
      out[q.question] = clip(text, 2000);
    }
    this.#settle(id, { behavior: 'allow', updatedInput: { ...p.input, answers: out } }, 'Answer sent');
  }

  reviewPlan(id, approve, feedback) {
    const p = this.sessions.get(id)?.pending;
    if (p?.kind !== 'plan') throw new Error('No open plan.');
    const note = String(feedback || '').trim();
    this.#settle(id, approve
      ? { behavior: 'allow', updatedInput: p.input }
      : { behavior: 'deny', message: note ? `The user wants changes to the plan: ${note}` : 'The user rejected the plan. Ask what should change.' },
    approve ? 'Plan approved' : 'Feedback sent');
  }

  // The Stop reply hook waits here; a typed answer wakes Claude up again.
  #holdReply(id, res) {
    if (!id) return false;
    this.#sendReply(id, '');
    const timer = setTimeout(() => { this.#sendReply(id, ''); this.#changed(); }, REPLY_TIMEOUT_S * 1000);
    this.replies.set(id, { res, timer });
    res.on('close', () => { if (this.replies.get(id)?.res === res) { clearTimeout(timer); this.replies.delete(id); this.#changed(); } });
    this.#changed();
    return true;
  }

  #sendReply(id, text) {
    const r = this.replies.get(id);
    if (!r) return false;
    this.replies.delete(id); clearTimeout(r.timer);
    try { r.res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ reply: text || '' })); } catch {}
    return true;
  }

  reply(id, text) {
    const clean = String(text || '').trim();
    if (!clean) throw new Error('Type something first.');
    if (!this.#sendReply(id, clip(clean, 5000))) throw new Error('Claude Code is no longer waiting for a reply.');
    const s = this.sessions.get(id);
    if (s) Object.assign(s, { state: 'working', label: 'Reply sent', startedAt: Date.now(), endedAt: 0 });
    this.#changed();
  }

  // You looked at it: finished/failed sessions calm down. Open permissions stay.
  acknowledge() {
    for (const s of this.sessions.values()) {
      if (s.state === 'finished' || s.state === 'failed' || (s.state === 'asking' && !this.holds.has(s.id))) { s.state = 'idle'; s.label = 'Ready'; }
    }
    this.#changed();
  }

  dismiss(id) { this.#release(id); this.#sendReply(id, ''); this.sessions.delete(id); this.#changed(); }

  // ---------- view ----------
  snapshot() {
    const list = [...this.sessions.values()]
      .map(s => ({ ...s, pending: s.pending && { ...s.pending, input: undefined }, holding: this.holds.has(s.id), canReply: this.replies.has(s.id) }))
      .sort((a, b) => (PRIORITY[b.state] - PRIORITY[a.state]) || (b.updatedAt - a.updatedAt));
    return { listening: this.listening, error: this.error, lastHeard: this.lastHeard, usage: this.usage, sessions: list,
      mood: list[0]?.state || 'idle' };
  }

  #changed() { this.emit('change'); }
}

module.exports = { Hub, PORT, ROUTES, describe, kindOf, endsWithQuestion };
