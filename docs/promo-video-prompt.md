Using /hyperframes (with /hyperframes-registry for ready-made blocks and /media-use for music and sound), and the web-animation-skills plugin (60fps-animation, micro-interaction, gsap-web, accessible-animation) for the motion, create a 30-second promo video for my app **Pulse**.

## What Pulse is
Pulse is a small "living island" that sits at the top centre of your Windows or Mac screen. It follows Claude Code live (what it's reading, editing and running), asks before anything risky so you can Allow in one click, smiles when the job is done, and keeps music with synced lyrics, focus timers, reminders, a launcher, a file tray and clipboard history one hover away. It's free, there's no account, and nothing leaves your computer. Website: https://pulse-bot.dev

One-line pitch: **"Your desk, with a pulse."**

## The source
- The app's code is in `D:\comp\pulse` (Electron). Read `src/renderer/` (app.js, style.css, eyes.js) to understand the island's shapes, pages and animations. Don't change how the app behaves.
- I've attached 10 screenshots of the real app in my colours: Home, Claude Code, Music, Ask Pulse, Time, Plan, Launcher, Tray, Clipboard and the folded pill. **Use them only as a reference** for layout, proportions and colour. They contain my personal things (a real song, a downloaded file's name, copied links, my own Claude prompts, my desktop behind the island). **None of that may appear in the video.**
- **Real footage:** the repo has a film mode that records the real island with made-up content: `npm run film` (see `src/main/film.js` and `scripts/film.js`). It runs Pulse in its own empty profile, plays a fictional Claude Code session and a fictional song ("Paper Lanterns" by "The Quiet Hours", lyrics written for the demo), and drives it with a drawn cursor using real mouse events. Frames are saved with transparency, as compressed raw BGRA, in `%TEMP%\pulse-film-frames`, with `frames.json` holding the timings. Extend it rather than faking the UI:
  1. In film mode, set the theme to my colours: `prefs.theme = { main: '#d28a0f', second: '#000000' }`.
  2. Add scenes for the pages the promo needs: Home, Claude (working, then the Allow card), Music with lyrics, Time (start a focus session), Plan (a fictional note and reminder), Launcher (a few generic pins such as "Notes", "Terminal" and "Design"), Tray (fictional files such as `brief.pdf` and `logo.png`) and Clipboard (harmless fictional snippets). Everything must be invented: no real names, paths, songs, Wi-Fi names or URLs.
  3. Add an export option that writes **transparent** clips of each scene (a PNG sequence, or ProRes 4444 / WebM with alpha) instead of compositing onto a backdrop, so HyperFrames can place the island inside the laptop screen.
  4. Keep film mode development-only. It's already excluded from both release builds.
- If the HyperFrames capture tools work better for this, you may run the island's renderer (`src/renderer/index.html`) yourself with a stubbed `window.pulse` API that feeds made-up state. Either way, the footage must be the app's real UI, not a redrawing of it.

## The look: a real laptop, not my desktop
- The hero object is a **laptop seen in 3/4 perspective, then frontal**: thin dark-graphite aluminium body, black bezel, a small camera notch area, subtle reflections on the screen glass, a soft shadow on a dark surface. Generic design: **no Apple logo or other brand marks**.
- **Screen contents are a clean fake desktop**, not mine. Use a calm abstract wallpaper in black and deep amber (generated, or CC0 from /media-use), plus one or two tidy fictional app windows: a code editor with a short invented React file (`Navbar.tsx`) and a terminal running `claude` with the prompt "Make the navbar sticky and give it a soft blur". Keep them minimal and slightly dimmed so the island is the star. Make the taskbar or menu bar generic, or leave it out.
- **True scale matters most.** I want viewers to feel how small the pill is and how big it gets when it opens. The island is a fixed-size panel on a real screen. Treat the laptop screen as a 1536×864 logical-pixel display (a 1920×1080 panel at 125%) and size the island at exactly these proportions of the screen width:
  - folded pill: **252×38 px** (≈16% of the screen width), hanging from the top centre with a 10 px gap (on a Mac it hugs the notch with square top corners)
  - pill while lyrics play: **470×38 px**; while asking for permission: **420×38 px**
  - unfolded panel: **660 px wide, about 350 px tall** (≈43% of the screen width), 26 px corner radius
  - The rest of the screen must stay visible around it. Never blow the island up to fill the frame while it's shown on the laptop.
- For close-ups, **push the camera into the laptop screen** (a smooth dolly into the glass) instead of scaling the UI. Then pull back out so the true size is felt again. At least twice in the video, show the full laptop with the folded pill, then the full laptop with the unfolded panel.

