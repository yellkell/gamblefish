/**
 * The island's plants and rocks, grown where Tidewater grows them.
 *
 * Placement is Tidewater's (vegetation/Scatter.js land cover and Rocks.js, run by the bake), so
 * the hills carry its forest, the bay its palms and the gullies its understory. The meshes are
 * built for a headset: Tidewater's own foliage is shaped by its WGSL vertex stage and cut by
 * procedural leaf masks, so here the leaves come from one painted atlas (world/foliage.ts) on
 * alpha-to-coverage cards — soft-edged under MSAA, sorted like opaque — and the crowns keep
 * Tidewater's lobe layout (TREE_LOBES / SHRUB_LOBES, baked into veg.bin), palms its heights
 * and leans.
 *
 * Budget: the forest is ~12.7k trees. Far away each is a painted crown on a camera-facing card
 * (two triangles), instanced in 256 m cells so whole cells cull off-screen; within 70 m the
 * trees swap to a trunk, limbs and leaf-card crowns, and the understory and ferns appear —
 * re-picked from a spatial grid whenever you've moved (a teleport, mostly).
 */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Euler,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type Camera,
  type CanvasTexture,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { unpack, type Typed } from './data.ts';
import { paintFoliage, REGION, TREE_SPRITE } from './foliage.ts';

type Lobe = [number, number, number, number];
type Region = [number, number, number, number];

interface VegMeta {
  stride: number;
  counts: Record<string, number>;
  rocks: number;
  rockStyles: number;
  treeH: number;
  treeLobes: Lobe[];
  shrubH: number;
  shrubLobes: Lobe[];
}

/* ── tiny deterministic noise for shapes and tints ─────────────────────── */

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/* ── geometry kit: position, normal, uv (into the foliage atlas), colour ── */

/** Solid parts sample the atlas's opaque white block (bottom right), so they merge with leaf cards. */
const SOLID_U = 0.99;
const SOLID_V = 0.01;

function withUvColour(g: BufferGeometry, hex: number, vary = 0, seed = 0): BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3);
  const base = new Color(hex);
  for (let i = 0; i < n; i += 3) {
    const k = 1 + (hash(seed + i * 0.37) - 0.5) * vary;
    for (let v = 0; v < 3 && i + v < n; v++) c.set([base.r * k, base.g * k, base.b * k], (i + v) * 3);
  }
  geo.setAttribute('color', new BufferAttribute(c, 3));
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) uv.set([SOLID_U, SOLID_V], i * 2);
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
  return geo;
}

/** A lumpy blob: an icosahedron with its vertices pushed in and out. */
function lump(x: number, y: number, z: number, r: number, hex: number, seed: number, detail = 0, squash = 0.85): BufferGeometry {
  const g = new IcosahedronGeometry(r, detail);
  const p = g.attributes.position as BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i);
    const vy = p.getY(i);
    const vz = p.getZ(i);
    const k = 1 + (hash(seed + Math.round(vx * 97) * 3.1 + Math.round(vy * 89) * 5.7 + Math.round(vz * 83) * 7.3) - 0.5) * 0.36;
    p.setXYZ(i, x + vx * k, y + vy * k * squash, z + vz * k);
  }
  g.computeVertexNormals();
  return withUvColour(g, hex, 0.18, seed);
}

function cylinder(r0: number, r1: number, from: Vector3, to: Vector3, hex: number, radial = 6): BufferGeometry {
  const d = to.clone().sub(from);
  const g = new CylinderGeometry(r1, r0, 1, radial, 1, true);
  g.translate(0, 0.5, 0);
  g.scale(1, d.length(), 1);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize()));
  g.translate(from.x, from.y, from.z);
  return withUvColour(g, hex, 0.12, 3);
}

interface Arrays {
  pos: number[];
  nrm: number[];
  uv: number[];
  col: number[];
}
const arrays = (): Arrays => ({ pos: [], nrm: [], uv: [], col: [] });

