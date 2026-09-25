/**
 * The sea's sound: the surf along the island's beaches and the water lapping round the pier.
 *
 * It is ff2's cove soundscape (ff2 src/arena/cove/sound.ts) on this island, with the same
 * Tidewater recordings (CC0, public/audio/CREDITS.md) and the same idea: the surf isn't a loop,
 * it keeps time with the water you can see.
 *
 *  - SHORE STATIONS: rays from your head across the baked heightfield find where land meets sea
 *    around you, and up to three points along that waterline become stations, each at least
 *    20 m from the others, so the waves roll along the beach.
 *  - WAVE BY WAVE: the ocean shader's foam band (world/ocean.ts) runs up the sand on the cycle
 *    sin(0.21x + 0.6z − 1.3t). At each station the swash hisses up as that band starts to climb
 *    and drains back after it peaks. A wave breaks a few metres out beforehand, with a set
 *    envelope, so some crash and some just wash.
 *  - BEDS: a low distant-surf roar from the direction of the nearest shore, and the pier's
 *    lapping from the nearest point under the deck.
 *
 * Everything goes through one shore bus. Indoors it's muffled and quieter; outdoors it's open.
 * Tidewater's SoundScape.js gives the levels (samples.ts MIX).
 */

import { Vector3 } from 'three';
import type { Heightfield } from '../world/heightfield.ts';
import { audioContext, sfxOut } from './sfx.ts';
import { MIX, sample, shot } from './samples.ts';

export interface PierFrame {
  x: number;
  zStart: number;
  zEnd: number;
  width: number;
  headWidth: number;
  headDepth: number;
}

/** the ocean shader's foam cycle: ψ = 1.3 t − 0.21 x − 0.6 z (world/ocean.ts, fragment) */
const FOAM_W = 1.3;
const FOAM_KX = 0.21;
const FOAM_KZ = 0.6;
/** a wave breaks this far out and this long before its swash reaches the sand */
const BREAK_OUT = 12;
const RAYS = 36;
const RAY_STEP = 2;
const RAY_MAX = 160;
const dB = (x: number): number => Math.pow(10, x / 20);

interface Loop {
  gain: GainNode;
  pan: PannerNode;
  src: AudioBufferSourceNode | null;
}

interface Station {
  x: number;
  z: number;
  /** seaward, unit */
  sx: number;
  sz: number;
  /** cycle position last frame (0..1) */
  c: number;
}

export class ShoreSound {
  private bus: GainNode | null = null;
  private muffle: BiquadFilterNode | null = null;
  private far: Loop | null = null;
  private lap: Loop | null = null;
  private stations: Station[] = [];
  private nearest: { x: number; z: number; d: number } | null = null;
  private scan = 0;
  private readonly head = new Vector3();

  constructor(
    private readonly ground: Heightfield,
    private readonly pier: PierFrame,
    private readonly indoors: () => boolean,
  ) {}

