'use strict';
// Pulse's eyes. Each instance renders two glowing eyes that blink, glance toward the cursor,
// and change shape with the mood: idle, working, asking, finished (happy ^^), failed, sleepy.
// Poke them a few times quickly and they get dizzy.
/* exported Eyes */

class Eyes {
  static all = new Set();
  static cursor = { dx: 0, dy: 0, at: 0 };

  constructor(root, { reach = 3 } = {}) {
    this.root = root;
    this.reach = reach; // how far (px) the eyes may travel when looking around
    this.mood = 'idle';
    this.music = false;
    this.pokes = [];
    root.classList.add('eyes');
    root.innerHTML = '<span class="eye"><span class="ball"></span><span class="arc"></span></span><span class="eye"><span class="ball"></span><span class="arc"></span></span>';
    root.addEventListener('click', e => { if (root.dataset.pokeable != null) { e.stopPropagation(); this.poke(); } });
    Eyes.all.add(this);
    this.#scheduleBlink();
  }

  setMood(mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    this.root.dataset.mood = mood;
    if (mood === 'asking' || mood === 'finished') this.blink(); // a little reaction when something happens
  }

  setMusic(on) { this.music = on; this.root.classList.toggle('bob', on && (this.mood === 'idle' || this.mood === 'sleepy')); }

  blink() {
    if (this.root.classList.contains('dizzy')) return;
    this.root.classList.add('blink');
    setTimeout(() => this.root.classList.remove('blink'), 130);
  }

  #scheduleBlink() {
    const wait = 2200 + Math.random() * 4200;
    setTimeout(() => {
      if (!document.hidden) { this.blink(); if (Math.random() < 0.18) setTimeout(() => this.blink(), 260); } // sometimes a double blink
      this.#scheduleBlink();
    }, wait);
  }

  poke() {
    const now = Date.now();
    this.pokes = [...this.pokes.filter(t => now - t < 2500), now];
    if (this.pokes.length >= 5) {
      this.pokes = [];
      this.root.classList.add('dizzy');
      setTimeout(() => this.root.classList.remove('dizzy'), 2600);
    } else {
      this.root.classList.add('squish');
      setTimeout(() => this.root.classList.remove('squish'), 180);
    }
  }

  look(gx, gy) {
    this.root.style.setProperty('--gx', `${(gx * this.reach).toFixed(2)}px`);
    this.root.style.setProperty('--gy', `${(gy * this.reach * 0.7).toFixed(2)}px`);
  }

  // Shared cursor feed from the main process: everyone looks the same way.
  static follow({ dx, dy }) {
    Eyes.cursor = { dx, dy, at: Date.now() };
    const gx = Math.max(-1, Math.min(1, dx / 520));
    const gy = Math.max(-1, Math.min(1, (dy - 30) / 380));
    for (const e of Eyes.all) if (e.mood !== 'working') e.look(gx, gy);
  }
}

// Idle life: when the cursor has been still for a while, glance somewhere at random.
// While Claude works the eyes scan left-right as if reading.
setInterval(() => {
  const still = Date.now() - Eyes.cursor.at > 5000;
  for (const e of Eyes.all) {
    if (e.mood === 'working') { const t = Date.now() / 900; e.look(Math.sin(t) * 0.9, 0.2); }
    else if (still && Math.random() < 0.08) e.look(Math.random() * 2 - 1, Math.random() * 1.2 - 0.6);
  }
}, 300);
