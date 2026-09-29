/**
 * Now and then a red-tailed hawk. It comes in high from somewhere over the island, finds a
 * thermal not far from you and circles up it, banked into the turn, wings held in a shallow V
 * and fingered at the tips, teetering in the gusts and giving a few deep flaps now and then.
 * It screams once or twice (audio/sfx.ts `hawkCry`), then slides off on a long glide and is
 * gone for a few minutes. Sometimes its mate comes too. They keep a hawk's hours: none after
 * dusk, and any still up when the light goes head home.
 *
 * The bird is built here, pale underneath (a dark bar along each wing's leading edge, a dark
 * comma at the wrist, dark fingertips) and brown on top with its rufous tail, lit by the
 * scene's lights. The wingbeat bends it in its vertex shader, at the shoulder and the wrist:
 * one draw per hawk.
 */

import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshLambertMaterial,
  Vector3,
  type Camera,
} from 'three';
import { hawkCry } from '../audio/sfx.ts';
import type { Heightfield } from './heightfield.ts';
import type { SkyState } from './sky.ts';

/** the wing's joints, out from the body's centreline (m) */
const SHOULDER = 0.075;
const WRIST = 0.36;
/** the wings held in soaring: a shallow V, the hands a touch lower */
const GLIDE_SHOULDER = 0.065;
const GLIDE_WRIST = -0.06;
const G = 9.81;
/** how far off they come in from and go out to (m) */
const REACH = 650;
/** out of sight past this (m): a visit's over */
const GONE = 1100;

/* ── the bird ──────────────────────────────────────────────────────────── */

const BROWN = new Color(0x6b4a2f);
const BROWN_DARK = new Color(0x4d3421);
const COVERTS = new Color(0x8c6844);
const PALE = new Color(0xeee3cf);
const BUFF = new Color(0xd8c3a2);
const BAR = new Color(0x4a3222);
const TIPS = new Color(0x2c231d);
const GREY = new Color(0xbdb1a0);
const RUFOUS = new Color(0xb4532b);
const TAIL_UNDER = new Color(0xecd8c6);
const BEAK = new Color(0x3b3b3e);

type V3 = [number, number, number];

