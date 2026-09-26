/**
 * THE MAKER'S KIT: what the shops' goods are made of (village/wares.ts builds them).
 *
 * The first goods were a few boxes, balls and cones each: a hibiscus was coloured balls over a
 * cup, a palm a stick with a crown of spikes. The kit makes things the way they're shaped:
 *
 *  - BLADES: a leaf, a petal, a palm's leaflet, a sail. A grid laid along a spine that arches as
 *    it goes, folded along its midrib, cupped, twisted, rippled at the edge, shaded base to tip
 *    (vertex colours) and seen from both sides.
 *  - STALKS: a tapered tube along a curve (stems, branches, cords, a rocker, a chandelier arm).
 *  - TURNED and ROUNDED pieces: lathe profiles (pots, legs, bottles, a bust) and rounded boxes,
 *    so nothing has a knife edge.
 *  - SURFACES painted once on a canvas: wood grain, linen, velvet, rattan, terracotta.
 *
 * A thing is built into a Batch: every piece that shares a material becomes one mesh, so a
 * plant of three hundred leaves is one draw (and village/merge.ts bakes the whole thing down
 * again once it stands in its room). Everything is lit by the casino's studio environment
 * (casino/look.ts), so it reads under a room's lamp at any hour.
 */

import {
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type Material,
  type WebGLRenderer,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { casinoEnv } from '../casino/look.ts';
import type { Props } from '../fishing/props.ts';

/** what a thing is built with: the renderer (for its materials' environment) and the props (fish) */
export interface Kit {
  renderer: WebGLRenderer;
  props: Props;
}

/* ── randomness that's the same every load ─────────────────────────────── */

/** a seeded generator: the same seed, the same plant */
export function rng(seed: number): () => number {
  let s = (Math.abs(Math.floor(seed * 9973)) % 2147483646) + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/* ── surfaces ──────────────────────────────────────────────────────────── */

function canvas(w: number, h: number, paint: (g: CanvasRenderingContext2D, w: number, h: number) => void): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!, w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

const shade = (hex: string, k: number, a = 1): string => {
  const c = new Color(hex);
  const f = (v: number): number => Math.round(Math.max(0, Math.min(1, v * k)) * 255);
  return `rgba(${f(c.r)}, ${f(c.g)}, ${f(c.b)}, ${a})`;
};

/**
 * Wood: long wavering grain, lighter and darker streaks. Grain runs along v, and
 * the tile repeats seamlessly both ways (the waver is periodic down it, and anything crossing
 * a side edge is drawn again from the other side), so a long board shows no seam.
 */
function grain(g: CanvasRenderingContext2D, w: number, h: number, base: string, seed: number, contrast: number): void {
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const wave = (y: number, n: number, ph: number): number => Math.sin((y / h) * Math.PI * 2 * n + ph);
  const wrapped = (draw: (dx: number) => void): void => {
    for (const dx of [-w, 0, w]) draw(dx);
  };
  // broad streaks
  for (let i = 0; i < 26; i++) {
    const x = r() * w;
    const bw = 4 + r() * 22;
    const n = 1 + Math.floor(r() * 3);
    const ph = r() * 6;
    g.fillStyle = shade(base, r() < 0.5 ? 1 - 0.18 * contrast : 1 + 0.14 * contrast, 0.35 + r() * 0.35);
    wrapped((dx) => {
      g.beginPath();
      for (let y = 0; y <= h; y += 8) g.lineTo(dx + x + wave(y, n, ph) * 6, y);
      for (let y = h; y >= 0; y -= 8) g.lineTo(dx + x + bw + wave(y, n, ph) * 6, y);
      g.fill();
    });
  }
  // fine grain lines
  for (let i = 0; i < 90; i++) {
    const x0 = r() * w;
    const ph = r() * 6;
    const amp = 1 + r() * 4;
    const n = 1 + Math.floor(r() * 2);
    g.strokeStyle = shade(base, 1 - (0.25 + r() * 0.2) * contrast, 0.25 + r() * 0.35);
    g.lineWidth = 0.6 + r() * 1.4;
    wrapped((dx) => {
      g.beginPath();
      for (let y = 0; y <= h; y += 6) g.lineTo(dx + x0 + wave(y, n, ph) * amp + wave(y, 5, ph * 2) * 1.2, y);
      g.stroke();
    });
  }
  // (no knots: on a big piece the tile's knot showed again every 35 cm)
}

/** Cloth: a fine two-way weave over the colour, slubs here and there. */
function weave(g: CanvasRenderingContext2D, w: number, h: number, base: string, seed: number, pitch: number, depth: number): void {
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += pitch) {
    g.fillStyle = shade(base, 1 - depth * (0.5 + r() * 0.5), 0.5);
    g.fillRect(0, y, w, 1);
  }
  for (let x = 0; x < w; x += pitch) {
    g.fillStyle = shade(base, 1 + depth * (0.3 + r() * 0.4), 0.35);
    g.fillRect(x, 0, 1, h);
  }
  for (let i = 0; i < 60; i++) {
    g.fillStyle = shade(base, r() < 0.5 ? 1 - depth : 1 + depth, 0.3);
    g.fillRect(r() * w, r() * h, 6 + r() * 20, 1.5);
  }
}

/** Rattan: over-and-under strands, each a rounded, shaded band. */
function rattanPaint(g: CanvasRenderingContext2D, w: number, h: number, base: string): void {
  g.fillStyle = shade(base, 0.45);
  g.fillRect(0, 0, w, h);
  const n = 8;
  const cw = w / n;
  const ch = h / n;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const across = (i + j) % 2 === 0;
      const x = i * cw;
      const y = j * ch;
      const grad = across ? g.createLinearGradient(x, y, x, y + ch) : g.createLinearGradient(x, y, x + cw, y);
      grad.addColorStop(0, shade(base, 0.7));
      grad.addColorStop(0.5, shade(base, 1.15));
      grad.addColorStop(1, shade(base, 0.65));
      g.fillStyle = grad;
      g.fillRect(x + 1.5, y + 1.5, cw - 3, ch - 3);
    }
  }
}

