/**
 * The camps' sound: each fire crackling, and the drums keeping the dancers going. The drums carry
 * further than the firelight, so walking the hills you hear a camp before you see it.
 *
 * All synthesised (nothing to load) on the island's AudioContext and SFX fader (audio/sfx.ts),
 * placed in the world at the fire with a PannerNode. The crackle is FIRE FIGHT 2's (ff2
 * src/arena/cove/sound.ts): short band-passed noise pops, at random.
 *
 * THE DRUMS are a little West African ensemble in 12/8: twelve pulses to the bar, four dancing
 * beats of three, every part locked to the one grid (a couple of milliseconds of hand in it, no
 * more) with its own accents, so it grooves instead of wandering:
 *   BELL      the time-line everyone keys off, the standard seven-stroke pattern, low bell on
 *             the one, high bell after
 *   SHAKER    every pulse, leaning on the beats
 *   DUNDUN    the big bass drum: the one, and a push into the next bar
 *   SANGBAN   the middle drum, answering it off the beat
 *   DJEMBE    the accompaniment (bass, tone and slap), and every fourth bar a fill: a run of
 *             slaps rolling into the next phrase (two fills, taking turns)
 * with a short outdoor echo on it all. Each camp plays at its own tempo. Only the nearest camp
 * plays, and only within earshot.
 */

import { audioContext, sfxOut } from '../audio/sfx.ts';

/** how far the drums carry (m); the crackle is only heard close to */
const EARSHOT = 110;
const CRACKLE = 30;
/** pulses to the bar, and bars to the phrase */
const PULSES = 12;
const PHRASE = 4;

/**
 * One bar each, a character a pulse. Bell: L low, H high. Shaker: 0-9 how hard. Drums: X hard,
 * x soft. Djembe: B bass, T tone, S slap (lower case: a ghost of it).
 */
const BELL = 'L.H.HH.H.H.H';
const SHAKER = '925725925725';
const DUNDUN = ['X.....x..X..', 'X.....x..X..', 'X.....x..X..', 'X..x..X.xX.x'];
const SANGBAN = '...x.x...X.x';
const DJEMBE = 'B.TS.tB.TS.s';
const FILLS = ['S.sSSs.SSsSS', 'B.SS.SB.SSSS'];

export interface CampSpot {
  x: number;
  y: number;
  z: number;
}

export class CampSound {
  private noise: AudioBuffer | null = null;
  private bus: GainNode | null = null;
  private drums: GainNode | null = null;
  private pan: PannerNode | null = null;
  private at: CampSpot | null = null;
  /** the next pulse to schedule, when (AudioContext time), and how long a pulse is here */
  private step = 0;
  private next = 0;
  private pulse = 0.17;
  private crackleT = 0;
  private on = false;

  /** Call once a frame with the nearest camp's fire, how far you are from it and how far its drums carry. */
  update(dt: number, camp: CampSpot | null, dist: number, earshot = EARSHOT): void {
    const ctx = audioContext();
    const out = sfxOut();
    if (!ctx || !out || ctx.state !== 'running') return;
    if (!this.bus) this.build(ctx, out);
    const near = camp !== null && dist < earshot;
    // fade in and out at the edge of earshot rather than cutting (only on a change: rescheduling
    // the ramp every frame makes the gain jump)
    if (near !== this.on) {
      this.on = near;
      this.bus!.gain.cancelScheduledValues(ctx.currentTime);
      this.bus!.gain.setTargetAtTime(near ? 1 : 0, ctx.currentTime, 0.4);
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
      // each camp its own tempo: 114 to 126 dancing beats a minute
      const bpm = 114 + (Math.abs(Math.round(camp.x * 7 + camp.z * 13)) % 5) * 3;
      this.pulse = 60 / bpm / 3;
      this.step = 0;
      this.next = ctx.currentTime + 0.1;
    }
    // schedule a little ahead, on the grid (after a stall, pick the grid up again from now)
    if (this.next < ctx.currentTime - 0.1) this.next = ctx.currentTime + 0.05;
    while (this.next < ctx.currentTime + 0.25) {
      this.play(ctx, this.step, this.next);
      this.step++;
      this.next += this.pulse;
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

  private build(ctx: AudioContext, out: AudioNode): void {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.pan = ctx.createPanner();
    this.pan.panningModel = 'HRTF';
    this.pan.distanceModel = 'inverse';
    this.pan.refDistance = 5;
    this.pan.rolloffFactor = 1.1;
    this.pan.maxDistance = 10000;
    this.bus.connect(this.pan).connect(out);
    // one second of white noise, shared by every pop, slap and shake
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const ch = this.noise.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    // the drums: glued together a little, with a short echo off the hills round the camp
    this.drums = ctx.createGain();
    this.drums.gain.value = 0.45;
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -18;
    glue.ratio.value = 3;
    glue.attack.value = 0.005;
    glue.release.value = 0.12;
    this.drums.connect(glue).connect(this.bus);
    const len = Math.floor(ctx.sampleRate * 1.3);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5);
    }
    const verb = ctx.createConvolver();
    verb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.16;
    this.drums.connect(verb).connect(wet).connect(this.bus);
  }

