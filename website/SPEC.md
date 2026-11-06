# Pulse website — build spec (in progress)

Status: built. `index.html`, product shots in `assets/shots/`, footage in `assets/`, and the app zip in `downloads/` (ignored by git; rebuild it from `dist/`).

## Brief
- **What / who:** a download site for Pulse, a desk companion for Windows that follows Claude Code. Visitors are developers and students on Windows.
- **Mood:** nocturnal, alive, precise.
- **Signature:** a real Three.js capsule (Pulse's own shape, ink-blue, two glowing eyes with catchlights) floating centre stage. A pinned scroll section unfolds it into the open card while the heartbeat trace draws itself across the page (SVG stroke scrubbed by ScrollTrigger).
- **Output:** `website/index.html` (single file, CDN libs, pinned versions) plus `website/assets/` (self-hosted media and product shots) and `website/downloads/` (the packaged app).

## Stack (pinned)
- three@0.170.0 (importmap), RoomEnvironment lighting, MeshPhysicalMaterial capsule (CapsuleGeometry), emissive eye meshes
- gsap@3.12.5 + ScrollTrigger, lenis@1.1.13 (smooth scroll, synced with gsap.ticker)
- Fonts: Bahnschrift is Windows-only, so for the web use "Barlow Condensed" (display) + "Inter" (body) from Google Fonts

## Tokens (match the app)
ink #171a2e, well #0f1222, paper #f2f0ff, mist #a9aecb, faint #6c7194, brand #8d9bff, honey #ffc861, mint #79e0b6, rose #ff6b86

## Sections
1. **Hero:** 3D capsule with eyes that track the cursor and blink. H1 "Your desk, with a pulse." Sub: "A living island for Windows that watches Claude Code, answers its questions, and keeps your music, timers and reminders one hover away." CTAs: "Download for Windows" / "See it work".
2. **Pinned stage:** the capsule morphs into the open card through the moods (working ECG, asking honey, done mint smile); copy changes per step.
3. **Feature film strip:** real product shots of each page (Claude, Music + lyrics, Plan, Time, Launcher, Tray), stacking cards that scale down.
4. **Colours:** six theme swatches recolour a live mock card.
5. **Privacy line:** "Runs on your PC. No account. Nothing leaves it."
6. **Download:** big CTA, system requirements (Windows 10/11), file size, version.

## Assets to use (existing, not made from scratch)
- Media shelf (cinematic-web-builder skill, `media/MEDIA.md`): pick a dark ambient loop for the stage background after viewing `sheet-1..6.jpg`; download and self-host it.
- Product shots: capture fresh ones with demo data only (no real song titles, lyrics, Wi-Fi names or personal notes). Use the CDP shoot script approach from the app work.

## Done
- [x] Footage: shelf #16 (blue ribbon, behind the pinned stage) and #26 (lit doorway, behind Download), self-hosted
- [x] Product shots captured with invented demo data only, default Ink theme, transparent background
- [x] index.html built (Three.js capsule, GSAP ScrollTrigger, Lenis)
- [x] Pulse packaged by hand (Electron runtime renamed Pulse.exe, app in resources/app, English locales only), zipped to 120 MB
- [x] Screenshot-and-fix pass in the built-in browser at 1440×900 and 375×812

## Before publishing
- The zip isn't code-signed, so Windows SmartScreen warns on first run (the page says so).
- The site loads three.js, GSAP, Lenis and Google Fonts from CDNs; self-host them if the site must work offline.

## Open source, blog and deploys (added for the launch)
- **Star on GitHub:** a ghost button (GitHub mark and "Star on GitHub") in the nav, under the download buttons and in the footer. No star count, so no request to the GitHub API. On phones the nav version shows only the mark; the aria-label carries the words. No buttons.github.io iframe.
- **Open source:** "Free and open source · MIT" pill above the hero headline, and a "Built in the open" block (code, CONTRIBUTING, good first issues) between Privacy and Download.
- **SEO:** title and description cover Windows and macOS; Open Graph and Twitter tags use `assets/og.jpg` (1200×630, made from the promo poster); canonical URL, `robots.txt`, `sitemap.xml`.
- **Version text:** the static text says the current version (`<span data-version>`); `scripts/deploy.js` stamps it from `version.json` at build time, and the page script updates it again at runtime.
- **Blog** (`/blog/`): hand-written static posts at `blog/<slug>/index.html` (copy `blog/_template.html`), styled by `blog/blog.css`. `npm run blog` (also run by deploy) fills each post's shared nav/footer and writes `blog/index.html`, `blog/feed.xml` and `sitemap.xml`. Files starting with `_` are never published.
- **Deploys:** `.github/workflows/site.yml` runs `scripts/deploy.js` on pushes to `main` that touch `website/**`, using the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets; without them it builds and skips the deploy. `node scripts/deploy.js --build` builds `dist/site` locally without deploying.
- **Analytics:** Cloudflare Web Analytics, turned on in the Pages project (no snippet in the page, no cookies). No other tracker.
