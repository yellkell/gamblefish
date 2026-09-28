/**
 * A GEM ROCK: a big boulder veined with light, the colour of the gems inside it.
 *
 *  - THE STONE is an icosphere, flattened, carved by a few fracture planes and roughened, in the
 *    ground's own stone: weathered grey-tan on the shore, mossy grey in the forest, dark basalt
 *    with rusty lichen on the high ground, pale speckled granite on the peaks. Faceted and
 *    vertex-coloured, like the island's other rocks.
 *  - THE CRYSTALS: a few clusters of rough points in the colour of the ground's common gem, lit by
 *    the gems' own shader (mining/gemMesh.ts), twinkling. It's how you know it's one.
 *  - THE CRACKS: each blow of the pick opens them wider, and the gems' light shines out through
 *    them (a glow along veins laid through the stone, in its own frame).
 *  - THE BREAK: the stone is cut into chunks along the same veins, each closed off with a raw
 *    face; when it goes they fly apart and settle, then sink away into the rubble.
 */

import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Vector3,
  type Texture,
} from 'three';
import { stalk } from '../village/craft.ts';
import { GEMS, gemsOf, type Ground } from './gems.ts';
import { ROCK_H, ROCK_R } from './sites.ts';

/** the stone of each ground: its colour, a second (moss, lichen, speckle) and where that goes */
const STONE: Record<Ground, { base: number; dark: number; accent: number; accentUp: number; speckle: number }> = {
  shore: { base: 0xbcb09a, dark: 0x8a8070, accent: 0xd8d0c0, accentUp: 0.25, speckle: 0.1 },
  forest: { base: 0x7e7e72, dark: 0x55564d, accent: 0x4c7a30, accentUp: 0.85, speckle: 0.05 },
  high: { base: 0x5a5452, dark: 0x3a3534, accent: 0xa8683a, accentUp: 0.4, speckle: 0.08 },
  peak: { base: 0xb0aaa4, dark: 0x7e7872, accent: 0x3a3634, accentUp: 0, speckle: 0.45 },
};

/** the veins' clock, shared by every rock (MiningSystem sets it) */
export const ROCK_TIME = { value: 0 };

/** the stone's colour on `ground` (for its rubble) */
export function stoneColour(ground: Ground): Color {
  return new Color(STONE[ground].base);
}

/** the chunks a rock breaks into */
const CHUNKS = 9;

function rnd(seed: number): () => number {
  let s = (Math.abs(Math.floor(seed * 9973)) % 2147483646) + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** smooth 3D value noise, for the stone's roughness */
function noise(x: number, y: number, z: number, seed: number): number {
  const h = (i: number, j: number, k: number): number => {
    const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7 + seed * 13.3) * 43758.5453;
    return s - Math.floor(s);
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const u = (t: number): number => t * t * (3 - 2 * t);
  const fx = u(x - xi);
  const fy = u(y - yi);
  const fz = u(z - zi);
  const l = (a: number, b: number, t: number): number => a + (b - a) * t;
  return l(
    l(l(h(xi, yi, zi), h(xi + 1, yi, zi), fx), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), fx), fy),
    l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), fx), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), fx), fy),
    fz,
  );
}

/** an icosphere's corners and faces */
function icosphere(subdiv: number): { v: Vector3[]; f: number[] } {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(([x, y, z]) => new Vector3(x, y, z).normalize());
  let f = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  for (let s = 0; s < subdiv; s++) {
    const mid = new Map<string, number>();
    const m = (a: number, b: number): number => {
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      let i = mid.get(k);
      if (i === undefined) {
        i = v.length;
        v.push(v[a].clone().add(v[b]).normalize());
        mid.set(k, i);
      }
      return i;
    };
    const nf: number[] = [];
    for (let i = 0; i < f.length; i += 3) {
      const [a, b, c] = [f[i], f[i + 1], f[i + 2]];
      const ab = m(a, b);
      const bc = m(b, c);
      const ca = m(c, a);
      nf.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
    }
    f = nf;
  }
  return { v, f };
}

