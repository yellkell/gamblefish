/**
 * THE STONES THEMSELVES: each gem cut the way a lapidary would cut it, and a shader that makes it
 * behave like one.
 *
 *  THE CUTS    built from the stone's outline (oval, pear, cushion, heart, trillion) as a
 *              brilliant: a table, a crown of kite and star facets stepping down to a thin girdle,
 *              and a pavilion of long facets to the culet, every ring turned half a facet on the
 *              last so the facets interlock. The emerald and baguette cuts are step cuts: flat
 *              terraces round a long table. The opal is a smooth cabochon. Every facet keeps its
 *              own flat normal.
 *  THE LIGHT   a stone's beauty is contrast: bright facets beside dark ones, flashing as you move.
 *              Each is lit by its own jeweller's studio (a dark room, a softbox overhead, strip
 *              lights round it) fixed in the world, so turning your head makes it scintillate.
 *              Through each facet you see the light that went in through the crown, bounced off
 *              a pavilion facet and came back out, split a little differently for red, green and
 *              blue (its fire), coloured by the path it took through the stone; over that, the
 *              surface's own reflection, strongest at a glancing angle.
 *  THE OPAL    no facets: a dark body, and patches of pure spectral colour that drift and change
 *              as you turn it (its play of colour).
 *  WATERMELON  a tourmaline pink at the heart and green at the rind, with a pale band between.
 *
 * Twinkles: little four-pointed stars that flash on a stone now and then, additive, the finishing
 * touch in the tray and in the rock.
 */