  /** Once a frame: the ocean's clock (s), the camera (your head) and the frame time. */
  update(time: number, dt: number, camera: { getWorldPosition(v: Vector3): Vector3 }): void {
    const ctx = audioContext();
    const out = sfxOut();
    if (!ctx || !out || ctx.state !== 'running') return;
    if (!this.bus) this.build(ctx, out);
    const p = camera.getWorldPosition(this.head);
    const t = ctx.currentTime;

    const inside = this.indoors();
    this.bus!.gain.setTargetAtTime(inside ? 0.35 : 1, t, 0.25);
    this.muffle!.frequency.setTargetAtTime(inside ? 420 : 18000, t, 0.25);

    this.scan -= dt;
    if (this.scan <= 0) {
      this.scan = 0.75;
      this.findShore(p.x, p.z, time);
    }
    this.beds(ctx, p);

    // wave by wave
    for (const s of this.stations) {
      const c = cycle(time, s.x, s.z);
      const was = s.c;
      s.c = c;
      if (was < 0) continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d > 70) continue;
      const big = 0.72 + 0.28 * Math.sin((time / 4.83 / 5.3) * Math.PI * 2 + s.x * 0.013 + s.z * 0.007);
      // out at the break, a couple of seconds before the swash (bigger waves of the set only)
      if (crossed(was, c, 0.08) && big > 0.8) {
        shot('surf_crash', MIX.crash - 6 + 20 * Math.log10(big) + (Math.random() - 0.5) * 3, {
          at: { x: s.x + s.sx * BREAK_OUT, y: 0.4, z: s.z + s.sz * BREAK_OUT },
          ref: 10,
          rate: 0.92 + Math.random() * 0.12,
          out: this.bus!,
        });
      }
      // the foam starts up the sand: the uprush
      if (crossed(was, c, 0.5)) {
        shot('surf_wash', MIX.wash + 20 * Math.log10(big) + (Math.random() - 0.5) * 3, { at: { x: s.x + s.sx, y: 0.1, z: s.z + s.sz }, ref: 5, out: this.bus! });
      }
      // past its reach: the backwash drains down
      if (crossed(was, c, 0.8)) {
        shot('surf_backwash', MIX.backwash + (Math.random() - 0.5) * 3, { at: { x: s.x + s.sx * 2, y: 0, z: s.z + s.sz * 2 }, ref: 5, out: this.bus! });
      }
    }
  }

  private build(ctx: AudioContext, out: AudioNode): void {
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 18000;
    this.muffle.connect(out);
    this.bus = ctx.createGain();
    this.bus.connect(this.muffle);
    const placed = (ref: number, rolloff: number): Loop => {
      const pan = ctx.createPanner();
      pan.panningModel = 'HRTF';
      pan.distanceModel = 'inverse';
      pan.refDistance = ref;
      pan.rolloffFactor = rolloff;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(pan).connect(this.bus!);
      return { gain, pan, src: null };
    };
    this.far = placed(40, 0.6);
    this.lap = placed(3, 1);
  }

  /** The looping beds start once their recordings are in; then just follow you around. */
  private beds(ctx: AudioContext, p: Vector3): void {
    const t = ctx.currentTime;
    const far = this.far!;
    const lap = this.lap!;
    if (!far.src) this.startLoop(ctx, 'surf_far', far);
    if (!lap.src) this.startLoop(ctx, 'pier_lap', lap);

    // the distant roar, 40 m out past the nearest shore (Tidewater: falls off slowly inland)
    const n = this.nearest;
    const fs = sample('surf_far');
    if (n && fs) {
      const ux = (n.x - p.x) / Math.max(1, n.d);
      const uz = (n.z - p.z) / Math.max(1, n.d);
      setPos(far.pan, p.x + ux * (n.d + 40), -1.5, p.z + uz * (n.d + 40), t);
      far.gain.gain.setTargetAtTime((dB(MIX.surfFar) * 1.25) / (1 + n.d / 200) / dB(fs.lufs), t, 0.5);
    }
    // the lapping: from under the deck, the nearest point of the walkway or the head
    const lp = sample('pier_lap');
    if (lp) {
      const P = this.pier;
      const walk = nearestInRect(p.x, p.z, P.x - P.width / 2, P.x + P.width / 2, P.zStart, P.zEnd);
      const head = nearestInRect(p.x, p.z, P.x - P.headWidth / 2, P.x + P.headWidth / 2, P.zEnd - P.headDepth, P.zEnd);
      const q = Math.hypot(walk[0] - p.x, walk[1] - p.z) < Math.hypot(head[0] - p.x, head[1] - p.z) ? walk : head;
      // only where there's water under it
      const wet = this.ground.heightAt(q[0], q[1]) < -0.2;
      setPos(lap.pan, q[0], 0.2, q[1], t);
      lap.gain.gain.setTargetAtTime(wet ? dB(MIX.pierLap) / dB(lp.lufs) : 0, t, 0.6);
    }
  }

  private startLoop(ctx: AudioContext, name: string, at: Loop): void {
    const s = sample(name);
    if (!s) return;
    const src = ctx.createBufferSource();
    src.buffer = s.buffer;
    src.loop = true;
    src.connect(at.gain);
    // start somewhere in the loop so it never opens on its crossfade
    src.start(0, Math.random() * s.buffer.duration);
    at.src = src;
  }

  /**
   * Where land meets sea around (x, z): along each ray, the first cell whose side of the
   * waterline differs from where you stand. The nearest becomes the first station, then the
   * nearest ones 20 m clear of those already picked.
   */
  private findShore(x: number, z: number, time: number): void {
    const H = this.ground;
    const wet0 = H.heightAt(x, z) < 0;
    const hits: { x: number; z: number; d: number }[] = [];
    for (let i = 0; i < RAYS; i++) {
      const a = (i / RAYS) * Math.PI * 2;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      let prev = H.heightAt(x, z);
      for (let r = RAY_STEP; r <= RAY_MAX; r += RAY_STEP) {
        const h = H.heightAt(x + dx * r, z + dz * r);
        if (h < 0 !== wet0) {
          // interpolate to the zero crossing
          const f = prev === h ? 1 : prev / (prev - h);
          const d = r - RAY_STEP + f * RAY_STEP;
          hits.push({ x: x + dx * d, z: z + dz * d, d });
          break;
        }
        prev = h;
      }
    }
    hits.sort((a, b) => a.d - b.d);
    this.nearest = hits[0] ?? null;
    const picked: { x: number; z: number }[] = [];
    for (const h of hits) {
      if (picked.length >= 3) break;
      if (picked.every((q) => Math.hypot(q.x - h.x, q.z - h.z) > 20)) picked.push(h);
    }
    // keep a station that hasn't moved much (its wave timing carries on), else start it fresh
    const n = { x: 0, y: 0, z: 0 };
    this.stations = picked.map((q) => {
      const old = this.stations.find((s) => Math.hypot(s.x - q.x, s.z - q.z) < 6);
      if (old) return old;
      // seaward: downhill
      H.normalAt(q.x, q.z, n);
      const l = Math.hypot(n.x, n.z) || 1;
      return { x: q.x, z: q.z, sx: n.x / l, sz: n.z / l, c: cycle(time, q.x, q.z) };
    });
  }
}

/** Where the foam cycle is at (x, z) at time t: 0..1, the band starts up the sand at 0.5. */
function cycle(t: number, x: number, z: number): number {
  const psi = FOAM_W * t - FOAM_KX * x - FOAM_KZ * z;
  const c = psi / (Math.PI * 2);
  return c - Math.floor(c);
}

/** Did the cycle pass `at` between two frames (allowing for the wrap from 1 back to 0)? */
function crossed(was: number, now: number, at: number): boolean {
  return now >= was ? was < at && now >= at : was < at || now >= at;
}

function nearestInRect(x: number, z: number, x0: number, x1: number, z0: number, z1: number): [number, number] {
  return [Math.min(x1, Math.max(x0, x)), Math.min(z1, Math.max(z0, z))];
}

function setPos(p: PannerNode, x: number, y: number, z: number, t: number): void {
  p.positionX.setTargetAtTime(x, t, 0.1);
  p.positionY.setTargetAtTime(y, t, 0.1);
  p.positionZ.setTargetAtTime(z, t, 0.1);
}
