'use strict';
// Understands the times people type for reminders: "in 20 min", "in 2 hours", "at 5pm", "17:30",
// "tomorrow 9am", "tomorrow at 9:15". Returns a timestamp (ms) or null. Works in the page and in Node tests.
/* exported parseWhen */

function parseWhen(text, now = new Date()) {
  const s = String(text || '').trim().toLowerCase();
  if (!s) return null;

  const rel = s.match(/^in\s+(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|days?)$/);
  if (rel) {
    const n = parseFloat(rel[1]), u = rel[2][0];
    const ms = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[u];
    return now.getTime() + n * ms;
  }

  const m = s.match(/^(tomorrow|today)?\s*(?:at\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/);
  if (!m || (!m[1] && !m[3] && !m[4] && !/^at\s/.test(s))) return null; // a bare "5" is too ambiguous
  let hour = Number(m[2]);
  const minute = m[3] ? Number(m[3]) : 0;
  if (minute > 59 || hour > 23 || (m[4] && (hour < 1 || hour > 12))) return null;
  if (m[4] === 'pm' && hour < 12) hour += 12;
  if (m[4] === 'am' && hour === 12) hour = 0;
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  if (m[1] === 'tomorrow') d.setDate(d.getDate() + 1);
  else if (!m[1] && d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1); // "at 9" after 9 means tomorrow
  return d.getTime();
}

if (typeof module !== 'undefined') module.exports = { parseWhen };
