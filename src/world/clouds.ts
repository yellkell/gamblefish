/**
 * Fair-weather cumulus over the island, drifting on the trade wind. Tidewater raymarches
 * volumetric clouds; on Quest each cloud is a heap of soft puffs (camera-facing sprites) with a
 * flat base, lit as little spheres by the sky's key light (world/sky.ts: the sun, or the moon
 * after dark) and its sky light: bright domed tops, grey-blue bellies, a silver edge when they
 * cross the sun, pink undersides at sunset, and faint moonlit shapes against the stars. The far
 * ones melt into the same haze the dome has at their height, so none is ever cut off.
 *
 * One instanced draw for the whole sky. The field is a tile that wraps round the viewer, so
 * wherever you stand there are clouds all the way to the horizon; the puffs (about 1200)
 * blend, so a few times a second they're sorted back to front on the CPU. Only the ones that can
 * reach inside the fade-out are drawn (the rest would be thrown away pixel by pixel), and what's
 * the same all over a puff (its haze, its silver lining, the sun's angle to it) is worked out
 * once a corner in the vertex shader rather than for every pixel it covers.
 */

import {
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  PlaneGeometry,
  RGBAFormat,
  ShaderMaterial,
  Vector3,
  type Camera,
} from 'three';
import type { SkyState } from './sky.ts';

/** the tile the clouds wrap in (m), and how far out they're still drawn */
const TILE = 10000;
const REACH = 4700;
const CLOUDS = 95;
/** how often the puffs are re-laid and re-sorted (s); between, the wind carries them in the shader */
const RESORT = 0.3;
/**
 * slack on the reach when choosing which puffs to draw (m): the viewer may walk 5 m before a
 * re-lay, and the wind carries them a metre or so between, more over a hitch
 */
const SLACK = 60;
/** the most a puff's sprite swells by (the shader's `swell`) */
const SWELL = 1.06;
/** metres a second, toward −x (the trades blow from the east) and a little to the south */
const WIND = new Vector3(-4.2, 0, 1.1);

/** a tiny seeded random, so the sky is the same every visit */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Four puff shapes in a 2×2 atlas: a round body whose edge is eaten into by cauliflower
 * lumps (value-noise fbm). Alpha is the puff's density.
 */
function puffAtlas(): DataTexture {
  const N = 128;
  const W = N * 2;
  const data = new Uint8Array(W * W * 4);
  const r = rng(7);
  const lattice = new Float32Array(64 * 64).map(() => r());
  const vnoise = (x: number, y: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const at = (i: number, j: number): number => lattice[(((j & 63) * 64) + (i & 63))];
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * sx;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * sx;
    return a + (b - a) * sy;
  };
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * N;
    const oy = Math.floor(v / 2) * N;
    const off = v * 17.3;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const u = (x + 0.5) / N * 2 - 1;
        const w = (y + 0.5) / N * 2 - 1;
        const d = Math.hypot(u, w);
        let f = 0;
        let amp = 0.5;
        let fr = 3;
        for (let o = 0; o < 4; o++) {
          f += amp * vnoise(u * fr + off, w * fr + off * 0.7);
          amp *= 0.5;
          fr *= 2.1;
        }
        // lumpy rim: the noise pushes the edge in and out; the core stays dense
        const edge = 0.78 + (f - 0.47) * 0.55;
        const t = Math.min(1, Math.max(0, (edge - d) / 0.3));
        const dens = t * t * (3 - 2 * t) * (0.82 + 0.18 * f);
        const i = ((oy + y) * W + ox + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 255;
        data[i + 3] = Math.round(Math.min(1, dens) * 255);
      }
  }
  const tex = new DataTexture(data, W, W, RGBAFormat);
  tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

interface Puff {
  /** offset from the cloud's anchor (m) */
  x: number;
  y: number;
  z: number;
  /** sprite half-size across and up (m) */
  sx: number;
  sy: number;
  rot: number;
  tex: number;
  /** 0 at the cloud's base .. 1 at its top */
  h: number;
  /** the farthest its sprite reaches from its centre, any way it's turned (m) */
  ext: number;
}

interface Cloud {
  x: number;
  z: number;
  base: number;
  puffs: Puff[];
}

