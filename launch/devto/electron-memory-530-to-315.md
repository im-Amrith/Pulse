---
title: "Cutting an Electron app’s memory from 530 MB to 315 MB with a 12 KB native helper"
published: false
description: "How Pulse 0.2.1 cut memory at launch by replacing a PowerShell media bridge with a tiny C# helper built by the compiler that ships with Windows, and by drawing less glow."
tags: electron, performance, csharp, windows
canonical_url: https://pulse-bot.dev/blog/electron-memory-530-to-315/
cover_image: https://pulse-bot.dev/assets/og.jpg
---

Pulse 0.2.1 uses about 40% less memory than 0.2.0. Most of the saving came from outside the Electron app: a PowerShell bridge became a 12 KB C# program, built with the compiler that ships with Windows.

Pulse is a small island that hangs from the top of your screen. It shows what Claude Code is doing, lets you allow or deny its requests, and keeps music, timers and notes one hover away. It’s an Electron app, so you can guess where this is going: in 0.2.0, Pulse used about **530 MB** of memory right after launch on Windows.

That’s a lot for something whose job is to sit quietly at the top of the screen. Version 0.2.1 brought it down to about **315 MB**. This post is about where the memory went, what I changed, and what I didn’t manage to change.

![The folded Pulse capsule at the top of the screen, showing that Claude Code is editing a file](https://pulse-bot.dev/assets/shots/pill-working.png)

*The folded island. Most of the time, this is all of Pulse you see.*

## Where 530 MB went

An Electron app is never one process. Pulse runs the usual set: the main Node process, one renderer for the island, Chromium’s GPU process, a network utility process, and so on. Then it adds one of its own: a long-running child that reads “now playing” from Windows and controls the volume.

That child was the first thing I looked at, because it was the easiest to blame. It was a PowerShell script, `media.ps1`, and on its own it used about **90 MB**.

## Why a PowerShell bridge costs 90 MB

The bridge reads two things. “Now playing” comes from the Windows Runtime API `GlobalSystemMediaTransportControlsSessionManager`, the same source as the media flyout next to the volume control, so it works with Spotify, browsers and most players. The volume comes from Core Audio’s `IAudioEndpointVolume` COM interface.

PowerShell is a convenient place to call both. It is not a light one. A PowerShell process loads the .NET runtime, the PowerShell engine and its modules. The Core Audio part needed a few COM interface definitions, so the script compiled C# at startup with `Add-Type`:

```powershell
Add-Type -AssemblyName System.Runtime.WindowsRuntime

Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
namespace PulseAudio {
  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"),
   InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume { /* ... */ }
  ...
'@
```

So every time Pulse started, it launched a scripting engine and a C# compiler to run what is really a small loop: read the current track, read the volume, print a line of JSON when something changes, and read commands like `toggle` or `vol 40` from standard input.

## The same loop as a 12 KB program

If the script was already C# in disguise, the obvious step was to make it real C#. `src/native/PulseMedia.cs` is about 180 lines. It speaks exactly the same line protocol as the script, so nothing else in Pulse had to change:

```text
// stdout: one JSON line per change, {"type":"media",...} or {"type":"volume",...}
// stdin:  toggle | next | prev | seek <seconds> | vol <0-100> | mute <0|1>
```

The main loop polls every 700 ms and only writes when something has changed:

```csharp
var key = artKey + "|" + playing + "|" + tl.LastUpdatedTime.Ticks;
if (key != lastKey) {
  Emit("{\"type\":\"media\",\"active\":true,\"title\":" + Str(title) + ...);
  lastKey = key;
}
Thread.Sleep(700);
```

The part I like most is how it’s built. Every copy of Windows 10 and 11 ships .NET Framework 4.8, and with it `csc.exe`, the C# compiler. So there’s no .NET SDK to install and no NuGet. `scripts/build-helper.js` calls that compiler directly and references the Windows Runtime metadata (`Windows.winmd`, which comes from the Windows SDK):

```javascript
const FW = path.join(WIN, 'Microsoft.NET', 'Framework64', 'v4.0.30319');
const args = ['/nologo', '/optimize+', '/platform:anycpu', '/target:exe',
  `/out:${out}`, ...refs.map(r => `/r:${r}`), src];
execFileSync(path.join(FW, 'csc.exe'), args, { stdio: 'pipe' });
```

The result, `pulse-media.exe`, is **12,288 bytes**. While running, it uses about **19 MB**, against about 90 MB for the PowerShell bridge. It runs on the framework that’s already in Windows, so it adds nothing to the download beyond those 12 KB. CI compiles it on every push to make sure it still builds.

### Keeping the old bridge as a fallback

I didn’t delete the PowerShell script. If the helper is missing, or starts and exits without ever printing a line, Pulse falls back to the script:

```javascript
this.child.on('exit', () => {
  this.child = null;
  // never spoke: switch to PowerShell
  if (useHelper && !spoke) { this.helperFailed = true; this.restarts--; }
  if (!this.stopped && this.restarts++ < 5) setTimeout(() => this.start(), 3000 * this.restarts);
});
```

“Never spoke” is a cheap and useful test. A helper that crashes on some unusual Windows setup costs you 70 MB, not your music controls.

## The glow: cheap to write, not cheap to draw

The island is a transparent, always-on-top window, and its shape is drawn in CSS. In 0.2.0 it had a soft shadow plus a coloured glow that changes with Claude’s mood:

```css
#shell { filter: drop-shadow(0 14px 26px rgba(4, 6, 18, .5)) drop-shadow(0 0 0 transparent); }
#shell.glow { filter: drop-shadow(0 14px 26px rgba(4, 6, 18, .5))
                      drop-shadow(0 0 10px color-mix(in srgb, var(--mood) 70%, transparent)); }
```

A CSS `filter` on a large element isn’t free. The browser draws the element into an offscreen texture, then blurs it. The bigger the blur radius, the bigger the area it has to sample, and because the island animates, that work comes back on every frame. On a transparent window the size of the open panel, those textures add up in the GPU process.

0.2.1 uses one smaller shadow, and adds the coloured rim only when something needs you:

```css
/* one soft shadow, and a faint mood rim only when something needs you;
   small blur radii keep the GPU cost low */
#shell { filter: drop-shadow(0 8px 12px rgba(4, 6, 18, .45)); }
#shell.glow { filter: drop-shadow(0 8px 12px rgba(4, 6, 18, .45))
                      drop-shadow(0 0 4px color-mix(in srgb, var(--mood) 45%, transparent)); }
```

The heartbeat line in the header also lost its `drop-shadow`. It’s an SVG path animated forever, so its glow was being redrawn forever too. Honestly, I can’t see the difference at a normal viewing distance.

## Cursor polling: send less, less often

The eyes glance at your cursor. The window ignores mouse events unless you’re over the island, so it can’t just listen for `mousemove`. The main process asks Electron for the cursor position and sends it to the renderer. In 0.2.0 that happened every 50 ms, with the exact pixel offset, so almost every tick sent a message and re-rendered the eyes.

Now the position is clamped to the range where the eyes can still react, snapped to 6 px, and sent every 80 ms only if it changed:

```javascript
// clamped to where the eyes can still react, and snapped to 6px,
// so far-away or tiny moves send nothing
const q = (v, lo, hi) => Math.round(Math.max(lo, Math.min(hi, v)) / 6) * 6;
const msg = `${q(p.x - (b.x + b.width / 2), -540, 540)},${q(p.y - b.y, -360, 420)}`;
if (msg !== last) { last = msg; send('cursor', { dx, dy }); }
```

This saves CPU more than memory. When your mouse is on the other side of the screen, Pulse now sends nothing at all. I also turned off the spellchecker for the island’s window (`spellcheck: false`), so Chromium doesn’t load dictionaries for a few small text fields.

## The numbers, honestly

|                                    | 0.2.0               | 0.2.1                  |
|------------------------------------|---------------------|------------------------|
| Pulse right after launch (Windows) | ~530 MB             | ~315 MB                |
| Media bridge                       | ~90 MB (PowerShell) | ~19 MB (native helper) |
| Helper on disk                     | n/a                 | 12 KB                  |

The helper explains about 70 MB of the 215 MB saved. The rest came with the rendering changes in the same release. I measured the totals before and after, not each change on its own, so I can’t tell you exactly how the remaining ~145 MB splits between the shadow, the trace line and the spellchecker. If you want to measure it properly, the code is all there, and I’d love the numbers.

315 MB is still a lot. That’s the cost of Electron: Chromium plus Node, for a small window. I chose it so one person could ship the same plain-JavaScript app on Windows and macOS without a build step, and I still think that was right for a first version. But I’d rather say the number out loud than hide it.

## What I took away

- **Count processes, not just your app.** The biggest single saving wasn’t in the Electron app at all. It was a child process I’d forgotten was running all the time.
- **Windows ships a C# compiler.** For small native helpers on Windows, `csc.exe` from .NET Framework 4.8 is a zero-install option that a lot of people forget about.
- **Keep the fallback.** Making the new path fast is good. Making sure it can fail without breaking a feature is better.
- **Filters on big, animated, transparent elements are expensive.** Small blur radii and glow only when it means something.

The helper is in [`src/native/PulseMedia.cs`](https://github.com/im-Amrith/Pulse/blob/main/src/native/PulseMedia.cs) and the build script is in [`scripts/build-helper.js`](https://github.com/im-Amrith/Pulse/blob/main/scripts/build-helper.js). If you can make Pulse lighter still, pull requests are very welcome.

---

*Originally published on the [Pulse blog](https://pulse-bot.dev/blog/electron-memory-530-to-315/). Pulse is free and open source (MIT) for Windows and macOS: [github.com/im-Amrith/Pulse](https://github.com/im-Amrith/Pulse). It's an independent project for Claude Code, not affiliated with or endorsed by Anthropic.*
