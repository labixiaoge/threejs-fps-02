// RUSTLINE DEPOT — procedural WebAudio sounds. No audio files: every sound
// is synthesised from noise bursts and oscillators, so the game ships no
// assets and makes no network requests. The context is created lazily on the
// first user gesture; every call is a no-op until then (headless captures
// run silent).
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst({ duration, frequency, type = 'lowpass', gain = 0.5, at = 0 }) {
    if (!ctx) return;
    const t0 = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(duration + 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    src.connect(filter).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + duration + 0.05);
  }

  function tone({ frequency, endFrequency = null, duration, type = 'sine', gain = 0.3, at = 0 }) {
    if (!ctx) return;
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t0);
    if (endFrequency !== null) osc.frequency.exponentialRampToValueAtTime(endFrequency, t0 + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function volumeFor(distance) {
    return Math.max(0.05, 1 - distance / 70);
  }

  return {
    ensure,
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    shot() {
      if (!ensure()) return;
      burst({ duration: 0.14, frequency: 2400, gain: 0.85 });
      tone({ frequency: 170, endFrequency: 55, duration: 0.11, type: 'square', gain: 0.32 });
    },
    enemyShot(distance) {
      if (!ensure()) return;
      const v = volumeFor(distance);
      burst({ duration: 0.12, frequency: 1700, gain: 0.5 * v });
      tone({ frequency: 130, endFrequency: 50, duration: 0.1, type: 'square', gain: 0.2 * v });
    },
    dryFire() {
      if (!ensure()) return;
      tone({ frequency: 1400, duration: 0.03, type: 'square', gain: 0.15 });
    },
    reload() {
      if (!ensure()) return;
      tone({ frequency: 900, duration: 0.04, type: 'square', gain: 0.18 });
      tone({ frequency: 620, duration: 0.04, type: 'square', gain: 0.18, at: 0.22 });
      tone({ frequency: 1100, duration: 0.04, type: 'square', gain: 0.2, at: 0.48 });
    },
    hit() {
      if (!ensure()) return;
      tone({ frequency: 1900, duration: 0.05, type: 'sine', gain: 0.28 });
    },
    kill() {
      if (!ensure()) return;
      tone({ frequency: 880, duration: 0.07, type: 'sine', gain: 0.3 });
      tone({ frequency: 1320, duration: 0.1, type: 'sine', gain: 0.3, at: 0.07 });
    },
    hurt() {
      if (!ensure()) return;
      tone({ frequency: 220, endFrequency: 140, duration: 0.12, type: 'sawtooth', gain: 0.22 });
    },
    plantBeep() {
      if (!ensure()) return;
      tone({ frequency: 1200, duration: 0.06, type: 'square', gain: 0.22 });
    },
    fuseBeep() {
      if (!ensure()) return;
      tone({ frequency: 1500, duration: 0.05, type: 'square', gain: 0.2 });
    },
    explode() {
      if (!ensure()) return;
      burst({ duration: 1.1, frequency: 500, gain: 1.0 });
      tone({ frequency: 90, endFrequency: 28, duration: 0.9, type: 'sine', gain: 0.7 });
    },
    roundWin() {
      if (!ensure()) return;
      [523, 659, 784, 1047].forEach((f, i) => tone({ frequency: f, duration: 0.16, type: 'triangle', gain: 0.26, at: i * 0.11 }));
    },
    roundLoss() {
      if (!ensure()) return;
      [392, 330, 262].forEach((f, i) => tone({ frequency: f, duration: 0.2, type: 'triangle', gain: 0.24, at: i * 0.13 }));
    },
    buy() {
      if (!ensure()) return;
      tone({ frequency: 980, duration: 0.06, type: 'sine', gain: 0.25 });
      tone({ frequency: 1470, duration: 0.09, type: 'sine', gain: 0.25, at: 0.06 });
    },
    click() {
      if (!ensure()) return;
      tone({ frequency: 700, duration: 0.04, type: 'square', gain: 0.15 });
    },
    defuseDone() {
      if (!ensure()) return;
      [784, 1047].forEach((f, i) => tone({ frequency: f, duration: 0.14, type: 'triangle', gain: 0.26, at: i * 0.1 }));
    },
  };
}
