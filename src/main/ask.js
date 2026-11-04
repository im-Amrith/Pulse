'use strict';
// "Ask Pulse": one-shot questions answered by the user's own Claude Code CLI (`claude -p`).
// Runs in a private working folder so the hub can ignore these sessions.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const TIMEOUT_MS = 180_000;
const os = require('node:os');

// Apps opened from Finder or the Dock get a minimal PATH, not the one from your terminal,
// so add the places Claude Code and Node usually live on a Mac.
function askEnv() {
  if (process.platform !== 'darwin') return process.env;
  const home = os.homedir();
  const extra = [`${home}/.local/bin`, `${home}/.claude/local`, `${home}/.npm-global/bin`, `${home}/.volta/bin`, '/opt/homebrew/bin', '/usr/local/bin'];
  return { ...process.env, PATH: [...extra, process.env.PATH || '/usr/bin:/bin'].join(':') };
}

function createAsk({ dir }) {
  fs.mkdirSync(dir, { recursive: true });
  let child = null;

  function run(prompt) {
    if (child) return Promise.reject(new Error('Still answering the previous question.'));
    return new Promise((resolve, reject) => {
      child = spawn('claude', ['-p', '--output-format', 'json'], { cwd: dir, shell: true, windowsHide: true, env: askEnv() });
      let out = '', err = '';
      const timer = setTimeout(() => { child?.kill(); reject(new Error('Claude took too long to answer.')); }, TIMEOUT_MS);
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      child.stdout.on('data', c => { out += c; });
      child.stderr.on('data', c => { err += c; });
      child.on('error', e => { clearTimeout(timer); child = null; reject(new Error(`Could not start Claude Code: ${e.message}`)); });
      child.on('close', code => {
        clearTimeout(timer); child = null;
        let parsed = null;
        try { parsed = JSON.parse(out); } catch {}
        if (parsed?.result && !parsed.is_error) return resolve(String(parsed.result).trim());
        if (/not recognized|not found/i.test(err)) return reject(new Error('Claude Code CLI was not found on PATH.'));
        reject(new Error((parsed?.result || err || `Claude exited with code ${code}`).toString().trim().slice(0, 300)));
      });
      child.stdin.end(prompt);
    });
  }

  function cancel() { try { child?.kill(); } catch {} child = null; }
  const busy = () => Boolean(child);
  return { run, cancel, busy, dir };
}

module.exports = { createAsk };
