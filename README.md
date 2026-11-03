# Pulse

A Dynamic Island for Windows that follows **Claude Code** live, plus a few desk tools.

A black notch hangs from the top of the screen with two glowing eyes. They blink, glance toward your cursor, scan while Claude works, hop when it needs you, turn into happy ^^ when it's done, droop when it fails, get sleepy when you're away, bob to music, and get dizzy if you poke them five times.

Click it (or press `Ctrl+Alt+P`) to unfold:

- **Home**: three cards for Claude (jobs today, live state, 5-hour usage ring), Music and Focus.
- **Claude**: the live session (current step, a diff of the edit, command output), jobs done today, recent jobs and a model picker. Permission requests, `AskUserQuestion` choices and plans show up here with Allow/Deny, and you can reply after Claude stops.
- **Music**: now playing from any app Windows knows (Spotify, browsers…), with seek, play/pause and skip.
- **Ask**: ask your own Claude Code (`claude -p`) anything, or use quick actions on your last copied text (explain, check spelling, translate, summarize) or on a screenshot of your screen.
- **Focus**: a timer with 5/15/25/50 minute lengths.
- **Tray**: drop files on the island and drag them out later; swap files with your phone by QR code (local network only, stops after an hour, received files go to `Downloads\Pulse`).
- **Clipboard**: recent copies, click to copy again.
- **Note**: a quick note; start a line with `[ ]` for a tickable circle.
- **Header**: Wi-Fi, date and time, 5-hour usage with a countdown to reset, and a menu with a system volume slider, Settings, Fold in and Quit.

Everything runs locally. The hook server listens only on `127.0.0.1:47900` and requires a per-install token.

## Run

```bash
npm install
npm start
```

`Ctrl+Alt+P` toggles the island, `Esc` collapses it, and the tray icon has "Start with Windows" and "Quit".

Open the island → **Connect**. Pulse adds its hooks and (if you don't already have one) a status line to `~/.claude/settings.json`, keeping a `settings.json.pulse-backup`. **Disconnect** removes only Pulse's entries. Restart any Claude Code that was already open.

## Layout

| Path | What |
| --- | --- |
| `src/main/hub.js` | Hook server and session model; holds `PermissionRequest`s until you answer |
| `src/main/claude-config.js` | Connect/disconnect in Claude Code settings |
| `src/bin/pulse-status.js` | Status line: prints usage in the terminal, forwards it to the island |
| `src/bin/pulse-reply.js` | Background `Stop` hook that wakes Claude with a reply typed in the island |
| `src/main/media.ps1`, `media.js` | Windows media session bridge |
| `src/main/clipboard.js`, `store.js`, `icon.js` | Clipboard history, JSON storage, generated tray icon |
| `src/renderer/` | Island UI |

`npm test` runs the hub and settings tests.
