let ctx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

function playTone({ freq = 440, durationMs = 60, type = 'square', gain = 0.05 }) {
  const ac = getAudioContext();
  if (!ac) return;

  const t0 = ac.currentTime;
  const osc = ac.createOscillator();
  const g = ac.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);

  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);

  osc.connect(g);
  g.connect(ac.destination);

  osc.start(t0);
  osc.stop(t0 + durationMs / 1000 + 0.02);
}

export function sfxClick() {
  playTone({ freq: 880, durationMs: 30, type: 'square', gain: 0.035 });
  playTone({ freq: 1320, durationMs: 20, type: 'square', gain: 0.02 });
}

export function sfxError() {
  playTone({ freq: 220, durationMs: 160, type: 'square', gain: 0.06 });
}

export function sfxSuccess() {
  playTone({ freq: 660, durationMs: 70, type: 'triangle', gain: 0.045 });
  playTone({ freq: 880, durationMs: 70, type: 'triangle', gain: 0.04 });
}

