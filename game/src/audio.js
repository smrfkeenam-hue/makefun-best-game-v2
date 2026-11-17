// All sound is synthesized with WebAudio — no audio files. A short noise
// buffer is the raw material for knocks, hisses and crashes; oscillators
// make the whistle, the dings and the win/lose tunes. The context is
// created on the first user gesture (browsers forbid audio before one) and
// every call is guarded, so a browser without audio never breaks the game.
export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    muted: false,
    chugTimer: 0,
  };

  /** Create (or resume) the context. Call from a user gesture. */
  function ensure() {
    try {
      if (!audio.ctx) {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        audio.ctx = new Ctor();
        audio.master = audio.ctx.createGain();
        audio.master.gain.value = 0.5;
        audio.master.connect(audio.ctx.destination);
      }
      if (audio.ctx.state === 'suspended') audio.ctx.resume();
      return audio.ctx;
    } catch {
      return null;
    }
  }

  function tone(freq, seconds, type, volume, when, slideTo) {
    if (audio.muted) return;
    const ctx = ensure();
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime + (when || 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + seconds);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(volume || 0.3, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
      osc.connect(gain);
      gain.connect(audio.master);
      osc.start(t0);
      osc.stop(t0 + seconds + 0.05);
    } catch { /* audio is best-effort */ }
  }

  function noise(seconds, volume, filterFreq, when, type) {
    if (audio.muted) return;
    const ctx = ensure();
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime + (when || 0);
      const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = type || 'lowpass';
      filter.frequency.value = filterFreq || 800;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume || 0.3, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(audio.master);
      src.start(t0);
    } catch { /* audio is best-effort */ }
  }

  return {
    unlock: ensure,
    setMuted(m) {
      audio.muted = m;
    },
    isMuted() {
      return audio.muted;
    },
    /** Rhythmic chug while the train rolls; rate follows the speed. */
    chug(trainSpeed, dt) {
      if (trainSpeed < 0.2 || audio.muted) return;
      audio.chugTimer -= dt;
      if (audio.chugTimer <= 0) {
        audio.chugTimer = 0.55 / trainSpeed;
        noise(0.09, 0.22, 300);
        tone(90, 0.08, 'sine', 0.12);
      }
    },
    whistle() {
      tone(740, 0.35, 'sine', 0.25, 0, 740);
      tone(932, 0.35, 'sine', 0.18, 0, 932);
      tone(740, 0.5, 'sine', 0.25, 0.4, 740);
      tone(932, 0.5, 'sine', 0.18, 0.4, 932);
    },
    place() {
      noise(0.07, 0.35, 1200);
      tone(180, 0.08, 'triangle', 0.25);
    },
    rotate() {
      tone(1200, 0.05, 'square', 0.08);
    },
    discard() {
      tone(300, 0.12, 'sine', 0.15, 0, 180);
    },
    bulldoze() {
      noise(0.15, 0.3, 500);
    },
    coal() {
      tone(880, 0.12, 'sine', 0.25);
      tone(1320, 0.2, 'sine', 0.18, 0.07);
    },
    brake() {
      noise(0.5, 0.2, 4000, 0, 'highpass');
    },
    crash() {
      noise(0.5, 0.5, 400);
      tone(120, 0.6, 'sine', 0.4, 0, 40);
      noise(0.3, 0.3, 900, 0.1);
    },
    countBeep(final) {
      tone(final ? 880 : 440, final ? 0.3 : 0.12, 'sine', 0.25);
    },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, 'triangle', 0.25, i * 0.14));
    },
    lose() {
      [392, 330, 262, 196].forEach((f, i) => tone(f, 0.4, 'triangle', 0.22, i * 0.18));
    },
    click() {
      tone(700, 0.05, 'sine', 0.15);
    },
  };
}