function fromArrays(a: Arrays): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(a.pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(a.nrm), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(a.uv), 2));
  g.setAttribute('color', new BufferAttribute(new Float32Array(a.col), 3));
  return g;
}

/**
 * Leaf cards over a lobe: `n` quads on the sphere (x, y, z, r), facing out, each mapped to an
 * atlas region. Normals point out from the lobe centre (the classic foliage trick), so light
 * wraps round the crown as if it were solid and the underside falls into its own shade.
 */
function cards(a: Arrays, x: number, y: number, z: number, r: number, n: number, region: Region, seed: number, shade = 0.5): void {
  const c = new Vector3(x, y, z);
  const [u0, v0, u1, v1] = region;
  for (let i = 0; i < n; i++) {
    // a well-spread direction (golden spiral), jittered, weighted to the upper half
    const k = (i + 0.5) / n;
    const yv = 1 - 1.7 * k + (hash(seed + i) - 0.5) * 0.2;
    const ra = Math.sqrt(Math.max(0, 1 - Math.min(1, yv * yv)));
    const ang = i * 2.39996 + hash(seed + i * 3) * 0.6;
    const d = new Vector3(Math.cos(ang) * ra, Math.max(-0.85, yv), Math.sin(ang) * ra).normalize();
    const centre = c.clone().addScaledVector(d, r * 0.6);
    const t1 = new Vector3().crossVectors(d, Math.abs(d.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0)).normalize();
    const t2 = new Vector3().crossVectors(d, t1);
    const roll = hash(seed + i * 7) * Math.PI * 2;
    const ax = t1.clone().multiplyScalar(Math.cos(roll)).addScaledVector(t2, Math.sin(roll));
    const ay = t1.clone().multiplyScalar(-Math.sin(roll)).addScaledVector(t2, Math.cos(roll));
    const h = r * (0.85 + hash(seed + i * 11) * 0.35);
    const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const P = corners.map(([sx, sy]) => centre.clone().addScaledVector(ax, sx * h).addScaledVector(ay, sy * h));
    const UV = corners.map(([sx, sy]) => [sx < 0 ? u0 : u1, sy < 0 ? v0 : v1]);
    for (const q of [0, 1, 2, 0, 2, 3]) {
      a.pos.push(P[q].x, P[q].y, P[q].z);
      const nn = P[q].clone().sub(c).normalize();
      a.nrm.push(nn.x, nn.y, nn.z);
      a.uv.push(UV[q][0], UV[q][1]);
      const k2 = shade + (1 - shade) * (0.5 + 0.5 * nn.y);
      a.col.push(k2, k2, k2);
    }
  }
}

/**
 * A frond as textured cards along its arch: a V of two strips either side of the rachis (the
 * leaflets hang down off it), mapped to a feather region of the atlas, base to tip.
 */
function frond(a: Arrays, o: Vector3, az: number, len: number, w: number, rise: number, droop: number, segs: number, region: Region, hang = 0.5): void {
  const dir = new Vector3(Math.cos(az), 0, Math.sin(az));
  const side = new Vector3(-dir.z, 0, dir.x);
  const [u0, v0, u1, v1] = region;
  const vm = (v0 + v1) / 2;
  const pt = (t: number): Vector3 => o.clone().addScaledVector(dir, len * t).add(new Vector3(0, rise * t - droop * t * t, 0));
  for (let i = 0; i < segs; i++) {
    const ta = i / segs;
    const tb = (i + 1) / segs;
    const pa = pt(ta);
    const pb = pt(tb);
    for (const s of [-1, 1]) {
      const ea = pa.clone().addScaledVector(side, s * w).add(new Vector3(0, -w * hang, 0));
      const eb = pb.clone().addScaledVector(side, s * w).add(new Vector3(0, -w * hang, 0));
      const ve = s < 0 ? v1 : v0;
      const quad: [Vector3, number, number][] = [
        [pa, u0 + (u1 - u0) * ta, vm],
        [pb, u0 + (u1 - u0) * tb, vm],
        [eb, u0 + (u1 - u0) * tb, ve],
        [ea, u0 + (u1 - u0) * ta, ve],
      ];
      // up and a little out: fronds light like a canopy, not like paper
      const n = new Vector3(0, 1, 0).addScaledVector(side, s * 0.35).normalize();
      for (const q of [0, 1, 2, 0, 2, 3]) {
        const [p, u, v] = quad[q];
        a.pos.push(p.x, p.y, p.z);
        a.nrm.push(n.x, n.y, n.z);
        a.uv.push(u, v);
        const k = 0.75 + 0.25 * (i / segs);
        a.col.push(k, k, k);
      }
    }
  }
}