/** a cumulus: a broad flat-bottomed heap, with smaller domes climbing on the sun-warmed middle */
function makeCloud(r: () => number): Cloud {
  const big = r();
  const w = 110 + 260 * big * big;
  const depth = w * (0.55 + 0.35 * r());
  const tall = w * (0.3 + 0.35 * r());
  const base = 520 + r() * 140;
  const n = Math.round(7 + 11 * big);
  const puffs: Puff[] = [];
  for (let i = 0; i < n; i++) {
    // the first few lay the base, the rest pile up in the middle
    const low = i < Math.ceil(n * 0.45);
    const a = r() * Math.PI * 2;
    const rr = Math.sqrt(r()) * (low ? 1 : 0.6);
    const px = Math.cos(a) * rr * w * 0.5;
    const pz = Math.sin(a) * rr * depth * 0.5;
    const dome = Math.sqrt(Math.max(0, 1 - rr * rr));
    const h = low ? r() * 0.2 : (0.25 + 0.75 * r()) * dome;
    const size = w * (low ? 0.26 + 0.1 * r() : 0.17 + 0.12 * r()) * (1 - 0.35 * h);
    puffs.push({
      x: px,
      y: h * tall + size * 0.55,
      z: pz,
      sx: size * (low ? 1.35 : 1.05),
      sy: size,
      rot: r() * Math.PI * 2,
      tex: Math.floor(r() * 4),
      h,
      ext: 0,
    });
    const p = puffs[puffs.length - 1];
    p.ext = Math.hypot(p.sx, p.sy) * SWELL;
  }
  return { x: (r() - 0.5) * TILE, z: (r() - 0.5) * TILE, base, puffs };
}

export class Clouds {
  readonly mesh: Mesh;
  private readonly geometry: InstancedBufferGeometry;
  private readonly clouds: Cloud[];
  private readonly count: number;
  private readonly iPos: InstancedBufferAttribute;
  private readonly iShape: InstancedBufferAttribute;
  private readonly iCloud: InstancedBufferAttribute;
  private readonly order: Int32Array;
  private readonly dist: Float32Array;
  private readonly wx: Float32Array;
  private readonly wy: Float32Array;
  private readonly wz: Float32Array;
  private readonly flat: { c: Cloud; p: Puff }[] = [];
  private readonly drift = new Vector3();
  /** the drift the puffs were last laid out with (the shader adds the rest) */
  private readonly laid = new Vector3();
  private readonly uDrift = { value: new Vector3() };
  private readonly eye = new Vector3();
  private readonly laidEye = new Vector3(Infinity, 0, 0);
  private sinceLaid = Infinity;
  private readonly key: Color;
  private readonly amb: Color;
  private time = 0;