import {
  AdditiveBlending,
  DoubleSide,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  LatheGeometry,
  Mesh,
  Points,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import { GEMS, type Cut, type GemInfo } from './gems.ts';

/* ── the cuts ─────────────────────────────────────────────────────────── */

type Outline = (t: number) => [number, number];

const OUTLINES: Record<string, Outline> = {
  round: (t) => [Math.cos(t), Math.sin(t)],
  oval: (t) => [Math.cos(t) * 1.32, Math.sin(t)],
  // a teardrop, its point toward +x
  pear: (t) => {
    const x = Math.cos(t);
    const y = Math.sin(t) * Math.pow(Math.sin(t / 2) ** 2, 0.75);
    return [-x * 1.28, y * 1.25];
  },
  // a superellipse: square with its corners rounded
  cushion: (t) => {
    const c = Math.cos(t);
    const s = Math.sin(t);
    const r = Math.pow(Math.abs(c) ** 3.2 + Math.abs(s) ** 3.2, -1 / 3.2);
    return [c * r * 0.98, s * r * 0.98];
  },
  // a triangle with its sides bowed out a little
  trillion: (t) => {
    const k = (Math.PI * 2) / 3;
    const u = ((((t - Math.PI / 2) % k) + k) % k) - k / 2;
    const r = (0.5 / Math.cos(u)) * (1 + 0.16 * Math.cos(u * 3)) * 1.55;
    return [Math.cos(t) * r, Math.sin(t) * r];
  },
  // the heart, its point toward −z (away from you in the tray it lies top up)
  heart: (t) => {
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return [x / 15.5, (y + 2.5) / 15.5];
  },
};

/**
 * A brilliant cut on an outline: rings of [radius scale, height, turned half a facet] from the
 * table to the culet. `n` facets round (even).
 */
function brilliantCut(outline: Outline, n: number): BufferGeometry {
  const rings: [number, number, number][] = [
    [0.54, 0.36, 0], // the table's edge
    [0.8, 0.22, 0.5], // the star facets' points
    [1.0, 0.035, 0], // the girdle, top
    [1.0, -0.035, 0], // and bottom
    [0.62, -0.42, 0.5], // the lower girdle facets' points
  ];
  const culet: [number, number] = [0, -0.84];
  const at = (k: number, i: number): Vector3 => {
    const [s, y, turn] = rings[k];
    const t = ((i + turn) / n) * Math.PI * 2;
    const [x, z] = outline(t);
    return new Vector3(x * s, y, z * s);
  };
  const pos: number[] = [];
  const tri = (a: Vector3, b: Vector3, c: Vector3): void => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  // the table: a fan from its centre (flat, so it reads as one facet)
  const top = new Vector3(0, rings[0][1], 0);
  for (let i = 0; i < n; i++) tri(top, at(0, i + 1), at(0, i));
  // between each pair of rings
  for (let k = 0; k < rings.length - 1; k++) {
    const d = rings[k + 1][2] - rings[k][2];
    for (let i = 0; i < n; i++) {
      if (d === 0) {
        // a quad: two triangles
        tri(at(k, i), at(k, i + 1), at(k + 1, i + 1));
        tri(at(k, i), at(k + 1, i + 1), at(k + 1, i));
      } else if (d > 0) {
        // the lower ring turned forward: zig-zag
        tri(at(k, i), at(k, i + 1), at(k + 1, i));
        tri(at(k + 1, i), at(k, i + 1), at(k + 1, i + 1));
      } else {
        tri(at(k, i), at(k, i + 1), at(k + 1, i + 1));
        tri(at(k, i + 1), at(k + 1, i + 2), at(k + 1, i + 1));
      }
    }
  }
  // the pavilion's long facets down to the culet
  const bottom = new Vector3(culet[0], culet[1], 0);
  const last = rings.length - 1;
  for (let i = 0; i < n; i++) tri(at(last, i), at(last, i + 1), bottom);
  return flat(pos);
}

/**
 * A step cut: an octagon (a rectangle with its corners cut), in terraces. `len` is its length
 * against its width of 1.
 */
function stepCut(len: number): BufferGeometry {
  const hw = 1;
  const hl = len;
  const cc = 0.28;
  const corners: [number, number][] = [
    [hl, hw - cc],
    [hl - cc, hw],
    [-hl + cc, hw],
    [-hl, hw - cc],
    [-hl, -hw + cc],
    [-hl + cc, -hw],
    [hl - cc, -hw],
    [hl, -hw + cc],
  ];
  // [inset (m in from the outline, on every side alike), height]
  const rings: [number, number][] = [
    [0.36, 0.3],
    [0.2, 0.22],
    [0.08, 0.13],
    [0, 0.035],
    [0, -0.035],
    [0.24, -0.3],
    [0.46, -0.52],
    [0.66, -0.66],
  ];
  const n = corners.length;
  // an inset octagon: each corner moved in along its bisector so every side moves in by `d`
  const ring = (d: number, y: number): Vector3[] =>
    corners.map(([x, z], i) => {
      const [px, pz] = corners[(i + n - 1) % n];
      const [nx, nz] = corners[(i + 1) % n];
      const e1 = new Vector2(x - px, z - pz).normalize();
      const e2 = new Vector2(nx - x, nz - z).normalize();
      // inward normals of the two sides (the outline runs anticlockwise from above)
      const n1 = new Vector2(-e1.y, e1.x);
      const n2 = new Vector2(-e2.y, e2.x);
      const bis = n1.clone().add(n2).normalize();
      const k = d / Math.max(0.3, bis.dot(n1));
      return new Vector3(x + bis.x * k, y, z + bis.y * k);
    });
  const R = rings.map(([d, y]) => ring(d, y));
  const pos: number[] = [];
  const tri = (a: Vector3, b: Vector3, c: Vector3): void => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  // the table
  for (let i = 1; i < n - 1; i++) tri(R[0][0], R[0][i + 1], R[0][i]);
  for (let k = 0; k < R.length - 1; k++)
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      tri(R[k][i], R[k][j], R[k + 1][j]);
      tri(R[k][i], R[k + 1][j], R[k + 1][i]);
    }
  // the keel along the bottom
  const b = R[R.length - 1];
  for (let i = 1; i < n - 1; i++) tri(b[0], b[i], b[i + 1]);
  return flat(pos);
}

