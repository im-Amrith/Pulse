'use strict';
// Star on GitHub: one request for the star count, cached for an hour. If it fails, the count stays hidden
// and the buttons still link to the repo.
(() => {
  const KEY = 'pulse-stars', HOUR = 3600e3;
  const fmt = n => n < 1000 ? String(n) : n < 1e6 ? `${(n / 1e3).toFixed(n < 1e4 ? 1 : 0).replace(/\.0$/, '')}k` : `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  const show = n => {
    if (!Number.isFinite(n) || n < 0) return;
    for (const a of document.querySelectorAll('a.star')) {
      const c = a.querySelector('.star-count');
      c.textContent = fmt(n); c.hidden = false;
      a.setAttribute('aria-label', `Star Pulse on GitHub, ${n.toLocaleString('en')} ${n === 1 ? 'star' : 'stars'} (opens in a new tab)`);
    }
  };
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(KEY)); } catch {}
  if (cached && Date.now() - cached.at < HOUR) return show(cached.n);
  fetch('https://api.github.com/repos/im-Amrith/Pulse', { headers: { Accept: 'application/vnd.github+json' } })
    .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
    .then(j => {
      const n = Number(j.stargazers_count);
      show(n);
      try { localStorage.setItem(KEY, JSON.stringify({ n, at: Date.now() })); } catch {}
    })
    .catch(() => { if (cached) show(cached.n); }); // offline or rate-limited: an older count, or none
})();