function hawkGeometry(): BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  /** 1 on the wings (they bend with the beat), 0 on the body and tail */
  const wing: number[] = [];
  let onWing = 0;
  const _a = new Vector3();
  const _b = new Vector3();
  const _n = new Vector3();
  /** a triangle, wound so its face looks along `out` */
  const tri = (a: V3, b: V3, c: V3, ca: Color, cb: Color, cc: Color, out: V3): void => {
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _n.crossVectors(_a, _b);
    const flip = _n.x * out[0] + _n.y * out[1] + _n.z * out[2] < 0;
    const vs = flip ? [a, c, b] : [a, b, c];
    const cs = flip ? [ca, cc, cb] : [ca, cb, cc];
    for (let i = 0; i < 3; i++) {
      pos.push(...vs[i]);
      col.push(cs[i].r, cs[i].g, cs[i].b);
      wing.push(onWing);
    }
  };
  /** a thin sheet (wing, tail): a top face and an underside, each with its own colours */
  const sheet = (a: V3, b: V3, c: V3, d: V3, top: Color[], under: Color[]): void => {
    tri(a, b, c, top[0], top[1], top[2], [0, 1, 0]);
    tri(a, c, d, top[0], top[2], top[3], [0, 1, 0]);
    tri(a, b, c, under[0], under[1], under[2], [0, -1, 0]);
    tri(a, c, d, under[0], under[2], under[3], [0, -1, 0]);
  };

  // the body: a spindle from the beak to the root of the tail, pale below and brown above
  const stations: { z: number; rx: number; ry: number; y: number; top: Color; under: Color }[] = [
    { z: 0.25, rx: 0.003, ry: 0.003, y: -0.008, top: BEAK, under: BEAK },
    { z: 0.225, rx: 0.02, ry: 0.02, y: 0.0, top: BROWN_DARK, under: BUFF },
    { z: 0.19, rx: 0.038, ry: 0.036, y: 0.008, top: BROWN_DARK, under: BUFF },
    { z: 0.14, rx: 0.046, ry: 0.044, y: 0.004, top: BROWN, under: PALE },
    { z: 0.07, rx: 0.072, ry: 0.062, y: 0.0, top: BROWN, under: PALE },
    { z: -0.01, rx: 0.074, ry: 0.06, y: -0.004, top: BROWN, under: BUFF },
    { z: -0.09, rx: 0.056, ry: 0.044, y: 0.0, top: BROWN, under: PALE },
    { z: -0.14, rx: 0.042, ry: 0.024, y: 0.005, top: BROWN, under: PALE },
  ];
  const SEG = 8;
  const ring = (s: (typeof stations)[number], k: number): V3 => {
    const a = (k / SEG) * Math.PI * 2;
    return [Math.cos(a) * s.rx, s.y + Math.sin(a) * s.ry, s.z];
  };
  const shade = (s: (typeof stations)[number], k: number): Color => (Math.sin((k / SEG) * Math.PI * 2) > -0.2 ? s.top : s.under);
  for (let i = 0; i < stations.length - 1; i++) {
    const s0 = stations[i];
    const s1 = stations[i + 1];
    for (let k = 0; k < SEG; k++) {
      const a = ring(s0, k);
      const b = ring(s0, k + 1);
      const c = ring(s1, k + 1);
      const d = ring(s1, k);
      const mid = ((k + 0.5) / SEG) * Math.PI * 2;
      const out: V3 = [Math.cos(mid), Math.sin(mid), 0];
      tri(a, b, c, shade(s0, k), shade(s0, k + 1), shade(s1, k + 1), out);
      tri(a, c, d, shade(s0, k), shade(s1, k + 1), shade(s1, k), out);
    }
  }
  const tail = stations[stations.length - 1];
  for (let k = 0; k < SEG; k++) tri([0, tail.y, tail.z - 0.01], ring(tail, k), ring(tail, k + 1), BROWN, BROWN, BROWN, [0, 0, -1]);

  // the wings: broad arms to the wrist, then the hand, then five fingered primaries
  onWing = 1;
  const span = [0.04, 0.14, 0.25, WRIST, 0.46];
  const le = [0.07, 0.09, 0.1, 0.1, 0.088];
  const te = [-0.115, -0.155, -0.162, -0.142, -0.1];
  const chord = [0, 0.2, 0.55, 0.88, 1];
  const underAt = (x: number, f: number): Color => {
    if (f < 0.2 && x > 0.08 && x < 0.34) return BAR;
    if (f < 0.35 && x >= 0.32) return BAR;
    if (f > 0.85) return GREY;
    return PALE;
  };
  const topAt = (_x: number, f: number): Color => (f < 0.35 ? COVERTS : BROWN);
  for (const side of [1, -1]) {
    const P = (i: number, j: number): V3 => {
      const x = span[i];
      const z = le[i] + (te[i] - le[i]) * chord[j];
      // a little camber: the wing's crown a centimetre up
      const y = 0.012 * Math.sin(Math.PI * chord[j]) - 0.004;
      return [x * side, y, z];
    };
    for (let i = 0; i < span.length - 1; i++)
      for (let j = 0; j < chord.length - 1; j++) {
        const quad: [number, number][] = [
          [i, j],
          [i + 1, j],
          [i + 1, j + 1],
          [i, j + 1],
        ];
        const [a, b, c, d] = quad.map(([ii, jj]) => P(ii, jj));
        sheet(
          a,
          b,
          c,
          d,
          quad.map(([ii, jj]) => topAt(span[ii], chord[jj])),
          quad.map(([ii, jj]) => underAt(span[ii], chord[jj])),
        );
      }
    // the primaries, splayed like fingers and curling up at their tips
    const fingers = [
      { z: 0.07, len: 0.15, ang: 17 },
      { z: 0.036, len: 0.19, ang: 7 },
      { z: 0.0, len: 0.2, ang: -4 },
      { z: -0.036, len: 0.185, ang: -15 },
      { z: -0.07, len: 0.15, ang: -26 },
    ];
    for (const f of fingers) {
      const a = (f.ang * Math.PI) / 180;
      const ux = Math.cos(a);
      const uz = Math.sin(a);
      const root = [0.43, f.z];
      const at = (t: number, w: number): V3 => {
        const x = root[0] + ux * f.len * t - uz * w;
        const z = root[1] + uz * f.len * t + ux * w;
        return [x * side, 0.03 * t * t, z];
      };
      const w0 = 0.026;
      const w1 = 0.018;
      const c0 = [PALE, PALE, GREY, GREY];
      const c1 = [GREY, GREY, TIPS, TIPS];
      const t0 = [BROWN, BROWN, BROWN_DARK, BROWN_DARK];
      sheet(at(0, -w0), at(0, w0), at(0.55, w1 + 0.004), at(0.55, -w1 - 0.004), t0, c0);
      sheet(at(0.55, -w1 - 0.004), at(0.55, w1 + 0.004), at(0.92, w1 * 0.6), at(0.92, -w1 * 0.6), [BROWN_DARK, BROWN_DARK, TIPS, TIPS], c1);
      tri(at(0.92, -w1 * 0.6), at(0.92, w1 * 0.6), at(1, 0), TIPS, TIPS, TIPS, [0, 1, 0]);
      tri(at(0.92, -w1 * 0.6), at(0.92, w1 * 0.6), at(1, 0), TIPS, TIPS, TIPS, [0, -1, 0]);
    }
  }

  // the tail, fanned for soaring: brick red on top with a dark band and a pale tip
  onWing = 0;
  const FAN = 7;
  const ray = (k: number, r: number): V3 => {
    const f = k / FAN;
    const a = (-34 + 68 * f) * (Math.PI / 180);
    // from a root as broad as the rump, spreading into the fan
    const x0 = (f - 0.5) * 0.08;
    return [x0 + Math.sin(a) * r, 0.004, -0.13 - Math.cos(a) * r];
  };
  for (let k = 0; k < FAN; k++) {
    sheet(ray(k, 0), ray(k + 1, 0), ray(k + 1, 0.16), ray(k, 0.16), [RUFOUS, RUFOUS, RUFOUS, RUFOUS], [TAIL_UNDER, TAIL_UNDER, TAIL_UNDER, TAIL_UNDER]);
    sheet(ray(k, 0.16), ray(k + 1, 0.16), ray(k + 1, 0.195), ray(k, 0.195), [RUFOUS, RUFOUS, BROWN_DARK, BROWN_DARK], [TAIL_UNDER, TAIL_UNDER, GREY, GREY]);
    sheet(ray(k, 0.195), ray(k + 1, 0.195), ray(k + 1, 0.21), ray(k, 0.21), [PALE, PALE, PALE, PALE], [PALE, PALE, PALE, PALE]);
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setAttribute('wing', new Float32BufferAttribute(wing, 1));
  g.computeVertexNormals();
  return g;
}