/* ── materials ─────────────────────────────────────────────────────────── */

export type Wood = 'teak' | 'walnut' | 'drift' | 'mahogany' | 'bamboo' | 'oak' | 'ebony';
const WOODS: Record<Wood, [string, number]> = {
  teak: ['#9a6a3e', 0.9],
  walnut: ['#5e3c24', 0.8],
  drift: ['#a8987e', 0.7],
  mahogany: ['#6e2e1c', 0.8],
  bamboo: ['#c9a862', 0.6],
  oak: ['#b08a58', 0.85],
  ebony: ['#221a16', 0.6],
};

const cache = new Map<string, Material>();
function once<T extends Material>(key: string, make: () => T): T {
  let m = cache.get(key);
  if (!m) cache.set(key, (m = make()));
  return m as T;
}

/** every material a thing can be made of */
export const M = {
  satin: (r: WebGLRenderer, c: string): MeshStandardMaterial => once(`satin:${c}`, () => new MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.05, envMap: casinoEnv(r), envMapIntensity: 0.7 })),
  gloss: (r: WebGLRenderer, c: string): MeshStandardMaterial => once(`gloss:${c}`, () => new MeshStandardMaterial({ color: c, roughness: 0.14, metalness: 0, envMap: casinoEnv(r), envMapIntensity: 1.2 })),
  /** glazed ceramic: glossy, a touch of depth */
  glaze: (r: WebGLRenderer, c: string): MeshStandardMaterial => once(`glaze:${c}`, () => new MeshStandardMaterial({ color: c, roughness: 0.2, metalness: 0.02, envMap: casinoEnv(r), envMapIntensity: 1.3 })),
  /** polished metal */
  metal: (r: WebGLRenderer, c: string, rough = 0.25): MeshStandardMaterial => once(`metal:${c}:${rough}`, () => new MeshStandardMaterial({ color: c, roughness: rough, metalness: 1, envMap: casinoEnv(r), envMapIntensity: 1.5 })),
  gold: (r: WebGLRenderer): MeshStandardMaterial => M.metal(r, '#ffc848', 0.2),
  brass: (r: WebGLRenderer): MeshStandardMaterial => M.metal(r, '#c89a48', 0.36),
  copper: (r: WebGLRenderer): MeshStandardMaterial => M.metal(r, '#b0643a', 0.36),
  silver: (r: WebGLRenderer): MeshStandardMaterial => M.metal(r, '#e8ecf0', 0.12),
  iron: (r: WebGLRenderer): MeshStandardMaterial => M.metal(r, '#3a3a3e', 0.6),
  wood: (r: WebGLRenderer, kind: Wood, polish = 0.45): MeshStandardMaterial =>
    once(`wood:${kind}:${polish}`, () => {
      const [base, contrast] = WOODS[kind];
      const map = canvas(256, 512, (g, w, h) => grain(g, w, h, base, kind.length * 7.3, contrast));
      const m = new MeshStandardMaterial({ map, roughness: polish, metalness: 0, envMap: casinoEnv(r), envMapIntensity: 0.8 });
      // box-projected: one tile is 0.35 m across the grain and 0.7 m along it
      m.userData.tile = [0.35, 0.7];
      return m;
    }),
  /** cloth: linen's weave, or velvet's sheen */
  cloth: (r: WebGLRenderer, c: string, kind: 'linen' | 'velvet' | 'canvas' = 'linen'): MeshStandardMaterial =>
    once(`cloth:${c}:${kind}`, () => {
      const map = canvas(128, 128, (g, w, h) => weave(g, w, h, c, c.length, kind === 'canvas' ? 3 : 4, kind === 'velvet' ? 0.05 : 0.12));
      const m = new MeshStandardMaterial({ map, roughness: kind === 'velvet' ? 0.75 : 0.9, metalness: 0, envMap: casinoEnv(r), envMapIntensity: kind === 'velvet' ? 0.9 : 0.5 });
      m.userData.tile = [0.12, 0.12];
      return m;
    }),
  rattan: (r: WebGLRenderer, c = '#c8a468'): MeshStandardMaterial =>
    once(`rattan:${c}`, () => {
      const map = canvas(128, 128, (g, w, h) => rattanPaint(g, w, h, c));
      map.repeat.set(18, 4);
      return new MeshStandardMaterial({ map, roughness: 0.7, metalness: 0, envMap: casinoEnv(r), envMapIntensity: 0.6 });
    }),
  terracotta: (r: WebGLRenderer): MeshStandardMaterial =>
    once('terracotta', () => {
      const map = canvas(128, 128, (g, w, h) => weave(g, w, h, '#b8643a', 9, 64, 0.06));
      return new MeshStandardMaterial({ map, roughness: 0.85, metalness: 0, envMap: casinoEnv(r), envMapIntensity: 0.5 });
    }),
  soil: (_r?: WebGLRenderer): MeshStandardMaterial =>
    once('soil', () => {
      const map = canvas(128, 128, (g, w, h) => {
        const rr = rng(3);
        g.fillStyle = '#3a2a1c';
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 500; i++) {
          g.fillStyle = rr() < 0.5 ? 'rgba(20,12,6,0.6)' : 'rgba(110,86,60,0.5)';
          g.fillRect(rr() * w, rr() * h, 1 + rr() * 3, 1 + rr() * 3);
        }
      });
      return new MeshStandardMaterial({ map, roughness: 1, metalness: 0 });
    }),
  /** satin in the colour each piece carries (tint()): many colours, one draw */
  tinted: (r: WebGLRenderer, gloss = false): MeshStandardMaterial => once(`tinted:${gloss}`, () => new MeshStandardMaterial({ vertexColors: true, roughness: gloss ? 0.18 : 0.55, metalness: 0.03, envMap: casinoEnv(r), envMapIntensity: gloss ? 1.1 : 0.7 })),
  /** leaves and petals: their colour is in the blade (vertex colours), seen from both sides */
  leaf: (r: WebGLRenderer): MeshStandardMaterial => once('leaf', () => new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, roughness: 0.42, metalness: 0, envMap: casinoEnv(r), envMapIntensity: 0.9 })),
  petal: (r: WebGLRenderer): MeshStandardMaterial => once('petal', () => new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, roughness: 0.6, metalness: 0, envMap: casinoEnv(r), envMapIntensity: 0.7 })),
  /** clear glass: a bottle, a dome, a lamp's chimney */
  glass: (r: WebGLRenderer, tint = '#dff4ff', opacity = 0.2): MeshStandardMaterial =>
    once(`glass:${tint}:${opacity}`, () => new MeshStandardMaterial({ color: tint, transparent: true, opacity, roughness: 0.03, metalness: 0, envMap: casinoEnv(r), envMapIntensity: 2, depthWrite: false })),
  /** cut crystal and gems: very bright highlights */
  crystal: (r: WebGLRenderer, c = '#f4fbff'): MeshStandardMaterial => once(`crystal:${c}`, () => new MeshStandardMaterial({ color: c, roughness: 0.02, metalness: 0.35, envMap: casinoEnv(r), envMapIntensity: 3, flatShading: true })),
  /** a picture or label painted on a canvas */
  painted: (r: WebGLRenderer, key: string, w: number, h: number, paint: (g: CanvasRenderingContext2D, w: number, h: number) => void, rough = 0.8): MeshStandardMaterial =>
    once(`painted:${key}`, () => {
      const map = canvas(w, h, paint);
      map.wrapS = map.wrapT = ClampToEdgeWrapping;
      return new MeshStandardMaterial({ map, roughness: rough, metalness: 0, envMap: casinoEnv(r), envMapIntensity: 0.8 });
    }),
};