export interface RockModel {
  /** the whole stone, one mesh (its crack glow in its material) */
  stone: Mesh;
  /** the chunks it breaks into, each about its own middle (`home`: where that is in the rock) */
  chunks: { mesh: Mesh; home: Vector3 }[];
  /** the crack glow, 0 whole .. 1 about to go */
  crack: { value: number };
  /** the stone's own material (its crack colour) */
  material: MeshLambertMaterial;
}

/**
 * A rock for `ground`, `seed` its shape, at size 1 (ROCK_R across the base, ROCK_H tall), its base
 * at y = 0 (sunk a little into the ground by whoever places it).
 */
export function buildRock(ground: Ground, seed: number): RockModel {
  const r = rnd(seed);
  const st = STONE[ground];
  const { v, f } = icosphere(3);
  // fracture planes: the stone's big flat faces
  const planes = Array.from({ length: 6 }, () => {
    const n = new Vector3(r() - 0.5, (r() - 0.35) * 0.9, r() - 0.5).normalize();
    return { n, d: 0.78 + r() * 0.14 };
  });
  const sx = ROCK_R * (0.95 + r() * 0.15);
  const sz = ROCK_R * (0.8 + r() * 0.15);
  const sy = ROCK_H * 0.55;
  const pts = v.map((p) => {
    let k = 1 + (noise(p.x * 2.2, p.y * 2.2, p.z * 2.2, seed) - 0.5) * 0.28 + (noise(p.x * 6, p.y * 6, p.z * 6, seed + 3) - 0.5) * 0.08;
    // cut by the planes
    for (const pl of planes) {
      const along = p.dot(pl.n) * k;
      if (along > pl.d) k *= pl.d / along;
    }
    const q = p.clone().multiplyScalar(k);
    // a flatter bottom, sitting on the ground
    const y = q.y < -0.35 ? -0.35 + (q.y + 0.35) * 0.3 : q.y;
    return new Vector3(q.x * sx, (y + 0.42) * sy, q.z * sz);
  });
  // the veins the cracks run along, and the chunks between them
  const seeds = Array.from({ length: CHUNKS }, (_, i) => {
    const a = (i / CHUNKS) * Math.PI * 2 + r() * 0.5;
    const up = i === 0 ? 1 : 0.2 + r() * 0.5;
    return new Vector3(Math.cos(a) * (i === 0 ? 0.1 : 1), up, Math.sin(a) * (i === 0 ? 0.1 : 1)).normalize();
  });
  const centre = new Vector3(0, sy * 0.45, 0);
  const chunkOf = (p: Vector3): number => {
    const d = p.clone().sub(centre).normalize();
    let best = 0;
    let bd = -Infinity;
    seeds.forEach((s, i) => {
      const k = d.dot(s) + (noise(p.x * 3, p.y * 3, p.z * 3, seed + 9) - 0.5) * 0.25;
      if (k > bd) {
        bd = k;
        best = i;
      }
    });
    return best;
  };
  // colour a face
  const base = new Color(st.base);
  const dark = new Color(st.dark);
  const accent = new Color(st.accent);
  const faceColour = (a: Vector3, b: Vector3, c: Vector3, i: number): Color => {
    const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const m = a.clone().add(b).add(c).divideScalar(3);
    const low = Math.max(0, 1 - m.y / (sy * 0.5));
    const col = base.clone().lerp(dark, low * 0.4 + (noise(m.x * 4, m.y * 4, m.z * 4, seed + 5) - 0.5) * 0.5);
    if (st.accentUp > 0 && n.y > 1 - st.accentUp && noise(m.x * 2.5, m.y * 2.5, m.z * 2.5, seed + 7) > 0.45) col.lerp(accent, 0.75);
    if (st.speckle > 0 && ((i * 7919) % 97) / 97 < st.speckle) col.lerp(accent, 0.45);
    return col.multiplyScalar(0.9 + ((i * 131) % 17) / 17 * 0.2);
  };
  const stoneTris: number[] = [];
  const stoneCols: number[] = [];
  const chunkTris: number[][] = Array.from({ length: CHUNKS }, () => []);
  const chunkCols: number[][] = Array.from({ length: CHUNKS }, () => []);
  const chunkFaces: [number, number, number][][] = Array.from({ length: CHUNKS }, () => []);
  for (let i = 0; i < f.length; i += 3) {
    const [a, b, c] = [pts[f[i]], pts[f[i + 1]], pts[f[i + 2]]];
    const col = faceColour(a, b, c, i);
    const k = chunkOf(a.clone().add(b).add(c).divideScalar(3));
    for (const p of [a, b, c]) {
      stoneTris.push(p.x, p.y, p.z);
      stoneCols.push(col.r, col.g, col.b);
      chunkTris[k].push(p.x, p.y, p.z);
      chunkCols[k].push(col.r, col.g, col.b);
    }
    chunkFaces[k].push([f[i], f[i + 1], f[i + 2]]);
  }
  const stoneGeo = geo(stoneTris, stoneCols, true);
  const material = crackMaterial(ground);
  const stone = new Mesh(stoneGeo, material);
  // each chunk closed with raw stone (paler, freshly broken) from its open edges to the middle
  const raw = new Color(st.base).lerp(new Color(0xe8e0d0), 0.35);
  const chunks = chunkFaces.map((faces, k) => {
    const count = new Map<string, [number, number] | null>();
    for (const [a, b, c] of faces)
      for (const [x, y] of [[a, b], [b, c], [c, a]] as [number, number][]) {
        const key = x < y ? `${x},${y}` : `${y},${x}`;
        count.set(key, count.has(key) ? null : [x, y]);
      }
    // closed off a little way in behind its own face: a shell of stone, not a wedge to the middle
    const shell = new Vector3();
    for (const [a, b, c] of faces) shell.add(pts[a]).add(pts[b]).add(pts[c]);
    shell.divideScalar(Math.max(1, faces.length * 3));
    const inner = shell.lerp(centre, 0.45);
    for (const e of count.values()) {
      if (!e) continue;
      const [x, y] = e;
      for (const p of [pts[y], pts[x], inner]) {
        chunkTris[k].push(p.x, p.y, p.z);
        chunkCols[k].push(raw.r, raw.g, raw.b);
      }
    }
    const g = geo(chunkTris[k], chunkCols[k], false);
    g.computeBoundingBox();
    const home = g.boundingBox!.getCenter(new Vector3());
    g.translate(-home.x, -home.y, -home.z);
    return { mesh: new Mesh(g, material), home };
  });
  const crack = material.userData.crack as { value: number };
  return { stone, chunks, crack, material };
}

