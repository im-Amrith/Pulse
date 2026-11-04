# Security

Pulse sits between Claude Code and your Allow / Deny decisions, so security reports matter a lot.

## Reporting a problem

Please **don't open a public issue** for a security problem. Use GitHub's private reporting instead:
[Report a vulnerability](https://github.com/im-Amrith/Pulse/security/advisories/new).

Include what an attacker could do, the steps to reproduce it, and the Pulse version and OS. You'll get a reply within a few days, and credit in the release notes if you'd like it.

## What's in scope

- The local hook server (`src/main/hub.js`): anything that lets another program or website answer a permission request, read session data, or skip the per-install token
- Changes to `~/.claude/settings.json` (`src/main/claude-config.js`)
- Phone transfer (`src/main/phone.js`) and anything reachable from the local network
- The renderer: script injection through file names, song titles, lyrics, clipboard contents or Claude output

Only the latest release gets security fixes.
