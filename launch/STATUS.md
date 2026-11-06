# Launch status

Where the Pulse launch stands: what's been done, what's waiting on you (Amrithesh), and what Claude does next.
Last updated: 6 November 2026.

**Nothing has been posted or deployed yet.** #10, #13 and #16 are merged; the website (#11) and this launch kit (#12) are still open.

> **Testing on a Mac:** Amrithesh works on Windows and has no Mac. Mac changes are reviewed from the code and the macOS CI job (`macos-15`), plus a friend's Mac when a real-device check is needed. Commands in this file are written for Windows.

## Contents
1. [Done](#1-done)
2. [Waiting on you](#2-waiting-on-you)
3. [What Claude does next](#3-what-claude-does-next)
4. [Things to double-check](#4-things-to-double-check)
5. [Later (Phase 5)](#5-later-phase-5)

---

## 1. Done

### Pull requests

| PR | Branch | What | Merging it… |
| --- | --- | --- | --- |
| [#10](https://github.com/im-Amrith/Pulse/pull/10) | `claude/confident-cerf-8pbu4d` | Phase 1: open-source polish | changes the repo only |
| [#11](https://github.com/im-Amrith/Pulse/pull/11) | `claude/website-star-button` | Phase 2 + blog posts: website | **deploys pulse-bot.dev** once the Cloudflare secrets are set |
| [#12](https://github.com/im-Amrith/Pulse/pull/12) | `claude/launch-kit` | Phase 3: launch kit (this folder) | changes the repo only |

**Since Checkpoint 3 (6 Nov):**

| PR / issue | State |
| --- | --- |
| [#10](https://github.com/im-Amrith/Pulse/pull/10) open-source polish | **merged**; `windows.yml` run by hand on 6 Nov: success |
| [#13](https://github.com/im-Amrith/Pulse/pull/13) by @Saikat556: "Notifications" label on macOS (closes #1) | **merged**, the first outside contribution |
| [#16](https://github.com/im-Amrith/Pulse/pull/16) CI: `macos-14` → `macos-15` (GitHub retired the macos-14 image on 2 Nov) | **merged**; #11 and #12 have `main` merged in, so they use macos-15 too |
| [#15](https://github.com/im-Amrith/Pulse/pull/15) by @laozhej: tests for `store.js` (closes #3) | open; its CI run needs **Approve and run workflows** |
| [#14](https://github.com/im-Amrith/Pulse/pull/14) Dependabot: Electron 38 → 42 | open; needs a real review (CI skips the Electron binary) |
| [#5](https://github.com/im-Amrith/Pulse/issues/5) keyboard-accessible Plan checkboxes | claimed by @laozhej, not assigned yet |
| `loadToken()` keeps old file permissions when it replaces a bad `hook-token` | found while reviewing #15; see section 3 |

### Phase 1: open-source polish ([#10](https://github.com/im-Amrith/Pulse/pull/10))
- **README:**
  - 9-second demo loop at the top (`.github/media/pulse-demo.gif`, 4.3 MB, cut from the 16:9 promo); the poster shows for reduced-motion users
  - badges: release, licence, CI, platforms, stars
  - ⭐ call to action
  - FAQ: Is it safe? What does Connect change? Why Electron? Why unsigned? Linux? Is it official?
  - a note that release builds are made on GitHub Actions
- **CHANGELOG.md:** 0.1.0 → 0.2.2, from the git history and the Pulse-releases notes.
- **CODE_OF_CONDUCT.md:** Contributor Covenant 2.1. Reports go through GitHub private reporting or an issue. No email address.
- **`.github/pull_request_template.md`**, matching CONTRIBUTING.md.
- **`.github/workflows/windows.yml`:** on `v*` tags (or by hand) it runs:
  - the tests
  - a check that the tag matches `package.json`
  - `npm run release` on `windows-latest`
  - a smoke test of the built `Pulse.exe`

  Then it uploads `Pulse-win-x64.zip` and its `.sha256` as an artifact. **It never publishes a release.**
- **`.github/media/social-preview.png`** (1280×640, gold on black).
- **CONTRIBUTING.md and SECURITY.md:** improved (Node 22, starter issues, how releases work, what's out of scope).
- **Starter issues** (already open on GitHub):
  - [#1](https://github.com/im-Amrith/Pulse/issues/1) Settings says "Windows notifications" on macOS (a real bug found in the code)
  - [#2](https://github.com/im-Amrith/Pulse/issues/2) Settings toggle to hide CPU and RAM
  - [#3](https://github.com/im-Amrith/Pulse/issues/3) Tests for `store.js`
  - [#4](https://github.com/im-Amrith/Pulse/issues/4) More colour themes
  - [#5](https://github.com/im-Amrith/Pulse/issues/5) Plan checkboxes can't be used with the keyboard
  - [#6](https://github.com/im-Amrith/Pulse/issues/6) Keyboard navigation in the panel
  - [#7](https://github.com/im-Amrith/Pulse/issues/7) Accessibility pass
  - [#8](https://github.com/im-Amrith/Pulse/issues/8) Localisation groundwork
  - [#9](https://github.com/im-Amrith/Pulse/issues/9) Investigate Linux support

### Phase 2: website ([#11](https://github.com/im-Amrith/Pulse/pull/11))
- **Star on GitHub** ghost button in the nav, under the download buttons, and in the footer.
  - One request to the GitHub API, cached for an hour.
  - If the request fails, the count hides and the button still works.
  - On phones the nav version shows the mark and the count only.
  - The `aria-label` includes the count. No third-party iframe.
- **Open source:** a "Free and open source · MIT" line above the hero, and a "Built in the open" block (code, CONTRIBUTING, good first issues).
- **SEO:**
  - the title and description now cover Windows and macOS
  - Open Graph and Twitter tags, `website/assets/og.jpg` (1200×630)
  - canonical URL, `robots.txt`, `sitemap.xml`
  - the old "0.1.0" text is replaced from `version.json`
- **Blog at `/blog/`:** plain HTML in the site's style.
  - `npm run blog` builds the index, the RSS feed (`feed.xml`) and the sitemap; every deploy runs it.
  - New posts start from `website/blog/_template.html`.
- **`.github/workflows/site.yml`:** deploys `website/` to Cloudflare Pages on pushes to `main`, and skips the deploy until the secrets exist. `node scripts/deploy.js --build` builds without deploying.
- **Checked locally** at 1440 px and 375 px:
  - no horizontal scroll and no console errors
  - star count shown when the API answers; hidden, with working buttons, when it's blocked
- The sphere bot, background videos, promo film and motion are unchanged.

### Phase 3: content
- **Blog posts** (on [#11](https://github.com/im-Amrith/Pulse/pull/11)):
  - [Cutting an Electron app's memory from 530 MB to 315 MB with a 12 KB native helper](https://pulse-bot.dev/blog/electron-memory-530-to-315/)
  - [How Pulse sits between Claude Code and your Allow button](https://pulse-bot.dev/blog/claude-code-hooks-allow-button/)
  - [Why your Mac says 99% RAM (and how Activity Monitor really counts it)](https://pulse-bot.dev/blog/mac-99-percent-ram/)

  (The links work once #11 is merged and deployed.)
- **Launch kit** (on [#12](https://github.com/im-Amrith/Pulse/pull/12), this folder):
  - [posts.md](posts.md): Show HN, Reddit ×4, X thread, Product Hunt (for later), Discord, awesome-claude-code notes
  - [shorts.md](shorts.md): 15 hooks with captions, hashtags and footage; YouTube titles and descriptions with chapters; 5 follow-up short ideas
  - [plan.md](plan.md): two-week calendar in IST and US time, spacing rules, replies to common questions, measuring, later steps with costs
  - [devto/](devto/): the three posts for dev.to and Hashnode, with `canonical_url` set to pulse-bot.dev

---

## 2. Waiting on you

Do these in order. Tell Claude "done" (or paste the error) after each group.

### Already done
- Labels `idea`, `mac` and `windows` created and applied (#1 `mac`; #2, #4, #8, #9 `idea`).
- Discussions on, social preview uploaded, repo pinned, Dependabot alerts and security updates on.
- #10 merged and the Windows workflow tested.

### A. Contributors
1. On [#15](https://github.com/im-Amrith/Pulse/pull/15), choose **Approve and run workflows**. Merge when `test (windows-latest)`, `test (macos-15)` and `test (ubuntu-latest)` pass.
2. Post the drafted replies on #15 and #5, then assign @laozhej to [#5](https://github.com/im-Amrith/Pulse/issues/5).

### B. Protect `main`
1. At https://github.com/im-Amrith/Pulse/settings/rules, choose **New ruleset → New branch ruleset**, and target the default branch.
2. Turn on **Require status checks to pass**, and add `test (windows-latest)`, `test (macos-15)` and `test (ubuntu-latest)`.
3. Turn on **Block force pushes** and **Restrict deletions**.

### C. Discussions
Post the welcome post in **Announcements** and pin it. Keep Announcements, Q&A, Ideas and Show and tell; delete General and Polls.

### D. GitHub Sponsors
Sign up at https://github.com/sponsors. Tell Claude when you're approved; Claude then adds `.github/FUNDING.yml` (`github: im-Amrith`).

### E. Cloudflare (for automatic deploys and analytics)
1. **API token** at https://dash.cloudflare.com/profile/api-tokens → **Create Custom Token**:
   - name `pulse-github-deploy`
   - permissions **Account → Cloudflare Pages → Edit** only
   - account resources **Include → your account**
   - no IP filtering, expiry 1 year
   - copy the token. **Don't paste it into chat.**
2. **Account ID:** at https://dash.cloudflare.com, open **Workers & Pages** and copy the **Account ID**.
3. **GitHub secrets** at https://github.com/im-Amrith/Pulse/settings/secrets/actions: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
4. **Web Analytics:** **Workers & Pages → pulse → Metrics → Web Analytics → Enable**. No token or code needed.
5. **Tell Claude before merging #11.** Merging deploys the live site.

### F. Edit the drafts before anything is posted
1. **Subreddit rules:** Reddit was blocked from Claude's session, so no rules are quoted. For each subreddit, open its rules page and fill in the box under its draft in [posts.md](posts.md) (self-promo allowed, which days, flair, title format).
2. **Show HN rules:** HN was blocked too. Read https://news.ycombinator.com/showhn.html and https://news.ycombinator.com/newsguidelines.html.
3. **Rewrite the posts in your own words.** Communities notice copy-paste, and awesome-claude-code requires recommendations to be written by a person.
4. **Post 3 (Mac RAM) needs a real measurement.** The "99% → 46%" table uses the made-up `vm_stat` sample from `test/features.test.js`, not a reading from a real Mac, but the post says "Same machine, same moment". Either ask your friend to run `vm_stat` and note Pulse's old and new figures on their Mac (and decide whether to credit them), or reword it as a worked example. This applies to the blog copy on #11 and `launch/devto/mac-99-percent-ram.md`.
5. **Check the claim in post 1** that you measured before/after totals rather than each change separately. Change it if you measured more.
6. **Set the start date.** The plan assumes Day 1 is Tuesday 10 November 2026. If that changes, tell Claude and the calendar can be shifted.

### G. Posting (Phase 4, with Claude)
Post each piece yourself, from your own accounts, in the order in [plan.md](plan.md). Paste each link back to Claude.

| Day | Channel | Account |
| --- | --- | --- |
| 1 | Show HN, then the X thread, then Discord | Hacker News, X, Discord |
| 2 | r/ClaudeAI | Reddit |
| 3 | dev.to / Hashnode (hooks post); YouTube 16:9 promo | dev.to / Hashnode, YouTube |
| 4 | r/ClaudeCode | Reddit |
| 5, 7, 10, 12 | Shorts / Reels / TikTok | YouTube, Instagram, TikTok |
| 8 | dev.to / Hashnode (memory post); r/SideProject | dev.to / Hashnode, Reddit |
| 9 (18 Nov or later) | awesome-claude-code issue form | GitHub |
| 10 | r/Windows11 | Reddit |
| 11 | dev.to / Hashnode (Mac RAM post) | dev.to / Hashnode |
| 14 | Recap post and a "Two weeks of Pulse" Discussion | X, GitHub |

Never ask for upvotes or stars, and space the subreddits at least a day apart.

### H. Measure (daily, during the two weeks)
Run the `gh api` commands in [plan.md](plan.md#measuring) once a day and note the numbers; GitHub keeps traffic for 14 days only. Check Cloudflare Web Analytics for visits and referrers.

---

## 3. What Claude does next

| When | What |
| --- | --- |
| After you confirm Sponsors (B) | Commit `.github/FUNDING.yml` (`github: im-Amrith`) on a branch and open a PR |
| If @laozhej doesn't take the `loadToken()` fix | Fix it on a branch: `fs.chmodSync(file, 0o600)` after writing (`mode` only applies when Node creates the file), plus a test for replacing an existing bad token. No effect on Windows, which ignores POSIX modes. |
| Before merging #14 | Review Electron 39–42 breaking changes against Pulse's code (transparent window, `beginFrameSubscription`, `globalShortcut`, preload/contextIsolation), and ask a friend with a Mac or run the Windows build to smoke-test |
| After you've edited the drafts | Fold your edits into `launch/` and the blog posts, re-check limits (titles, tweets), and push |
| Before #11 is merged | Re-check the blog after your edits, and confirm with you that the secrets are set |
| After #11 is merged | Check https://pulse-bot.dev shows the star button, the blog and the three posts, that the OG image appears, and that the Actions run deployed (or skipped cleanly) |
| Phase 4, each posting day | Walk you through the next channel in the plan; after you paste the link, draft replies to the first comments when you ask |
| If the start date changes | Shift every date in [plan.md](plan.md) |
| Bugs reported during the launch | Open issues with details. App behaviour isn't changed without your OK. |

Claude won't post, merge to `main`, deploy, create releases or change settings without your explicit OK for that specific action.

---

## 4. Things to double-check

- **Site palette.** The live site uses its ink-blue palette, so the star button follows it. The OG image and the social preview are gold on black. Say if you want the OG image in blue to match the site.
- **Star count.** It was tested with a mocked API response and with the API blocked. The real count shows once the site is live.
- **CDN check.** Claude's session couldn't reach jsDelivr or Google Fonts. The local test used the same pinned versions of three, GSAP and Lenis from npm, and local fonts. After deploying, open the live site once on desktop and phone.
- **Release builds wording.** The README says release zips are built on GitHub Actions, and that the 0.2.2 Windows zip was built on your PC. From the next release on, publish the zip from the workflow artifact, so that statement stays true.
- **awesome-claude-code eligibility:** the repo must be 14 days old, so **18 November 2026** or later, or have 100+ stars.
- **Blog post dates** are all 5 November 2026. If you publish later, change `pulse:date` and the visible date in each post, then run `npm run blog`.

---

## 5. Later (Phase 5)

Written up with costs in [plan.md → Later](plan.md#later-not-now). Not started.
1. **Code signing:** Azure Trusted Signing (~$10/month) for Windows, and the Apple Developer Program ($99/year) for notarization. About $220/year for both. Both build scripts already support signing once the secrets exist.
2. **After signing:** post to r/macapps and launch on Product Hunt (drafts in [posts.md](posts.md)).
3. **Linux build investigation** ([#9](https://github.com/im-Amrith/Pulse/issues/9)).
4. **Sponsors tiers:** a $3 Supporter, a $10 Backer, and a one-time "signing fund". No features locked behind sponsorship.
5. **A possible "Pulse Pro"** (~$5–9 one-time) for extras only. The core stays free and MIT. Decide after the launch numbers are in.
