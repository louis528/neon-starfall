// Synthesized sound effects: every noise is built from oscillators and filtered noise in
// code, so the game needs no audio files. The context is created lazily on the first user
// gesture (browsers refuse sound before one), and in screenshot mode nothing here is ever
// constructed, so shot scenes render silently.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let lastLaser = 0;

  function ensure() {
    if (ctx !== null) return true;
    const AC = window.AudioContext ?? window.webkitAudioContext;
    if (AC === undefined) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
    return true;
  }

  /** Call from a click or key handler: unlocks audio on the first gesture. */
  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') void ctx.resume();
  }

  function tone(freqFrom, freqTo, seconds, type, volume, delay = 0) {
    if (ctx === null || muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(24, freqTo), t0 + seconds);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.02);
  }

  function noise(seconds, volume, cutoffFrom, cutoffTo, delay = 0) {
    if (ctx === null || muted) return;
    const t0 = ctx.currentTime + delay;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoffFrom, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, cutoffTo), t0 + seconds);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
  }

  return {
    unlock,
    toggleMute() {
      muted = !muted;
      return muted;
    },
    get muted() { return muted; },
    laser() {
      if (ctx === null || muted) return;
      const now = performance.now();
      if (now - lastLaser < 70) return; // a held trigger would otherwise buzz
      lastLaser = now;
      tone(880, 240, 0.09, 'square', 0.16);
    },
    explosion() {
      noise(0.32, 0.5, 1600, 120);
      tone(160, 40, 0.3, 'triangle', 0.35);
    },
    bigExplosion() {
      noise(0.7, 0.8, 2400, 60);
      tone(220, 30, 0.65, 'triangle', 0.5);
      tone(90, 24, 0.8, 'sine', 0.6, 0.05);
    },
    pickup() {
      tone(660, 660, 0.07, 'sine', 0.3);
      tone(990, 990, 0.1, 'sine', 0.3, 0.07);
    },
    shieldBreak() {
      tone(1200, 300, 0.18, 'sawtooth', 0.2);
      noise(0.15, 0.25, 3000, 500);
    },
    hit() {
      noise(0.4, 0.6, 2000, 100);
      tone(320, 50, 0.4, 'sawtooth', 0.3);
    },
    wave() {
      tone(523, 523, 0.09, 'triangle', 0.28);
      tone(784, 784, 0.12, 'triangle', 0.28, 0.09);
    },
    gameOver() {
      const notes = [392, 330, 262, 196];
      notes.forEach((f, i) => tone(f, f * 0.98, 0.22, 'triangle', 0.3, i * 0.16));
    },
    start() {
      const notes = [262, 392, 523, 784];
      notes.forEach((f, i) => tone(f, f, 0.1, 'triangle', 0.26, i * 0.07));
    },
  };
}