  /** Everything that plays on pulse `n` (counting from when you came in earshot), at `t`. */
  private play(ctx: AudioContext, n: number, t: number): void {
    const p = n % PULSES;
    const bar = Math.floor(n / PULSES) % PHRASE;
    const phrase = Math.floor(n / (PULSES * PHRASE));
    // a couple of milliseconds of hand, a touch of give in the loudness
    const hand = (): number => t + (Math.random() - 0.5) * 0.004;
    const give = (k: number): number => k * (0.94 + Math.random() * 0.12);
    const bell = BELL[p];
    if (bell !== '.') this.bell(ctx, hand(), bell === 'L' ? 1 : 0.8, bell === 'L');
    this.shake(ctx, hand(), give(Number(SHAKER[p]) / 9));
    const dun = DUNDUN[bar][p];
    if (dun !== '.') this.drum(ctx, hand(), give(dun === 'X' ? 1 : 0.6), 58, 0.5);
    const san = SANGBAN[p];
    if (san !== '.') this.drum(ctx, hand(), give(san === 'X' ? 0.8 : 0.55), 92, 0.32);
    // the djembe: its part, and on the last bar of the phrase a fill into the next
    const dj = (bar === PHRASE - 1 ? FILLS[phrase % FILLS.length] : DJEMBE)[p];
    if (dj === '.') return;
    const k = give(dj === dj.toUpperCase() ? 1 : 0.45) * (p % 3 === 0 ? 1 : 0.85);
    const lo = dj.toUpperCase();
    if (lo === 'B') this.drum(ctx, hand(), k * 0.8, 78, 0.28);
    else if (lo === 'T') this.tone(ctx, hand(), k);
    else this.slap(ctx, hand(), k);
  }

  private voice(ctx: AudioContext, t: number, peak: number, decay: number, to: AudioNode = this.drums!): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    g.connect(to);
    return g;
  }

  private noiseBurst(ctx: AudioContext, t: number, type: BiquadFilterType, hz: number, q: number, peak: number, decay: number): void {
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = hz;
    f.Q.value = q;
    src.connect(f).connect(this.voice(ctx, t, peak, decay));
    src.start(t, Math.random() * 0.8, decay + 0.02);
  }

  /** a skin struck in the middle: a deep note falling onto its pitch, and the stick's knock */
  private drum(ctx: AudioContext, t: number, k: number, hz: number, decay: number): void {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(hz * 2.2, t);
    o.frequency.exponentialRampToValueAtTime(hz, t + 0.045);
    o.connect(this.voice(ctx, t, 0.55 * k, decay));
    o.start(t);
    o.stop(t + decay + 0.05);
    this.noiseBurst(ctx, t, 'lowpass', 1400, 0.7, 0.18 * k, 0.03);
  }

  /** the tone: fingers flat at the edge, a round ringing note with a skin partial over it */
  private tone(ctx: AudioContext, t: number, k: number): void {
    for (const [hz, a] of [
      [330, 0.26],
      [545, 0.09],
    ]) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(hz * 1.08, t);
      o.frequency.exponentialRampToValueAtTime(hz, t + 0.03);
      o.connect(this.voice(ctx, t, a * k, 0.2));
      o.start(t);
      o.stop(t + 0.25);
    }
    this.noiseBurst(ctx, t, 'bandpass', 1100, 1.2, 0.12 * k, 0.03);
  }

  /** the slap: a crack off the rim, bright noise and a high ring */
  private slap(ctx: AudioContext, t: number, k: number): void {
    this.noiseBurst(ctx, t, 'bandpass', 2600, 0.9, 0.55 * k, 0.075);
    this.noiseBurst(ctx, t, 'highpass', 5000, 0.7, 0.14 * k, 0.03);
    const o = ctx.createOscillator();
    o.frequency.value = 760;
    o.connect(this.voice(ctx, t, 0.07 * k, 0.05));
    o.start(t);
    o.stop(t + 0.08);
  }

  /** the bell: struck iron, two inharmonic partials; the low bell a fourth under the high */
  private bell(ctx: AudioContext, t: number, k: number, low: boolean): void {
    const f = low ? 990 : 1320;
    for (const [m, a] of [
      [1, 0.1],
      [2.76, 0.035],
    ]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * m;
      o.connect(this.voice(ctx, t, a * k, m > 1 ? 0.09 : 0.26));
      o.start(t);
      o.stop(t + 0.3);
    }
  }

  /** the shaker: a hiss of seeds, short */
  private shake(ctx: AudioContext, t: number, k: number): void {
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 7000;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06 * k + 0.0002, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    src.connect(f).connect(g).connect(this.drums!);
    src.start(t, Math.random() * 0.9, 0.08);
  }

  /** One crackle: a few ms of band-passed noise with a snap of an envelope (ff2's). */
  private pop(ctx: AudioContext, amp: number): void {
    const t = ctx.currentTime + Math.random() * 0.2;
    const len = 0.015 + Math.random() * 0.05;
    // the odd loud snap
    const peak = amp * (0.3 + Math.random() * 0.7) * (Math.random() < 0.08 ? 2.2 : 1);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700 + Math.random() * 3200;
    bp.Q.value = 1.5 + Math.random() * 5;
    src.connect(bp).connect(this.voice(ctx, t, peak, len, this.bus!));
    src.start(t, Math.random() * 0.9, len + 0.02);
  }
}