  constructor(private readonly sky: SkyState) {
    const r = rng(1905);
    this.clouds = Array.from({ length: CLOUDS }, () => makeCloud(r));
    for (const c of this.clouds) for (const p of c.puffs) this.flat.push({ c, p });
    const n = (this.count = this.flat.length);
    this.order = new Int32Array(n).map((_, i) => i);
    this.dist = new Float32Array(n);
    this.wx = new Float32Array(n);
    this.wy = new Float32Array(n);
    this.wz = new Float32Array(n);

    const g = new InstancedBufferGeometry();
    const quad = new PlaneGeometry(2, 2);
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    g.setAttribute('uv', quad.getAttribute('uv'));
    g.instanceCount = n;
    this.geometry = g;
    const attr = (size: number): InstancedBufferAttribute => new InstancedBufferAttribute(new Float32Array(n * size), size).setUsage(DynamicDrawUsage);
    this.iPos = attr(3);
    /** half-width, half-height, rotation, atlas cell */
    this.iShape = attr(4);
    /** the cloud's base altitude, height in the cloud, opacity, a seed */
    this.iCloud = attr(4);
    g.setAttribute('iPos', this.iPos);
    g.setAttribute('iShape', this.iShape);
    g.setAttribute('iCloud', this.iCloud);

    this.key = new Color();
    this.amb = new Color();
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTex: { value: puffAtlas() },
        uSunDir: { value: sky.sunDir },
        uZenith: { value: sky.zenith },
        uHorizon: { value: sky.horizon },
        uKey: { value: this.key },
        uAmb: { value: this.amb },
        uTime: { value: 0 },
        uDrift: this.uDrift,
        uReach: { value: REACH },
      },
      vertexShader: /* glsl */ `
        attribute vec3 iPos;
        attribute vec4 iShape;
        attribute vec4 iCloud;
        uniform float uTime;
        uniform vec3 uDrift;
        uniform vec3 uSunDir;
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uKey;
        uniform float uReach;
        varying vec2 vUv;
        varying vec2 vQuad;
        varying vec2 vCell;
        varying vec3 vWorld;
        varying vec4 vCloud;
        // the sun and world-up in the sprite's own frame (right, up, toward you)
        varying vec3 vSunL;
        varying vec3 vUpL;
        varying float vHBase;
        varying vec3 vSilver;
        varying vec3 vSky;
        varying float vHaze;
        void main() {
          vec3 at = iPos + uDrift;
          vec3 toCam = cameraPosition - at;
          float dist = length(toCam);
          toCam /= dist;
          // face the viewer, kept upright; straight overhead, north stands in for up
          vec3 ref = normalize(mix(vec3(0.0, 1.0, 0.0), vec3(0.0, 0.0, 1.0), smoothstep(0.75, 0.98, abs(toCam.y))));
          vec3 right = normalize(cross(ref, toCam));
          vec3 up = cross(toCam, right);
          // the puffs turn and swell very slowly: the heap seems to boil
          float seed = iCloud.w;
          float rot = iShape.z + uTime * 0.004 * (fract(seed * 7.13) - 0.5);
          float swell = 1.0 + 0.06 * sin(uTime * 0.05 + seed * 6.2832);
          vec2 q = position.xy * iShape.xy * swell;
          vec3 p = at + right * q.x + up * q.y;
          float c = cos(rot);
          float s = sin(rot);
          vUv = mat2(c, s, -s, c) * position.xy;
          vQuad = position.xy;
          vCell = vec2(mod(iShape.w, 2.0), floor(iShape.w / 2.0)) * 0.5;
          vWorld = p;
          vCloud = iCloud;
          vSunL = vec3(dot(right, uSunDir), dot(up, uSunDir), dot(toCam, uSunDir));
          vUpL = vec3(right.y, up.y, toCam.y);
          // how high in the cloud: the part that doesn't hang on the puff's own curve
          vHBase = iCloud.y * 0.7 + (p.y - iCloud.x) / 220.0 * 0.3;
          // a silver lining on the thin edges when the cloud crosses the sun
          float toward = max(-vSunL.z, 0.0);
          vSilver = uKey * pow(toward, 24.0) * 1.4;
          // the same haze the dome has in this direction, thicker with distance
          vec3 d = normalize(p - cameraPosition);
          vSky = mix(uHorizon, uZenith, pow(max(d.y, 0.0), 0.5));
          vHaze = smoothstep(700.0, uReach * 1.05, dist) * 0.8;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex;
        uniform vec3 uKey;
        uniform vec3 uAmb;
        uniform float uReach;
        varying vec2 vUv;
        varying vec2 vQuad;
        varying vec2 vCell;
        varying vec3 vWorld;
        varying vec4 vCloud;
        varying vec3 vSunL;
        varying vec3 vUpL;
        varying float vHBase;
        varying vec3 vSilver;
        varying vec3 vSky;
        varying float vHaze;
        void main() {
          vec2 uv = clamp(vUv, -1.0, 1.0);
          float dens = texture2D(uTex, vCell + (uv * 0.5 + 0.5) * 0.5).a;
          // the flat base: the heap sits on the condensation level
          dens *= smoothstep(-6.0, 22.0, vWorld.y - vCloud.x);
          float a = dens * vCloud.z;
          // far out, thin away into the haze (and never pop at the tile's edge)
          float horiz = length((vWorld - cameraPosition).xz);
          a *= 1.0 - smoothstep(uReach * 0.62, uReach, horiz);
          if (a < 0.004) discard;

          // lit as a soft sphere: wrapped diffuse from the key light over the light a cloud
          // scatters round inside itself (never black), domed tops, greyer bellies. The normal
          // is in the sprite's frame: unit on the disc, the corners pulled back onto its rim.
          float r2 = dot(vQuad, vQuad);
          vec3 n = vec3(vQuad, sqrt(max(0.0, 1.0 - min(r2, 1.0)))) * inversesqrt(max(r2, 1.0));
          float wrap = clamp(dot(n, vSunL) * 0.5 + 0.5, 0.0, 1.0);
          float h = clamp(vHBase + dot(n, vUpL) * 0.25, 0.0, 1.0);
          vec3 col = uAmb * mix(0.8, 1.15, h) + uKey * mix(0.28, 1.0, wrap * wrap) * mix(0.55, 1.0, h);
          float thin = 1.0 - dens;
          col += vSilver * thin * thin;
          col = mix(col, vSky, vHaze);
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new Mesh(g, mat);
    this.mesh.name = 'clouds';
    this.mesh.frustumCulled = false;
    // after the dome, before the sea (which covers the ones past the horizon)
    this.mesh.renderOrder = 0;
  }

  /** drift on the wind, and now and then re-lay and re-sort for this viewpoint (call once a frame) */
  update(dt: number, camera: Camera): void {
    // in XR this comes once per eye: the second one (no time gone by) keeps the first's order
    if (dt <= 0) return;
    this.time += dt;
    (this.mesh.material as ShaderMaterial).uniforms.uTime.value = this.time;
    this.drift.addScaledVector(WIND, dt);
    this.eye.setFromMatrixPosition(camera.matrixWorld);
    this.light();
    this.sinceLaid += dt;
    // a teleport, or time for the wind to have shuffled them
    const moved = this.eye.distanceToSquared(this.laidEye) > 25;
    if (this.sinceLaid >= RESORT || moved) this.lay(moved);
    this.uDrift.value.subVectors(this.drift, this.laid);
  }

  /**
   * Every puff where the wind has it, round the tile centred on the viewer, back to front: only
   * the ones some part of which can come inside the reach (the shader fades the rest to nothing).
   */
  private lay(jumped: boolean): void {
    this.sinceLaid = 0;
    this.laid.copy(this.drift);
    this.laidEye.copy(this.eye);
    const ex = this.eye.x;
    const ez = this.eye.z;
    const half = TILE / 2;
    const wrap = (v: number): number => v - Math.floor(v / TILE) * TILE - half;
    const n = this.count;
    for (let i = 0; i < n; i++) {
      const { c, p } = this.flat[i];
      const cx = ex + wrap(c.x + this.drift.x - ex + half);
      const cz = ez + wrap(c.z + this.drift.z - ez + half);
      this.wx[i] = cx + p.x;
      this.wy[i] = c.base + p.y;
      this.wz[i] = cz + p.z;
      const dx = this.wx[i] - ex;
      const dy = this.wy[i] - this.eye.y;
      const dz = this.wz[i] - ez;
      this.dist[i] = dx * dx + dy * dy + dz * dz;
    }
    const dist = this.dist;
    const order = this.order;
    if (jumped) order.sort((a, b) => dist[b] - dist[a]);
    else {
      // a third of a second on, the order has barely changed: an insertion sort is next to free
      for (let k = 1; k < n; k++) {
        const i = order[k];
        const d = dist[i];
        let j = k - 1;
        while (j >= 0 && dist[order[j]] < d) {
          order[j + 1] = order[j];
          j--;
        }
        order[j + 1] = i;
      }
    }

    const pos = this.iPos.array as Float32Array;
    const shape = this.iShape.array as Float32Array;
    const cl = this.iCloud.array as Float32Array;
    const far = REACH + SLACK;
    let k = 0;
    for (let o = 0; o < n; o++) {
      const i = order[o];
      const { c, p } = this.flat[i];
      if (Math.hypot(this.wx[i] - ex, this.wz[i] - ez) - p.ext > far) continue;
      pos[k * 3] = this.wx[i];
      pos[k * 3 + 1] = this.wy[i];
      pos[k * 3 + 2] = this.wz[i];
      shape[k * 4] = p.sx;
      shape[k * 4 + 1] = p.sy;
      shape[k * 4 + 2] = p.rot;
      shape[k * 4 + 3] = p.tex;
      cl[k * 4] = c.base;
      cl[k * 4 + 1] = p.h;
      cl[k * 4 + 2] = 1;
      cl[k * 4 + 3] = (i * 0.618034) % 1;
      k++;
    }
    this.geometry.instanceCount = k;
    for (const [a, size] of [[this.iPos, 3], [this.iShape, 4], [this.iCloud, 4]] as const) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, k * size);
      a.needsUpdate = true;
    }
  }

  /**
   * The key and sky light on a cloud, from the sky's own: white in the afternoon, gold then rose
   * at sunset, and after dark only as bright as the moon makes them, a little above the sky.
   */
  private light(): void {
    const s = this.sky;
    // high up, they keep the sun a while after the beach has lost it: full light through the
    // sunset, only dimming as the dusk goes to night
    const n = Math.min(1, Math.max(0, (s.night.value - 0.5) / 0.5));
    const deep = n * n * (3 - 2 * n);
    this.key.copy(s.sunE).multiplyScalar(0.34 * (1 - 0.5 * deep));
    this.amb.copy(s.skyE).multiplyScalar(0.45 * (1 - 0.6 * deep)).lerp(s.zenith, 0.12 + 0.18 * deep);
  }
}
