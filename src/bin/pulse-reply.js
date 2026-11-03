#!/usr/bin/env node
'use strict';
// Background (asyncRewake) Stop hook for Claude Code. Waits for a reply typed in the
// Pulse island. Exit 2 + stderr wakes Claude with that reply; exit 0 means nothing to send.
// Usage: node pulse-reply.js <token>
const http = require('node:http');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', () => {
  let id = '';
  try { id = String(JSON.parse(raw).session_id || ''); } catch {}
  if (!id) process.exit(0);
  const body = JSON.stringify({ session_id: id });
  const req = http.request({ host: '127.0.0.1', port: 47900, path: '/pulse/wait', method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'x-pulse-token': process.argv[2] || '' } }, res => {
    let out = '';
    res.setEncoding('utf8');
    res.on('data', c => { out += c; });
    res.on('end', () => {
      let reply = '';
      try { reply = String(JSON.parse(out).reply || '').trim(); } catch {}
      if (!reply) process.exit(0);
      process.stderr.write('The user replied from the Pulse island: ' + reply + '\n');
      process.exit(2);
    });
  });
  req.on('error', () => process.exit(0));
  req.end(body);
});
