/**
 * bake-world — runs Tidewater's OWN world generators (vendor/tidewater, MIT)
 * headlessly in Node and writes the island out as compact binaries that the
 * three.js / IWSDK runtime can stream straight onto the GPU.
 *
 * Tidewater is a WebGPU/WGSL engine; Quest Browser can't run WebGPU inside a
 * WebXR session, so nothing of its renderer survives the trip. What DOES
 * survive is everything that's plain CPU JavaScript: the procedural island
 * heightmap and its masks, the village / pier / boardwalk geometry builders,
 * and the collision world they register. Those are the source of truth, and
 * this script is the only place that touches them.
 *
 * Output (public/world/):
 *   terrain.bin   heights (2 m grid, uint16), ground albedo (RGBA8) and
 *                 water depth (R8) over the full 2048 m domain
 *   village.bin   one merged, vertex-coloured mesh per material class
 *   world.json    layout constants, collider tables, bake metadata
 *
 * Usage: node tools/bake-world.mjs [--if-missing]
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pack } from './pack.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TW = resolve(ROOT, 'vendor/tidewater/src');
const OUT = resolve(ROOT, 'public/world');
const url = (p) => 'file:///' + resolve(TW, p).replace(/\\/g, '/');

// No GPU here. Two things on the build path reach for one anyway, and both
// have a CPU copy of what we actually read: the fish drying racks upload an
// instance table (we don't ship those props), and the vegetation scatter's
// shared detail texture uploads itself before placement samples its CPU
// data. A do-nothing device (and WebGPU's enum globals) lets both through.
const { StorageBuffer } = await import(url('engine/gpu/Texture.js'));
StorageBuffer.prototype.write = function () {
  return this;
};
const { GPU } = await import(url('engine/gpu/GPU.js'));
const nop = new Proxy(function () {}, { get: (t, p) => (p === 'then' ? undefined : p === Symbol.toPrimitive ? () => 0 : nop), apply: () => nop, construct: () => nop });
for (const k of Object.keys(GPU)) if (GPU[k] === null) GPU[k] = nop;
for (const k of ['GPUTextureUsage', 'GPUBufferUsage', 'GPUShaderStage', 'GPUMapMode', 'GPUColorWrite']) globalThis[k] = new Proxy({}, { get: () => 1 });

// A porch 2.6–5.2 m wide gets three posts (buildHouse: ceil(width / 2.6) + 1), and the middle one
// stands on the stair line, right in front of the door — the Florist and the harbour huts. The
// bake leaves that post out (and its base, cap and knee braces); the beam spans on its own.
// Which house is being built comes from Village._layout's specs and buildHouse's own
// B.pushAt(x, 0, z, yaw).
const houseAt = new Map();
let house = null;
let houseDepth = -1;
const near = (a, b, e = 0.02) => Math.abs(a - b) < e;
/** the post in the stairs' way in the current house frame, if there is one: [x, z] */
const blockingPost = (B) => {
  if (!house || !house.porch || B.stack.length !== houseDepth) return null;
  const pw = Math.min(house.w, house.porch.width || house.w);
  if (Math.max(2, Math.ceil(pw / 2.6) + 1) !== 3) return null;
  const pcx = house.porch.offset || 0;
  const stairX = house.porch.stairX ?? house.doorX ?? 0;
  return Math.abs(pcx - stairX) < 0.7 ? [pcx, house.d / 2 + house.porch.depth - 0.12] : null;
};
// The walk-in buildings (village/interiors.ts) get a real doorway: their front wall is built as
// three pieces round an opening the size of Tidewater's door (DOOR_OPENING), and the door
// itself — leaf, glass, knob — is left out; its casing, head and sill stay as the doorway's trim.
// Through it you see into the lit room, and out of it to the island.
const { hasInterior, DOOR_OPENING } = await import('../src/village/interiors.ts');
// Houses the village does without (village/roles.ts DEMOLISHED): out of the layout before anything
// is built, so no house, no pad and no colliders; a little garden goes where each stood.
const { DEMOLISHED } = await import('../src/village/roles.ts');
const demolished = new Map();
let frontWall = false;

