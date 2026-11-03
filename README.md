# Pulse

A Dynamic Island for Windows that follows **Claude Code** live, plus a few desk tools.

- **Live sessions**: what Claude is reading, editing and running, a small diff of the current edit, last command output, elapsed time. The island glows blue (working), amber (needs you), green (done) or red (failed).
- **Answer from the island**: Allow or Deny tool permissions, answer `AskUserQuestion` choices, approve or send back plans, and type a follow-up reply after Claude stops.
- **Usage**: 5-hour and weekly limit meters (plus a ring in the collapsed bar) and per-session context fill, fed by a Pulse status line.
- **Activity**: the last 50 finished turns.
- **Media**: now playing from any app Windows knows about (Spotify, browsers…), with play/pause/skip/seek.
- **Tools**: a file shelf (drop files onto the island, drag them out again), clipboard history, a quick note and a focus timer.

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
