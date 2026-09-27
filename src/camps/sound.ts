/**
 * The camps' sound: each fire crackling, and a hand drum keeping the dancers going. The drums
 * carry further than the firelight, so walking the hills you hear a camp before you see it.
 *
 * All synthesised (nothing to load) on the island's AudioContext and SFX fader (audio/sfx.ts),
 * placed in the world with PannerNodes. The crackle is FIRE FIGHT 2's (ff2
 * src/arena/cove/sound.ts): short band-passed noise pops, at random. The drum is a djembe's three
 * voices: the bass (a low thump in the middle of the skin), the tone and the slap (the rim), on a
 * two-bar pattern with a little swing. Only the nearest camp plays, and only within earshot.
 */

import { audioContext, sfxOut } from '../audio/sfx.ts';

/** how far the drums carry (m); the crackle is only heard close to */
const EARSHOT = 110;
const CRACKLE = 30;
const BPM = 108;
/** the pattern, sixteenths over two bars: B bass, T tone, S slap, . rest */
const PATTERN = 'B..TS.T.B.TTS...B..TS.T.B.S.STSS';

export interface CampSpot {
  x: number;
  y: number;
  z: number;
}

export class CampSound {
  private noise: AudioBuffer | null = null;
  private bus: GainNode | null = null;
  private pan: PannerNode | null = null;
  private at: CampSpot | null = null;
  /** the next sixteenth to schedule, and when (AudioContext time) */
  private step = 0;
  private next = 0;
  private crackleT = 0;
  private on = false;

  /** Call once a frame with the nearest camp's fire, how far you are from it and how far its drums carry. */
  update(dt: number, camp: CampSpot | null, dist: number, earshot = EARSHOT): void {
    const ctx = audioContext();
    const out = sfxOut();
    if (!ctx || !out || ctx.state !== 'running') return;
    if (!this.bus) {
      this.bus = ctx.createGain();
      this.bus.gain.value = 0;
      this.pan = ctx.createPanner();
      this.pan.panningModel = 'HRTF';
      this.pan.distanceModel = 'inverse';
      this.pan.refDistance = 5;
      this.pan.rolloffFactor = 1.1;
      this.pan.maxDistance = 10000;
      this.bus.connect(this.pan).connect(out);
      // one second of white noise, shared by every pop and slap
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const ch = this.noise.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    }
    const near = camp !== null && dist < earshot;
    // fade in and out at the edge of earshot rather than cutting (only on a change: rescheduling
    // the ramp every frame makes the gain jump)
    if (near !== this.on) {
      this.on = near;
      this.bus.gain.cancelScheduledValues(ctx.currentTime);
      this.bus.gain.setTargetAtTime(near ? 1 : 0, ctx.currentTime, 0.4);
    }
    if (!near || !camp) {
      this.at = null;
      return;
    }
    if (this.at !== camp) {
      this.at = camp;
      const p = this.pan!;
      p.positionX.value = camp.x;
      p.positionY.value = camp.y + 0.6;
      p.positionZ.value = camp.z;
      this.next = ctx.currentTime + 0.1;
    }
    // the drum: schedule a little ahead
    const sixteenth = 60 / BPM / 4;
    if (this.next < ctx.currentTime) this.next = ctx.currentTime + 0.05;
    while (this.next < ctx.currentTime + 0.2) {
      const v = PATTERN[this.step % PATTERN.length];
      // swing the off sixteenths, and a hand is never quite the same twice
      const t = this.next + (this.step % 2 ? sixteenth * 0.12 : 0) + (Math.random() - 0.5) * 0.008;
      const k = 0.75 + Math.random() * 0.25;
      if (v === 'B') this.bass(ctx, t, k);
      else if (v === 'T') this.tone(ctx, t, k);
      else if (v === 'S') this.slap(ctx, t, k);
      this.step++;
      this.next += sixteenth;
    }
    // the fire, close to
    if (dist < CRACKLE) {
      this.crackleT += dt * 5;
      while (this.crackleT > 0) {
        this.crackleT -= Math.random() * 2;
        this.pop(ctx, 0.9 * (1 - dist / CRACKLE));
      }
    }
  }

  private voice(ctx: AudioContext, t: number, peak: number, decay: number): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    g.connect(this.bus!);
    return g;
  }

  /** the bass: the palm in the middle of the skin, a deep falling thump */
  private bass(ctx: AudioContext, t: number, k: number): void {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(115, t);
    o.frequency.exponentialRampToValueAtTime(58, t + 0.18);
    o.connect(this.voice(ctx, t, 0.5 * k, 0.4));
    o.start(t);
    o.stop(t + 0.45);
  }

  /** the tone: fingers at the edge, a round ringing note */
  private tone(ctx: AudioContext, t: number, k: number): void {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(245, t);
    o.frequency.exponentialRampToValueAtTime(215, t + 0.12);
    o.connect(this.voice(ctx, t, 0.22 * k, 0.2));
    o.start(t);
    o.stop(t + 0.25);
  }

  /** the slap: a crack off the rim, mostly noise */
  private slap(ctx: AudioContext, t: number, k: number): void {
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400 + Math.random() * 500;
    bp.Q.value = 1.6;
    src.connect(bp).connect(this.voice(ctx, t, 0.5 * k, 0.09));
    src.start(t, Math.random() * 0.8, 0.12);
    const o = ctx.createOscillator();
    o.frequency.value = 390;
    o.connect(this.voice(ctx, t, 0.08 * k, 0.07));
    o.start(t);
    o.stop(t + 0.1);
  }

  /** One crackle: a few ms of band-passed noise with a snap of an envelope (ff2's). */
  private pop(ctx: AudioContext, amp: number): void {
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700 + Math.random() * 3200;
    bp.Q.value = 1.5 + Math.random() * 5;
    const t = ctx.currentTime + Math.random() * 0.2;
    const len = 0.015 + Math.random() * 0.05;
    // the odd loud snap
    const peak = amp * (0.3 + Math.random() * 0.7) * (Math.random() < 0.08 ? 2.2 : 1);
    src.connect(bp).connect(this.voice(ctx, t, peak, len));
    src.start(t, Math.random() * 0.9, len + 0.02);
  }
}