/** A cabochon: a smooth oval dome over a flat back (smooth normals: no facets). */
function cabochon(): BufferGeometry {
  const prof: Vector2[] = [new Vector2(0, -0.12)];
  prof.push(new Vector2(0.98, -0.12), new Vector2(1, -0.06));
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * (Math.PI / 2);
    prof.push(new Vector2(Math.cos(a), Math.sin(a) * 0.62));
  }
  const g = new LatheGeometry(prof.reverse(), 48);
  g.setAttribute('facet', new Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(0.5), 3));
  g.scale(1.3, 1, 1);
  g.computeVertexNormals();
  return g;
}

/** A rough crystal for a rock's face: a hexagonal prism with a pointed end. */
export function crystalPoint(seed: number): BufferGeometry {
  const r = rnd(seed);
  const n = 6;
  const h = 1;
  const pos: number[] = [];
  const ring = (y: number, s: number): Vector3[] => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const w = s * (0.85 + r() * 0.3);
    return new Vector3(Math.cos(a) * w, y, Math.sin(a) * w);
  });
  const lo = ring(-0.3, 0.32);
  const hi = ring(h * 0.62, 0.3);
  const tip = new Vector3((r() - 0.5) * 0.08, h, (r() - 0.5) * 0.08);
  const tri = (a: Vector3, b: Vector3, c: Vector3): void => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tri(lo[i], hi[j], lo[j]);
    tri(lo[i], hi[i], hi[j]);
    tri(hi[i], tip, hi[j]);
  }
  return flat(pos);
}