function geo(pos: number[], col: number[], computeFlat: boolean): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  if (computeFlat) g.computeBoundingSphere();
  return g;
}

/**
 * The stone: faceted and vertex-coloured, lit by the island's sun and moon. Along veins laid
 * through it (in its own frame, so the chunks carry theirs away) the gems' light shows, in the
 * ground's gem colour: softly, breathing (ROCK_TIME), while it's whole; wider and brighter as the
 * pick opens the cracks (`userData.crack`, 0..1).
 */
function crackMaterial(ground: Ground): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const crack = { value: 0 };
  const glow = { value: new Color(GEMS[gemsOf(ground)[0]].colour) };
  m.userData.crack = crack;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCrack = crack;
    sh.uniforms.uRockTime = ROCK_TIME;
    sh.uniforms.uCrackGlow = glow;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRockP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRockP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uCrack;
uniform float uRockTime;
uniform vec3 uCrackGlow;
varying vec3 vRockP;
float rockVein(vec3 p) {
  // three wandering sheets through the stone: where the rock is near one, it's a crack
  vec3 q = p * 2.3;
  float a = abs(sin(q.x * 1.3 + sin(q.z * 2.1) * 0.9 + q.y * 0.6));
  float b = abs(sin(q.z * 1.1 - sin(q.x * 1.7 + q.y) * 0.8 + 1.7));
  float c = abs(sin(q.y * 2.4 + sin(q.x * 1.9) * 0.7 + q.z * 0.5 + 0.6));
  return min(min(a, b), c);
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  // whole, the veins breathe; struck, they open and blaze
  float w = 0.05 + 0.11 * uCrack;
  float d = rockVein(vRockP);
  float v = 1.0 - smoothstep(0.0, w, d);
  float halo = (1.0 - smoothstep(w, w * 3.0, d)) * 0.25;
  float breathe = 0.85 + 0.15 * sin(uRockTime * 1.7 + dot(vRockP, vec3(2.1, 1.3, 1.7)));
  totalEmissiveRadiance += uCrackGlow * (v + halo) * (1.3 + 2.6 * uCrack) * breathe;
  diffuseColor.rgb *= 1.0 - v * 0.85;
}`,
      );
  };
  m.customProgramCacheKey = () => 'gem-rock';
  return m;
}

/* ── the pickaxe ──────────────────────────────────────────────────────── */

/**
 * The prospector's pickaxe: a hickory haft, a leather grip, a forged steel head across its end,
 * a long point one way and a chisel the other. Grip space: the haft runs forward (−z) from your
 * fist, the point down (−y). Its point is at PICK_TIP.
 */
export const PICK_TIP = new Vector3(0, -0.25, -0.54);

export function buildPickaxe(env: Texture | null): Group {
  const g = new Group();
  const hickory = new MeshStandardMaterial({ color: 0xb08a58, roughness: 0.6, envMap: env, envMapIntensity: 0.6 });
  const leather = new MeshStandardMaterial({ color: 0x5a2a18, roughness: 0.85 });
  const steel = new MeshStandardMaterial({ color: 0x5e6268, roughness: 0.32, metalness: 0.9, envMap: env, envMapIntensity: 1.2 });
  const bright = new MeshStandardMaterial({ color: 0xe8ecf0, roughness: 0.15, metalness: 1, envMap: env, envMapIntensity: 1.6 });
  const brass = new MeshStandardMaterial({ color: 0xd8a848, roughness: 0.3, metalness: 1, envMap: env, envMapIntensity: 1.3 });
  const haft = new Mesh(new CylinderGeometry(0.017, 0.022, 0.7, 10).rotateX(Math.PI / 2), hickory);
  haft.position.z = -0.23;
  const grip = new Mesh(new CylinderGeometry(0.024, 0.024, 0.18, 10).rotateX(Math.PI / 2), leather);
  grip.position.z = 0.03;
  // the eye: a collar of steel round the haft's end, a brass ferrule under it
  const eye = new Mesh(new BoxGeometry(0.05, 0.075, 0.06), steel);
  eye.position.set(0, 0, -0.54);
  const ferrule = new Mesh(new CylinderGeometry(0.025, 0.025, 0.03, 12).rotateX(Math.PI / 2), brass);
  ferrule.position.z = -0.495;
  // the point: curving down and a touch back toward you, tapering to a bright tip
  const point = new Mesh(
    stalk([new Vector3(0, -0.02, -0.54), new Vector3(0, -0.1, -0.545), new Vector3(0, -0.18, -0.54), new Vector3(0, -0.245, -0.525)], 0.021, 0.004, 8, 14, true),
    steel,
  );
  const tip = new Mesh(new ConeGeometry(0.0045, 0.018, 8).rotateX(Math.PI), bright);
  tip.position.copy(PICK_TIP).add(new Vector3(0, 0.004, 0.002));
  // the chisel: up the other way, flattening to a broad edge
  const chisel = new Mesh(
    stalk([new Vector3(0, 0.02, -0.54), new Vector3(0, 0.1, -0.545), new Vector3(0, 0.17, -0.54)], 0.02, 0.012, 8, 10, true).scale(1.5, 1, 0.7),
    steel,
  );
  const edge = new Mesh(new BoxGeometry(0.05, 0.01, 0.012), bright);
  edge.position.set(0, 0.176, -0.54);
  g.add(haft, grip, eye, ferrule, point, tip, chisel, edge);
  return g;
}
