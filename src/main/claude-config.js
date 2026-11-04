'use strict';
// Connects / disconnects Pulse in ~/.claude/settings.json.
// Only entries Pulse wrote are ever touched; a backup is kept next to the file.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PORT, ROUTES } = require('./hub');

const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  'PermissionRequest', 'Notification', 'Stop', 'StopFailure', 'SessionEnd'];
const BIN = path.join(__dirname, '..', 'bin');
const HOOK_URL = `http://127.0.0.1:${PORT}${ROUTES.hook}`;

// `node` is how hook scripts get run. The packaged app passes its own exe in Node mode
// (ELECTRON_RUN_AS_NODE) so people don't need Node.js installed.
function createClaudeConfig({ token, node = process.env.PULSE_NODE || 'node', settingsFile = path.join(os.homedir(), '.claude', 'settings.json') }) {
  const statusCommand = `${node} "${path.join(BIN, 'pulse-status.js')}" ${token}`;
  const replyCommand = `${node} "${path.join(BIN, 'pulse-reply.js')}" ${token}`;

  const isOurHook = h => (typeof h?.url === 'string' && h.url.startsWith(HOOK_URL))
    || (typeof h?.command === 'string' && h.command.includes('pulse-reply.js'));
  const isOurStatus = l => typeof l?.command === 'string' && l.command.includes('pulse-status.js');

  function read() {
    try { return JSON.parse(fs.readFileSync(settingsFile, 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return {}; throw new Error(`${settingsFile} is not valid JSON; nothing was changed.`); }
  }
  function write(settings) {
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    if (fs.existsSync(settingsFile)) fs.copyFileSync(settingsFile, settingsFile + '.pulse-backup');
    fs.writeFileSync(settingsFile + '.tmp', JSON.stringify(settings, null, 2) + '\n');
    fs.renameSync(settingsFile + '.tmp', settingsFile);
  }
  function strip(settings) {
    for (const event of Object.keys(settings.hooks || {})) {
      const groups = (settings.hooks[event] || [])
        .map(g => ({ ...g, hooks: (g.hooks || []).filter(h => !isOurHook(h)) }))
        .filter(g => g.hooks.length);
      if (groups.length) settings.hooks[event] = groups; else delete settings.hooks[event];
    }
    if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
    if (isOurStatus(settings.statusLine)) delete settings.statusLine;
  }

  function status() {
    let settings;
    try { settings = read(); } catch (e) { return { connected: false, error: e.message }; }
    const hooksFor = ev => (settings.hooks?.[ev] || []).flatMap(g => (g.hooks || []).filter(isOurHook));
    const ours = EVENTS.flatMap(hooksFor);
    // connected = every event reports to us with the right token, the reply hook and our status line
    // point at *this* copy of Pulse (they go stale when the app is moved)
    const hooksOk = EVENTS.every(ev => hooksFor(ev).some(h => h.url === HOOK_URL))
      && ours.filter(h => h.url).every(h => h.headers?.['X-Pulse-Token'] === token)
      && hooksFor('Stop').some(h => h.command === replyCommand)
      && ours.filter(h => h.command).every(h => h.command === replyCommand)
      && (!isOurStatus(settings.statusLine) || settings.statusLine.command === statusCommand);
    const statusLine = !settings.statusLine ? 'none' : isOurStatus(settings.statusLine) ? 'pulse' : 'custom';
    return { connected: hooksOk, statusLine, settingsFile };
  }

  function connect() {
    const settings = read();
    strip(settings);
    settings.hooks ||= {};
    for (const event of EVENTS) {
      const timeout = event === 'PermissionRequest' ? 310 : 3;
      (settings.hooks[event] ||= []).push({ hooks: [{ type: 'http', url: HOOK_URL, timeout, headers: { 'X-Pulse-Token': token } }] });
    }
    // Background Stop hook: lets you type a follow-up in the island; exit code 2 wakes Claude with it.
    settings.hooks.Stop.push({ hooks: [{ type: 'command', command: replyCommand, asyncRewake: true, timeout: 1810 }] });
    // Never replace a status line you made yourself.
    if (!settings.statusLine) settings.statusLine = { type: 'command', command: statusCommand, padding: 0 };
    write(settings);
    return status();
  }

  function disconnect() {
    const settings = read();
    strip(settings);
    write(settings);
    return status();
  }

  // The model Claude Code starts with ("model" in settings.json); '' means Claude Code's own default.
  function getModel() { try { return String(read().model || ''); } catch { return ''; } }
  function setModel(model) {
    if (!['', 'opus', 'sonnet', 'haiku', 'opusplan'].includes(model)) throw new Error('Unknown model.');
    const settings = read();
    if (model) settings.model = model; else delete settings.model;
    write(settings);
  }

  // Any Pulse entries at all (even ones pointing at an old location)?
  function hasOurs() {
    try {
      const s = read();
      return isOurStatus(s.statusLine) || Object.values(s.hooks || {}).some(groups => (groups || []).some(g => (g.hooks || []).some(isOurHook)));
    } catch { return false; }
  }

  return { status, connect, disconnect, hasOurs, getModel, setModel, EVENTS };
}

module.exports = { createClaudeConfig, EVENTS, HOOK_URL };
