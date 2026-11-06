---
title: "Why your Mac says 99% RAM (and how Activity Monitor really counts it)"
published: false
description: "os.freemem() on macOS leaves out file cache, so a healthy Mac looks full. Here’s how Activity Monitor counts Memory Used, and how to get the same number from vm_stat."
tags: macos, node, javascript, performance
canonical_url: https://pulse-bot.dev/blog/mac-99-percent-ram/
cover_image: https://pulse-bot.dev/assets/og.jpg
---

Pulse 0.2.2 fixed a RAM readout that showed about 99% on every Mac. The Mac was fine; the maths was wrong. Here’s how Activity Monitor really counts memory, and how to read the same number from vm_stat.

Pulse’s panel has a small `CPU 11% RAM 41%` readout in its header. Soon after the Mac version came out, the RAM figure on Macs showed about **99%**, all the time, on machines with plenty of memory to spare. The Mac was fine. My maths was wrong. Version 0.2.2 fixed it, and the fix is a nice small lesson in how macOS uses memory.

![The open Pulse panel; the header at the top right shows CPU and RAM percentages next to the clock](https://pulse-bot.dev/assets/shots/claude-working.png)

*The CPU and RAM readout sits in the header, next to the clock.*

## The one-liner that worked on Windows

The first version used the formula you’d write without thinking:

```javascript
const ram = Math.round((1 - os.freemem() / os.totalmem()) * 100);
```

On Windows, the free memory Node reports is the memory that’s *available*, which includes the standby cache Windows can hand back at once. So the formula came out close to Task Manager’s figure, and nobody noticed anything.

On a Mac, `os.freemem()` means something much narrower: pages that hold nothing at all. And a healthy Mac has very few of those.

## macOS doesn’t like free memory

macOS treats empty RAM as wasted RAM. When you read a file, the system keeps its contents in memory after you’re done (“cached files”), in case you need them again. That memory isn’t in use the way an app’s memory is. The system can drop it the moment something needs the space. But it isn’t *free* either, so `os.freemem()` doesn’t count it.

After a few hours of normal use, almost all spare memory is file cache, free pages fall to a sliver, and `1 - free / total` heads for 100%. My header was reporting that the Mac had done its job.

## What Activity Monitor counts

Open Activity Monitor’s Memory tab and look at the bottom. **Memory Used** is split into three parts:

- **App Memory:** memory that apps have asked for and are using
- **Wired Memory:** memory the system has locked in place and can’t compress or move out
- **Compressed:** memory that macOS has squeezed to make room, instead of writing it to disk

**Cached Files** is listed separately, and isn’t part of Memory Used. So that’s the number to match: App + Wired + Compressed.

## Reading it from vm_stat

Every Mac has `/usr/bin/vm_stat`, which prints the kernel’s page counts. Here’s the output Pulse’s test uses, the shape of a 16 GB Apple Silicon Mac after a busy day:

```text
Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                9000.
Pages active:                            300000.
Pages inactive:                          290000.
Pages speculative:                         5000.
Pages wired down:                        150000.
Pages purgeable:                          10000.
Anonymous pages:                         280000.
File-backed pages:                       330000.
Pages occupied by compressor:             60000.
```

The page size is on the first line, and it matters: it’s 16 KB on Apple Silicon and 4 KB on Intel Macs. Hard-code 4096 and an Apple Silicon Mac comes out four times too low.

The rows map onto Activity Monitor like this:

- **Wired** is `Pages wired down`.
- **Compressed** is `Pages occupied by compressor`: the space the compressed data takes up.
- **App Memory** is close to `Anonymous pages` (memory not backed by a file, which is what apps allocate) minus `Pages purgeable` (memory apps have marked as safe for the system to throw away).
- **Cached Files** are the `File-backed pages`. We leave them out.

A word of honesty: Apple doesn’t publish Activity Monitor’s exact formula. “Anonymous minus purgeable” for App Memory is a widely used approximation that tracks Activity Monitor closely, not an official definition. For a percentage in a header, close is what I need.

## The code

Here’s the whole parser from `src/main/system.js`:

```javascript
function parseVmStat(out, total = os.totalmem()) {
  const text = String(out);
  const page = Number((text.match(/page size of (\d+) bytes/) || [])[1]) || 4096;
  const n = name => {
    const m = text.match(new RegExp(`^${name}:\\s+(\\d+)`, 'mi'));
    return m ? Number(m[1]) : null;
  };
  const wired = n('Pages wired down'), compressed = n('Pages occupied by compressor');
  const anon = n('Anonymous pages'), active = n('Pages active');
  if (wired == null || !total) return null;
  const app = anon != null ? Math.max(0, anon - (n('Pages purgeable') || 0)) : (active || 0);
  return Math.round(Math.max(0, Math.min(100,
    ((app + wired + (compressed || 0)) * page / total) * 100)));
}
```

A few choices worth pointing out:

- It reads the page size instead of assuming one.
- If a future macOS stops printing `Anonymous pages`, it falls back to `Pages active`, a rougher figure but in the right ballpark.
- If the output doesn’t look like `vm_stat` at all, it returns `null`, and Pulse falls back to the old formula instead of showing nonsense.
- The result is clamped to 0–100, because a percentage outside that range is always a bug.

## The numbers from the test

Run both formulas on that sample, on a 16 GB Mac:

|                               | Pages                      | Size          | Shown   |
|-------------------------------|----------------------------|---------------|---------|
| Old: `1 − free / total`       | 9,000 free                 | ≈ 141 MB free | **99%** |
| New: app + wired + compressed | 270,000 + 150,000 + 60,000 | ≈ 7.3 GB used | **46%** |
| Cached files (left out)       | 330,000                    | ≈ 5.0 GB      | n/a     |

Same sample, two formulas: 99% versus 46%. The difference is nearly all file cache, memory the Mac is using well and would give up immediately. The test in `test/features.test.js` checks exactly this case, and that garbage input gives `null`:

```javascript
assert.equal(parseVmStat(vm, total), 46); // (280000 - 10000 + 150000 + 60000) pages of 16 KB
assert.equal(parseVmStat('garbage', total), null);
```

On a real Mac it looks the same. A friend’s Mac that showed 99% on Pulse 0.2.1 shows **51%** on 0.2.2.

## How often to ask

Pulse samples CPU every 2 seconds, from `os.cpus()`, which is cheap. Running `vm_stat` means starting a process, so Pulse does it every third tick, every 6 seconds, with a 3-second timeout. That’s plenty for a percentage in a header:

```javascript
const readVm = () => execFile('/usr/bin/vm_stat', { timeout: 3000 },
  (err, out) => { if (!err) macRam = parseVmStat(out); });
// ...
if (mac && ++tick % 3 === 0) readVm(); // every 6 s is plenty for a percentage
```

The full path, `/usr/bin/vm_stat`, means nothing on your `PATH` can stand in for it.

## The takeaway

“Free memory” means different things on different systems. On a Mac, low free memory is normal and healthy. If you want a number that matches what people see in Activity Monitor, count what’s actually in use, App + Wired + Compressed, and leave the cache out. And if what you really want to know is “is this Mac short of memory?”, the better signal is Activity Monitor’s **Memory Pressure** graph, not any percentage.

The fix shipped in [Pulse 0.2.2](https://github.com/im-Amrith/Pulse-releases/releases/tag/v0.2.2). The code is in [`src/main/system.js`](https://github.com/im-Amrith/Pulse/blob/main/src/main/system.js).

---

*Originally published on the [Pulse blog](https://pulse-bot.dev/blog/mac-99-percent-ram/). Pulse is free and open source (MIT) for Windows and macOS: [github.com/im-Amrith/Pulse](https://github.com/im-Amrith/Pulse). It's an independent project for Claude Code, not affiliated with or endorsed by Anthropic.*
