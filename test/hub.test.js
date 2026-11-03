'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Hub, endsWithQuestion } = require('../src/main/hub');
const { createClaudeConfig, EVENTS } = require('../src/main/claude-config');

const TOKEN = 'a'.repeat(48);
let port = 48100;

function post(p, route, body, token = TOKEN) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port: p, path: route, method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), 'x-pulse-token': token } }, res => {
      let out = ''; res.setEncoding('utf8'); res.on('data', c => { out += c; }); res.on('end', () => resolve({ status: res.statusCode, body: out }));
    });
    req.on('error', reject); req.end(data);
  });
}
async function withHub(fn, opts = {}) {
  const hub = new Hub({ token: TOKEN, port: ++port, ...opts });
  await hub.start();
  try { await fn(hub, hub.port); } finally { await hub.stop(); }
}
const tick = () => new Promise(r => setTimeout(r, 20));

test('rejects requests without the token', () => withHub(async (_h, p) => {
  const r = await post(p, '/pulse/hook', { session_id: 'x', hook_event_name: 'Stop' }, 'wrong');
  assert.equal(r.status, 403);
}));

test('tracks a turn: prompt, tool steps, diff, finish into history', async () => {
  const added = [];
  await withHub(async (hub, p) => {
    const base = { session_id: 's1', cwd: 'C:\\code\\shop' };
    await post(p, '/pulse/hook', { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'fix the cart' });
    await post(p, '/pulse/hook', { ...base, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: 'C:\\code\\shop\\cart.js', old_string: 'a', new_string: 'b' } });
    let s = hub.snapshot().sessions[0];
    assert.equal(s.state, 'working');
    assert.equal(s.project, 'shop');
    assert.deepEqual(s.diff, { file: 'cart.js', removed: ['a'], added: ['b'] });
    await post(p, '/pulse/hook', { ...base, hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_response: {} });
    await post(p, '/pulse/hook', { ...base, hook_event_name: 'Stop', last_assistant_message: 'All fixed.' });
    s = hub.snapshot().sessions[0];
    assert.equal(s.state, 'finished');
    assert.equal(s.steps[0].status, 'done');
    assert.equal(added.length, 1);
    assert.equal(added[0].prompt, 'fix the cart');
    assert.equal(added[0].files, 1);
  }, { history: { add: e => added.push(e) } });
});

test('holds a PermissionRequest until allowed from the island', () => withHub(async (hub, p) => {
  const pending = post(p, '/pulse/hook', { session_id: 's2', hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'npm install' } });
  await tick();
  const s = hub.snapshot().sessions[0];
  assert.equal(s.state, 'asking');
  assert.equal(s.holding, true);
  assert.equal(s.pending.detail, 'npm install');
  assert.equal(s.pending.input, undefined, 'raw tool input is not sent to the renderer');
  hub.allow('s2');
  const r = await pending;
  assert.deepEqual(JSON.parse(r.body), { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow', updatedInput: { command: 'npm install' } } } });
  assert.throws(() => hub.allow('s2'), /already answered/);
}));

test('deny and AskUserQuestion answers produce the right decisions', () => withHub(async (hub, p) => {
  let pending = post(p, '/pulse/hook', { session_id: 's3', hook_event_name: 'PermissionRequest', tool_name: 'Write', tool_input: { file_path: 'x' } });
  await tick(); hub.deny('s3');
  assert.equal(JSON.parse((await pending).body).hookSpecificOutput.decision.behavior, 'deny');

  const questions = [{ question: 'Which db?', header: 'DB', multiSelect: false, options: [{ label: 'Postgres' }, { label: 'SQLite' }] }];
  pending = post(p, '/pulse/hook', { session_id: 's3', hook_event_name: 'PermissionRequest', tool_name: 'AskUserQuestion', tool_input: { questions } });
  await tick();
  assert.throws(() => hub.answer('s3', {}), /Answer every question/);
  hub.answer('s3', { 'Which db?': ['SQLite'] });
  const d = JSON.parse((await pending).body).hookSpecificOutput.decision;
  assert.equal(d.behavior, 'allow');
  assert.deepEqual(d.updatedInput.answers, { 'Which db?': 'SQLite' });
}));

test('a later event releases a permission answered in the terminal', () => withHub(async (hub, p) => {
  const pending = post(p, '/pulse/hook', { session_id: 's4', hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'ls' } });
  await tick();
  await post(p, '/pulse/hook', { session_id: 's4', hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_response: { stdout: 'ok' } });
  assert.equal((await pending).body, '', 'empty body lets Claude Code continue normally');
  assert.equal(hub.snapshot().sessions[0].holding, false);
}));

