const MUTE_KEY = 'cube-shift-muted';

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    /* storage unavailable, ignore */
  }
}

interface ToneOptions {
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  /** If set, the tone glides from `freq` to this frequency over its duration. */
  slideTo?: number;
}

/**
 * Every effect here is synthesized on the fly with the Web Audio API rather
 * than loaded from audio files — no assets to source, host, or license, and
 * the whole thing is a few hundred bytes of code. Each `tone()` call is a
 * short oscillator burst with a quick attack/decay envelope so it clicks in
 * cleanly and fades rather than cutting off abruptly.
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private muted = loadMuted();

  private context(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, duration: number, opts: ToneOptions = {}) {
    const ctx = this.context();
    if (!ctx) return;
    const { type = 'sine', gain = 0.15, delay = 0, slideTo } = opts;

    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + duration);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(env).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
  }

  /** A quick, light blip — a cube slide that actually moved. */
  playMove() {
    this.tone(420, 0.08, { type: 'sine', gain: 0.1, slideTo: 560 });
  }

  /** A dull thud — a swipe that couldn't move anything (wall/edge/cube). */
  playBump() {
    this.tone(140, 0.11, { type: 'square', gain: 0.1, slideTo: 90 });
  }

  /** The reverse of playMove's slide — reads as "rewinding" a step. */
  playUndo() {
    this.tone(500, 0.09, { type: 'sine', gain: 0.1, slideTo: 380 });
  }

  /** A short two-note chime when a new bond in the goal becomes satisfied. */
  playBondConnect() {
    this.tone(660, 0.12, { gain: 0.13 });
    this.tone(880, 0.16, { gain: 0.11, delay: 0.07 });
  }

  /** Rising four-note arpeggio for a solved level. */
  playWin() {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      this.tone(freq, 0.18, { gain: 0.14, delay: i * 0.09 });
    });
  }

  /** A low descending tone for falling off an open edge. */
  playFail() {
    this.tone(320, 0.35, { type: 'sine', gain: 0.16, slideTo: 90 });
  }

  /** A bright ping when a hint direction is found. */
  playHintFound() {
    this.tone(880, 0.1, { gain: 0.12 });
    this.tone(1180, 0.12, { gain: 0.09, delay: 0.06 });
  }

  /** A soft low buzz when no hint could be found in time. */
  playHintUnavailable() {
    this.tone(220, 0.18, { type: 'sine', gain: 0.09, slideTo: 160 });
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    saveMuted(this.muted);
    if (this.muted) {
      void this.ctx?.suspend();
    } else {
      this.context();
    }
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }
}
