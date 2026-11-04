# Contributing to Pulse

Thanks for helping. Bug reports, ideas and pull requests are all welcome.

## Reporting a bug

Open an [issue](https://github.com/im-Amrith/Pulse/issues/new/choose) and include:
- your OS (Windows 10/11 or macOS version) and the Pulse version (shown in Settings)
- what you did, what you expected and what happened
- a screenshot or short recording if it's visual

Please remove anything personal from screenshots (file paths, song titles, prompts, Wi-Fi names).

## Running from source

```bash
npm install
npm start      # runs Pulse from the source folder
npm test       # hub, settings and feature tests
```

On Windows, `npm run helper` builds the optional native media helper. Without it, Pulse uses the PowerShell fallback, so you don't need it to work on most things.

## Pull requests

- Keep each PR to one change, and say what it does and how you tested it (Windows, macOS or both).
- Run `npm test` before you push. Add a test in `test/` when you change `hub.js`, `claude-config.js` or other main-process logic.
- Match the surrounding style: plain CommonJS, no build step, no new framework. New npm dependencies need a good reason, since every one ships to every user.
- UI changes: include a before/after screenshot, and check both the folded pill and the unfolded panel.
- Anything that touches `~/.claude/settings.json` must keep Disconnect removing only Pulse's own entries.
- Privacy: Pulse must not send data anywhere new without the user turning it on. If your change adds a network call, call it out in the PR.

## Project layout

See [How it works](README.md#how-it-works) in the README.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE.txt).