function flat(pos: number[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  // every facet (triangle) its own random: which pavilion facets it looks into
  const r = rnd(pos.length);
  const facet: number[] = [];
  for (let i = 0; i < pos.length / 9; i++) {
    const f = [r(), r(), r()];
    facet.push(...f, ...f, ...f);
  }
  g.setAttribute('facet', new Float32BufferAttribute(facet, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

function rnd(seed: number): () => number {
  let s = (Math.abs(Math.floor(seed * 9973)) % 2147483646) + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const cutCache = new Map<Cut, BufferGeometry>();

/**
 * A cut's geometry, its girdle about 2 units across (so scale it by half the stone's size), the
 * table up (+y). Shared: don't dispose it.
 */
export function cutGeometry(cut: Cut): BufferGeometry {
  let g = cutCache.get(cut);
  if (g) return g;
  if (cut === 'emerald') g = stepCut(1.38);
  else if (cut === 'baguette') g = stepCut(1.9);
  else if (cut === 'cabochon') g = cabochon();
  else g = brilliantCut(OUTLINES[cut] ?? OUTLINES.round, cut === 'heart' || cut === 'pear' ? 28 : cut === 'trillion' ? 18 : 20);
  cutCache.set(cut, g);
  return g;
}

/* ── the light ───────────────────────────────────────────────────────── */

const VERT = /* glsl */ `
varying vec3 vW;
varying vec3 vN;
varying vec3 vO;
varying vec3 vON;
varying vec3 vF;
attribute vec3 facet;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vO = position;
  vF = facet;
  vON = normal;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
uniform vec3 uBody;
uniform vec3 uBody2;
uniform float uOptic;
uniform float uIOR;
uniform float uFire;
uniform float uTime;
uniform float uBright;
uniform float uGlow;
uniform vec3 uHalf;
uniform float uStep;
varying vec3 vW;
varying vec3 vN;
varying vec3 vO;
varying vec3 vON;
varying vec3 vF;
#include <common>
#include <logdepthbuf_pars_fragment>

vec3 hash3(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yxz + 19.19);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash3(i).x, b = hash3(i + vec3(1,0,0)).x, c = hash3(i + vec3(0,1,0)).x, d = hash3(i + vec3(1,1,0)).x;
  float e = hash3(i + vec3(0,0,1)).x, g = hash3(i + vec3(1,0,1)).x, h = hash3(i + vec3(0,1,1)).x, k = hash3(i + vec3(1,1,1)).x;
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}
vec3 spectrum(float h) {
  return clamp(abs(fract(h + vec3(0.0, 0.6667, 0.3333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
}
// a light: its direction, how wide, how bright
float lamp(vec3 d, vec3 L, float w) {
  return smoothstep(1.0 - w, 1.0 - w * 0.35, dot(d, normalize(L)));
}
// the jeweller's studio, fixed in the world: a dark room hung with lamps (every way you turn a
// stone some facets catch one and blaze, the rest go dark, and that contrast is its beauty)
const vec4 LAMPS[16] = vec4[16](
  vec4(0.10, 1.00, 0.05, 0.10), vec4(0.90, 0.55, 0.30, 0.05), vec4(-0.80, 0.45, 0.50, 0.045),
  vec4(-0.30, 0.60, -0.90, 0.05), vec4(0.50, 0.30, -0.80, 0.04), vec4(0.20, 0.25, 1.00, 0.04),
  vec4(-0.95, -0.10, -0.20, 0.03), vec4(0.60, 0.85, -0.40, 0.035), vec4(-0.55, 0.85, -0.20, 0.035),
  vec4(-0.20, 0.80, 0.60, 0.035), vec4(0.70, 0.10, 0.70, 0.03), vec4(-0.40, 0.15, 0.90, 0.03),
  vec4(0.95, 0.20, -0.25, 0.03), vec4(0.00, 0.35, -1.00, 0.03), vec4(0.35, -0.30, 0.85, 0.02),
  vec4(-0.75, -0.25, 0.60, 0.02)
);
vec3 studio(vec3 d, float sharp) {
  vec3 c = mix(vec3(0.006, 0.006, 0.012), vec3(0.05, 0.05, 0.065), smoothstep(-0.3, 0.8, d.y));
  for (int i = 0; i < 16; i++) {
    vec4 L = LAMPS[i];
    float k = lamp(d, L.xyz, L.w * sharp);
    c += mix(vec3(3.4, 3.2, 3.0), vec3(2.6, 2.8, 3.3), fract(float(i) * 0.37)) * k * (i == 0 ? 1.1 : 0.85);
  }
  // a warm horizon strip
  c += vec3(0.3, 0.24, 0.18) * (1.0 - smoothstep(0.0, 0.1, abs(d.y - 0.05)));
  return c;
}

// the opal's harlequin: cells of colour, each flashing when its angle meets your eye
vec3 harlequin(vec3 p, vec3 N, vec3 V) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float best = 9.0;
  float second = 9.0;
  vec3 id = vec3(0.0);
  for (int z = -1; z <= 1; z++)
    for (int y = -1; y <= 1; y++)
      for (int x = -1; x <= 1; x++) {
        vec3 g = vec3(float(x), float(y), float(z));
        vec3 o = hash3(i + g);
        float d = length(g + o - f);
        if (d < best) { second = best; best = d; id = i + g; }
        else if (d < second) second = d;
      }
  vec3 h = hash3(id + 7.3);
  vec3 dir = normalize(h - 0.5);
  float facing = dot(reflect(-V, N), dir);
  float flash = pow(0.5 + 0.5 * facing, 9.0) * 3.2 + 0.03;
  float hue = h.x + facing * 0.18;
  float edge = smoothstep(0.0, 0.22, second - best);
  // brightest in the middle of its patch, a green-to-violet shimmer across it
  vec3 c = spectrum(hue + (best - 0.5) * 0.12);
  return c * c * flash * edge * (0.6 + h.y) * (1.2 - best * 0.7);
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  if (dot(N, V) < 0.0) N = -N;
  float cosi = clamp(dot(N, V), 0.0, 1.0);
  float f0 = pow((uIOR - 1.0) / (uIOR + 1.0), 2.0);
  float F = f0 + (1.0 - f0) * pow(1.0 - cosi, 5.0);
  vec3 R = reflect(-V, N);
  vec3 refl = studio(R, 1.0);
  vec3 body = uBody;
  vec3 col;

  if (uOptic > 0.5 && uOptic < 1.5) {
    // THE OPAL: a dark body, cells of pure spectral colour that flash as you turn it
    vec3 play = harlequin(vO * 1.7 + vec3(0.0, uTime * 0.01, 0.0), N, V) * 0.9;
    play += harlequin(vO * 3.9 + 11.0, N, V) * 0.3;
    float pin = smoothstep(0.9, 0.99, vnoise(vO * 14.0 + V * 6.0));
    play += vec3(1.0) * pin * 0.6;
    vec3 base = body * (0.7 + 0.3 * vnoise(vO * 3.0));
    // its polish: small bright windows of the lamps, not broad grey ones
    vec3 glint = studio(R, 0.07);
    col = base + play * (0.4 + 0.6 * cosi) + glint * (F * 2.5 + 0.25) * step(1.0, glint.r);
  } else {
    // a facet's own pavilion facet to bounce off (the same for the whole facet)
    vec3 h = vF;
    // a step cut's table: the hall of mirrors, rings of reflected steps one inside another
    if (uStep > 0.5 && vO.y > 0.25 && abs(normalize(vON).y) > 0.97) {
      float q = max(abs(vO.x) / (uHalf.x - 0.36), abs(vO.z) / (uHalf.z - 0.36));
      h = hash3(vec3(floor(q * 5.0), step(0.0, vO.x) + 2.0 * step(0.0, vO.z), 3.0));
    }
    vec3 B = normalize(-N + (h - 0.5) * 1.6);
    float spread = uFire * 0.035;
    vec3 inR = reflect(refract(-V, N, 1.0 / (uIOR - spread)), B);
    vec3 inG = reflect(refract(-V, N, 1.0 / uIOR), B);
    vec3 inB = reflect(refract(-V, N, 1.0 / (uIOR + spread)), B);
    vec3 inner = vec3(studio(inR, 1.0).r, studio(inG, 1.0).g, studio(inB, 1.0).b);
    // and a second pavilion facet, for the patchwork of light a real stone throws back
    vec3 B2 = normalize(-N + (h.zxy - 0.5) * 2.2);
    inner = inner * 0.75 + studio(reflect(refract(-V, N, 1.0 / uIOR), B2), 1.0) * 0.45;
    if (uOptic > 1.5) {
      // WATERMELON: pink heart, a pale band, green rind (across the stone's width)
      float r = length(vO.xz / uHalf.xz * vec2(0.55, 1.0));
      body = mix(uBody, vec3(0.9, 0.8, 0.72), smoothstep(0.46, 0.53, r) * 0.7);
      body = mix(body, uBody2, smoothstep(0.58, 0.72, r));
    }
    // coloured by its path through the stone, and lit from within where light has pooled
    float path = 1.2 + h.x * 1.4;
    vec3 tint = pow(max(body, vec3(0.001)), vec3(path * 0.8));
    inner = inner * tint * 1.5 + body * (0.05 + 0.12 * h.y) * uGlow;
    // fire: spectral flashes where light leaves along a lamp
    float fireAmt = pow(max(dot(normalize(inG), normalize(vec3(0.1, 1.0, 0.05))), 0.0), 18.0) + pow(max(dot(normalize(inG), normalize(vec3(0.9, 0.55, 0.3))), 0.0), 40.0);
    inner += spectrum(fract(h.z + dot(inG, vec3(1.7, 2.9, 1.3)))) * fireAmt * uFire * 1.4;
    col = mix(inner, refl, F * 0.7);
  }
  col *= uBright;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const matCache = new Map<string, ShaderMaterial>();
/** everything that sparkles, for the clock */
const live = new Set<ShaderMaterial>();

/** Advance the stones' clock (their opal play drifts, their twinkles flash). */
export function tickGems(time: number): void {
  for (const m of live) m.uniforms.uTime.value = time;
  for (const m of twinkleMats) m.uniforms.uTime.value = time;
}

/** A gem's material (shared by every stone of that gem; `key` for a separate copy). */
export function gemMaterial(id: string, key = ''): ShaderMaterial {
  const k = `${id}:${key}`;
  let m = matCache.get(k);
  if (m) return m;
  const g = GEMS[id];
  const lin = (hex: string): Color => new Color(hex);
  const half = new Vector3(1, 1, 1);
  if (g.cut === 'baguette') half.set(1.9, 1, 1);
  if (g.cut === 'emerald') half.set(1.38, 1, 1);
  m = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    // (every facet drawn whichever way it's wound: the shader turns its normal to face you)
    side: DoubleSide,
    uniforms: {
      uBody: { value: lin(g.colour) },
      uBody2: { value: lin(g.colour2 ?? g.colour) },
      uOptic: { value: g.optic === 'opal' ? 1 : g.optic === 'watermelon' ? 2 : 0 },
      uIOR: { value: g.ior },
      uFire: { value: g.fire },
      uTime: { value: 0 },
      uBright: { value: 1 },
      uGlow: { value: 1 },
      uHalf: { value: half },
      uStep: { value: g.cut === 'emerald' || g.cut === 'baguette' ? 1 : 0 },
    },
  });
  m.name = `gem:${id}`;
  matCache.set(k, m);
  live.add(m);
  return m;
}

/** A cut stone of `id`, `size` metres across its girdle, table up. */
export function gemMesh(id: string, size: number, key = ''): Mesh {
  const g: GemInfo = GEMS[id];
  const mesh = new Mesh(cutGeometry(g.cut), gemMaterial(id, key));
  mesh.scale.setScalar(size / 2);
  mesh.name = `gem-${id}`;
  return mesh;
}

/* ── twinkles ─────────────────────────────────────────────────────────── */

const TW_VERT = /* glsl */ `
attribute float aPhase;
attribute float aSize;
uniform float uTime;
uniform float uScale;
varying float vK;
varying float vHue;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float t = uTime * (1.3 + fract(aPhase * 7.1) * 1.4) + aPhase * 6.2831;
  float k = pow(max(0.0, sin(t)), 22.0);
  vK = k;
  vHue = fract(aPhase * 3.7);
  gl_PointSize = aSize * uScale * (0.25 + k) / max(0.05, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const TW_FRAG = /* glsl */ `
uniform vec3 uTint;
varying float vK;
varying float vHue;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  // a four-pointed star and a soft core
  float cross = max(exp(-abs(p.x) * 26.0) * exp(-abs(p.y) * 2.4), exp(-abs(p.y) * 26.0) * exp(-abs(p.x) * 2.4));
  float diag = max(exp(-abs(p.x + p.y) * 30.0), exp(-abs(p.x - p.y) * 30.0)) * exp(-length(p) * 4.0) * 0.5;
  float core = exp(-dot(p, p) * 18.0);
  float a = (cross + diag + core) * vK;
  vec3 c = mix(vec3(1.0), uTint, 0.35) * a * 2.2;
  gl_FragColor = vec4(c, a);
}
`;

const twinkleMats = new Set<ShaderMaterial>();

/**
 * `n` twinkles scattered over a stone's crown (in its own frame, radius about `r`), tinted with
 * its colour. Add it as a child of the stone's holder.
 */
export function twinkles(n: number, r: number, tint: string, seed = 1, scale = 1): Points {
  const rr = rnd(seed + 3);
  const pos: number[] = [];
  const phase: number[] = [];
  const size: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = rr() * Math.PI * 2;
    const d = Math.sqrt(rr()) * r;
    pos.push(Math.cos(a) * d, r * (0.1 + rr() * 0.3), Math.sin(a) * d);
    phase.push(rr());
    size.push(0.6 + rr() * 0.8);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aPhase', new Float32BufferAttribute(phase, 1));
  g.setAttribute('aSize', new Float32BufferAttribute(size, 1));
  const m = new ShaderMaterial({
    vertexShader: TW_VERT,
    fragmentShader: TW_FRAG,
    uniforms: { uTime: { value: 0 }, uScale: { value: 48 * scale }, uTint: { value: new Color(tint) } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  twinkleMats.add(m);
  const p = new Points(g, m);
  p.frustumCulled = false;
  p.renderOrder = 5;
  return p;
}

/** Let go of a twinkle's material (the stone it sparkled on is gone). */
export function dropTwinkles(p: Points): void {
  const m = p.material as ShaderMaterial;
  twinkleMats.delete(m);
  m.dispose();
  p.geometry.dispose();
}