/* ── geometry ──────────────────────────────────────────────────────────── */

/** leaf outlines: half-width (0..1) along the blade (0 at the base, 1 at the tip) */
export const OUTLINE = {
  /** long and pointed, widest a third of the way up */
  lance: (t: number): number => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.62)), 0.85),
  /** egg-shaped, pointed tip */
  ovate: (t: number): number => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.75),
  /** a strap: even width, tapering at the very end */
  strap: (t: number): number => Math.min(1, t * 10) * Math.pow(1 - Math.pow(t, 4), 0.6),
  /** a petal: a narrow claw, broadening to a round end */
  petal: (t: number): number => (t < 0.55 ? 0.18 + 0.82 * Math.pow(Math.sin((Math.PI / 2) * (t / 0.55)), 1.3) : Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.55) / 0.45, 2)))),
  /** round, with a short point */
  round: (t: number): number => Math.pow(Math.sin(Math.PI * t), 0.6),
  /** heart-shaped: lobed at the base */
  heart: (t: number): number => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.9)), 0.55) * (0.75 + 0.25 * Math.cos(Math.PI * t * 1.2)),
};

export interface BladeOpts {
  len: number;
  width: number;
  outline?: (t: number) => number;
  /** each half rises from the midrib by this angle (rad) */
  fold?: number;
  /** total bend along the length, toward the blade's +z (rad) */
  arch?: number;
  /** how the bend is spread: 1 even, 2 mostly toward the tip */
  archPow?: number;
  /** the edges curl toward +z by cup × half-width */
  cup?: number;
  /** turn about the spine by the tip (rad) */
  twist?: number;
  /** an edge wave: amplitude (× half-width) and how many waves along it */
  ripple?: number;
  ripples?: number;
  segs?: number;
  across?: number;
  /** vertex colours: base to tip, the midrib, the rim */
  base: string;
  tip?: string;
  rib?: string;
  rim?: string;
}

