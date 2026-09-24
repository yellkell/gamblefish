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

// The fish drying racks upload their instance table to a GPU storage buffer
// at build time. No device here — and we don't ship those props — so the
// upload becomes a no-op. (It is the ONLY GPU call on the village path.)
const { StorageBuffer } = await import(url('engine/gpu/Texture.js'));
StorageBuffer.prototype.write = function () {
  return this;
};

const { TerrainData } = await import(url('world/TerrainData.js'));
const { Colliders } = await import(url('world/Colliders.js'));
const { Village } = await import(url('world/Village.js'));
const { WORLD } = await import(url('world/WorldLayout.js'));
const E = await import(url('engine/index.js'));

const t0 = performance.now();
const terrain = new TerrainData();
const colliders = new Colliders();
// Village flattens its building pads INTO the terrain, so it must be built
// before the heights are sampled.
const village = new Village({ scene: new E.Scene(), terrain, colliders });
console.log(`generated island + village in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

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
    default:
      return tint;
  }
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
      }
      idx.push(dst);
    }
  }
  villageArrays[`${cls}.position`] = new Float32Array(pos);
  villageArrays[`${cls}.normal`] = new Int8Array(nrm);
  villageArrays[`${cls}.color`] = new Uint8Array(col);
  villageArrays[`${cls}.index`] = pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
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

/* ── write ─────────────────────────────────────────────────────────────── */

mkdirSync(OUT, { recursive: true });
const terrainBin = pack({ heights, albedo, depth });
writeFileSync(resolve(OUT, 'terrain.bin'), terrainBin);
const villageBin = pack(villageArrays);
writeFileSync(resolve(OUT, 'village.bin'), villageBin);

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
  colliders: { boxes, cylinders },
};
writeFileSync(resolve(OUT, 'world.json'), JSON.stringify(world));

const mb = (b) => (b.length / 1048576).toFixed(2) + ' MB';
console.log(`terrain.bin ${mb(terrainBin)}  village.bin ${mb(villageBin)}`);
console.log('village', villageMeta);
console.log(`colliders: ${boxes.length} boxes (${boxes.filter((b) => b.walkable).length} walkable), ${cylinders.length} cylinders`);
