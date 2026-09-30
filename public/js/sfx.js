// Short feedback sounds, synthesized with Web Audio so there are no files to download or cache.
// iOS keeps Web Audio silent while the ring/silent switch is on silent.
let ctx = null;

function audio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// Browsers only start audio from a user gesture; unlock on the first tap or key press.
for (const type of ['pointerdown', 'keydown']) {
  addEventListener(type, () => audio(), { once: true, capture: true, passive: true });
}

function tone(ac, freq, at, dur, { type = 'sine', gain = 0.12 } = {}) {
  const osc = ac.createOscillator();
  const env = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(env).connect(ac.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

const SOUNDS = {
  // two rising notes
  right: (ac, t) => {
    tone(ac, 880, t, 0.12);
    tone(ac, 1320, t + 0.08, 0.18);
  },
  // a soft low bump, not a buzzer
  wrong: (ac, t) => {
    tone(ac, 220, t, 0.16, { type: 'triangle', gain: 0.16 });
    tone(ac, 175, t + 0.1, 0.2, { type: 'triangle', gain: 0.12 });
  },
  // a short arpeggio when a session is done
  done: (ac, t) => [523, 659, 784, 1047].forEach((f, i) => tone(ac, f, t + i * 0.09, 0.22, { gain: 0.1 })),
};

export function play(name) {
  const ac = audio();
  if (!ac || ac.state !== 'running') return;
  SOUNDS[name]?.(ac, ac.currentTime + 0.01);
}