// The boatyard's slipway. Tidewater lays each rail as one straight beam from the shed to 6.5 m
// out, so it cuts through the sand where the beach dips and stops dead on the sand short of the
// sea, and it gives each rail its own short ties, off-centre: two broken half-ladders. The bake
// leaves those out and lays one slipway: both rails following the sand in half-metre lengths
// from the shed on into the water, full-width ties across the pair every 0.6 m.
let boathouse = null;
let boathouseDepth = -1;
const SLIP = { rails: [-0.55, 1.25], tie: 0.6, wet: 2.5, step: 0.5 };
const walkIn = () => house && hasInterior(house.name);
{
  const { Village: V } = await import(url('world/Village.js'));
  const layout = V.prototype._layout;
  V.prototype._layout = function (rand) {
    const specs = layout.call(this, rand);
    for (const h of specs.houses ?? []) if (DEMOLISHED.includes(h.name)) demolished.set(h.name, h);
    specs.houses = (specs.houses ?? []).filter((h) => !DEMOLISHED.includes(h.name));
    for (const h of specs.houses) houseAt.set(`${h.x},${h.z}`, h);
    boathouse = specs.boathouse ?? null;
    return specs;
  };
  const { Builder } = await import(url('world/village/GeoBuilder.js'));
  const { pushAt, pop, box, beam, part, lathe } = Builder.prototype;
  Builder.prototype.pushAt = function (x, y, z, ...r) {
    const out = pushAt.call(this, x, y, z, ...r);
    const h = y === 0 ? houseAt.get(`${x},${z}`) : undefined;
    if (h) ((house = h), (houseDepth = this.stack.length), (frontWall = false));
    else if (boathouse && y === 0 && x === boathouse.x && z === boathouse.z) boathouseDepth = this.stack.length;
    // buildHouse's frame for the front wall's windows and door
    else if (house && this.stack.length === houseDepth + 1 && x === 0 && y === 0 && near(z, house.d / 2) && !(r[0] ?? 0)) frontWall = true;
    return out;
  };
  Builder.prototype.pop = function () {
    if (boathouseDepth >= 0 && this.stack.length === boathouseDepth) {
      layBoathouseSlip(this);
      boathouseDepth = -1;
    }
    const out = pop.call(this);
    if (house && this.stack.length <= houseDepth) frontWall = false;
    if (house && this.stack.length < houseDepth) house = null;
    return out;
  };
  /** in the front wall's frame of a walk-in house: the door's own pieces, to leave out */
  const doorPiece = (B, x, y, z) => walkIn() && frontWall && B.stack.length === houseDepth + 1 && house.floorY !== undefined && Math.abs(x - (house.doorX ?? 0)) < 0.5 && y - house.floorY < 2.2;
  const inBoathouse = (B) => boathouseDepth >= 0 && B.stack.length === boathouseDepth;
  /** Tidewater's slipway, in the boathouse frame: laid by layBoathouseSlip instead */
  const layBoathouseSlip = (B) => {
    const bh = boathouse;
    const d = bh.d ?? 7.2;
    const c = Math.cos(bh.yaw);
    const sn = Math.sin(bh.yaw);
    const g = (lx, lz) => terrain.heightAt(bh.x + lx * c + lz * sn, bh.z - lx * sn + lz * c);
    const mid = (SLIP.rails[0] + SLIP.rails[1]) / 2;
    const span = SLIP.rails[1] - SLIP.rails[0] + 0.4;
    // the rails' bed: on the sand, then (under water) no deeper than the sea floor a little way out
    const bed = (lz) => Math.max(Math.min(g(SLIP.rails[0], lz), g(SLIP.rails[1], lz)), -1.2);
    const z0 = d / 2 - 0.3;
    // run on until the bed is `wet` metres of slipway past the waterline
    let z1 = z0 + 4;
    let wetFrom = null;
    for (let lz = z0; lz < z0 + 40; lz += 0.25) {
      if (bed(lz) < 0 && wetFrom === null) wetFrom = lz;
      if (wetFrom !== null && lz - wetFrom >= SLIP.wet) {
        z1 = lz;
        break;
      }
      z1 = lz;
    }
    let seed = 0.37;
    // Props.js WOOD(seed, 0.95): bare, well-weathered timber ([seed, paint, pattern, weather])
    const wood = () => [(seed = (seed * 9301 + 49297) % 233280) / 233280, 0, 0, 0.95];
    for (const sx of SLIP.rails) {
      for (let a = z0; a < z1 - 1e-6; a += SLIP.step) {
        const b = Math.min(z1, a + SLIP.step);
        beam.call(B, 'wood', [sx, bed(a) + 0.07, a], [sx, bed(b) + 0.07, b], 0.14, 0.12, { data: wood() });
      }
    }
    for (let lz = z0 + 0.3; lz <= z1 - 0.1; lz += SLIP.tie) {
      box.call(B, 'wood', mid, bed(lz) - 0.01, lz, span, 0.09, 0.16, { grain: 0, data: wood() });
    }
  };
  Builder.prototype.box = function (key, x, y, z, sx, sy, sz, o) {
    // Tidewater's slipway ties (1.1 m, one set per rail)
    if (inBoathouse(this) && sx === 1.1 && sy === 0.09 && sz === 0.16) return;
    const p = blockingPost(this);
    // the post (0.12 square), its base and cap (0.16 square), at the post line
    if (p && near(x, p[0]) && near(z, p[1]) && ((sx === 0.12 && sz === 0.12) || (sx === 0.16 && sz === 0.16))) return;
    // a walk-in house's front wall (full width, 0.14 thick, just inside the front face): round the doorway
    if (walkIn() && this.stack.length === houseDepth && x === 0 && sx === house.w && sz === 0.14 && near(z, house.d / 2 - 0.07)) {
      const floorY = (house.floorY = y - sy / 2);
      const W = DOOR_OPENING.w;
      const Hd = DOOR_OPENING.h;
      const ox = house.doorX ?? 0;
      const l0 = -house.w / 2;
      const l1 = ox - W / 2;
      const r0 = ox + W / 2;
      const r1 = house.w / 2;
      box.call(this, key, (l0 + l1) / 2, y, z, l1 - l0, sy, sz, o);
      box.call(this, key, (r0 + r1) / 2, y, z, r1 - r0, sy, sz, o);
      box.call(this, key, ox, (floorY + Hd + floorY + sy) / 2, z, W, sy - Hd, sz, o);
      return;
    }
    // the door leaf (0.92 × 2.08) and its glazing frame and bar
    if (doorPiece(this, x, y, z) && ((near(z, 0.012) && sx === 0.92) || (near(z, 0.04) && sx === 0.56) || (near(z, 0.049) && sx === 0.02))) return;
    return box.call(this, key, x, y, z, sx, sy, sz, o);
  };
  Builder.prototype.part = function (key, pt, x, y, z, o) {
    // the door's pane
    if (key === 'glass' && near(z, 0.047) && doorPiece(this, x, y, z)) return;
    return part.call(this, key, pt, x, y, z, o);
  };
  Builder.prototype.lathe = function (key, x, y, z, profile, o) {
    // the door's knob
    if (key === 'hard' && near(z, 0.035) && doorPiece(this, x, y, z)) return;
    return lathe.call(this, key, x, y, z, profile, o);
  };
  Builder.prototype.beam = function (key, p0, p1, w, h, o) {
    // Tidewater's slipway rails (one straight beam each)
    if (inBoathouse(this) && w === 0.14 && h === 0.12 && SLIP.rails.includes(p0[0]) && p0[0] === p1[0]) return;
    const p = blockingPost(this);
    // its knee braces: from 4 cm off the post, 0.32 m out to the beam
    if (p && near(p0[2], p[1]) && near(Math.abs(p0[0] - p[0]), 0.04) && near(Math.abs(p1[0] - p0[0]), 0.32)) return;
    return beam.call(this, key, p0, p1, w, h, o);
  };
}

