/**
 * Water effects: droplets and ripples, pooled, one draw call each.
 *
 *   splash(p, strength)   a crown of droplets thrown up and out, and rings spreading from it
 *   ripple(p, size)       one ring (a nibble at the bobber, the bobber bobbing)
 *   drip(p, n, spread)    a few drops falling off something wet (the landed fish)
 *
 * Droplets fly ballistically and die where they meet the sea — each leaving a tiny ring — so a
 * splash reads the same from the pier as from the boat.
 *
 * Ripples ride the swell. A ring isn't a flat disc at one height: its vertex shader lifts every
 * point of it to the sea's height right there, from the ocean's own waves and clock (the same
 * Gerstner sum as world/ocean.ts and its heightAt), so a ring spreading over a passing crest
 * climbs it and dips into the trough behind instead of vanishing under it. It is drawn pulled a
 * few centimetres toward the eye in depth, which covers the sea mesh's coarser sampling of the
 * same surface without lifting the ring visibly off the water.
 */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Points,
  PointsMaterial,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  Vector3,
  Vector4,
} from 'three';

/** the ocean's swell uniforms (world/ocean.ts Ocean.swell) */
export interface Swell {
  uTime: { value: number };
  uWaves: { value: Vector4[] };
}

const ringVertex = /* glsl */ `
uniform float uTime;
uniform vec4 uWaves[4];
varying vec3 vFade;
void main() {
  vec4 p = modelMatrix * instanceMatrix * vec4(position, 1.0);
  // the sea's height here, now: the vertical part of the ocean's Gerstner sum (Ocean.heightAt)
  float y = 0.0;
  for (int i = 0; i < 4; i++) {
    float k = 6.2831853 / uWaves[i].z;
    float c = sqrt(9.8 / k);
    y += uWaves[i].w * sin(k * (dot(uWaves[i].xy, p.xz) - c * uTime));
  }
  vec4 view = viewMatrix * vec4(p.x, y + 0.01, p.z, 1.0);
  // toward the eye in depth: the sea mesh samples the surface coarser the farther it is
  float d = length(view.xyz);
  view.xyz *= 1.0 - min((0.05 + d * 0.004) / max(d, 0.01), 0.5);
  gl_Position = projectionMatrix * view;
  vFade = instanceColor;
}
`;

const ringFragment = /* glsl */ `
varying vec3 vFade;
void main() {
  gl_FragColor = vec4(vFade, 0.55);
  #include <colorspace_fragment>
}
`;

const DROPS = 700;
const RINGS = 40;

interface Pos {
  x: number;
  y: number;
  z: number;
}

