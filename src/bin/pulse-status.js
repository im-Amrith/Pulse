#!/usr/bin/env node
'use strict';
// Claude Code status line for Pulse. Prints a compact line in the terminal and forwards
// plan usage + context fill to the island. Usage: node pulse-status.js <token>
const http = require('node:http');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', () => {
  let d = {};
  try { d = JSON.parse(raw); } catch {}
  const pct = v => (Number.isFinite(v) ? Math.round(v) : null);
  const limits = d.rate_limits || {};
  const win = w => (w ? { used: pct(w.used_percentage), resets_at: w.resets_at ?? null } : null);
  const payload = {
    session_id: d.session_id || '',
    model: d.model?.display_name || d.model?.id || '',
    context: pct(d.context_window?.used_percentage),
    five_hour: win(limits.five_hour),
    seven_day: win(limits.seven_day),
  };

  const bits = [payload.model || 'Claude'];
  if (payload.five_hour?.used != null) bits.push(`5h ${payload.five_hour.used}%`);
  if (payload.seven_day?.used != null) bits.push(`7d ${payload.seven_day.used}%`);
  if (payload.context != null) bits.push(`ctx ${payload.context}%`);
  process.stdout.write('◉ ' + bits.join('  ·  ') + '\n');

  const body = JSON.stringify(payload);
  const req = http.request({ host: '127.0.0.1', port: 47900, path: '/pulse/status', method: 'POST', timeout: 800,
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'x-pulse-token': process.argv[2] || '' } });
  req.on('error', () => {});
  req.on('timeout', () => req.destroy());
  req.end(body);
});