/** raise each wing at the shoulder and bend its hand at the wrist, in the vertex shader */
function flapMaterial(): { mat: MeshLambertMaterial; shoulder: { value: number }; wrist: { value: number } } {
  const shoulder = { value: GLIDE_SHOULDER };
  const wrist = { value: GLIDE_WRIST };
  const mat = new MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uShoulder = shoulder;
    shader.uniforms.uWrist = wrist;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform float uShoulder;
        uniform float uWrist;
        attribute float wing;
        vec2 hawkRot(vec2 v, float a) { float c = cos(a); float s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
        vec3 hawkFlap(vec3 p) {
          if (wing < 0.5) return p;
          float sd = p.x < 0.0 ? -1.0 : 1.0;
          vec2 q = vec2(abs(p.x), p.y);
          if (q.x > ${WRIST.toFixed(3)}) q = vec2(${WRIST.toFixed(3)}, 0.0) + hawkRot(q - vec2(${WRIST.toFixed(3)}, 0.0), uWrist);
          if (q.x > ${SHOULDER.toFixed(3)}) q = vec2(${SHOULDER.toFixed(3)}, 0.0) + hawkRot(q - vec2(${SHOULDER.toFixed(3)}, 0.0), uShoulder);
          return vec3(q.x * sd, q.y, p.z);
        }
        vec3 hawkFlapN(vec3 p, vec3 n) {
          if (wing < 0.5) return n;
          float sd = p.x < 0.0 ? -1.0 : 1.0;
          float ax = abs(p.x);
          float a = (ax > ${WRIST.toFixed(3)} ? uWrist : 0.0) + (ax > ${SHOULDER.toFixed(3)} ? uShoulder : 0.0);
          vec2 m = hawkRot(vec2(n.x * sd, n.y), a);
          return vec3(m.x * sd, m.y, n.z);
        }`,
      )
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = hawkFlapN(position, normal);')
      .replace('#include <begin_vertex>', 'vec3 transformed = hawkFlap(position);');
  };
  // the sky's light, scattered up off the ground and through the feathers: without it a hawk
  // overhead is a black cut-out and you'd never see the pale underside
  mat.onBeforeCompile = ((compile) => (shader, r) => {
    compile(shader, r);
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= diffuseColor.rgb;');
  })(mat.onBeforeCompile);
  mat.customProgramCacheKey = () => 'hawk-flap';
  return { mat, shoulder, wrist };
}

/* ── the flight ────────────────────────────────────────────────────────── */

interface Thermal {
  x: number;
  z: number;
  /** the circle's radius, and the height it's climbed to */
  r: number;
  alt: number;
  top: number;
  /** +1 one way round, −1 the other */
  turn: number;
}

type Mode = 'in' | 'soar' | 'out';

const angleTo = (from: number, to: number): number => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

class Hawk {
  readonly mesh: Mesh;
  private readonly shoulder: { value: number };
  private readonly wrist: { value: number };
  readonly pos = new Vector3();
  private heading = 0;
  private omega = 0;
  private vy = 0;
  private speed = 12;
  mode: Mode = 'in';
  /** it's circled long enough: the flock (Hawks) picks it a way out */
  done = false;
  private away = 0;
  private outAlt = 0;
  private soarFor = 0;
  private flapIn = 0;
  private flapping = 0;
  private flapAmp = 0;
  private phase = 0;
  private wobble = Math.random() * 100;
  cryIn = 0;
  private altOffset = 0;

  constructor() {
    const { mat, shoulder, wrist } = flapMaterial();
    this.shoulder = shoulder;
    this.wrist = wrist;
    this.mesh = new Mesh(hawkGeometry(), mat);
    this.mesh.name = 'hawk';
    this.mesh.rotation.order = 'YXZ';
    // a big female: 1.4 m across
    this.mesh.scale.setScalar(1.1);
    this.mesh.visible = false;
  }

  /** come in from `from` toward the thermal, and circle it for `soar` seconds */
  launch(from: Vector3, t: Thermal, soar: number, altOffset: number): void {
    this.pos.copy(from);
    this.heading = Math.atan2(t.x - from.x, t.z - from.z);
    this.omega = 0;
    this.vy = 0;
    this.mode = 'in';
    this.done = false;
    this.soarFor = soar;
    this.altOffset = altOffset;
    this.flapIn = 2 + Math.random() * 4;
    this.cryIn = 6 + Math.random() * 10;
    this.mesh.visible = true;
  }

  /** glide off toward `away` (a heading), holding its height */
  leave(away: number): void {
    this.mode = 'out';
    this.away = away;
    this.outAlt = this.pos.y;
  }

  /** `floor`: the least height it'll fly at here, clear of the ground under and ahead of it */
  update(dt: number, t: Thermal, time: number, floor: number): void {
    const dx = this.pos.x - t.x;
    const dz = this.pos.z - t.z;
    const d = Math.hypot(dx, dz) || 1;
    let want = this.heading;
    let alt = t.alt + this.altOffset;
    if (this.mode === 'in') {
      // aim for the near edge of the circle, so it swings into the turn rather than across it
      const side = Math.atan2(-dx, -dz) - t.turn * Math.asin(Math.min(1, t.r / d));
      want = side;
      this.speed += (13 - this.speed) * dt * 0.5;
      if (d < t.r * 1.25) this.mode = 'soar';
    } else if (this.mode === 'soar') {
      // round the circle: along the tangent, steered back onto the radius
      const tx = (-dz / d) * t.turn;
      const tz = (dx / d) * t.turn;
      const k = Math.max(-1.2, Math.min(1.2, ((d - t.r) / t.r) * 2.5));
      want = Math.atan2(tx - (dx / d) * k, tz - (dz / d) * k);
      this.speed += (9.5 - this.speed) * dt * 0.4;
      this.soarFor -= dt;
      if (this.soarFor <= 0) this.done = true;
    } else {
      // a long, shallow glide away
      want = this.away;
      this.outAlt -= dt * 0.4;
      alt = this.outAlt;
      this.speed += (14 - this.speed) * dt * 0.3;
    }
    const low = this.pos.y < floor;
    alt = Math.max(alt, floor);

    const turn = Math.max(-0.42, Math.min(0.42, angleTo(this.heading, want) * 1.1));
    this.omega += (turn - this.omega) * Math.min(1, dt * 1.4);
    this.heading += this.omega * dt;
    // (and a hard climb, beating, if the ground's coming up at it)
    const vyWant = Math.max(-2.2, Math.min(low ? 4 : 1.4, (alt - this.pos.y) * 0.25));
    this.vy += (vyWant - this.vy) * Math.min(1, dt * (low ? 2 : 0.8));
    if (low && this.flapping <= 0) this.flapIn = 0;
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    this.pos.y += this.vy * dt;

    // a few deep beats now and then (more of them on the way in), otherwise gliding
    this.flapIn -= dt;
    if (this.flapIn <= 0 && this.flapping <= 0) {
      this.flapping = (3 + Math.floor(Math.random() * 3)) / 3.1;
      this.flapIn = this.mode === 'soar' ? 9 + Math.random() * 14 : 4 + Math.random() * 6;
    }
    this.flapping -= dt;
    const beating = this.flapping > 0;
    this.flapAmp += ((beating ? 1 : 0) - this.flapAmp) * Math.min(1, dt * 6);
    if (beating || this.flapAmp > 0.02) this.phase += dt * 3.1 * Math.PI * 2;
    else this.phase = 0;
    const s = Math.sin(this.phase);
    this.shoulder.value = GLIDE_SHOULDER + this.flapAmp * (0.62 * s - 0.08);
    this.wrist.value = GLIDE_WRIST - this.flapAmp * 0.32 * Math.max(0, Math.sin(this.phase - 1.1));

    // banked into the turn (a touch more than a plane would, so you can read it from below),
    // nosed with the climb, and teetering in the gusts
    const w = this.wobble + time;
    const bank = Math.max(-0.6, Math.min(0.6, -Math.atan((this.speed * this.omega) / G) * 1.5)) + (Math.sin(w * 1.3) * 0.05 + Math.sin(w * 2.9) * 0.025) * (1 - this.flapAmp);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(-Math.atan2(this.vy, this.speed) + Math.sin(w * 0.9) * 0.02, this.heading, bank);
  }
}

/* ── the visits ────────────────────────────────────────────────────────── */

export class Hawks {
  readonly group = new Group();
  private readonly birds = [new Hawk(), new Hawk()];
  private readonly thermal: Thermal = { x: 0, z: 0, r: 40, alt: 60, top: 100, turn: 1 };
  /** seconds to the next visit; the first comes soon after you arrive */
  private wait = 30 + Math.random() * 25;
  private mateIn = -1;
  private time = 0;
  private readonly eye = new Vector3();
  private readonly from = new Vector3();
  private readonly fill = new Color();

  constructor(
    private readonly ground: Heightfield,
    private readonly sky: SkyState,
    private readonly indoors: () => boolean = () => false,
  ) {
    this.group.name = 'hawks';
    for (const b of this.birds) this.group.add(b.mesh);
  }

  update(dt: number, camera: Camera): void {
    if (dt <= 0) return;
    this.time += dt;
    this.eye.setFromMatrixPosition(camera.matrixWorld);
    const day = this.sky.night.value < 0.25;
    // the fill: as bright as the sky's light, warmed by the ground it comes up off
    const e = this.sky.skyE;
    this.fill.setRGB(1, 0.94, 0.84).multiplyScalar((e.r * 0.3 + e.g * 0.6 + e.b * 0.1) * 0.24);
    const up = this.birds.filter((b) => b.mesh.visible);

    if (!up.length) {
      if (day) this.wait -= dt;
      if (this.wait <= 0) this.visit();
    }
    if (this.mateIn > 0) {
      this.mateIn -= dt;
      if (this.mateIn <= 0) this.launch(this.birds[1], 12 + Math.random() * 10);
    }

    const t = this.thermal;
    t.alt = Math.min(t.top, t.alt + dt * 0.35);
    for (const b of up) {
      if (b.mode !== 'out' && (b.done || !day)) b.leave(this.clearWay(b.pos.x, b.pos.z, b.pos.y, b.pos.y - 35));
      (b.mesh.material as MeshLambertMaterial).emissive.copy(this.fill);
      b.update(dt, t, this.time, this.floorAt(b));
      const far = Math.hypot(b.pos.x - this.eye.x, b.pos.z - this.eye.z);
      if (b.mode === 'out' && far > GONE) {
        b.mesh.visible = false;
        if (!this.birds.some((o) => o.mesh.visible)) this.wait = 90 + Math.random() * 150;
      }
      // a scream, now and then, while it's near enough to hear
      b.cryIn -= dt;
      if (b.cryIn <= 0) {
        b.cryIn = b.mode === 'soar' ? 16 + Math.random() * 30 : 10 + Math.random() * 10;
        if (far < 450 && !this.indoors()) hawkCry(b.pos, 0.55);
      }
    }
  }

  /** find a thermal near the viewer (over the land if there's any about) and send a hawk to it */
  private visit(): void {
    const t = this.thermal;
    let best = -Infinity;
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 35 + Math.random() * 100;
      const x = this.eye.x + Math.cos(a) * r;
      const z = this.eye.z + Math.sin(a) * r;
      // thermals come off warm ground: a bit of a preference for land
      const score = Math.min(this.ground.heightAt(x, z), 30) + Math.random() * 20;
      if (score > best) {
        best = score;
        t.x = x;
        t.z = z;
      }
    }
    t.r = 30 + Math.random() * 25;
    // clear of the ground all round the circle, and of your head
    let floor = Math.max(0, this.eye.y);
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i === 8 ? 0 : t.r * 1.2;
      floor = Math.max(floor, this.ground.heightAt(t.x + Math.cos(a) * r, t.z + Math.sin(a) * r));
    }
    t.alt = floor + 28 + Math.random() * 30;
    t.top = t.alt + 35 + Math.random() * 40;
    t.turn = Math.random() < 0.5 ? 1 : -1;
    this.launch(this.birds[0], 0);
    this.mateIn = Math.random() < 0.3 ? 5 + Math.random() * 10 : -1;
  }

  private launch(b: Hawk, altOffset: number): void {
    const t = this.thermal;
    const y = t.alt + altOffset + 30 + Math.random() * 30;
    // it comes in along a line clear of the hills
    const h = this.clearWay(t.x, t.z, t.alt + altOffset, y);
    this.from.set(t.x + Math.sin(h) * REACH, y, t.z + Math.cos(h) * REACH);
    b.launch(this.from, t, 70 + Math.random() * 80, altOffset);
  }

  /**
   * A heading out from (x, z) for a hawk gliding from height y0 to y1 over REACH metres: one
   * with good clearance over the ground all the way (the island's peak is 300 m), the most
   * clearance if none is good.
   */
  private clearWay(x: number, z: number, y0: number, y1: number): number {
    let best = 0;
    let bestClear = -Infinity;
    const start = Math.random() * Math.PI * 2;
    for (let k = 0; k < 12; k++) {
      const h = start + (k / 12) * Math.PI * 2;
      let clear = Infinity;
      for (let i = 1; i <= 16; i++) {
        const f = i / 16;
        clear = Math.min(clear, y0 + (y1 - y0) * f - this.ground.heightAt(x + Math.sin(h) * REACH * f, z + Math.cos(h) * REACH * f));
      }
      if (clear > 30) return h;
      if (clear > bestClear) {
        bestClear = clear;
        best = h;
      }
    }
    return best;
  }

  /** how low a hawk may fly where it is: 18 m over the ground under it and 40 m ahead, or the sea */
  private floorAt(b: Hawk): number {
    const { x, z } = b.pos;
    const fx = Math.sin(b.mesh.rotation.y) * 40;
    const fz = Math.cos(b.mesh.rotation.y) * 40;
    return Math.max(0, this.ground.heightAt(x, z), this.ground.heightAt(x + fx, z + fz)) + 18;
  }
}