/**
 * A blade's surface as a function: (t along, s across −1..1) → its point and colour. The spine
 * rises along +y from the origin and arches toward +z; the width lies across x.
 */
export function bladeSurface(o: BladeOpts): (t: number, s: number, p: Vector3, c: Color) => void {
  const outline = o.outline ?? OUTLINE.lance;
  const fold = o.fold ?? 0.2;
  const arch = o.arch ?? 0;
  const archPow = o.archPow ?? 1.4;
  const cup = o.cup ?? 0;
  const twist = o.twist ?? 0;
  const ripple = o.ripple ?? 0;
  const ripples = o.ripples ?? 5;
  const c0 = new Color(o.base);
  const c1 = new Color(o.tip ?? o.base);
  const c2 = new Color(o.rib ?? o.tip ?? o.base);
  const c3 = new Color(o.rim ?? o.tip ?? o.base);
  // the spine, finely: position at each step
  const N = 64;
  const spine: Vector3[] = [new Vector3()];
  for (let i = 1; i <= N; i++) {
    const th = arch * Math.pow((i - 0.5) / N, archPow);
    spine.push(spine[i - 1].clone().add(new Vector3(0, Math.cos(th), Math.sin(th)).multiplyScalar(o.len / N)));
  }
  return (t, s, p, c) => {
    const f = Math.max(0, Math.min(1, t)) * N;
    const i = Math.min(N - 1, Math.floor(f));
    p.lerpVectors(spine[i], spine[i + 1], f - i);
    const th = arch * Math.pow(Math.max(0, t), archPow);
    const tw = twist * t;
    // spine frame: N the bend side, B across; twisted about the spine
    const ny = -Math.sin(th);
    const nz = Math.cos(th);
    const ct = Math.cos(tw);
    const st = Math.sin(tw);
    const hw = (o.width / 2) * outline(Math.max(0, Math.min(1, t)));
    const a = Math.abs(s);
    const lat = s * hw * Math.cos(fold);
    const off = a * hw * Math.sin(fold) + cup * hw * s * s + ripple * hw * a * a * Math.sin(t * ripples * Math.PI * 2 + (s > 0 ? 0 : 1.7));
    // B' = B cos + N sin, N' = N cos − B sin (B = +x)
    p.x += ct * lat - st * off;
    p.y += ny * st * lat + ny * ct * off;
    p.z += nz * st * lat + nz * ct * off;
    c.copy(c0).lerp(c1, t);
    c.lerp(c3, Math.pow(a, 4) * 0.6);
    c.lerp(c2, Math.pow(1 - a, 8) * 0.7 * (1 - t * 0.6));
  };
}

