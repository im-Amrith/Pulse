<p align="center">
  <img src="promo/final/pulse-promo-poster.jpg" alt="Pulse: a small island at the top of a laptop screen, unfolded into a panel" width="820">
</p>

<h1 align="center">Pulse</h1>

<p align="center">
  <b>Your desk, with a pulse.</b><br>
  A small living island at the top of your screen that follows <b>Claude Code</b> live, asks before anything risky, and keeps your music, timers and notes one hover away.
</p>

<p align="center">
  <a href="https://pulse-bot.dev">Website</a> ·
  <a href="https://github.com/im-Amrith/Pulse-releases/releases/latest">Download</a> ·
  <a href="#build-it-yourself">Build it yourself</a> ·
  <a href="CONTRIBUTING.md">Contribute</a>
</p>

<p align="center">
  <img alt="Windows and macOS" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-black">
  <img alt="MIT License" src="https://img.shields.io/badge/license-MIT-d28a0f">
  <img alt="Electron 38" src="https://img.shields.io/badge/electron-38-black">
</p>

---

A black capsule hangs from the top centre of your screen with two eyes. They blink, glance at your cursor, scan while Claude works, hop when it needs you, smile when the job is done and droop when it fails. Hover over it (or press `Ctrl+Alt+P`, `Cmd+Alt+P` on a Mac) and it unfolds into a panel.

Free, no account, and nothing leaves your computer.

## What it does

**Claude Code, live**
- The pill shows what Claude is doing right now: reading a file, editing, running a command.
- The **Claude Code** page has the session timer, the current step, a diff of the edit, command output, jobs done today and a model picker.
- **Permission requests**, `AskUserQuestion` choices and plans appear in the island with **Allow** / **Deny**, so you don't have to keep checking the terminal. You can also reply after Claude stops.
- The header shows your 5-hour usage and a countdown to the reset.

**Everything else, one hover away**

| Page | What it does |
| --- | --- |
| **Home** | Claude's live state, what's playing, your running timer and the next reminder |
| **Music** | Now playing from Spotify, browsers and other media apps, with seek, skip and **synced lyrics** in the pill |
| **Ask Pulse** | Ask your own Claude Code anything, or use quick actions on your last copied text or a screenshot |
| **Time** | Focus sessions, named timers and a stopwatch |
| **Plan** | A quick note with tickable lines, and reminders in plain words ("in 20 min", "tomorrow 9am") |
| **Launcher** | Pin apps, folders and websites |
| **Tray** | Drop files on the island and drag them out later; swap files with your phone by QR code (local network only) |
| **Clipboard** | Recent copies, click to copy again |

Pick your own colours in Settings. The island's accent and body colours follow your theme.

## Install

Download the latest build from **[pulse-bot.dev](https://pulse-bot.dev)** or the [releases page](https://github.com/im-Amrith/Pulse-releases/releases/latest).

- **Windows:** unzip `Pulse-win-x64.zip` and open `Pulse.exe`. Pulse isn't code-signed yet, so Windows may say "Windows protected your PC". Choose **More info**, then **Run anyway**.
- **macOS:** open `Pulse-mac-universal.dmg` and drag Pulse to Applications. It isn't notarized yet, so the first time go to **System Settings → Privacy & Security → Open Anyway**.

Then open the island and choose **Connect**. Pulse adds its hooks (and, if you don't already have one, a status line) to `~/.claude/settings.json` and keeps a backup next to it as `settings.json.pulse-backup`. **Disconnect** removes only Pulse's entries. Restart any Claude Code session that was already open.

Prefer not to run an unsigned binary? [Build it yourself](#build-it-yourself); it takes a few commands.

## Privacy

Pulse has no account, no analytics and no server of its own.

- Claude Code reports to Pulse through [hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) sent to `127.0.0.1:47900`, a local-only address. Every request must carry a random per-install token (`src/main/hub.js`).
- **Ask Pulse** runs your own `claude -p`, using the Claude Code login you already have. Pulse never sees a password or an API key.
- **Lyrics** look up the song title, artist and length on [lrclib.net](https://lrclib.net). You can turn this off in Settings.
- **Update checks** ask GitHub for the latest version number.
- **Phone transfer** serves files on your local network at a random URL that stops after an hour.

That's the full list, and the code is here to check.

## Build it yourself

You need [Node.js](https://nodejs.org) 22 LTS. On Node 26, Electron's installer currently stops without unpacking Electron, so `npm start` can't find it.

```bash
git clone https://github.com/im-Amrith/Pulse.git
cd Pulse
npm install
npm start
```

`npm test` runs the tests (Node's built-in test runner, no extra setup).

**Optional on Windows:** `npm run helper` compiles the native media helper (`src/native/PulseMedia.cs`) with the C# compiler that ships with Windows; it needs the Windows 10/11 SDK. The helper uses about 20 MB of memory. Without it, Pulse falls back to a PowerShell bridge that uses about 90 MB.

**Release builds:** `npm run release` builds the Windows zip. The Mac build runs on GitHub Actions (`.github/workflows/mac.yml`) when a `v*` tag is pushed.

## How it works

```
Claude Code ──hooks (HTTP + token)──▶ hub.js ──IPC──▶ renderer (the island)
     ▲                                   │
     └──── pulse-reply.js (Stop hook) ◀──┘   your Allow / Deny / reply
```

| Path | What |
| --- | --- |
| `src/main/main.js` | App start, the transparent island window, tray, shortcuts |
| `src/main/hub.js` | Local hook server and session model; holds a `PermissionRequest` until you answer |
| `src/main/claude-config.js` | Connect and Disconnect in `~/.claude/settings.json` |
| `src/bin/pulse-status.js` | Status line: prints usage in the terminal and forwards it to the island |
| `src/bin/pulse-reply.js` | Background `Stop` hook that wakes Claude with a reply typed in the island |
| `src/main/media.js`, `media-mac.js` | Now playing and volume (native helper or PowerShell on Windows, AppleScript on macOS) |
| `src/native/PulseMedia.cs` | The small native Windows media helper |
| `src/main/lyrics.js` | Synced lyrics from LRCLIB |
| `src/main/ask.js` | Ask Pulse, through your own `claude -p` |
| `src/main/phone.js` | QR-code file transfer on the local network |
| `src/main/clipboard.js`, `downloads.js`, `system.js`, `store.js` | Clipboard history, Downloads watcher, Wi-Fi/CPU/RAM, JSON storage |
| `src/renderer/` | The island UI: `app.js` (pages), `eyes.js` (the eyes), `style.css` |
| `website/` | [pulse-bot.dev](https://pulse-bot.dev); `npm run deploy` publishes it to Cloudflare Pages |
| `promo/` | The promo video, made with [HyperFrames](https://github.com/heygen-com/hyperframes) from real footage (`npm run film -- --promo`) |

## Contributing

Bug reports, ideas and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). To report a security problem, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE.txt) © 2026 Amrithesh S Menon.

These files aren't covered by the MIT License:
- **Website background videos:** `website/assets/silk.mp4`, `ribbon.mp4`, `doorway.mp4` and `silk.jpg` come from third-party media libraries and remain their owners' property.
- **Barlow Condensed font:** licensed under the SIL Open Font License (`promo/shared/fonts/OFL-BarlowCondensed.txt`).

The published builds and website also come with [Terms of Use](TERMS.txt).

Pulse is an independent project. It is not affiliated with or endorsed by Anthropic. Claude and Claude Code are trademarks of Anthropic, PBC.
