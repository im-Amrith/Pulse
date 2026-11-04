# Pulse promo video

A 30-second promo for Pulse, made with [HyperFrames](https://hyperframes.heygen.com) in two cuts:
`landscape/` (1920x1080) and `vertical/` (1080x1920). Both are built from `shared/`.

- `shared/island/` - the real island, recorded from Pulse in film mode with invented content
  (`npm run film -- --promo` from the repo root; transparent VP9 clips at 2x, plus `contact-sheet.png`).
- `shared/stage.html` - the laptop, the fake desktop, the island clips at true scale and the camera.
- `shared/type.html` - the kinetic text. `shared/audio.html` - music and sound cues.
- `shared/make_audio.py` - scores the original 120 BPM bed and the app's chime tones (`python make_audio.py`).
- `SPEC.md` - the brief as numbers and the shot list.

Build, preview and render:

```bash
node sync.mjs                      # copy shared/ into landscape/ and vertical/
cd landscape && npm run dev        # preview (or: npx hyperframes preview)
cd landscape && npm run render     # render to MP4
```

Film mode is development-only and is excluded from both release builds.
