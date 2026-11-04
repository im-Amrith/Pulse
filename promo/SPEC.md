# Pulse promo: spec

GOAL:    The viewer sees how small the pill is and how big it opens, and leaves knowing Pulse follows Claude Code, asks before risky steps, and is free at pulse-bot.dev.
OUTPUT:  HyperFrames. 1920x1080 and 1080x1920, 30 fps, H.264, under 25 MB each.
TIME:    30 s x 30 fps = 900 frames. 120 BPM, one beat = 15 frames. Montage cuts on the 0.25 s grid.

LOOK
- Ground: a dark room. Wall #0B0B0D to #0D0D0F, desk #141416 from 70% height, one warm pool of #D28A0F at 10% behind the laptop, 5% grain.
- Ink #F5F1E8, muted #A39E93. One accent, #D28A0F: one word per line at most ("live.", "allow.", "pulse."), the URL.
- Display: Barlow Condensed 600, 104 px landscape / 132 px vertical, labels 132 / 160 px, line height 0.94, tracking -0.01em.
- Body: Inter 400/700, 28 px minimum.
- Medium: product UI on a real-looking laptop. Graphite lid #3A3B3F to #232427, black bezel, 8 px camera, deck seen from above
  (perspective 6000 px, eye at y 160), contact shadow 0.75 opacity. Glass: two diagonal reflections at 5.5% and 2.5% white.
- The island is real footage (film mode, gold theme), never redrawn. Mint and rose appear only inside it.

OBJECTS
- Laptop: 1300 px wide lid at 1x, glass 1240x697.5 = a 1536x864 display at 0.807. Pill 252x38 logical = 203x31 px at 1x (16%
  of the screen width); panel 660x~350 logical = 533x283 px (43%).
- Fake desktop: black/amber wallpaper with three ribbon lines, an editor on Navbar.tsx, a terminal running `claude`,
  a "Design notes" window, a generic taskbar with a clock (2:14, 2:31, 2:47 PM). Dimmed 28% whenever the island is the subject.

MOTION
- Camera: scale around the frame centre onto a world point. Moves 0.4-0.6 s on power3.inOut; holds drift +3% linear.
- Text: lines slide up from a mask, expo.out 0.5 s (labels 0.32 s), stagger 70 ms; exits power3.in 0.24 s (labels 0.14 s). No springs on text.
- The island keeps its own spring (it is the recording).

SHOTS (landscape; vertical uses the same times, centred framing, text below the laptop)
- 0.0-1.2  Black. Gold spark opens into the pill (close-up 2.6x); eyes blink at 1.0. "Meet Pulse."
- 1.2-3.0  Pull back and turn to a 3/4 laptop: the pill is tiny.
- 3.0-5.0  Cut: terminal scrolling, clock 2:14. "Claude Code is working..."
- 5.0-6.0  Focus jumps to Design notes, clock 2:31. 6.0-7.0 back to the terminal, 2:47. "...and you keep checking the terminal."
- 7.0-9.9  Full laptop, pill at true size: Reading, then Editing. "It follows Claude Code, live."
- 9.8      Hover unfolds the panel (tick). 9.9-10.5 dolly in 2.2x on the live diff; 11.8-12.4 back out: open panel at true size.
- 13.0-15.1 "Needs you" pill (ask chime). "Asks first."
- 15.15    Panel opens (tick); 15.2-15.8 dolly onto "Allow Bash? npm install ...". 17.5 click Allow (click + chime). "One click to allow."
- 17.6-18.4 Pull out; it folds. 18.4-19.5 dolly onto the pill: Done, with a smile.
- 19.5-20.5 Full laptop: lyrics pill (true size). 20.5-21.5 it unfolds to Music (true size, then push). "Lyrics"
- 21.5 Focus, 22.25 Reminders, 23.0 Launcher, 23.5 Files, 24.0 Clipboard (one label each, cut on the grid).
- 25.0-27.0 Cut to 3/4, orbit to frontal; panel folds to the idle pill. "Your desk, with a pulse."
- 26.4-27.85 "Free for Windows and Mac" / pulse-bot.dev.
- 27.6-30.0 Dolly into the pill, the world goes dark, the pill is the logo mark (eyes blink at 29.5). "Pulse", pulse-bot.dev,
  "No account. Nothing leaves your computer."

SOUND
- Original 120 BPM bed (shared/make_audio.py): pad from 0, hats from 3, kick/bass/pluck from 7, claps through the montage,
  one beat of air before the Allow click, half time through the turn, a bell on the last blink. Bed at about -14 LUFS.
- Effects under it: whoosh on each dolly, tick on each unfold, the app's own "ask" and "done" chime tones.

BANNED
- Redrawn or invented app UI; anything personal (real songs, files, names, paths, Wi-Fi, URLs).
- Scaling the island up while it is shown on the laptop (only the camera moves).
- Brand marks on the laptop; bouncy or elastic text; text that drifts after it lands; glass cards; logos docked in a corner.

QA
- 0.9 pill + "Meet Pulse."; 2.9 3/4 laptop with a tiny pill; 8.0 and 12.6 true-size pill then panel; 16.5 Allow card;
  19.2 smile; 20.0 lyrics pill and 21.0 Music at true size; 21.6-24.6 each page; 25.9 CTA; 29.6 end mark mid-blink.
- Vertical: nothing in the top 220 px or bottom 340 px.