test('reply hook receives the typed reply', () => withHub(async (hub, p) => {
  await post(p, '/pulse/hook', { session_id: 's5', hook_event_name: 'Stop', last_assistant_message: 'Shall I continue?' });
  assert.equal(hub.snapshot().sessions[0].state, 'asking');
  const waiting = post(p, '/pulse/wait', { session_id: 's5' });
  await tick();
  assert.equal(hub.snapshot().sessions[0].canReply, true);
  hub.reply('s5', 'yes please');
  assert.deepEqual(JSON.parse((await waiting).body), { reply: 'yes please' });
}));

test('status line updates usage and context', () => withHub(async (hub, p) => {
  await post(p, '/pulse/hook', { session_id: 's6', hook_event_name: 'SessionStart' });
  await post(p, '/pulse/status', { session_id: 's6', context: 42, model: 'Opus', five_hour: { used: 63, resets_at: 1 }, seven_day: { used: 20 } });
  const snap = hub.snapshot();
  assert.equal(snap.usage.fiveHour.used, 63);
  assert.equal(snap.sessions[0].context, 42);
}));

test('ignores Pulse\'s own Ask sessions and keeps system prompts out of history', async () => {
  const added = [];
  await withHub(async (hub, p) => {
    await post(p, '/pulse/hook', { session_id: 'ask', cwd: 'C:\\Pulse\\ask', hook_event_name: 'UserPromptSubmit', prompt: 'hi' });
    assert.equal(hub.snapshot().sessions.length, 0);
    await post(p, '/pulse/hook', { session_id: 's7', cwd: 'C:\\x', hook_event_name: 'UserPromptSubmit', prompt: '<task-notification> done' });
    await post(p, '/pulse/hook', { session_id: 's7', hook_event_name: 'Stop', last_assistant_message: 'ok' });
    assert.equal(added.length, 0);
  }, { ignoreCwd: 'C:\\Pulse\\ask', history: { add: e => added.push(e) } });
});

test('parses netsh wlan output', () => {
  const { parseWlan } = require('../src/main/system');
  assert.deepEqual(parseWlan('    State                  : connected\n    SSID                   : Home\n    Signal                 : 88%\n'), { wifi: 'on', ssid: 'Home', signal: 88 });
  assert.deepEqual(parseWlan(''), { wifi: 'none' });
});

test('endsWithQuestion', () => {
  assert.equal(endsWithQuestion('Done.\n\nWant me to commit?'), true);
  assert.equal(endsWithQuestion('Is it? Yes. All done.'), false);
});

test('connect/disconnect keeps the user\'s own hooks and status line', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-'));
  const file = path.join(dir, 'settings.json');
  const mine = { model: 'opus', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo mine' }] }] }, statusLine: { type: 'command', command: 'my-status' } };
  fs.writeFileSync(file, JSON.stringify(mine));
  const cfg = createClaudeConfig({ token: TOKEN, settingsFile: file });

  assert.equal(cfg.status().connected, false);
  cfg.connect();
  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(cfg.status().connected, true);
  assert.equal(cfg.status().statusLine, 'custom');
  for (const ev of EVENTS) assert.ok(after.hooks[ev].length >= 1, ev);
  assert.equal(after.hooks.Stop.length, 3); // user's + ours + reply hook
  assert.equal(after.statusLine.command, 'my-status');
  assert.ok(fs.existsSync(file + '.pulse-backup'));

  cfg.connect(); // idempotent
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).hooks.Stop.length, 3);

  cfg.disconnect();
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), mine);
});