/** A broad leaf (banana, monstera, heliconia): a solid bent blade, vertex-coloured. */
function blade(a: Arrays, o: Vector3, az: number, len: number, w: number, rise: number, droop: number, segs: number, hex: number): void {
  const dir = new Vector3(Math.cos(az), 0, Math.sin(az));
  const side = new Vector3(-dir.z, 0, dir.x);
  const c0 = new Color(hex);
  const pt = (t: number): Vector3 => o.clone().addScaledVector(dir, len * t).add(new Vector3(0, rise * t - droop * t * t, 0));
  const wf = (t: number): number => w * Math.pow(Math.sin(Math.PI * Math.min(0.98, t * 0.9 + 0.08)), 0.7);
  for (let i = 0; i < segs; i++) {
    const ta = i / segs;
    const tb = (i + 1) / segs;
    const pa = pt(ta);
    const pb = pt(tb);
    for (const s of [-1, 1]) {
      const ea = pa.clone().addScaledVector(side, s * wf(ta)).add(new Vector3(0, -wf(ta) * 0.15, 0));
      const eb = pb.clone().addScaledVector(side, s * wf(tb)).add(new Vector3(0, -wf(tb) * 0.15, 0));
      const n = new Vector3(0, 1, 0).addScaledVector(side, s * 0.2).normalize();
      for (const p of [pa, pb, eb, pa, eb, ea]) {
        a.pos.push(p.x, p.y, p.z);
        a.nrm.push(n.x, n.y, n.z);
        a.uv.push(SOLID_U, SOLID_V);
        const k = 0.8 + 0.3 * ta;
        a.col.push(c0.r * k, c0.g * k, c0.b * k);
      }
    }
  }
}

/* ── the plants ────────────────────────────────────────────────────────── */

const BARK = 0x6b5a48;
const PALM_BARK = 0x8c7a62;

function treeNear(m: VegMeta): BufferGeometry {
  const parts = [cylinder(0.38, 0.22, new Vector3(0, -0.3, 0), new Vector3(0.1, 4.2, 0), BARK, 7)];
  // limbs from the fork up into the biggest lobes
  for (const [x, y, z] of m.treeLobes.slice(0, 5)) parts.push(cylinder(0.17, 0.07, new Vector3(0.1, 3.8, 0), new Vector3(x * 0.75, y * 0.85, z * 0.75), BARK, 5));
  // a dark inner core per lobe (no see-through holes), then the leaf cards over it
  const leaves = arrays();
  m.treeLobes.forEach(([x, y, z, r], i) => {
    parts.push(lump(x, y, z, r * 0.6, 0x243e1a, 11 + i * 7));
    cards(leaves, x, y, z, r, 10, REGION.leaf, 100 + i * 17);
  });
  parts.push(fromArrays(leaves));
  return mergeGeometries(parts)!;
}

function shrub(m: VegMeta): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const leaves = arrays();
  m.shrubLobes.forEach(([x, y, z, r], i) => {
    parts.push(lump(x, y, z, r * 0.55, 0x2a4a1e, 40 + i * 5));
    cards(leaves, x, y, z, r * 1.05, 7, REGION.shrub, 300 + i * 13, 0.6);
  });
  parts.push(fromArrays(leaves));
  return mergeGeometries(parts)!;
}

