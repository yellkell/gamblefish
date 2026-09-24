/**
 * Tidewater's recorded fishing sounds (CC0, public/audio/CREDITS.md) on ff2's SFX bus.
 *
 * The slices, loudness measurements and mix levels are Tidewater's (vendor/tidewater/src/audio:
 * soundBank.js BANK, and SoundScape.js MIX for the fishing group), so a cast, a plop or a
 * screaming drag sits at the level Tidewater mixed it. Sounds out on the water (the plop, a fish
 * thrashing) are placed in 3-D with an HRTF panner; the rod and reel play at the hand.
 */

import { BANK as BANK_JS } from '../../vendor/tidewater/src/audio/soundBank.js';
import { audioContext, sfxOut } from './sfx.ts';

interface BankEntry {
  file: string;
  loop?: boolean;
  slices?: [number, number][];
  lufs: number | number[];
}
const BANK = BANK_JS as unknown as Record<string, BankEntry>;

/** Tidewater SoundScape MIX (dB), fishing group. */
export const MIX = {
  rodSwish: -30,
  bail: -40,
  lineOut: -38,
  plop: -30,
  reelWind: -36,
  reelDrag: -29,
  lineStrain: -44,
  lineSnap: -24,
  fishSplash: -24,
  fishFlop: -32,
  coins: -30,
} as const;

const NAMES = ['reel_wind', 'reel_drag', 'line_strain', 'rod_swish', 'bail_click', 'line_out', 'plop', 'line_snap', 'fish_splash', 'fish_flop', 'coins'];

const dB = (x: number): number => Math.pow(10, x / 20);

const buffers = new Map<string, AudioBuffer>();
let loading: Promise<void> | null = null;

/** Fetch + decode the fishing bank (idempotent; call once the context can exist). */
export function loadSamples(): Promise<void> {
  if (loading) return loading;
  const ctx = audioContext();
  if (!ctx) return Promise.resolve();
  loading = Promise.all(
    NAMES.map(async (n) => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}audio/${BANK[n].file}`);
        buffers.set(n, await ctx.decodeAudioData(await res.arrayBuffer()));
      } catch {
        /* a missing sound is never fatal */
      }
    }),
  ).then(() => undefined);
  return loading;
}

export interface Pos {
  x: number;
  y: number;
  z: number;
}

/**
 * Play one slice of a sprite. `level` is the target loudness (dB, Tidewater's MIX scale);
 * `at` places it in the world (with `ref` metres as the distance the level is measured at).
 */
export function shot(name: string, level: number, opts: { rate?: number; at?: Pos; ref?: number; slice?: number } = {}): void {
  const ctx = audioContext();
  const out = sfxOut();
  const buf = buffers.get(name);
  if (!ctx || !out || !buf || ctx.state !== 'running') return;
  const e = BANK[name];
  const slices = e.slices ?? [[0, buf.duration]];
  const i = opts.slice ?? Math.floor(Math.random() * slices.length);
  const [start, dur] = slices[i % slices.length];
  const lufs = Array.isArray(e.lufs) ? e.lufs[i % e.lufs.length] : e.lufs;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = opts.rate ?? 1;
  const g = ctx.createGain();
  g.gain.value = dB(level) / dB(lufs);
  src.connect(g);
  if (opts.at) {
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = opts.ref ?? 1;
    p.rolloffFactor = 1;
    p.positionX.value = opts.at.x;
    p.positionY.value = opts.at.y;
    p.positionZ.value = opts.at.z;
    g.connect(p).connect(out);
  } else {
    g.connect(out);
  }
  src.start(ctx.currentTime, start, dur);
}

/** A looping bed whose level and pitch follow a value every frame (the reel's wind, the drag). */
export class Bed {
  private src: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private readonly name: string;
  private readonly level: number;

  constructor(name: string, level: number) {
    this.name = name;
    this.level = level;
  }

  /** amount 0..1 scales the level; rate is the playback rate. */
  set(amount: number, rate = 1): void {
    const ctx = audioContext();
    const out = sfxOut();
    const buf = buffers.get(this.name);
    if (!ctx || !out || !buf || ctx.state !== 'running') return;
    if (amount <= 0.001 && !this.src) return;
    if (!this.src) {
      this.src = ctx.createBufferSource();
      this.src.buffer = buf;
      this.src.loop = true;
      this.gain = ctx.createGain();
      this.gain.gain.value = 0;
      this.src.connect(this.gain).connect(out);
      this.src.start();
    }
    const lufs = BANK[this.name].lufs as number;
    const t = ctx.currentTime;
    this.gain!.gain.setTargetAtTime((dB(this.level) / dB(lufs)) * amount, t, 0.06);
    this.src.playbackRate.setTargetAtTime(rate, t, 0.08);
    if (amount <= 0.001) {
      // let it fade, then free the voice
      const src = this.src;
      this.src = null;
      window.setTimeout(() => src.stop(), 400);
    }
  }
}

/** Keep the WebAudio listener on the player's head (call once a frame). */
export function setListener(p: Pos, fwd: Pos, up: Pos): void {
  const ctx = audioContext();
  if (!ctx) return;
  const L = ctx.listener;
  if (L.positionX) {
    const t = ctx.currentTime;
    L.positionX.setValueAtTime(p.x, t);
    L.positionY.setValueAtTime(p.y, t);
    L.positionZ.setValueAtTime(p.z, t);
    L.forwardX.setValueAtTime(fwd.x, t);
    L.forwardY.setValueAtTime(fwd.y, t);
    L.forwardZ.setValueAtTime(fwd.z, t);
    L.upX.setValueAtTime(up.x, t);
    L.upY.setValueAtTime(up.y, t);
    L.upZ.setValueAtTime(up.z, t);
  }
}
