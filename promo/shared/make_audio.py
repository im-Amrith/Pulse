"""Scores the Pulse promo: an original 120 BPM minimal electronic bed, plus the app's own chime tones and a soft tick.
Everything is synthesised here, so it is royalty-free by construction.
    python make_audio.py            -> audio/music.wav (needs ffmpeg), audio/chime-ask.wav, audio/chime-done.wav, audio/tick.wav
Deterministic: the noise generator is seeded.
"""
import os
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 48000
DUR = 30.0
BEAT = 0.5          # 120 BPM
OUT = os.path.join(os.path.dirname(__file__), 'audio')
rng = np.random.default_rng(7)
N = int(SR * DUR)
t_all = np.arange(N) / SR


def lp(x, hz, order=2):
    return sosfilt(butter(order, hz, 'low', fs=SR, output='sos'), x)


def hp(x, hz, order=2):
    return sosfilt(butter(order, hz, 'high', fs=SR, output='sos'), x)


def env(n, a, d, s=0.0, curve=4.0):
    """attack then exponential-ish decay towards s over the rest of n samples"""
    e = np.ones(n)
    na = max(1, int(a * SR))
    e[:na] = np.linspace(0, 1, na)
    rest = n - na
    if rest > 0:
        k = np.linspace(0, 1, rest)
        e[na:] = s + (1 - s) * np.exp(-curve * k * (rest / SR) / max(d, 1e-3))
    return e


def place(buf, x, at):
    i = int(at * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(x))
    buf[i:j] += x[: j - i]


def note_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# A minor colours: Am9, Fmaj7, Cmaj7, G6 (two bars each)
CHORDS = [[57, 60, 64, 67, 71], [53, 57, 60, 64, 67], [48, 55, 59, 64, 67], [55, 59, 62, 64, 67]]
ROOTS = [33, 29, 36, 31]


def chord_at(t):
    return int(t // 4.0) % 4


def gain_curve(points):
    """piecewise-linear automation over the whole film: [(t, value), ...]"""
    ts, vs = zip(*points)
    return np.interp(t_all, ts, vs)


# ---------- drums ----------
kick = np.zeros(N); hat = np.zeros(N); clap = np.zeros(N); pump = np.ones(N)


def kick_hit(amp=1.0):
    n = int(.42 * SR); tt = np.arange(n) / SR
    f = 46 + 95 * np.exp(-tt * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-tt * 7.5)
    click = hp(rng.standard_normal(n), 3000) * np.exp(-tt * 260) * .12
    return amp * np.tanh(1.6 * (body + click))


def hat_hit(amp):
    n = int(.08 * SR); tt = np.arange(n) / SR
    return amp * hp(rng.standard_normal(n), 7500) * np.exp(-tt * 70)


def clap_hit(amp):
    n = int(.25 * SR); tt = np.arange(n) / SR
    nz = sosfilt(butter(2, [900, 3200], 'band', fs=SR, output='sos'), rng.standard_normal(n))
    e = np.exp(-tt * 22) + .6 * np.exp(-((tt - .012) * 900) ** 2) + .5 * np.exp(-((tt - .024) * 900) ** 2)
    return amp * nz * e


def duck(at, depth=.55, rel=.32):
    i = int(at * SR); n = int(rel * SR)
    j = min(N, i + n)
    curve = 1 - depth * np.exp(-np.linspace(0, 5, n))[: j - i]
    pump[i:j] = np.minimum(pump[i:j], curve)


b = 0.0
while b < DUR:
    four = 7.0 <= b < 17.25 or 17.5 <= b < 25.0      # four on the floor; one beat of air before Allow
    half = 25.0 <= b < 28.0 and (b - 25.0) % 1.0 == 0  # half time while the laptop turns
    if four or half:
        place(kick, kick_hit(1.0 if b >= 19.5 else .85), b); duck(b)
    if 19.5 <= b < 25.0 and int(b / BEAT) % 2 == 1:
        place(clap, clap_hit(.5), b)
    for s16 in range(4):
        ts = b + s16 * BEAT / 4
        if 3.0 <= ts < 28.0:
            acc = .9 if s16 == 2 else (.35 if s16 % 2 else .5)
            lvl = .16 if ts < 7 else .22 if ts < 19.5 else .3
            place(hat, hat_hit(acc * lvl), ts)
    b += BEAT
place(kick, kick_hit(.9), 28.0); duck(28.0)

# ---------- bass: offbeat eighths on the chord root ----------
bass = np.zeros(N)
for i in range(int(DUR / (BEAT / 2))):
    ts = i * BEAT / 2
    if not (7.0 <= ts < 25.0) or i % 2 == 0:
        continue
    f = note_hz(ROOTS[chord_at(ts)])
    n = int(.22 * SR); tt = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * tt) + .35 * np.sin(4 * np.pi * f * tt)
    place(bass, .55 * np.tanh(1.4 * x) * env(n, .004, .12), ts)
# a held sub through the turn at the end
for ts, root in [(25.0, 33), (27.0, 29)]:
    n = int(2.0 * SR); tt = np.arange(n) / SR
    place(bass, .4 * np.sin(2 * np.pi * note_hz(root) * tt) * env(n, .05, 1.6, .2), ts)

