# Launch posts

Ready-to-paste drafts. Edit them into your own voice before posting: every community below prefers a real person's words.

**Ground rules for every post**
- Pulse is independent: say "for Claude Code", never anything that sounds official. No Anthropic logo.
- Say up front that it's Electron (~315 MB) and that the builds aren't code-signed.
- Never ask for upvotes, stars or "support" on HN, Reddit or Product Hunt. A link to the repo is fine; asking people to vote isn't.
- Only real numbers. No testimonials, no "trusted by", no star counts you haven't got.
- Images and video: only the promo films, the poster, `website/assets/shots/*.png` and the README GIF. Never `silk.mp4`, `ribbon.mp4` or `doorway.mp4` (third-party footage).
- Reply to comments yourself, in your own words. Suggested replies to common questions are in [plan.md](plan.md#replies-to-common-questions).

**Links used below**
- Repo: https://github.com/im-Amrith/Pulse
- Website: https://pulse-bot.dev
- Downloads: https://github.com/im-Amrith/Pulse-releases/releases/latest
- Blog posts: https://pulse-bot.dev/blog/claude-code-hooks-allow-button/ · https://pulse-bot.dev/blog/electron-memory-530-to-315/ · https://pulse-bot.dev/blog/mac-99-percent-ram/

---

## 1. Show HN

> I couldn't load news.ycombinator.com from this session, so the rules below are from memory. Read https://news.ycombinator.com/showhn.html and https://news.ycombinator.com/newsguidelines.html before posting.
>
> What matters here: Show HN is for something people can try; the title starts with "Show HN:"; no superlatives or marketing language; don't ask anyone to upvote or comment, and don't have friends do it; you post as yourself and stay to answer questions.

**URL field:** `https://github.com/im-Amrith/Pulse` (HN readers like the source; the website is one click away in the README)

**Title** (74 characters):

```
Show HN: Pulse – an island at the top of the screen that shows Claude Code
```

Alternatives:
- `Show HN: Pulse – approve Claude Code's permission requests from your desktop` (76)
- `Show HN: Pulse – a desktop island for Claude Code, built on its HTTP hooks` (74)

**First comment** (post it right after submitting):

```
Hi HN, I'm Amrithesh. Pulse is a small desktop app for Windows and macOS that hangs from the top centre of the screen, a bit like a notch with two eyes. It shows what Claude Code is doing right now (reading a file, editing, running a command), and when Claude asks for permission, the request appears in the island with Allow and Deny, so I don't have to keep checking the terminal.

Why I built it: I'd start Claude Code on something, switch to another window, and come back ten minutes later to find it had been waiting for a "yes" the whole time. I wanted something I could see from the corner of my eye.

How it works: it uses Claude Code's own hooks. "Connect" adds HTTP hooks to ~/.claude/settings.json that POST each event to a server on 127.0.0.1:47900. For PermissionRequest, Pulse keeps the HTTP response open until you click Allow or Deny, then answers with the decision JSON. If you don't answer within 5 minutes it sends an empty response and Claude Code falls back to its normal prompt. Every request has to carry a random per-install token (compared with timingSafeEqual). There's also a background Stop hook (asyncRewake) so you can reply to Claude from the island after it finishes. Disconnect removes only Pulse's entries, and Connect backs up settings.json first. I wrote up the details here: https://pulse-bot.dev/blog/claude-code-hooks-allow-button/

It also does a few non-Claude things because it was sitting there anyway: now playing with synced lyrics, timers, notes and reminders, a file shelf, clipboard history.

What's rough, honestly:
- It's Electron: about 315 MB right after launch on Windows. That's down from about 530 MB after I replaced a PowerShell media bridge with a 12 KB C# helper (https://pulse-bot.dev/blog/electron-memory-530-to-315/), but it's still a lot for what it is.
- The builds aren't code-signed yet, so SmartScreen warns on Windows and macOS needs "Open Anyway". The release builds are made on GitHub Actions, and you can build it yourself in a few commands.
- No Linux yet.
- No account, no analytics, no server of its own. The only network calls are lyrics (lrclib.net, can be turned off) and an update check against GitHub.

It's MIT licensed, plain CommonJS, no build step. It's an independent project, not affiliated with Anthropic.

I'd especially like feedback on: the security model of the local hook server (what would you change?), whether the permission flow feels safe to use, and ideas for making it lighter than Electron without losing the transparent always-on-top window on both OSes.
```

---

## 2. Reddit

Space these out: one subreddit per day at most, never the same text twice. See [plan.md](plan.md) for days and times.

> **Check each subreddit's rules before posting.** Reddit is blocked from this session, so I couldn't read the rules pages, and nothing below quotes them. For each one, open the rules link, then confirm:
> 1. Are self-made projects allowed, and on which days (some subs only allow them in a weekly thread or on certain days)?
> 2. Which flair to use (look at the flair list in the post form).
> 3. Whether you must disclose that you made it (do it anyway, in the first line).
> 4. Any title format, link-vs-text-post rule, or account karma/age minimum.
> 5. Any rule about AI-written posts (write or rewrite these in your own words regardless).
>
> Write what you find in the box under each post, so you have it next time.

### r/ClaudeAI

Rules: https://www.reddit.com/r/ClaudeAI/about/rules · Flair: _(check: probably a "showcase"/"built with Claude" style flair)_

> Rules checked on: ____ · Self-promo allowed: ____ · Flair: ____ · Notes: ____

**Title:** `I built a desktop island that shows what Claude Code is doing and lets me Allow/Deny without switching windows`

**Body** (text post; attach the vertical GIF or link the website):

```
I made this, so take it with that in mind.

I kept starting Claude Code on something, switching windows, and coming back to find it had been waiting on a permission prompt for ten minutes. So I built Pulse: a small capsule that hangs from the top of the screen (Windows and macOS).

- The pill shows what Claude is doing right now: reading a file, editing, running a command.
- Permission requests, AskUserQuestion choices and plans show up in the island with Allow / Deny.
- The panel shows a diff of the current edit, command output, jobs done today, and the header shows your 5-hour usage with a countdown to the reset.
- When Claude finishes with a question, you can reply from the island too.

It works through Claude Code's own hooks: "Connect" adds HTTP hooks in ~/.claude/settings.json pointing at 127.0.0.1, protected by a per-install token. Disconnect removes only its own entries. There's a write-up of exactly how it works: https://pulse-bot.dev/blog/claude-code-hooks-allow-button/

Honest caveats: it's Electron (~315 MB), the builds aren't code-signed yet (SmartScreen / "Open Anyway"), and there's no Linux build. Free, MIT, no account, no analytics. It's an independent project, not an Anthropic one.

Code: https://github.com/im-Amrith/Pulse
Site: https://pulse-bot.dev

I'd love to hear what you'd want it to show that it doesn't.
```

### r/ClaudeCode

Rules: https://www.reddit.com/r/ClaudeCode/about/rules · Flair: _(check)_

> Rules checked on: ____ · Self-promo allowed: ____ · Flair: ____ · Notes: ____

**Title:** `Holding a PermissionRequest hook open until you click Allow: how my Claude Code desktop companion works`

**Body** (more technical; this sub uses hooks daily):

```
I've been building Pulse (Windows + macOS, MIT), a small always-on-top island that shows Claude Code's current step and lets you answer permission prompts from it. Disclosure: I made it. I thought the hooks side might be interesting here, whether or not you use the app.

- It uses HTTP hooks (type "http") for 10 events, all POSTing to 127.0.0.1:47900 with an X-Pulse-Token header. Most have a 3 s timeout, so if Pulse isn't running the call just fails and Claude Code carries on.
- PermissionRequest: the server doesn't respond until you click. Allow returns {"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow","updatedInput":{...}}}}. The hook timeout is 310 s; Pulse gives up at 300 s with an empty 200, which means "no decision", so you get the normal terminal prompt.
- If you answer in the terminal instead, the next event for that session releases the held request.
- AskUserQuestion and ExitPlanMode come through the same door; answers go back in updatedInput.
- Replying after Claude stops: a background Stop command hook with asyncRewake long-polls the app. If you type a reply in the island, the script writes it to stderr and exits 2, which wakes Claude with it.
- Connect backs up settings.json and never replaces a status line you already have; Disconnect removes only entries whose URL/command is Pulse's.

Full write-up with code: https://pulse-bot.dev/blog/claude-code-hooks-allow-button/
Repo: https://github.com/im-Amrith/Pulse

Caveats: Electron (~315 MB), unsigned builds, no Linux yet. Not affiliated with Anthropic.

If you've built something on PermissionRequest hooks, I'm curious how you handle timeouts and answers given in the terminal.
```

### r/SideProject

Rules: https://www.reddit.com/r/SideProject/about/rules · Flair: _(check)_

> Rules checked on: ____ · Self-promo allowed: ____ · Flair: ____ · Notes: ____

**Title:** `Pulse: a little "living island" for the top of my screen, with eyes that react to what my AI coding assistant is doing`

**Body** (story and product; attach the 16:9 promo or the README GIF):

```
This started as a weekend fix for one annoyance and turned into a small app I use all day.

The annoyance: I use Claude Code, and it often stops to ask permission while I'm in another window. So I made a capsule that hangs from the top of my screen. It has two eyes: they blink, glance at the cursor, scan while Claude works, hop when it needs me, smile when the job is done and droop when it fails. Hover over it (or Ctrl+Alt+P) and it unfolds into a panel where I can Allow or Deny.

Once it was there, it collected other things: now playing with synced lyrics, focus timers, notes and reminders in plain words ("in 20 min"), a launcher, a file shelf with phone transfer by QR code, clipboard history, and custom colours.

Some numbers and lessons:
- Windows + macOS from one plain-JavaScript Electron codebase, no build step
- Memory at launch went from ~530 MB to ~315 MB when I replaced a PowerShell bridge with a 12 KB C# helper (write-up: https://pulse-bot.dev/blog/electron-memory-530-to-315/)
- The Mac RAM readout said 99% until I learned how macOS counts memory (https://pulse-bot.dev/blog/mac-99-percent-ram/)

It's free and MIT licensed, no account and no analytics. Rough edges: unsigned builds (Windows SmartScreen / macOS "Open Anyway") and Electron's memory use.

Site: https://pulse-bot.dev · Code: https://github.com/im-Amrith/Pulse

Feedback on the idea, the design or the landing page is very welcome.
```

### r/Windows11

Rules: https://www.reddit.com/r/Windows11/about/rules · Flair: _(check: there's often an "App" or "Concept/Showcase" flair)_

> Rules checked on: ____ · Self-promo allowed: ____ · Flair: ____ · Notes: ____

**Title:** `I made a free, open-source "island" for the top of the Windows 11 screen: now playing with lyrics, timers, clipboard, and a coding assistant monitor`

**Body** (lead with what any Windows user gets; Claude Code second):

```
Disclosure: I'm the developer. It's free and open source (MIT), no account, no ads.

Pulse is a small black capsule that hangs from the top centre of the screen. Hover over it (or press Ctrl+Alt+P) and it unfolds into a panel:

- Music: whatever's playing in Spotify, a browser or most players (it reads the same media controls as the Windows volume flyout), with synced lyrics in the pill (lyrics come from lrclib.net and can be turned off)
- Time: focus sessions, named timers, a stopwatch
- Plan: notes and reminders in plain words ("tomorrow 9am")
- Tray: drop files on it, drag them out later, or send files to and from your phone with a QR code (local network only)
- Clipboard history, an app launcher, custom colours
- If you use Claude Code, it shows what it's doing and lets you allow or deny its requests

Windows details people usually ask about:
- It's Electron, about 315 MB at launch. Music and volume go through a 12 KB native helper using the WinRT media session API and Core Audio, which cut ~70 MB compared with my earlier PowerShell version.
- It isn't code-signed yet, so SmartScreen will say "Windows protected your PC" → More info → Run anyway. The release zip is built on GitHub Actions, and the source is there if you'd rather build it.
- Portable zip, no installer. It adds a Start menu shortcut so you can search for it.

Download and screenshots: https://pulse-bot.dev
Source: https://github.com/im-Amrith/Pulse
```

### r/macapps (later)

Wait until the Mac build is signed and notarized (see [plan.md](plan.md#later-not-now)). r/macapps readers are wary of unsigned apps, and "Open Anyway" will dominate the comments. Draft it then, with a Mac-first angle: notch, menu bar, works over full-screen apps, `Cmd+Alt+P`.

---

## 3. X / Twitter thread

Attach `promo/final/pulse-promo-1920x1080.mp4` to tweet 1 (30 s). Post from your account; reply-chain the rest.

**1/**
```
I kept leaving Claude Code waiting on a permission prompt while I was in another window.

So I built Pulse: a little island at the top of my screen that shows what Claude is doing, and lets me Allow or Deny in one click.

Free and open source, Windows + macOS. 🧵
```
_(attach the 16:9 promo)_

**2/**
```
The pill shows the current step: reading a file, editing, running a command.

Hover (or Ctrl+Alt+P) and it unfolds: a diff of the edit, command output, jobs done today, a model picker, and your 5-hour usage with a countdown to the reset.
```
_(attach `website/assets/shots/claude-working.png`)_

**3/**
```
Permission requests, AskUserQuestion choices and plans land in the island.

Under the hood it's Claude Code's own hooks: an HTTP hook to 127.0.0.1, held open until you click. If you don't answer in 5 min, the terminal prompt takes over.

How it works → https://pulse-bot.dev/blog/claude-code-hooks-allow-button/
```
_(attach `website/assets/shots/permission.png`)_

**4/**
```
The eyes do the rest: they blink, glance at your cursor, scan while Claude works, hop when it needs you, smile when it's done and droop when it fails.

It also does music with synced lyrics, focus timers, notes, reminders, a file shelf and clipboard history.
```
_(attach `website/assets/shots/pill-done.png` or `music.png`)_

**5/**
```
Privacy: no account, no analytics, no server of its own.

Hooks go to 127.0.0.1 with a per-install token. The only network calls are lyrics (lrclib.net, optional) and an update check on GitHub.
```

**6/**
```
Honest bits: it's Electron (~315 MB, down from ~530 MB after a 12 KB native helper replaced PowerShell), and the builds aren't code-signed yet.

MIT licensed, plain JS, no build step. PRs and starter issues welcome.
https://github.com/im-Amrith/Pulse
```

**7/**
```
Download: https://pulse-bot.dev

Independent project for Claude Code, not affiliated with Anthropic. Feedback very welcome.
```

---

## 4. Product Hunt (later: after code signing)

Launch only once the builds are signed and notarized ([plan.md](plan.md#later-not-now)). Product Hunt's comment sections focus on install friction, and an unsigned app will get stuck there.

- **Name:** Pulse
- **Tagline** (57 characters): `A living island for your desktop that follows Claude Code`
  - Alternatives: `See what Claude Code is doing and Allow it in one click` (55) · `Your desk, with a pulse: Claude Code, music, timers, notes` (58)
- **Links:** https://pulse-bot.dev · https://github.com/im-Amrith/Pulse
- **Pricing:** Free (open source)
- **Topics:** Developer Tools, Productivity, Artificial Intelligence, Mac, Windows, Open Source

**Description** (under 260 characters):
```
Pulse hangs from the top of your screen and shows what Claude Code is doing. Permission requests, questions and plans appear with Allow / Deny. Music with lyrics, timers, notes and clipboard are one hover away. Free, open source, Windows and macOS.
```

**First maker comment:**
```
Hi Product Hunt! I'm Amrithesh, and I made Pulse.

I use Claude Code a lot, and I kept coming back to a terminal that had been waiting on a "yes" for ten minutes. Pulse is my fix: a small capsule at the top of the screen with two eyes. It shows the current step, unfolds into a panel when you hover, and lets you Allow or Deny without switching windows. When Claude finishes with a question, you can reply from the island too.

Since it was sitting there anyway, it also does now playing with synced lyrics, focus timers, plain-language reminders, a launcher, a file shelf with phone transfer, and clipboard history.

A few things I care about:
• Privacy: no account, no analytics, no server. Claude Code talks to it over 127.0.0.1 with a per-install token.
• Open source (MIT), so you can read exactly what "Connect" changes in your settings.
• Honesty: it's Electron (~315 MB), and it's an independent project, not affiliated with Anthropic.

I'd love to hear what you'd add, and what feels off.
```

**Gallery** (1270×760; build from the shots, gold-on-black frame like the social preview):
1. **Hero:** the promo poster frame (`promo/final/pulse-promo-poster.jpg`) with "Your desk, with a pulse."
2. **Allow in one click:** `website/assets/shots/permission.png`, caption "Permission requests, right where you're looking"
3. **Live Claude Code view:** `website/assets/shots/claude-working.png`, "The current step, the diff, the output"
4. **The pill's moods:** `pill-working.png`, `pill-done.png` and `pill-lyrics.png` stacked, "Working, done, playing"
5. **Everything else:** a 2×2 of `music.png`, `time.png`, `plan.png`, `launcher.png`, "One hover away"

Also upload the 16:9 promo as the gallery video (YouTube link).

---

## 5. Anthropic / Claude Discord

Post in the community showcase channel (read its pinned rules first; some showcase channels want one post per project and no repeated bumps).

```
Hi all! I made a small open-source desktop app for Claude Code called Pulse (Windows + macOS).

It's a little island at the top of the screen that shows what Claude Code is doing right now, and lets you Allow/Deny permission requests, answer AskUserQuestion choices and approve plans without switching back to the terminal. It works through Claude Code's HTTP hooks to 127.0.0.1 with a per-install token.

Free, MIT, no account or analytics. Electron, and unsigned for now. It's an independent project, not an official one.

Site + 30 s video: https://pulse-bot.dev
Code: https://github.com/im-Amrith/Pulse

Feedback welcome, especially on the permission flow.
```

---

## 6. awesome-claude-code

**Which list:** [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code). I also found [karanb192/awesome-claude-code-mods](https://github.com/karanb192/awesome-claude-code-mods) (mods built with hooks); its contribution rules weren't checked.

**Rules found in its CONTRIBUTING.md and issue form** (read in this session; check again before submitting):
- Submit **only through the web issue form**, not a PR, and not with `gh`: https://github.com/hesreallyhim/awesome-claude-code/issues/new?template=recommend-resource.yml . Their CONTRIBUTING warns that other routes can get you temporarily restricted.
- **Eligibility:** the repo must be at least **14 days old** (since the first commit on the default branch) **and** show signs of active development, **or** have at least 100 stars. Pulse's first commit is 4 Nov 2026, so **submit on or after 18 Nov 2026**. Earlier submissions are closed automatically.
- One resource at a time.
- "Resource recommendations must be created by human beings." So **fill the form yourself, in your own words**. The notes below are facts to draw from, not text to paste.
- Descriptions: "Descriptive, not promotional. Don't address the reader", 1 to 3 sentences, 10 to 500 characters, one line, no emojis.
- Signup or payment requirements block a review. Pulse needs neither, which helps.

**Form fields, with notes:**

| Field | Notes |
| --- | --- |
| Display Name | `Pulse` |
| Category | Best fits: **Observability & Monitoring > Session Monitors** (it shows live session state from hooks). Alternatives: **Remote Control, Notifications & Voice I/O** (answering permission prompts away from the terminal) or **Alternative Clients**. Look at what's already in each before choosing. |
| Link | `https://github.com/im-Amrith/Pulse` |
| Author Name | `Amrithesh S Menon` (or `im-Amrith`) |
| Author Link | `https://github.com/im-Amrith` |
| Description | Facts to work from: a desktop app for Windows and macOS; uses Claude Code HTTP hooks to 127.0.0.1 with a per-install token; shows the current tool step, diff and command output; answers `PermissionRequest`, `AskUserQuestion` and plan approval from an always-on-top window; replies after `Stop` through an `asyncRewake` hook; shows 5-hour usage from the status line; MIT. Keep it descriptive, e.g. what it does and how, not why it's great. |
| Checklist | Tick only what you've actually done: visited the list and checked Pulse isn't a duplicate of an existing entry, links work, it's specific to Claude Code, you read CONTRIBUTING.md. Leave the trap box unticked. |

After approval they invite you to add their badge to the README.
