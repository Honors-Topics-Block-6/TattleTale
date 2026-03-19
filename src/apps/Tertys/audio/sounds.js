let audioCtx = null;

function getContext() {
  if (audioCtx) return audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioCtx = new Ctx();
  return audioCtx;
}

function now(ctx) {
  return ctx.currentTime;
}

function envelope(gainNode, t0, a = 0.002, d = 0.06, peak = 0.18) {
  const g = gainNode.gain;
  g.cancelScheduledValues(t0);
  g.setValueAtTime(0.0001, t0);
  g.linearRampToValueAtTime(peak, t0 + a);
  g.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}

function beep({ freq, duration = 0.07, type = 'square', volume = 0.18, when = 0 }) {
  const ctx = getContext();
  if (!ctx) return;
  const t0 = now(ctx) + when;

  // Best-effort resume (must be called from a user gesture in many browsers).
  if (ctx.state === 'suspended') {
    // Fire-and-forget; if blocked, it just stays silent.
    ctx.resume().catch(() => {});
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);

  envelope(gain, t0, 0.002, duration, volume);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export function playLanding() {
  // low "thunk"
  beep({ freq: 110, duration: 0.05, type: 'square', volume: 0.14 });
  beep({ freq: 70, duration: 0.06, type: 'triangle', volume: 0.10, when: 0.01 });
}

export function playLineClear(lines = 1) {
  const base = lines >= 4 ? 520 : 440;
  beep({ freq: base, duration: 0.06, type: 'square', volume: 0.16 });
  beep({ freq: base * 1.25, duration: 0.06, type: 'square', volume: 0.16, when: 0.07 });
  beep({ freq: base * 1.5, duration: 0.08, type: 'square', volume: 0.16, when: 0.14 });
}

export function playGameOver() {
  beep({ freq: 330, duration: 0.10, type: 'square', volume: 0.16 });
  beep({ freq: 196, duration: 0.14, type: 'square', volume: 0.16, when: 0.12 });
  beep({ freq: 147, duration: 0.18, type: 'triangle', volume: 0.14, when: 0.28 });
}

