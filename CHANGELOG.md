# Changelog

All notable changes to Pulse. Downloads and the full release notes are on [Pulse-releases](https://github.com/im-Amrith/Pulse-releases/releases).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Pulse uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Fixed
- Plan note and reminder checkboxes now support Tab, Space and Enter, announce their item, and keep keyboard focus after toggling.

### Added
- A Settings toggle to hide CPU and memory use in the panel header. It is on by default.
- Windows release zips are built on GitHub Actions (`.github/workflows/windows.yml`) when a `v*` tag is pushed, like the Mac build. Releases are still checked and published by hand.

## [0.2.2] - 2026-11-04

### Fixed
- **Mac:** the RAM figure in the header showed about 99% even when plenty of memory was free. `os.freemem()` counts macOS file cache as used memory. Pulse now reads `vm_stat` and counts app memory, wired and compressed memory, the way Activity Monitor does.

### Changed
- Pulse's source code is public under the [MIT License](LICENSE.txt), with a README, contributing guide, security policy, issue templates and CI on Windows, macOS and Linux.

## [0.2.1] - 2026-11-04

### Changed
- **Windows:** music and volume now go through a small native helper (`src/native/PulseMedia.cs`, about 12 KB, compiled with the C# compiler that ships with Windows) instead of a PowerShell bridge. The bridge uses about 19 MB of memory instead of about 90 MB, and Pulse uses about 315 MB right after launch, down from about 530 MB. PowerShell is still the fallback when the helper is missing.
- The island's shadow and glow are softer and cheaper to draw, which lowers graphics memory.
- The eyes follow the cursor with fewer updates: positions are clamped and snapped, so far-away or tiny mouse moves send nothing.

## [0.2.0] - 2026-11-04

### Added
- **macOS** (one universal download for Apple Silicon and Intel): the island hangs around the notch, lives in the menu bar, works over full-screen apps and opens with `Cmd+Alt+P`. Music controls work with Spotify and Apple Music. Built on GitHub Actions (`mac.yml`).
- **Windows:** a Start menu shortcut, so searching "Pulse" opens it.
- If you move Pulse to another folder, it reconnects to Claude Code by itself.

### Changed
- Your colour theme applies from the very first frame and is saved instantly.
- Updated Terms of Use (Pulse asks you to agree once after updating).

### Fixed
- Error messages clear after a few seconds or when you change page, instead of staying on screen.
- Project and file names show correctly whichever path style (Windows or POSIX) Claude Code reports.

## [0.1.0] - 2026-11-04

First public release, for Windows 10 and 11 (64-bit).

### Added
- A living island at the top of the screen that follows Claude Code through hooks: the current step, a diff of the code being edited, permission requests you can allow or deny, and a chime when it's done.
- Pages: Music with synced lyrics, Plan (notes, reminders, calendar), Time (focus, timers, stopwatch), Launcher, Tray with a Downloads watcher and phone transfer by QR code, Clipboard and Ask Pulse.
- Six colour themes plus custom colours.
- An update check against the public releases repo.

[Unreleased]: https://github.com/im-Amrith/Pulse/compare/42dfe64...HEAD
[0.2.2]: https://github.com/im-Amrith/Pulse-releases/releases/tag/v0.2.2
[0.2.1]: https://github.com/im-Amrith/Pulse-releases/releases/tag/v0.2.1
[0.2.0]: https://github.com/im-Amrith/Pulse-releases/releases/tag/v0.2.0
[0.1.0]: https://github.com/im-Amrith/Pulse-releases/releases/tag/v0.1.0