const { TerrainData } = await import(url('world/TerrainData.js'));
const { Colliders } = await import(url('world/Colliders.js'));
const { Village } = await import(url('world/Village.js'));
const { WORLD } = await import(url('world/WorldLayout.js'));
const { VegSite, scatterVegetation, buildGrassMask } = await import(url('world/vegetation/Scatter.js'));
const { Rocks } = await import(url('world/Rocks.js'));
const { buildRockGeometry, ROCK_STYLES } = await import(url('world/terrain/RockGeometry.js'));
const { mulberry32 } = await import(url('util/Noise.js'));
const { TREE_H, TREE_LOBES, SHRUB_H, SHRUB_LOBES } = await import(url('world/vegetation/PlantGeometry.js'));
const E = await import(url('engine/index.js'));

// Tidewater's bucket() (world/Props.js) turns its half-ring handle about z, which stands it on
// edge down the bucket's side, pivoting top and bottom. Tipped back about x as well (what
// Props.js does for its other half-ring hoops), it arches over the rim, pivoting on the sides.
// The bucket's is the only half-ring turned about z alone.
const { Builder } = await import(url('world/village/GeoBuilder.js'));
const torus = Builder.prototype.torus;
Builder.prototype.torus = function (key, x, y, z, R, r, o = {}) {
  if (o.arc === Math.PI && o.rz === Math.PI / 2 && o.rx === undefined && o.ry === undefined) o = { ...o, rx: -Math.PI / 2 };
  return torus.call(this, key, x, y, z, R, r, o);
};