/**
 * A patch of a surface: t0..t1 along, s0..s1 across, in nt × ns quads. `slant` shifts t with
 * |s| (a monstera's slits run out toward the tip).
 */
export function patch(surf: (t: number, s: number, p: Vector3, c: Color) => void, t0: number, t1: number, s0: number, s1: number, nt: number, ns: number, slant = 0): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const p = new Vector3();
  const c = new Color();
  for (let i = 0; i <= nt; i++) {
    for (let j = 0; j <= ns; j++) {
      const s = s0 + ((s1 - s0) * j) / ns;
      const t = t0 + ((t1 - t0) * i) / nt + slant * Math.abs(s);
      surf(t, s, p, c);
      pos.push(p.x, p.y, p.z);
      uv.push(s * 0.5 + 0.5, t);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < nt; i++) {
    for (let j = 0; j < ns; j++) {
      const a = i * (ns + 1) + j;
      const b = a + ns + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A blade: a leaf, a petal, a leaflet (see bladeSurface for its frame). */
export function blade(o: BladeOpts): BufferGeometry {
  const across = o.across ?? 3;
  return patch(bladeSurface(o), 0, 1, -1, 1, o.segs ?? 10, across * 2);
}

const _m = new Matrix4();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
/**
 * The matrix that stands a thing made along +y (bending toward +z) at `at`, its +y along `up`
 * and its +z as near `lean` as that allows.
 */
export function aim(at: Vector3, up: Vector3, lean: Vector3, scale = 1): Matrix4 {
  _y.copy(up).normalize();
  _x.crossVectors(_y, lean);
  if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0).cross(_y);
  _x.normalize();
  _z.crossVectors(_x, _y).normalize();
  return _m.makeBasis(_x.multiplyScalar(scale), _y.multiplyScalar(scale), _z.multiplyScalar(scale)).setPosition(at);
}

/** A tapered tube along a smooth curve through `pts`. */
export function stalk(pts: Vector3[], r0: number, r1 = r0, radial = 6, segs = Math.max(4, pts.length * 4), cap = false): BufferGeometry {
  const curve = new CatmullRomCurve3(pts, false, 'centripetal');
  const frames = curve.computeFrenetFrames(segs, false);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const p = new Vector3();
  const n = new Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, p);
    const r = r0 + (r1 - r0) * t;
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      // (three's TubeGeometry turns this way round: the faces wind outward)
      n.copy(N).multiplyScalar(-Math.cos(a)).addScaledVector(B, Math.sin(a));
      pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
      nor.push(n.x, n.y, n.z);
      uv.push(j / radial, t);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  if (cap) {
    // a flat end on the last ring
    const T = frames.tangents[segs];
    const c = pos.length / 3;
    pos.push(p.x, p.y, p.z);
    nor.push(T.x, T.y, T.z);
    uv.push(0.5, 1);
    const base = segs * (radial + 1);
    for (let j = 0; j < radial; j++) {
      const k = pos.length / 3;
      for (const q of [j, j + 1]) {
        pos.push(pos[(base + q) * 3], pos[(base + q) * 3 + 1], pos[(base + q) * 3 + 2]);
        nor.push(T.x, T.y, T.z);
        uv.push(0.5, 1);
      }
      idx.push(c, k, k + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** A turned piece: a profile of [radius, height] points spun about y. */
export function turned(profile: [number, number][], segs = 24, phiStart = 0, phiLength = Math.PI * 2): BufferGeometry {
  return new LatheGeometry(
    profile.map(([r, y]) => new Vector2(Math.max(0, r), y)),
    segs,
    phiStart,
    phiLength,
  );
}

/** A box with rounded edges, centred on the origin. */
export function rounded(w: number, h: number, d: number, r = Math.min(w, h, d) * 0.2, segs = 2): BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, segs, Math.min(r, Math.min(w, h, d) / 2 - 1e-4));
}

/**
 * Texture coordinates projected onto a piece from its three sides, in metres per tile (`tile`:
 * across and along the grain): each face takes the view down its own axis, and the grain (v)
 * runs along the longer of that face's two sides. However a piece was made (an extruded plaque,
 * a lathe, a rounded box) its wood runs on without stretching, squeezing or a seam through it.
 */
export function boxUV(g: BufferGeometry, tile: [number, number]): BufferGeometry {
  g.computeBoundingBox();
  const size = g.boundingBox!.getSize(new Vector3());
  const pos = g.getAttribute('position');
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const nor = g.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  const ax = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    const n = [Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i))];
    const along = n[0] >= n[1] && n[0] >= n[2] ? 0 : n[1] >= n[2] ? 1 : 2;
    // the face's two axes; the grain along the piece's longer one
    const [a, b] = along === 0 ? [1, 2] : along === 1 ? [0, 2] : [0, 1];
    const sz = [size.x, size.y, size.z];
    const [cross, grainAxis] = sz[a] >= sz[b] ? [b, a] : [a, b];
    ax[0] = pos.getX(i);
    ax[1] = pos.getY(i);
    ax[2] = pos.getZ(i);
    uv[i * 2] = ax[cross] / tile[0];
    uv[i * 2 + 1] = ax[grainAxis] / tile[1];
  }
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return g;
}

