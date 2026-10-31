// Efeitos sonoros sintetizados com Web Audio (sem arquivos de áudio de terceiros).

const KEY = 'jogae:volume';
let ctx = null;
let master = null;
let volume = 0.6;
let muted = false;

try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved) {
    volume = typeof saved.volume === 'number' ? saved.volume : volume;
    muted = !!saved.muted;
  }
} catch (_) {
  /* */
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ volume, muted }));
  } catch (_) {
    /* */
  }
}

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// Navegadores só liberam áudio depois de uma interação.
['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => audio(), { once: true, passive: true }));

export function getVolume() {
  return { volume, muted };
}

export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  if (volume > 0) muted = false;
  if (master) master.gain.value = muted ? 0 : volume;
  persist();
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : volume;
  persist();
  return muted;
}

function tone(freq, { start = 0, dur = 0.15, type = 'sine', gain = 0.4, slideTo = null } = {}) {
  const c = audio();
  if (!c || muted || volume === 0) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise({ start = 0, dur = 0.1, gain = 0.2 } = {}) {
  const c = audio();
  if (!c || muted || volume === 0) return;
  const len = Math.floor(c.sampleRate * dur);
  const buffer = c.createBuffer(1, len, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  const g = c.createGain();
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1800;
  src.buffer = buffer;
  g.gain.value = gain;
  src.connect(f).connect(g).connect(master);
  src.start(c.currentTime + start);
}

export const sfx = {
  click: () => tone(660, { dur: 0.05, type: 'triangle', gain: 0.2 }),
  join: () => {
    tone(523, { dur: 0.1, type: 'triangle' });
    tone(784, { start: 0.08, dur: 0.14, type: 'triangle' });
  },
  correct: () => {
    tone(523, { dur: 0.12, type: 'triangle', gain: 0.45 });
    tone(659, { start: 0.1, dur: 0.12, type: 'triangle', gain: 0.45 });
    tone(784, { start: 0.2, dur: 0.25, type: 'triangle', gain: 0.45 });
  },
  wrong: () => {
    tone(220, { dur: 0.18, type: 'square', gain: 0.18, slideTo: 160 });
    tone(150, { start: 0.16, dur: 0.3, type: 'square', gain: 0.18, slideTo: 100 });
  },
  tick: () => tone(1200, { dur: 0.03, type: 'square', gain: 0.08 }),
  timeUp: () => tone(330, { dur: 0.45, type: 'sawtooth', gain: 0.18, slideTo: 140 }),
  hop: () => tone(420, { dur: 0.09, type: 'sine', gain: 0.3, slideTo: 760 }),
  dice: () => {
    for (let i = 0; i < 7; i++) noise({ start: i * 0.07, dur: 0.05, gain: 0.25 });
  },
  rouletteTick: () => tone(900, { dur: 0.025, type: 'square', gain: 0.1 }),
  reveal: () => {
    tone(392, { dur: 0.1, type: 'triangle' });
    tone(523, { start: 0.1, dur: 0.1, type: 'triangle' });
    tone(659, { start: 0.2, dur: 0.1, type: 'triangle' });
    tone(1047, { start: 0.3, dur: 0.3, type: 'triangle' });
  },
  danger: () => {
    tone(300, { dur: 0.15, type: 'sawtooth', gain: 0.2 });
    tone(200, { start: 0.15, dur: 0.15, type: 'sawtooth', gain: 0.2 });
    tone(130, { start: 0.3, dur: 0.3, type: 'sawtooth', gain: 0.2 });
  },
  power: () => {
    for (let i = 0; i < 5; i++) tone(500 + i * 150, { start: i * 0.05, dur: 0.12, type: 'sine', gain: 0.25 });
  },
  shield: () => {
    tone(880, { dur: 0.3, type: 'sine', gain: 0.3 });
    tone(1320, { start: 0.05, dur: 0.3, type: 'sine', gain: 0.2 });
  },
  swap: () => {
    tone(400, { dur: 0.2, type: 'triangle', slideTo: 800 });
    tone(800, { start: 0.2, dur: 0.2, type: 'triangle', slideTo: 400 });
  },
  fanfare: () => {
    const notes = [523, 523, 523, 659, 784, 659, 784, 1047];
    const times = [0, 0.12, 0.24, 0.36, 0.6, 0.78, 0.9, 1.05];
    notes.forEach((n, i) => tone(n, { start: times[i], dur: i === notes.length - 1 ? 0.7 : 0.14, type: 'triangle', gain: 0.4 }));
  },
};