const t0 = performance.now();
const terrain = new TerrainData();
const colliders = new Colliders();
// Village flattens its building pads INTO the terrain, so it must be built
// before the heights are sampled.
const village = new Village({ scene: new E.Scene(), terrain, colliders });
// Where everything grows (Tidewater's own land-cover scatter, clear of the houses and paths)
const vegSite = new VegSite(terrain, { footprints: village.getFootprints() });
const veg = scatterVegetation(vegSite);
// where the grass grows (Tidewater's grass mask: R dune grass, G meadow, B sea oats, A creeper)
const grassMask = buildGrassMask(vegSite);
// Rocks: Tidewater's placement; the emergent ones join the collision world as it does
const rocks = Rocks.prototype._place.call({ terrainData: terrain, village }, mulberry32(4242));
for (const r of rocks) {
  const top = r.y + r.size * r.sy * 0.8;
  if (r.size < 0.9 || top < -0.3) continue;
  colliders.addCylinder(r.x, r.z, r.size * 0.75, r.y - r.size * 0.5, top, { tag: 'rock' });
}
// Every building's frame (the village keeps only centres; the layout has the rest)
const specs = Village.prototype._layout.call(village, { next: () => 0.5, range: (a, b) => (a + b) / 2, chance: () => false, pick: (a) => a[0] });
console.log(`generated island + village + ${rocks.length} rocks + vegetation in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

/* ── terrain: 2 m grid over the whole domain ───────────────────────────── */

const SRC = terrain.res; // 2048 texels at 1 m
const STEP = 2;
const N = SRC / STEP; // 1024
const H_MIN = -100;
const H_MAX = 320;
const heights = new Uint16Array(N * N);
const albedo = new Uint8Array(N * N * 4);
const depth = new Uint8Array(N * N);
const DEPTH_RANGE = 30; // metres of water the R8 depth channel spans

const srgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sat = (v) => Math.min(1, Math.max(0, v));
const smooth = (e0, e1, x) => {
  const t = sat((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

// Ground palette (sRGB), read off Tidewater's screenshots: pale coral sand,
// wet sand at the swash line, dry tropical scrub on the hills, dark volcanic
// rock on the scarps, trodden earth on the paths, seagrass and rubble below.
const PAL = {
  sand: srgb(0xe2d2ac),
  wetSand: srgb(0xb49f7a),
  seabed: srgb(0xd8caa0),
  grass: srgb(0x5e7a36),
  scrub: srgb(0x77783f),
  soil: srgb(0x7a6243),
  rock: srgb(0x5d564d),
  rockDark: srgb(0x3e3934),
  path: srgb(0x9c8260),
  seagrass: srgb(0x51683a),
  rubble: srgb(0x6e6254),
};

const T = terrain;
const at = (arr, i, j) => arr[Math.min(SRC - 1, j) * SRC + Math.min(SRC - 1, i)];
// Average a mask over the 2×2 source texels a baked cell covers.
const avg = (arr, i, j, scale = 1) =>
  (at(arr, i, j) + at(arr, i + 1, j) + at(arr, i, j + 1) + at(arr, i + 1, j + 1)) / (4 * scale);

for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    const si = i * STEP;
    const sj = j * STEP;
    const h = at(T.heights, si, sj);
    const k = j * N + i;
    heights[k] = Math.round(((Math.min(H_MAX, Math.max(H_MIN, h)) - H_MIN) / (H_MAX - H_MIN)) * 65535);
    depth[k] = Math.round(sat(-h / DEPTH_RANGE) * 255);

    const rock = avg(T.rock, si, sj);
    const sand = avg(T.sand, si, sj, 255);
    const path = avg(T.path, si, sj, 255);
    const gully = avg(T.gully, si, sj, 255);
    const grass = avg(T.seagrass, si, sj, 255);
    const rubble = avg(T.rubble, si, sj, 255);
    const scarp = avg(T.scarp, si, sj, 255);
    // Slope from the 1 m source (steeper = rockier, even where the mask is soft).
    const hx = at(T.heights, si + 1, sj) - at(T.heights, si > 0 ? si - 1 : 0, sj);
    const hz = at(T.heights, si, sj + 1) - at(T.heights, si, sj > 0 ? sj - 1 : 0);
    const slope = Math.hypot(hx, hz) / 2;
    // A cheap stable per-cell variation so large fields don't read flat.
    const n = (T.noise.noise(i * 0.09, j * 0.09) + T.noise2.noise(i * 0.31, j * 0.31) * 0.5) * 0.5;

    let c;
    if (h < -0.4) {
      c = mix(PAL.seabed, PAL.seagrass, sat(grass * 1.2));
      c = mix(c, PAL.rubble, sat(rubble));
      c = mix(c, PAL.rock, sat(rock * 0.8));
    } else {
      const veg = mix(PAL.grass, PAL.scrub, sat(0.5 + n * 0.8 + smooth(40, 180, h) * 0.4));
      c = mix(veg, PAL.soil, sat(gully * 0.7 + scarp * 0.6));
      c = mix(c, PAL.sand, sat(sand));
      c = mix(c, PAL.wetSand, sat(sand) * (1 - smooth(0.2, 1.4, h)));
      c = mix(c, PAL.path, sat(path * 0.9));
      const r = sat(Math.max(rock, smooth(0.55, 1.1, slope)));
      c = mix(c, mix(PAL.rock, PAL.rockDark, sat(0.5 + n)), r);
    }
    const tone = 1 + n * 0.08;
    albedo[k * 4] = Math.round(sat(c[0] * tone) * 255);
    albedo[k * 4 + 1] = Math.round(sat(c[1] * tone) * 255);
    albedo[k * 4 + 2] = Math.round(sat(c[2] * tone) * 255);
    albedo[k * 4 + 3] = 255;
  }
}

/* ── village: vertex albedo per material class ─────────────────────────── */

// Tidewater shades its timber, metal, stone and thatch with baked PBR texture
// sets in WGSL. Quest gets the average of that shading folded into a vertex
// colour instead: one Lambert draw per material class, no textures.
const RAW_SILVER = [0.3, 0.29, 0.27]; // weathered timber (linear)
const RAW_WARM = [0.32, 0.2, 0.11]; // fresh-cut timber (linear)
const RUST = [0.2, 0.07, 0.025];
const THATCH = [0.42, 0.31, 0.15];
const GLASS = [0.02, 0.03, 0.035];

function vertexColour(kind, tint, data) {
  switch (kind) {
    case 'wood': {
      const [seed, paint, pattern, weather] = data;
      if (Math.round(pattern) === 9) return GLASS;
      const raw = mix(RAW_WARM, RAW_SILVER, sat(weather)).map((v, i) => v * tint[i]);
      if (paint > 0.001) {
        // chipped paint: the more worn, the more raw timber shows through
        return mix(tint.map((v) => v * 0.85), raw, sat((1 - paint) * 0.45 + (seed % 0.1)));
      }
      return raw;
    }
    case 'hard':
      return mix(tint, RUST, sat(data[1]) * 0.7);
    case 'thatch':
      return THATCH.map((v, i) => v * tint[i]);
    case 'glass':
      // a pane by day: dark, a hint of the curtain behind it (at night it glows: glowOf)
      return mix(GLASS, tint, 0.18);
    default:
      return tint;
  }
}

/**
 * How much a vertex glows after dark (0..1): the panes Tidewater lights at night — windows
 * flagged lit (data[2]) and lantern glass (data[1] = 1) — the runtime fades it in at dusk
 * (world/village.ts).
 */
function glowOf(kind, data) {
  if (kind !== 'glass') return 0;
  return data[1] > 0.5 ? 1 : data[2] > 0.5 ? 0.85 : 0;
}

const groups = {};
village.group.traverse((o) => {
  if (!o.geometry || o.isInstancedMesh) return;
  const name = o.name;
  // fish props are GPU-instanced shader geometry: not shipped (yet)
  if (name.startsWith('village_fish') || name.startsWith('FishProps')) return;
  const kind = name.replace(/^village_(sign_|lantern_)?/, '');
  const cls = kind === 'fabric' || kind === 'nets' ? 'cloth' : kind === 'wood' || kind === 'thatch' ? kind : 'solid';
  o.updateWorldMatrix(true, false);
  (groups[cls] ??= []).push({ o, kind });
});

const villageArrays = {};
const villageMeta = {};
for (const [cls, parts] of Object.entries(groups)) {
  const pos = [];
  const nrm = [];
  const col = [];
  const glow = [];
  const idx = [];
  const v = new E.Vector3();
  const nm = new E.Matrix3();
  for (const { o, kind } of parts) {
    const g = o.geometry;
    const P = g.attributes.position.array;
    const Nn = g.attributes.normal.array;
    const tint = g.attributes.tint?.array;
    const vd = g.attributes.vdata?.array;
    const I = g.index ? g.index.array : null;
    const start = g.drawRange.start;
    const count = g.drawRange.count === null || g.drawRange.count === Infinity ? (I ? I.length : P.length / 3) - start : g.drawRange.count;
    nm.getNormalMatrix(o.matrixWorld);
    const remap = new Map();
    const base = pos.length / 3;
    for (let t = start; t < start + count; t++) {
      const src = I ? I[t] : t;
      let dst = remap.get(src);
      if (dst === undefined) {
        dst = base + remap.size;
        remap.set(src, dst);
        v.set(P[src * 3], P[src * 3 + 1], P[src * 3 + 2]).applyMatrix4(o.matrixWorld);
        pos.push(v.x, v.y, v.z);
        v.set(Nn[src * 3], Nn[src * 3 + 1], Nn[src * 3 + 2]).applyMatrix3(nm).normalize();
        nrm.push(Math.round(v.x * 127), Math.round(v.y * 127), Math.round(v.z * 127));
        const tn = tint ? [tint[src * 3], tint[src * 3 + 1], tint[src * 3 + 2]] : [1, 1, 1];
        const dt = vd ? [vd[src * 4], vd[src * 4 + 1], vd[src * 4 + 2], vd[src * 4 + 3]] : [0, 0, 0, 0];
        const c = vertexColour(kind, tn, dt);
        col.push(...c.map((x) => Math.round(sat(x) * 255)), 255); // linear: three reads vertex colour as linear
        glow.push(Math.round(glowOf(kind, dt) * 255));
      }
      idx.push(dst);
    }
  }
  villageArrays[`${cls}.position`] = new Float32Array(pos);
  villageArrays[`${cls}.normal`] = new Int8Array(nrm);
  villageArrays[`${cls}.color`] = new Uint8Array(col);
  villageArrays[`${cls}.index`] = pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  if (glow.some((g) => g > 0)) villageArrays[`${cls}.glow`] = new Uint8Array(glow);
  villageMeta[cls] = { vertices: pos.length / 3, triangles: idx.length / 3 };
}

/* ── colliders → the teleport's floor areas and walls ──────────────────── */

const r3 = (x) => Math.round(x * 1000) / 1000;
const boxes = colliders.boxes.map((b) => ({
  tag: b.tag,
  walkable: b.walkable,
  solid: b.solid,
  cx: r3(b.center.x),
  cz: r3(b.center.z),
  hx: r3(b.half.x),
  hz: r3(b.half.z),
  rotY: r3(b.rotY),
  top: r3(b.top),
  bottom: r3(b.bottom),
}));
const cylinders = colliders.cylinders.map((c) => ({
  tag: c.tag,
  x: r3(c.x),
  z: r3(c.z),
  r: r3(c.radius),
  bottom: r3(c.yMin),
  top: r3(c.yMax),
}));

/* ── vegetation + rocks ─────────────────────────────────────────────────── */

/*
 * The village's planting, done on purpose. Tidewater's land-cover scatter is right for the hills
 * and the bay, but between the houses its odd fern, lone bush and stray palm read as accident.
 * Round each village house the scatter is cleared, and the plot is planted:
 *   - a flower bed along the front, either side of the steps (each house its own mix)
 *   - a clipped hedge down each side
 *   - an accent at the back corners (banana, young palm)
 *   - the casinos: a matched pair of big bananas flanking the entrance
 *   - the boardwalk up from the pier: an avenue of palms
 * Nothing goes where a collider is (walls, porches, stairs, paths, decks) or on the sand.
 */
{
  const village = specs.houses.filter((h) => !h.harbor);
  const frame = (h) => {
    const c = Math.cos(h.yaw);
    const s = Math.sin(h.yaw);
    return { toW: (lx, lz) => ({ x: h.x + lx * c + lz * s, z: h.z - lx * s + lz * c }), toL: (x, z) => ({ lx: (x - h.x) * c - (z - h.z) * s, lz: (x - h.x) * s + (z - h.z) * c }) };
  };
  const plot = (h, x, z, pad) => {
    const { lx, lz } = frame(h).toL(x, z);
    const pd = h.porch?.depth ?? 0;
    return Math.abs(lx) < h.w / 2 + pad && lz > -h.d / 2 - (h.annex ? (h.annex.d ?? 2.2) : 0) - pad && lz < h.d / 2 + pd + pad;
  };
  // clear the scatter round the houses
  let cleared = 0;
  for (const type of ['palms', 'shrubs', 'youngPalms', 'ferns', 'bananas', 'monsteras', 'elephantEars', 'heliconias', 'strelitzias', 'trees']) {
    const list = veg[type];
    if (!Array.isArray(list)) continue;
    // round each house, and (not the forest's trees) anywhere in the village's middle
    const core = (p) => type !== 'trees' && Math.hypot(p.x - WORLD.village.center.x, p.z - WORLD.village.center.z) < 46;
    const keep = list.filter((p) => !core(p) && !village.some((h) => plot(h, p.x, p.z, 7)));
    cleared += list.length - keep.length;
    veg[type] = keep;
  }
  // a spot is free if it's dry land and clear of every collider (grown by r)
  const free = (x, z, r) => {
    if (terrain.heightAt(x, z) < 0.6) return false;
    for (const b of colliders.boxes) {
      const dx = x - b.center.x;
      const dz = z - b.center.z;
      if (Math.abs(dx) > b.radius + r + 1 || Math.abs(dz) > b.radius + r + 1) continue;
      const lx = dx * b.cos - dz * b.sin;
      const lz = dx * b.sin + dz * b.cos;
      if (Math.abs(lx) < b.half.x + r && Math.abs(lz) < b.half.z + r) return false;
    }
    for (const c of colliders.cylinders) if (Math.hypot(x - c.x, z - c.z) < c.radius + r) return false;
    return true;
  };
  let seed = 0.123;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  let planted = 0;
  const plant = (type, x, z, r, o = {}) => {
    if (!free(x, z, r)) return false;
    (veg[type] ??= []).push({ x, y: terrain.heightAt(x, z), z, s: 1, sy: 1, yaw: rnd() * Math.PI * 2, la: 0, l: 0, H: 0, ...o });
    planted++;
    return true;
  };
  const MIXES = [
    ['heliconias', 'strelitzias'],
    ['monsteras', 'heliconias'],
    ['strelitzias', 'elephantEars'],
    ['heliconias', 'monsteras'],
  ];
  const CASINOS = new Set(['B', 'C', 'G']);
  village.forEach((h, k) => {
    const { toW } = frame(h);
    const pd = h.porch?.depth ?? 0;
    const pw = h.porch ? Math.min(h.w, h.porch.width || h.w) : h.w;
    const pcx = h.porch?.offset ?? 0;
    const door = h.porch?.stairX ?? h.doorX ?? 0;
    const mix = MIXES[k % MIXES.length];
    // the front bed, either side of the steps
    const bedZ = h.d / 2 + pd + 0.75;
    const gap = pd ? 1.15 : 1.35;
    let i = 0;
    for (let lx = pcx - pw / 2 + 0.35; lx <= pcx + pw / 2 - 0.35; lx += 0.85) {
      if (Math.abs(lx - door) < gap) continue;
      const p = toW(lx, bedZ + (i % 2) * 0.25);
      plant(mix[i++ % 2], p.x, p.z, 0.35, { s: 0.85 + rnd() * 0.2 });
    }
    // clipped hedges down the sides
    const back = -h.d / 2 + 0.3;
    for (const side of [-1, 1]) {
      for (let lz = back; lz <= h.d / 2 + pd - 0.2; lz += 0.62) {
        const p = toW(side * (h.w / 2 + 1.05), lz);
        plant('shrubs', p.x, p.z, 0.3, { s: 0.5, sy: 0.8, yaw: h.yaw });
      }
      // an accent at the back corner
      const c = toW(side * (h.w / 2 + 0.9), -h.d / 2 - 0.9);
      if (side < 0) plant('bananas', c.x, c.z, 0.5, { s: 0.9 + rnd() * 0.2 });
      else plant('youngPalms', c.x, c.z, 0.5, { s: 1.1 });
    }
    // the casinos: a matched pair of big bananas either side of the way in (a palm's crown is
    // ~4 m across whatever its height, and hid the porch and the board)
    if (CASINOS.has(h.name)) {
      for (const side of [-1, 1]) {
        const p = toW(pcx + side * (pw / 2 + 0.9), h.d / 2 + pd + 0.9);
        plant('bananas', p.x, p.z, 0.5, { s: 1.25, yaw: h.yaw + (side > 0 ? 0 : Math.PI) });
      }
    }
  });
  // where a demolished house stood: a pocket garden — a tall palm, a ring of flowers round it,
  // bananas and young palms at the edge
  for (const h of demolished.values()) {
    plant('palms', h.x, h.z, 0.5, { s: 0.95, H: 6.5, la: rnd() * Math.PI * 2, l: 0.05 });
    for (let i = 0; i < 9; i++) {
      const a = h.yaw + (i / 9) * Math.PI * 2;
      plant(i % 2 ? 'heliconias' : 'strelitzias', h.x + Math.cos(a) * 1.8, h.z + Math.sin(a) * 1.8, 0.35, { s: 0.9 + rnd() * 0.2 });
    }
    for (let i = 0; i < 4; i++) {
      const a = h.yaw + ((i + 0.5) / 4) * Math.PI * 2;
      plant(i % 2 ? 'bananas' : 'youngPalms', h.x + Math.cos(a) * 3.4, h.z + Math.sin(a) * 3.4, 0.5, { s: 1 + rnd() * 0.15 });
    }
  }
  // an avenue of palms up the boardwalk from the pier to the plaza: pairs, every 9 m, 2.4 m out
  const walk = [[54.6, -72], [52.4, -82], [48.4, -92], [44.8, -100.5], [42.6, -107.2]];
  let along = 0;
  for (let i = 0; i < walk.length - 1; i++) {
    const [ax, az] = walk[i];
    const [bx, bz] = walk[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    const nx = -(bz - az) / L;
    const nz = (bx - ax) / L;
    for (; along < L; along += 9) {
      const x = ax + ((bx - ax) * along) / L;
      const z = az + ((bz - az) * along) / L;
      for (const side of [-1, 1]) plant('palms', x + nx * side * 2.4, z + nz * side * 2.4, 0.5, { s: 0.85, H: 6 + rnd() * 0.8, la: rnd() * Math.PI * 2, l: 0.04 });
    }
    along -= L;
  }
  console.log(`village planting: ${cleared} scattered plants cleared round the houses, ${planted} planted`);
}

// per plant: x, y, z, scale, vertical scale, yaw, lean azimuth, lean, stem height
const VEG_STRIDE = 9;
const vegArrays = {};
const vegCounts = {};
for (const [type, list] of Object.entries(veg)) {
  if (!Array.isArray(list) || !list.length) continue;
  const a = new Float32Array(list.length * VEG_STRIDE);
  list.forEach((p, i) => {
    a.set([p.x, p.y, p.z, p.s ?? 1, p.sy ?? 1, p.yaw ?? 0, p.la ?? 0, p.l ?? 0, p.H ?? 0], i * VEG_STRIDE);
  });
  vegArrays[`veg.${type}`] = a;
  vegCounts[type] = list.length;
}
const rockMat = new Float32Array(rocks.length * 16);
const rockStyle = new Uint8Array(rocks.length);
rocks.forEach((r, i) => {
  rockMat.set(r.matrix.elements, i * 16);
  rockStyle[i] = r.style;
});
vegArrays['rocks.matrix'] = rockMat;
vegArrays['rocks.style'] = rockStyle;
ROCK_STYLES.forEach((st, si) => {
  for (const [lod, subdiv] of [['near', 3], ['far', 1]]) {
    const g = buildRockGeometry(si, 17 + si * 31, subdiv);
    vegArrays[`rock.${si}.${lod}.position`] = new Float32Array(g.attributes.position.array);
    const nrm = g.attributes.normal.array;
    const n8 = new Int8Array(nrm.length);
    for (let i = 0; i < nrm.length; i++) n8[i] = Math.round(nrm[i] * 127);
    vegArrays[`rock.${si}.${lod}.normal`] = n8;
    const idx = g.index.array;
    vegArrays[`rock.${si}.${lod}.index`] = g.attributes.position.count > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  }
});

/**
 * Where a house's roofs are, seen from the front, so the signs can go where they're seen
 * (buildHouse's arithmetic, vendor/tidewater/src/world/village/Buildings.js):
 *   eaves   top of the walls
 *   roof    the lowest edge of the main roof over the front wall — its fascia, or the bottom of
 *           a thatch fringe: at local x it's at y = eave − |x| · pitch (pitch 0 for an eave
 *           along the front, the rake's slope for a gable end facing the front)
 *   awning  the front edge of the porch roof (or the little hood over a stoop door): its top,
 *           its underside (fascia / thatch body), local z, and its span across the facade
 */
function roofLines(h, floorY) {
  const stories = h.stories ?? 1;
  const storyH = h.storyH ?? (stories > 1 ? 2.75 : 2.95);
  const yE = floorY + stories * storyH;
  const type = h.roof ?? 'gable';
  const thatch = h.roofMat === 'thatch';
  const a = h.pitch ?? (thatch ? 0.68 : 0.44);
  const ta = Math.tan(a);
  const r0 = 0.12;
  const T = thatch ? 0.28 : 0.06;
  const ovE = h.ovE ?? (thatch ? 0.6 : 0.45);
  const ovR = h.ovR ?? (thatch ? 0.45 : 0.32);
  // metal: a 0.2 m fascia under the edge; thatch: the body and its fringe (up to 0.2 m more)
  const drop = thatch ? T * 0.95 + 0.2 : 0.2;
  const roof = type === 'gableFront'
    ? { eave: r3(yE + r0 + (h.w / 2) * ta - drop), pitch: r3(ta), z: r3(h.d / 2 + ovR) }
    : { eave: r3(yE + r0 - ovE * ta - drop), pitch: 0, z: r3(h.d / 2 + ovE) };
  let awning;
  if (h.porch) {
    const pd = h.porch.depth;
    const pw = Math.min(h.w, h.porch.width || h.w);
    const pp = h.porchPitch ?? 0.26;
    const Tp = thatch ? 0.24 : 0.06;
    let yAtt;
    if (stories > 1) yAtt = floorY + storyH - 0.02;
    else if (type === 'gableFront') yAtt = yE - 0.03;
    else yAtt = Math.min(yE - 0.03, yE + r0 - ovE * ta - (thatch ? T / Math.cos(a) + 0.16 : 0.22) - 0.03 + ovE * Math.tan(pp));
    const zEnd = h.d / 2 + pd + 0.32;
    const yEnd = yAtt - (zEnd - h.d / 2) * Math.tan(pp);
    awning = { y: r3(yEnd), bottom: r3(yEnd - (thatch ? Tp : 0.19)), z: r3(zEnd + (thatch ? 0.04 : 0)), x: r3(h.porch.offset ?? 0), w: r3(pw + 0.44) };
  } else {
    const hy = floorY + 2.5 - 0.22;
    awning = { y: r3(hy), bottom: r3(hy - (thatch ? 0.14 : 0.04)), z: r3(h.d / 2 + 0.75), x: r3(h.doorX ?? 0), w: 1.7 };
  }
  return { eaves: r3(yE), roof, awning };
}

const buildings = [
  ...specs.houses.map((h) => {
    const b = village.buildings.find((v) => v.name === h.name);
    return { name: h.name, kind: h.foundation === 'stilts' ? 'hut' : 'house', x: h.x, z: h.z, yaw: h.yaw, w: h.w, d: h.d, stories: h.stories ?? 1, doorX: h.doorX ?? 0, porch: h.porch?.depth ?? 0, floorY: r3(b.floorY), roofTop: r3(b.roofTop), ...roofLines(h, b.floorY) };
  }),
  ...specs.sheds.map((h) => {
    const b = village.buildings.find((v) => v.name === h.name);
    return { name: h.name, kind: 'shed', x: h.x, z: h.z, yaw: h.yaw, w: 2.4, d: 2.0, stories: 1, doorX: 0, porch: 0, floorY: r3(b.floorY), roofTop: r3(b.roofTop) };
  }),
  { name: 'boathouse', kind: 'boathouse', x: specs.boathouse.x, z: specs.boathouse.z, yaw: specs.boathouse.yaw, w: 7, d: 8, stories: 1, doorX: 0, porch: 0, floorY: r3(terrain.heightAt(specs.boathouse.x, specs.boathouse.z)), roofTop: 0 },
  { name: 'stall', kind: 'stall', x: specs.stall.x, z: specs.stall.z, yaw: specs.stall.yaw, w: 4, d: 2.5, stories: 1, doorX: 0, porch: 0, floorY: r3(terrain.heightAt(specs.stall.x, specs.stall.z)), roofTop: 0 },
];

/* ── write ─────────────────────────────────────────────────────────────── */

mkdirSync(OUT, { recursive: true });
const terrainBin = pack({ heights, albedo, depth });
writeFileSync(resolve(OUT, 'terrain.bin'), terrainBin);
const villageBin = pack(villageArrays);
writeFileSync(resolve(OUT, 'village.bin'), villageBin);
// grass: two channels at 2 m — beach grass (dune + sea oats) and meadow
{
  const n = grassMask.res * grassMask.res;
  const g = new Uint8Array(n * 2);
  for (let i = 0; i < n; i++) {
    g[i * 2] = Math.max(grassMask.data[i * 4], grassMask.data[i * 4 + 2]);
    g[i * 2 + 1] = grassMask.data[i * 4 + 1];
  }
  vegArrays['grass.mask'] = g;
}
const vegBin = pack(vegArrays, {
  grassRes: grassMask.res,
  stride: VEG_STRIDE,
  counts: vegCounts,
  rocks: rocks.length,
  rockStyles: ROCK_STYLES.length,
  // Tidewater's crown shapes: [x, y, z, radius] per lobe at nominal size
  treeH: TREE_H,
  treeLobes: TREE_LOBES,
  shrubH: SHRUB_H,
  shrubLobes: SHRUB_LOBES,
});
writeFileSync(resolve(OUT, 'veg.bin'), vegBin);

const world = {
  source: 'vendor/tidewater (MIT) — see vendor/tidewater/VERSION',
  terrain: {
    size: T.size,
    origin: T.origin,
    res: N,
    cell: T.texel * STEP,
    hMin: H_MIN,
    hMax: H_MAX,
    depthRange: DEPTH_RANGE,
  },
  layout: {
    pier: WORLD.pier,
    village: { x: WORLD.village.center.x, z: WORLD.village.center.z, radius: WORLD.village.radius },
    reef: { x: WORLD.reef.center.x, z: WORLD.reef.center.z, radius: WORLD.reef.radius },
    boatDock: { x: WORLD.boatDock.position.x, z: WORLD.boatDock.position.z, heading: WORLD.boatDock.heading },
    start: { x: WORLD.start.position.x, z: WORLD.start.position.z, yaw: WORLD.start.yaw },
    beach: WORLD.beach,
  },
  village: villageMeta,
  footprints: village.getFootprints(),
  // the village's lamps (lanterns, path lights, lamp posts): where it's lit after dark
  lamps: village.lights.map((l) => [r3(l.position.x), r3(l.position.y), r3(l.position.z), l.kind ?? '']),
  buildings,
  colliders: { boxes, cylinders },
};
writeFileSync(resolve(OUT, 'world.json'), JSON.stringify(world));

const mb = (b) => (b.length / 1048576).toFixed(2) + ' MB';
console.log(`terrain.bin ${mb(terrainBin)}  village.bin ${mb(villageBin)}  veg.bin ${mb(vegBin)}`);
console.log('vegetation', vegCounts, 'rocks', rocks.length);
console.log('village', villageMeta);
console.log(`colliders: ${boxes.length} boxes (${boxes.filter((b) => b.walkable).length} walkable), ${cylinders.length} cylinders`);