/** Colour a piece for a tinted material (M.tinted). */
export function tint<T extends BufferGeometry>(g: T, colour: string): T {
  const c = new Color(colour);
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new Float32BufferAttribute(a, 3));
  return g;
}

/** An extruded or other non-indexed shape, welded so it bakes with the rest. */
export function welded(g: BufferGeometry): BufferGeometry {
  g.deleteAttribute('color');
  const out = mergeVertices(g);
  out.clearGroups();
  return out;
}

/* ── building a thing ──────────────────────────────────────────────────── */

/**
 * The pieces of a thing, gathered by material: `group()` makes one mesh per material. Blades
 * carry their colours; a vertex-coloured material gets white for any piece without them, and
 * the rest drop theirs, so every material's pieces bake together.
 */
export class Batch {
  private readonly parts = new Map<Material, BufferGeometry[]>();

  add(mat: Material, g: BufferGeometry, m?: Matrix4): this {
    const tile = mat.userData.tile as [number, number] | undefined;
    // wood and cloth: their texture laid on in the piece's own shape, before it's placed
    let geo = tile ? boxUV(g.clone(), tile) : g;
    geo = m ? (geo === g ? geo.clone() : geo).applyMatrix4(m) : geo;
    // everything bakes indexed (a rounded box, say, comes unindexed)
    if (!geo.index) geo = mergeVertices(geo);
    const coloured = (mat as MeshStandardMaterial).vertexColors === true;
    if (coloured && !geo.getAttribute('color')) {
      const n = geo.getAttribute('position').count;
      geo.setAttribute('color', new Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    }
    if (!coloured && geo.getAttribute('color')) geo.deleteAttribute('color');
    if (!geo.getAttribute('uv')) geo.setAttribute('uv', new Float32BufferAttribute(new Float32Array(geo.getAttribute('position').count * 2), 2));
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    let list = this.parts.get(mat);
    if (!list) this.parts.set(mat, (list = []));
    list.push(geo);
    return this;
  }

  /** a piece placed at x, y, z (and turned by rx, ry, rz) */
  at(mat: Material, g: BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1): this {
    const m = new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(rx, ry, rz)), new Vector3(s, s, s));
    return this.add(mat, g, m);
  }

  group(): Group {
    const out = new Group();
    for (const [mat, list] of this.parts) {
      const g = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!g) continue;
      out.add(new Mesh(g, mat));
    }
    return out;
  }
}