function dropSprite(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(235,248,255,0.85)');
  grad.addColorStop(1, 'rgba(235,248,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new CanvasTexture(c);
}

const _m = new Matrix4();
const _q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
const _s = new Vector3();
const _p = new Vector3();
const _col = new Color();

export class WaterFx {
  readonly group = new Group();
  private readonly pos = new Float32Array(DROPS * 3);
  private readonly vel = new Float32Array(DROPS * 3);
  private readonly life = new Float32Array(DROPS);
  private readonly points: Points;
  private next = 0;

  private readonly rings: InstancedMesh;
  private readonly ring: { x: number; z: number; t: number; dur: number; r0: number; r1: number; delay: number; a: number }[] = [];

  /** heightAt: the sea surface under (x, z) now; swell: the ocean's waves, for the rings to ride */
  constructor(
    private readonly heightAt: (x: number, z: number) => number,
    swell?: Swell,
  ) {
    this.group.name = 'water-fx';
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage));
    this.life.fill(0);
    for (let i = 0; i < DROPS; i++) this.pos[i * 3 + 1] = -1e4;
    this.points = new Points(
      g,
      new PointsMaterial({ size: 0.045, map: dropSprite(), transparent: true, depthWrite: false, color: 0xe8f6ff, sizeAttenuation: true }),
    );
    this.points.frustumCulled = false;
    this.group.add(this.points);

    const rg = new RingGeometry(0.9, 1.0, 48, 1);
    const mat = new ShaderMaterial({
      vertexShader: ringVertex,
      fragmentShader: ringFragment,
      uniforms: { uTime: swell?.uTime ?? { value: 0 }, uWaves: swell?.uWaves ?? { value: [0, 1, 2, 3].map(() => new Vector4(1, 0, 1, 0)) } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const rings = new InstancedMesh(rg, mat, RINGS);
    rings.instanceMatrix.setUsage(DynamicDrawUsage);
    rings.count = 0;
    rings.frustumCulled = false;
    rings.renderOrder = 2;
    // additive rings fade by scaling their per-instance colour toward black
    rings.setColorAt(0, new Color(1, 1, 1));
    this.rings = rings;
    this.group.add(rings);
  }

  /** A crown of droplets and a set of spreading rings. strength 0..1+ */
  splash(p: Pos, strength = 0.5, rings = true): void {
    const n = Math.round(14 + strength * 70);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const out = (0.4 + Math.random() * 1.2) * (0.6 + strength);
      const up = (1.2 + Math.random() * 2.4) * (0.55 + strength * 0.9);
      this.spawn(p.x + Math.cos(a) * 0.05, p.y + 0.02, p.z + Math.sin(a) * 0.05, Math.cos(a) * out, up, Math.sin(a) * out);
    }
    if (rings) {
      const r = 0.25 + strength * 0.6;
      this.ripple(p, r * 2.4, 0, 1.3 + strength * 0.5);
      this.ripple(p, r * 3.6, 0.18, 1.7 + strength * 0.6);
      this.ripple(p, r * 5.0, 0.4, 2.2 + strength * 0.7);
    }
  }

  /** One ring spreading from p to `size` metres over `dur` seconds (after `delay`). */
  ripple(p: Pos, size = 0.8, delay = 0, dur = 1.4): void {
    if (this.ring.length >= RINGS) this.ring.shift();
    this.ring.push({ x: p.x, z: p.z, t: 0, dur, r0: size * 0.08, r1: size, delay, a: Math.min(1, 0.35 + size * 0.25) });
  }

  /** Drops falling off something wet: n drops within `spread` of p. */
  drip(p: Pos, n = 2, spread = 0.1): void {
    for (let i = 0; i < n; i++) {
      this.spawn(p.x + (Math.random() - 0.5) * spread, p.y + (Math.random() - 0.5) * spread, p.z + (Math.random() - 0.5) * spread, (Math.random() - 0.5) * 0.3, -0.2 - Math.random() * 0.4, (Math.random() - 0.5) * 0.3);
    }
  }

  private spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    const i = this.next;
    this.next = (this.next + 1) % DROPS;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = 3;
  }

  update(dt: number): void {
    // droplets: gravity, a little drag; into the sea they go (with a tiny ring)
    const P = this.pos;
    const V = this.vel;
    for (let i = 0; i < DROPS; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      V[i * 3 + 1] -= 9.81 * dt;
      const k = Math.exp(-dt * 0.6);
      V[i * 3] *= k;
      V[i * 3 + 2] *= k;
      P[i * 3] += V[i * 3] * dt;
      P[i * 3 + 1] += V[i * 3 + 1] * dt;
      P[i * 3 + 2] += V[i * 3 + 2] * dt;
      const sea = this.heightAt(P[i * 3], P[i * 3 + 2]);
      if (P[i * 3 + 1] < sea || this.life[i] <= 0) {
        if (this.life[i] > 0 && Math.random() < 0.18) this.ripple({ x: P[i * 3], y: sea, z: P[i * 3 + 2] }, 0.18, 0, 0.6);
        this.life[i] = 0;
        P[i * 3 + 1] = -1e4;
      }
    }
    (this.points.geometry.attributes.position as BufferAttribute).needsUpdate = true;

    // rings: grow and fade on the moving surface
    let n = 0;
    for (let i = this.ring.length - 1; i >= 0; i--) {
      const r = this.ring[i];
      r.t += dt;
      const t = (r.t - r.delay) / r.dur;
      if (t >= 1) {
        this.ring.splice(i, 1);
        continue;
      }
      if (t < 0) continue;
      const e = 1 - Math.pow(1 - t, 2.2); // fast out, slow settle
      const rad = r.r0 + (r.r1 - r.r0) * e;
      _p.set(r.x, 0, r.z); // (the shader lays it on the sea)
      _s.set(rad, rad, rad);
      this.rings.setMatrixAt(n, _m.compose(_p, _q, _s));
      const fade = r.a * (1 - t) * (1 - t);
      this.rings.setColorAt(n, _col.setRGB(fade, fade, fade));
      n++;
    }
    this.rings.count = n;
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
  }
}