/** Palm trunk of height 1 (the instance scales it to the palm's own height). */
function palmTrunk(): BufferGeometry {
  const g = new CylinderGeometry(0.16, 0.24, 1, 7, 6, true);
  // the ringed trunk: every row a little proud
  const p = g.attributes.position as BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const ring = 1 + 0.08 * Math.abs(Math.sin(p.getY(i) * 40));
    p.setXYZ(i, p.getX(i) * ring, p.getY(i), p.getZ(i) * ring);
  }
  g.computeVertexNormals();
  g.translate(0, 0.5, 0);
  return withUvColour(g, PALM_BARK, 0.2, 9);
}

function palmCrown(fronds = 12, len = 3.7): BufferGeometry {
  const a = arrays();
  const o = new Vector3();
  for (let i = 0; i < fronds; i++) {
    const az = (i / fronds) * Math.PI * 2 + hash(i) * 0.4;
    const l = len * (0.8 + hash(i + 5) * 0.35);
    // young fronds stand up, old ones arch out and droop
    const age = hash(i + 13);
    frond(a, o, az, l, 0.62, 1.6 - age * 1.1, 1.6 + age * 2.2, 5, REGION.frond);
  }
  const nuts = [0, 1, 2, 3].map((k) => lump(Math.cos(k * 1.6) * 0.22, -0.35, Math.sin(k * 1.6) * 0.22, 0.14, 0x5a4a22, 60 + k));
  return mergeGeometries([fromArrays(a), ...nuts])!;
}

function fern(): BufferGeometry {
  const a = arrays();
  const o = new Vector3(0, 0.05, 0);
  for (let i = 0; i < 9; i++) frond(a, o, (i / 9) * Math.PI * 2 + hash(i) * 0.5, 1.05, 0.2, 1.25 + hash(i + 3) * 0.4, 0.95, 4, REGION.fern, 0.3);
  return fromArrays(a);
}

function youngPalm(): BufferGeometry {
  const a = arrays();
  const o = new Vector3(0, 0.2, 0);
  for (let i = 0; i < 7; i++) frond(a, o, (i / 7) * Math.PI * 2 + hash(i + 20), 1.8, 0.42, 1.6, 1.7, 4, REGION.frond);
  return fromArrays(a);
}

function broadleaf(hex: number, accent: number | null, leaves = 5, len = 1.0, h = 0.5): BufferGeometry {
  const a = arrays();
  for (let i = 0; i < leaves; i++) {
    const az = (i / leaves) * Math.PI * 2 + hash(i + 40) * 0.6;
    blade(a, new Vector3(0, h * (0.6 + hash(i) * 0.8), 0), az, len, 0.32, 0.25, 0.45, 3, hex);
  }
  const parts = [fromArrays(a)];
  if (accent !== null) for (const k of [0, 1]) parts.push(lump(Math.cos(k * 3) * 0.25, h * 1.6 + k * 0.2, Math.sin(k * 3) * 0.25, 0.14, accent, 70 + k));
  return mergeGeometries(parts)!;
}

function banana(): BufferGeometry {
  const a = arrays();
  for (let i = 0; i < 6; i++) blade(a, new Vector3(0, 2.1, 0), (i / 6) * Math.PI * 2 + hash(i + 80), 1.7, 0.36, 0.7, 1.4, 3, 0x6aa23e);
  return mergeGeometries([cylinder(0.14, 0.1, new Vector3(), new Vector3(0, 2.2, 0), 0x7d8a4a, 5), fromArrays(a)])!;
}