# ---------- pad: detuned saws, low-passed, slow swells ----------
pad = np.zeros(N)
for ci in range(int(DUR / 4) + 1):
    t0 = ci * 4.0
    notes = CHORDS[ci % 4]
    n = int(4.4 * SR); tt = np.arange(n) / SR
    x = np.zeros(n)
    for m in notes:
        for det in (-.07, .07):
            f = note_hz(m) * 2 ** (det / 12)
            x += 2 * ((tt * f) % 1.0) - 1
    x = lp(x, 900 if t0 < 19.5 else 1500, 2) / (len(notes) * 2)
    e = np.minimum(1, tt / .9) * np.minimum(1, np.maximum(0, (4.4 - tt) / .5))
    place(pad, x * e, t0)

# ---------- pluck: a gold arpeggio motif, sixteenths ----------
pluck = np.zeros(N)
PATTERN = [0, 2, 4, 2, 1, 3, 4, 3]
for i in range(int(DUR / (BEAT / 2))):
    ts = i * BEAT / 2
    if not (7.0 <= ts < 25.0 or 3.0 <= ts < 7.0 and i % 4 == 0):
        continue
    notes = CHORDS[chord_at(ts)]
    m = notes[PATTERN[i % 8]] + 12
    f = note_hz(m)
    n = int(.3 * SR); tt = np.arange(n) / SR
    x = 2 * np.abs(2 * ((tt * f) % 1.0) - 1) - 1  # triangle
    x += .3 * np.sin(2 * np.pi * 2 * f * tt)
    bright = 3200 if ts >= 19.5 else 2200
    amp = .22 if ts >= 7 else .12
    place(pluck, amp * lp(x, bright) * env(n, .002, .09), ts)

# ---------- moments: a swell into the hook, a riser into the montage, a bell at the end ----------
fx = np.zeros(N)
n = int(1.6 * SR); tt = np.arange(n) / SR
place(fx, .18 * lp(rng.standard_normal(n), 1200) * (tt / 1.6) ** 2 * np.exp(-np.maximum(0, tt - 1.45) * 30), 17.9)
for at, m in [(0.15, 81), (29.45, 76)]:
    n = int(2.4 * SR); tt = np.arange(n) / SR
    f = note_hz(m)
    x = np.sin(2 * np.pi * f * tt) + .4 * np.sin(2 * np.pi * 2.76 * f * tt) * np.exp(-tt * 3)
    place(fx, .16 * x * env(n, .004, .8), at)

# ---------- mix ----------
music = (
    kick * .95
    + hat * gain_curve([(0, 1), (28, 1), (28.5, 0)])
    + clap
    + bass * pump
    + pad * pump * gain_curve([(0, .0), (1.0, .55), (3, .45), (7, .5), (19.5, .62), (25, .5), (29, .45), (30, 0)])
    + pluck * pump
    + fx
)
music *= gain_curve([(0, 1), (29.2, 1), (30, 0)])
# a little stereo width: pad and pluck delayed slightly on the right
right = music + np.roll(pad * pump * .05 + pluck * pump * .08, int(.011 * SR))
left = music
stereo = np.stack([left, right], axis=1)
stereo /= np.max(np.abs(stereo)) * 1.05


def write(name, x):
    os.makedirs(OUT, exist_ok=True)
    wavfile.write(os.path.join(OUT, name), SR, (np.clip(x, -1, 1) * 32767).astype(np.int16))


write('music-raw.wav', stereo)
# loudness: about -14 LUFS for the bed, peaks under -1.5 dBTP
import subprocess
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(OUT, 'music-raw.wav'), '-af', 'loudnorm=I=-14:TP=-1.5:LRA=9', '-ar', str(SR), os.path.join(OUT, 'music.wav')], check=True)
os.remove(os.path.join(OUT, 'music-raw.wav'))


# ---------- the app's own chimes (src/renderer/app.js: chime()) and a soft tick ----------
def chime(notes):
    n = int((len(notes) * .11 + .5) * SR)
    x = np.zeros(n)
    for i, f in enumerate(notes):
        m = int(.45 * SR); tt = np.arange(m) / SR
        g = np.where(tt < .015, tt / .015 * .1, .1 * np.exp(np.log(.01) * (tt - .015) / .385))
        place_local = int(i * .11 * SR)
        x[place_local:place_local + m] += np.sin(2 * np.pi * f * tt) * g
    return np.stack([x, x], axis=1) / .12 * .7


write('chime-ask.wav', chime([988, 784, 988]))
write('chime-done.wav', chime([784, 1047]))
n = int(.06 * SR); tt = np.arange(n) / SR
tick = sosfilt(butter(2, [1800, 5200], 'band', fs=SR, output='sos'), rng.standard_normal(n)) * np.exp(-tt * 120)
tick += .5 * np.sin(2 * np.pi * 2400 * tt) * np.exp(-tt * 90)
tick /= np.max(np.abs(tick)) / .6
write('tick.wav', np.stack([tick, tick], axis=1))
print('wrote', OUT)
