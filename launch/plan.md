# Launch plan

Two weeks, one channel at a time. Drafts are in [posts.md](posts.md) and [shorts.md](shorts.md); the dev.to/Hashnode versions of the blog posts are in [devto/](devto/).

**Times.** The US is on standard time from 1 November, so: **ET = UTC−5, PT = UTC−8, IST = UTC+5:30**. IST is **10 h 30 min ahead of ET** and 13 h 30 min ahead of PT. Example: 08:30 ET = 05:30 PT = 19:00 IST.

**Dates.** The example dates assume Day 1 is **Tuesday 10 November 2026**. If you start later, shift everything, but keep Show HN on a Tuesday or Wednesday.

## Before Day 1 (checklist)

- [ ] Phase 1 PR merged: README with the demo GIF, CHANGELOG, Code of Conduct, Windows workflow
- [ ] Repo settings done: Discussions on, social preview uploaded, repo pinned, Dependabot on, `main` protected
- [ ] Website PR merged and live: star button, blog and the three posts at pulse-bot.dev/blog/, OG image shows when you paste the link into a chat app
- [ ] Cloudflare Web Analytics turned on
- [ ] Download both builds from the website on a clean machine (or a fresh user account) and run through the install steps once
- [ ] Starter issues have labels (`idea`, `mac`, `windows` created)
- [ ] Note your baseline numbers (see [Measuring](#measuring)): stars, release downloads, site visits

## The two weeks

| Day | Date | What | When (IST) | When (US) | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | Tue 10 Nov | **Show HN** | 19:00 | 08:30 ET / 05:30 PT | URL = the repo. Post the first comment at once. Keep the evening free: answer every question for the first 3–4 hours. |
| 1 | Tue 10 Nov | **X thread** (16:9 video) | 21:30 | 11:00 ET / 08:00 PT | Link the HN thread only if someone asks; don't ask anyone to vote. |
| 1 | Tue 10 Nov | Claude Discord showcase | 22:00 | 11:30 ET | One message, then answer replies. |
| 2 | Wed 11 Nov | **r/ClaudeAI** | 19:30 | 09:00 ET / 06:00 PT | Check rules and flair first ([posts.md](posts.md#rclaudeai)). |
| 3 | Thu 12 Nov | dev.to / Hashnode: **hooks post** | 18:30 | 08:00 ET | `canonical_url` already points to pulse-bot.dev. |
| 3 | Thu 12 Nov | **YouTube**: 16:9 promo | 20:30 | 10:00 ET | Title, description and chapters in [shorts.md](shorts.md#youtube-the-169-promo). |
| 4 | Fri 13 Nov | **r/ClaudeCode** | 19:30 | 09:00 ET | The technical version. Different text from r/ClaudeAI. |
| 5 | Sat 14 Nov | Shorts / Reels / TikTok: vertical promo | 21:30 | 11:00 ET | Hook #3 ("Stop babysitting the terminal"). |
| 6 | Sun 15 Nov | Rest. Answer comments, triage new issues. | | | |
| 7 | Mon 16 Nov | Short #2 | 21:30 | 11:00 ET | Hook #1. |
| 8 | Tue 17 Nov | dev.to / Hashnode: **memory post** | 18:30 | 08:00 ET | |
| 8 | Tue 17 Nov | **r/SideProject** | 20:30 | 10:00 ET | The story version. |
| 9 | Wed 18 Nov | **awesome-claude-code** submission | any time | | First eligible day (repo is 14 days old). Fill the form yourself ([posts.md](posts.md#6-awesome-claude-code)). |
| 10 | Thu 19 Nov | **r/Windows11** | 19:30 | 09:00 ET | The Windows-user version: music, timers, clipboard first. |
| 10 | Thu 19 Nov | Short #3 | 21:30 | 11:00 ET | Hook #9 (530 → 315 MB) pairs with the memory post. |
| 11 | Fri 20 Nov | dev.to / Hashnode: **Mac RAM post** | 18:30 | 08:00 ET | |
| 12 | Sat 21 Nov | Short #4 | 21:30 | 11:00 ET | Hook #10 (Mac 99% RAM). |
| 13 | Sun 22 Nov | Rest. | | | |
| 14 | Mon 23 Nov | Recap: numbers, what you learned, what's next | 21:30 | 11:00 ET | A short X post and a GitHub Discussion ("Two weeks of Pulse"). Then plan 0.2.3 from the issues. |

**Spacing rules**
- **One subreddit per day, at most,** with at least a day between them. Never cross-post the same text; each draft is written for its community.
- **Don't post to a subreddit twice** in this window. If a post is removed, read the removal reason and message the mods; don't repost.
- **One Show HN.** If it doesn't get traction, don't resubmit the same week. HN allows a repost of something that got no attention, but wait and change what you're showing (e.g. a later version).
- **Reply within the first hour** wherever you post. Most of a post's visibility comes early.
- **Never ask for upvotes, stars or "support"**, and don't ask friends to vote. It breaks HN's and most subreddits' rules and gets posts buried.
- Shorts can go to all three platforms the same day; space them 2 days apart.

## Replies to common questions

Write replies in your own words. These are the facts to draw on.

**"Why Electron? 315 MB for this?"**
> Fair. It's Electron because I wanted one plain-JavaScript codebase, with no build step, for a transparent always-on-top window on both Windows and macOS, built by one person. It was ~530 MB; replacing a PowerShell media bridge with a 12 KB C# helper and drawing less glow got it to ~315 MB ([write-up](https://pulse-bot.dev/blog/electron-memory-530-to-315/)). I'd love a lighter version. If you know how to keep the transparent window and the hooks on both systems with something smaller, I'm open to it.

**"Why isn't it signed? Is the unsigned binary safe?"**
> Signing costs money every year (a Windows signing service, and $99/year for Apple's developer program), and Pulse is free, so it's not signed yet; it's planned. Meanwhile: the release builds are made on GitHub Actions from the public source, each release lists its SHA-256, and you can build it yourself in four commands (README → Build it yourself).

**"Linux?"**
> Not yet, and I haven't tried it on a Linux desktop. Most of it is plain Node/Electron, but media (MPRIS), Wi-Fi status, the click-through transparent window on X11/Wayland, and packaging all need work. There's an issue for it: https://github.com/im-Amrith/Pulse/issues/9. Help welcome.

**"Is this official / made by Anthropic?"**
> No. It's an independent open-source project for Claude Code. It isn't affiliated with or endorsed by Anthropic. It only uses Claude Code's public hooks.

**"Can another app approve things through it?"**
> The hook server only listens on 127.0.0.1, only accepts POST, and every request needs a random per-install token, compared in constant time. Web pages can't send that custom header cross-origin without a preflight, which Pulse never answers. If you find a way around it, please report it privately: https://github.com/im-Amrith/Pulse/security/advisories/new

**"What does it change in my Claude Code settings?"**
> Only `~/.claude/settings.json`, after making a backup: ten HTTP hooks to 127.0.0.1, one background Stop hook for replies, and a status line only if you don't have one. Disconnect removes exactly those. Details in the README FAQ.

**"Does it send my code or prompts anywhere?"**
> No. There's no account, analytics or server. The only network calls are lyrics from lrclib.net (song title, artist and length; you can turn it off) and an update check against GitHub. Ask Pulse runs your own `claude -p`.

**"Why not just use notifications?"**
> Pulse does show a notification when it's not in focus, but a notification can't hold the request open and answer it. Pulse returns your Allow/Deny to Claude Code directly, and shows the diff or command so you can decide.

## Measuring

Run these once a day and paste the numbers into a note (a spreadsheet is fine). GitHub only keeps traffic data for 14 days, so record it daily.

```bash
gh api repos/im-Amrith/Pulse --jq '{stars: .stargazers_count, forks: .forks_count, watchers: .subscribers_count, open_issues: .open_issues_count}'
```

```bash
gh api repos/im-Amrith/Pulse/traffic/views --jq '{views: .count, unique: .uniques}'
```

```bash
gh api repos/im-Amrith/Pulse/traffic/clones --jq '{clones: .count, unique: .uniques}'
```

```bash
gh api repos/im-Amrith/Pulse/traffic/popular/referrers --jq '.[] | "\(.referrer): \(.count) views, \(.uniques) unique"'
```

```bash
gh api repos/im-Amrith/Pulse-releases/releases --jq '.[] | "\(.tag_name): " + ([.assets[] | "\(.name)=\(.download_count)"] | join(", "))'
```

The traffic endpoints need push access to the repo, which you have as the owner.

**Website:** Cloudflare dashboard → your account → **Analytics & Logs → Web Analytics → pulse-bot.dev**: visits, page views, top pages (is the blog getting read?) and referrers (HN, Reddit, X, dev.to). No cookies, so numbers are approximate.

**What to look at after two weeks**
- Stars and unique visitors per channel (referrers tell you which posts worked)
- Downloads per release, Windows vs Mac
- Issues and Discussions opened by people other than you (the best sign people are using it)
- Which blog post got the most reads, to decide the next one

---

## Later (not now)

These come after the launch. Costs are approximate; check current prices before you sign up.

### 1. Code signing
- **Windows: Azure Trusted Signing**, about **$10/month** (Basic tier). `scripts/release.js` already supports it (`PULSE_SIGN_DLIB` + `PULSE_SIGN_METADATA`), and it could run inside `windows.yml` with secrets. Check that individual developers in your country are eligible; it has had identity-verification limits for individuals.
- **macOS: Apple Developer Program**, **$99/year**. `mac.yml` already signs and notarizes when the secrets `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` are set.
- **Then:** post to **r/macapps** and launch on **Product Hunt** (drafts in [posts.md](posts.md)). Both audiences are much warier of unsigned apps.
- Total: about **$220/year** for both.

### 2. Linux build investigation
- Tracked in [#9](https://github.com/im-Amrith/Pulse/issues/9). Cost: time only. GitHub Actions minutes for public repos are free.
- First milestone: `npm start` usable on Ubuntu GNOME (X11), then MPRIS media, then an AppImage from electron-builder.

### 3. Sponsors tiers
- Once GitHub Sponsors is approved and `.github/FUNDING.yml` is in. GitHub takes no fee on personal sponsorships.
- Suggested tiers (keep the rewards light, so they don't become work):
  - **$3/month: Supporter.** Thanks in the README.
  - **$10/month: Backer.** Name or logo in the README and on the website's open-source section.
  - **$25 one-time: Signing fund.** Say plainly that it goes toward code signing costs (~$220/year), and show progress.
- Never lock features behind sponsorship. Be clear it's optional.

### 4. A possible "Pulse Pro" (one-time, ~$5–9)
- Only after signing, and only for extras; the core (Claude Code, music, time, plan, launcher, tray, clipboard, themes) stays free and MIT.
- Extra ideas: multiple-machine sync for notes and reminders, more island layouts or animated themes, a per-project activity history. Each would need to respect the privacy promise (no account, no analytics), so anything needing a server is out.
- The code stays MIT. Pro would be a paid convenience build or add-on, sold through a store like Gumroad or Lemon Squeezy (fees around 5–10% plus payment processing). Being open about that model up front avoids "bait and switch" complaints.
- Decide only after the launch numbers show how many people use it daily.