/** The far forest's card: a unit quad standing on its base (the shader turns it to face you). */
function treeSprite(): BufferGeometry {
  const g = new PlaneGeometry(1, 1);
  g.translate(0, 0.5, 0);
  const n = g.attributes.normal as BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

/* ── placement data ────────────────────────────────────────────────────── */

interface Plants {
  data: Float32Array;
  n: number;
}

class Grid {
  private readonly cells = new Map<number, number[]>();
  readonly p: Plants;
  private readonly stride: number;
  private readonly size: number;

  constructor(p: Plants, stride: number, size = 32) {
    this.p = p;
    this.stride = stride;
    this.size = size;
    for (let i = 0; i < p.n; i++) {
      const k = this.key(p.data[i * stride], p.data[i * stride + 2]);
      let c = this.cells.get(k);
      if (!c) this.cells.set(k, (c = []));
      c.push(i);
    }
  }
  private key(x: number, z: number): number {
    return (Math.floor(x / this.size) + 512) * 4096 + (Math.floor(z / this.size) + 512);
  }
  /** Indices within r of (x, z), nearest first, at most max. */
  query(x: number, z: number, r: number, max: number): number[] {
    const out: [number, number][] = [];
    const s = this.size;
    const D = this.p.data;
    for (let cx = Math.floor((x - r) / s); cx <= Math.floor((x + r) / s); cx++) {
      for (let cz = Math.floor((z - r) / s); cz <= Math.floor((z + r) / s); cz++) {
        const c = this.cells.get((cx + 512) * 4096 + (cz + 512));
        if (!c) continue;
        for (const i of c) {
          const dx = D[i * this.stride] - x;
          const dz = D[i * this.stride + 2] - z;
          const d2 = dx * dx + dz * dz;
          if (d2 < r * r) out.push([d2, i]);
        }
      }
    }
    out.sort((a, b) => a[0] - b[0]);
    return out.slice(0, max).map((e) => e[1]);
  }
}

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _e = new Euler();
const _c = new Color();
const ZERO = new Matrix4().makeScale(0, 0, 0);

/** Instance matrix for plant i: at its base, turned by its yaw, scaled (and leaned). */
function plantMatrix(D: Float32Array, i: number, st: number, out: Matrix4, lean = false): Matrix4 {
  const o = i * st;
  const s = D[o + 3];
  _p.set(D[o], D[o + 1], D[o + 2]);
  _q.setFromEuler(_e.set(0, D[o + 5], 0));
  if (lean) {
    const la = D[o + 6];
    const tilt = new Quaternion().setFromAxisAngle(new Vector3(Math.sin(la), 0, -Math.cos(la)), Math.atan(D[o + 7]));
    _q.premultiply(tilt);
  }
  _s.set(s, s * D[o + 4], s);
  return out.compose(_p, _q, _s);
}

interface NearSet {
  mesh: InstancedMesh;
  grid: Grid;
  radius: number;
  tint: number;
}

export class Vegetation {
  readonly group = new Group();
  private readonly near: NearSet[] = [];
  private readonly farCells: { mesh: InstancedMesh; index: Map<number, number> }[] = [];
  private readonly treeGrid: Grid;
  private hiddenFar: [InstancedMesh, number, Matrix4][] = [];
  private readonly last = new Vector3(1e9, 0, 0);
  private readonly stride: number;
  private readonly treeNearMesh: InstancedMesh;
  private readonly trees: Plants;
  private readonly treeNearR = 70;
  readonly atlas: CanvasTexture;
  /** the baked grass mask (2 channels at 2 m) for world/grass.ts */
  readonly grassMask: Uint8Array | null;
  readonly grassRes: number;
  /** leaf materials: a slow breeze in the vertex stage */
  private readonly swayMats: { uniforms: { uTime: { value: number } } }[] = [];

  constructor(buf: ArrayBuffer) {
    const { arrays: A, meta: raw } = unpack(buf);
    const meta = raw as unknown as VegMeta;
    this.stride = meta.stride;
    const plants = (type: string): Plants => {
      const data = (A[`veg.${type}`] as Float32Array) ?? new Float32Array(0);
      return { data, n: data.length / this.stride };
    };
    this.group.name = 'vegetation';

    this.atlas = paintFoliage(meta.treeLobes);
    this.grassMask = (A['grass.mask'] as Uint8Array) ?? null;
    this.grassRes = (raw as { grassRes?: number }).grassRes ?? 0;
    const solid = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    // leaves: the painted atlas, cut out with alpha-to-coverage (soft edges under MSAA)
    const foliage = (sway: number): MeshLambertMaterial =>
      this.swaying(new MeshLambertMaterial({ map: this.atlas, vertexColors: true, side: DoubleSide, alphaTest: 0.45, alphaToCoverage: true }), sway);
    const leaf = foliage(0.06);
    const crownMat = foliage(0.02);

    /* the forest: painted crowns far away in 256 m cells, full trees around you */
    this.trees = plants('trees');
    this.treeGrid = new Grid(this.trees, this.stride, 32);
    this.buildFarForest(treeSprite(), this.billboard());
    this.treeNearMesh = this.instanced(treeNear(meta), crownMat, 160);

    /* palms: all of them, always (233), trunk + crown */
    const palms = plants('palms');
    const trunks = new InstancedMesh(palmTrunk(), solid, palms.n);
    const crowns = new InstancedMesh(palmCrown(), leaf, palms.n);
    const top = new Vector3();
    for (let i = 0; i < palms.n; i++) {
      const D = palms.data;
      const o = i * this.stride;
      const H = D[o + 8] || 9;
      const la = D[o + 6];
      const l = D[o + 7];
      // trunk: unit height scaled to H, leaned by atan(lean) toward its azimuth
      plantMatrix(D, i, this.stride, _m, true);
      _m.decompose(_p, _q, _s);
      trunks.setMatrixAt(i, _m.compose(_p, _q, _s.set(D[o + 3], H, D[o + 3])));
      // crown at the top of the leaned trunk
      top.set(D[o] + Math.cos(la) * l * H, D[o + 1] + H, D[o + 2] + Math.sin(la) * l * H);
      _q.setFromEuler(_e.set(0, D[o + 5], 0));
      const cs = 0.85 + D[o + 3] * 0.25;
      crowns.setMatrixAt(i, _m.compose(top, _q, _s.set(cs, cs, cs)));
      crowns.setColorAt(i, _c.setRGB(0.9 + hash(i) * 0.2, 0.95 + hash(i + 1) * 0.1, 0.85 + hash(i + 2) * 0.2));
    }
    for (const m of [trunks, crowns]) {
      m.frustumCulled = false; // spread over the whole island; cheap enough to always draw
      this.group.add(m);
    }

    /* understory: near only */
    const nearTypes: [string, BufferGeometry, Material, number, number][] = [
      ['shrubs', shrub(meta), crownMat, 55, 220],
      ['ferns', fern(), leaf, 28, 260],
      ['youngPalms', youngPalm(), leaf, 45, 90],
      ['bananas', banana(), leaf, 50, 60],
      ['monsteras', broadleaf(0x2f6a2a, null, 6, 0.9, 0.35), leaf, 40, 120],
      ['elephantEars', broadleaf(0x3d7a36, null, 5, 1.3, 0.6), leaf, 40, 20],
      ['heliconias', broadleaf(0x2f7034, 0xd8402a, 5, 1.0, 0.8), leaf, 40, 40],
      ['strelitzias', broadleaf(0x3a6e40, 0xf08a1e, 5, 0.9, 0.7), leaf, 40, 16],
    ];
    for (const [type, geo, mat, radius, max] of nearTypes) {
      const p = plants(type);
      if (!p.n) continue;
      const mesh = this.instanced(geo, mat, Math.min(max, p.n));
      this.near.push({ mesh, grid: new Grid(p, this.stride, 32), radius, tint: hash(type.length) });
    }

    /* rocks: Tidewater's placements and shapes, low detail, all drawn */
    const rockMat = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const RM = A['rocks.matrix'] as Float32Array;
    const RS = A['rocks.style'] as Uint8Array;
    for (let si = 0; si < meta.rockStyles; si++) {
      const idx: number[] = [];
      for (let i = 0; i < RS.length; i++) if (RS[i] === si) idx.push(i);
      if (!idx.length) continue;
      const mesh = new InstancedMesh(rockGeometry(A, si), rockMat, idx.length);
      idx.forEach((ri, k) => {
        mesh.setMatrixAt(k, _m.fromArray(RM, ri * 16));
        mesh.setColorAt(k, _c.setRGB(1, 1, 1).multiplyScalar(0.85 + hash(ri) * 0.3));
      });
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
  }

  private instanced(geo: BufferGeometry, mat: Material, capacity: number): InstancedMesh {
    const m = new InstancedMesh(geo, mat, capacity);
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    m.count = 0;
    m.frustumCulled = false;
    this.group.add(m);
    return m;
  }

  /**
   * The far forest's material: each instance is a card standing on its base, turned about the
   * vertical to face the camera, showing one of four painted crowns (per-instance `variant`).
   */
  private billboard(): MeshLambertMaterial {
    const mat = new MeshLambertMaterial({ map: this.atlas, alphaTest: 0.45, alphaToCoverage: true });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float variant;')
        .replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>
          vMapUv = vec2(mod(variant, 2.0) * 0.25, 0.75 - floor(variant / 2.0) * 0.25) + uv * 0.25;`,
        )
        .replace(
          '#include <project_vertex>',
          `vec3 C = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float sx = length(instanceMatrix[0].xyz);
          float sy = length(instanceMatrix[1].xyz);
          vec2 d = normalize(cameraPosition.xz - C.xz + vec2(1e-4, 0.0));
          vec3 right = vec3(d.y, 0.0, -d.x);
          vec3 wp = C + right * transformed.x * sx + vec3(0.0, transformed.y * sy, 0.0);
          vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mvPosition;`,
        );
    };
    mat.customProgramCacheKey = () => 'tree-billboard';
    return mat;
  }

  /** Leaves and crowns lean with a slow breeze (height-weighted, per-instance phase). */
  private swaying(mat: MeshLambertMaterial, amount: number): MeshLambertMaterial {
    const uniforms = { uTime: { value: 0 } };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.17;
          #else
            float ph = 0.0;
          #endif
          float hgt = max(transformed.y, 0.0);
          transformed.x += sin(uTime * 0.9 + ph) * ${amount.toFixed(3)} * hgt;
          transformed.z += sin(uTime * 0.7 + ph * 1.3) * ${(amount * 0.6).toFixed(3)} * hgt;`,
        );
      if (mat.side === DoubleSide) {
        shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <normal_fragment_begin>',
          '#include <normal_fragment_begin>\n  // foliage: both faces take the authored normal (a card seen from behind is not facing down)\n  normal = normalize(vNormal);',
        );
      }
    };
    mat.customProgramCacheKey = () => `sway${amount}`;
    this.swayMats.push({ uniforms });
    return mat;
  }

  private buildFarForest(sprite: BufferGeometry, mat: Material): void {
    const D = this.trees.data;
    const st = this.stride;
    const CELL = 256;
    const cells = new Map<string, number[]>();
    for (let i = 0; i < this.trees.n; i++) {
      const k = `${Math.floor(D[i * st] / CELL)},${Math.floor(D[i * st + 2] / CELL)}`;
      let c = cells.get(k);
      if (!c) cells.set(k, (c = []));
      c.push(i);
    }
    for (const list of cells.values()) {
      const geo = sprite.clone();
      const variant = new Float32Array(list.length);
      const mesh = new InstancedMesh(geo, mat, list.length);
      const index = new Map<number, number>();
      list.forEach((ti, k) => {
        const o = ti * st;
        const s = D[o + 3];
        _m.compose(_p.set(D[o], D[o + 1], D[o + 2]), _q.identity(), _s.set(TREE_SPRITE.w * s, TREE_SPRITE.h * s * D[o + 4], 1));
        mesh.setMatrixAt(k, _m);
        const g = hash(ti * 1.3);
        mesh.setColorAt(k, _c.setRGB(0.88 + g * 0.24, 0.92 + hash(ti) * 0.2, 0.85 + g * 0.18));
        variant[k] = Math.floor(hash(ti * 2.7) * 4);
        index.set(ti, k);
      });
      geo.setAttribute('variant', new InstancedBufferAttribute(variant, 1));
      mesh.computeBoundingSphere(); // per cell: whole cells cull off-screen
      this.group.add(mesh);
      this.farCells.push({ mesh, index });
    }
  }

  update(time: number, camera: Camera): void {
    for (const m of this.swayMats) m.uniforms.uTime.value = time;
    _p.setFromMatrixPosition(camera.matrixWorld); // read-only (see world/ocean.ts update)
    if (_p.distanceToSquared(this.last) < 9) return; // re-pick only after you've moved 3 m
    this.last.copy(_p);
    const x = _p.x;
    const z = _p.z;

    // near trees in, their far cards out
    for (const [mesh, k, m] of this.hiddenFar) {
      mesh.setMatrixAt(k, m);
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.hiddenFar = [];
    const T = this.treeNearMesh;
    const nearTrees = this.treeGrid.query(x, z, this.treeNearR, T.instanceMatrix.count);
    nearTrees.forEach((ti, k) => {
      T.setMatrixAt(k, plantMatrix(this.trees.data, ti, this.stride, _m));
      T.setColorAt(k, _c.setRGB(0.88 + hash(ti * 1.3) * 0.24, 0.92 + hash(ti) * 0.2, 0.85 + hash(ti * 1.3) * 0.18));
      for (const cell of this.farCells) {
        const fk = cell.index.get(ti);
        if (fk === undefined) continue;
        const old = new Matrix4();
        cell.mesh.getMatrixAt(fk, old);
        cell.mesh.setMatrixAt(fk, ZERO);
        cell.mesh.instanceMatrix.needsUpdate = true;
        this.hiddenFar.push([cell.mesh, fk, old]);
        break;
      }
    });
    T.count = nearTrees.length;
    T.instanceMatrix.needsUpdate = true;
    if (T.instanceColor) T.instanceColor.needsUpdate = true;

    for (const s of this.near) {
      const list = s.grid.query(x, z, s.radius, s.mesh.instanceMatrix.count);
      list.forEach((i, k) => {
        s.mesh.setMatrixAt(k, plantMatrix(s.grid.p.data, i, this.stride, _m));
        s.mesh.setColorAt(k, _c.setRGB(1, 1, 1).multiplyScalar(0.85 + hash(i * 0.7 + s.tint) * 0.3));
      });
      s.mesh.count = list.length;
      s.mesh.instanceMatrix.needsUpdate = true;
      if (s.mesh.instanceColor) s.mesh.instanceColor.needsUpdate = true;
    }
  }
}

function rockGeometry(A: Record<string, Typed>, si: number): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(A[`rock.${si}.far.position`] as Float32Array, 3));
  g.setIndex(new BufferAttribute(A[`rock.${si}.far.index`], 1));
  const geo = g.toNonIndexed();
  geo.computeVertexNormals();
  // volcanic grey-brown, moss on the upward faces
  const N = geo.attributes.normal as BufferAttribute;
  const c = new Float32Array(N.count * 3);
  const rock = new Color(0x6a625a);
  const moss = new Color(0x5a6a3a);
  for (let i = 0; i < N.count; i++) {
    const up = Math.max(0, N.getY(i));
    const k = new Color().copy(rock).lerp(moss, Math.pow(up, 3) * 0.6).multiplyScalar(0.85 + hash(i * 0.3) * 0.25);
    c.set([k.r, k.g, k.b], i * 3);
  }
  geo.setAttribute('color', new BufferAttribute(c, 3));
  return geo;
}
