## What this changes

<!-- One change per PR. What does it do, and why? Link the issue, e.g. "Closes #12". -->

## How I tested it

<!-- Delete the lines that don't apply. -->
- [ ] `npm test` passes
- [ ] Tried it on **Windows** (10 / 11): 
- [ ] Tried it on **macOS** (Apple Silicon / Intel): 
- [ ] Added or updated a test in `test/` (needed when changing `hub.js`, `claude-config.js` or other main-process logic)

## Screenshots

<!-- For UI changes: before and after, of both the folded pill and the unfolded panel.
     Please hide anything personal: file paths, song titles, prompts, Wi-Fi names. -->

## Checklist

- [ ] Plain CommonJS, no build step, no new framework
- [ ] No new npm dependency, or I've explained below why it's worth shipping to every user
- [ ] If it touches `~/.claude/settings.json`: Disconnect still removes only Pulse's own entries
- [ ] If it adds a network call: it's called out below, and it's off until the user turns it on
- [ ] I've read the [Code of Conduct](https://github.com/im-Amrith/Pulse/blob/main/CODE_OF_CONDUCT.md), and my contribution is licensed under the [MIT License](https://github.com/im-Amrith/Pulse/blob/main/LICENSE.txt)

## Anything else

<!-- New dependencies, network calls, open questions, follow-ups. -->