## Brand
- Colours (my current Pulse theme): main/accent **#D28A0F** (warm gold), body **#000000** (black). Supporting colours: near-black surfaces #0B0B0D and #141416, text #F5F1E8, muted text #A39E93. In the app's own UI, mint #79E0B6 means "done/allow" and rose #FF6B86 means "deny"; use them only inside the app footage.
- Type: the app uses **Barlow Condensed** (600) for headings and **Inter** for body (both on Google Fonts). Use Barlow Condensed for the kinetic text, set large, tight and uppercase or title case.
- The logo is the app's own mark: a small black capsule with two glowing eyes. Recreate it from `src/main/icon.js` and the island's eyes, or take it from the footage. There's no separate logo file.
- Mood: premium, calm-confident, dark, warm gold light. Think Apple keynote meets Linear: precise, smooth, nothing cartoonish. The eyes give it personality: blinks, a smile at "done", a glance toward the cursor.

## Deliverables
1. **1920×1080, 30 fps, 30 s** (main: website hero and YouTube)
2. **1080×1920, 30 fps, 30 s** (vertical cut for Reels, Shorts and TikTok). Same story, re-composed: laptop higher in the frame, text below, and every important element inside the safe zone (nothing in the top 220 px or bottom 340 px).

## Structure (30 s)
1. **Hook (0–3 s):** black. A tiny gold glow at the top centre resolves into the folded pill. Its eyes open and blink. Kinetic text: "Meet Pulse." Pull back to reveal the laptop. The pill is tiny on the screen, which is the point.
2. **Problem (3–7 s):** quick cuts of a fictional terminal scrolling while the "user" looks away (show this through window focus and time jumps, never a real person). Text, one phrase at a time: "Claude Code is working…" / "…and you keep checking the terminal."
3. **Feature 1, follow Claude live (7–13 s):** the pill shows "Reading Navbar.tsx", then "Editing". The cursor hovers and the island unfolds (real footage) into the Claude view with a timer and a live code diff. Text: "It follows Claude Code, live." Dolly into the screen, then back out to true scale.
4. **Feature 2, allow in one click (13–18 s):** the pill widens with an amber notice. The panel asks "Allow Bash? npm install …". The cursor clicks **Allow**. It finishes, folds up and **smiles**. Text: "Asks first. One click to allow." then "Done, with a smile."
5. **Feature 3, everything else one hover away (18–25 s):** a fast, rhythmic montage (cuts on the music beat) of the real panel pages: Music with lyrics in the pill, Time with a focus dial counting, Plan with a reminder, Launcher, Tray and Clipboard. Each page appears for 0.6–1 s with a one- or two-word label ("Lyrics", "Focus", "Reminders", "Launcher", "Files", "Clipboard"). Keep it on the laptop screen at true scale, or use short dolly-ins.
6. **Call to action (25–30 s):** back to the full laptop with the gold-themed pill idling and blinking. Kinetic text: "Your desk, with a pulse." then **"Free for Windows and Mac"** and **"pulse-bot.dev"**. A small line underneath: "No account. Nothing leaves your computer." End on the logo mark with the eyes blinking once.

## Motion and sound
- Kinetic text: words slide up from a mask, short tracking-in, 2–4 words per beat, exits as fast as entrances. No bouncy or elastic easing on text. Use expo/quart out, and a slight spring only on the island itself (it already has one).
- Transitions: match cuts on the island shape (the pill becomes the next scene's pill), camera dolly through the screen glass, and quick gold light sweeps. Avoid generic slide/zoom wipes. Check /hyperframes-registry first for camera moves, kinetic type and light sweeps before building your own.
- Everything at 60fps-quality motion curves (rendered at 30 fps), with no jitter on text (whole-pixel or GPU-composited transforms only).
- Music: a modern, minimal electronic track at about 110–120 BPM with a clear downbeat for the montage, **royalty-free or generated via /media-use**, never a commercial song. Add subtle sound effects: a soft "tick" when the pill expands, a gentle chime on Allow (the app has its own `chime` in `app.js`; you can reuse those tones), and a whoosh on the dolly-ins. Mix the music around −14 LUFS, with the effects under it.
- No voiceover.

## Process
1. Read the HyperFrames skill's contract, then plan a shot list with timings (both aspect ratios) and show it to me before building.
2. Record the footage with the extended film mode, at 2× device scale for sharpness. Show me a contact sheet of the captured scenes and confirm that nothing personal appears.
3. Build the composition and **preview it first** (HyperFrames preview). Send me stills of the hook, each feature and the call to action, at both sizes.
4. After I approve, **render both to MP4** (H.264, high quality, under 25 MB each for the web). Also save a 1920×1080 poster frame of the laptop with the unfolded panel.
5. Put the outputs in `D:\comp\pulse\website\assets\promo\` and don't touch the website code. I'll decide where the video goes. Commit the film-mode changes and the HyperFrames project on a branch, but don't push or deploy without asking me.
