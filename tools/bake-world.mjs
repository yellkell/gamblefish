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

// A one-storey house with its porch roof under the main roof's eave (buildHouse: gable or hip)
// hangs that roof from below the eave's fascia. Under a thick thatch eave it came down to eye
// height: the Tackle Shop's porch beam was 1.4 m over its floor, its fringe lower still, so you
// looked into the beam from the porch. Such a porch is pitched shallower and the house's walls
// raised until the beam and the fringe clear 2.05 m (buildHouse's arithmetic, porch section).
const PORCH_CLEAR = 2.05;
/** the porch roof's lowest point (beam underside or thatch fringe) over the porch floor (m) */
const porchClearance = (h) => {
  const thatch = h.roofMat === 'thatch';
  const a = h.pitch ?? (thatch ? 0.68 : 0.44);
  const ta = Math.tan(a);
  const T = thatch ? 0.28 : 0.06;
  const ovE = h.ovE ?? (thatch ? 0.6 : 0.45);
  const pp = h.porchPitch ?? 0.26;
  const Tp = thatch ? 0.24 : 0.06;
  const pd = h.porch.depth;
  const yE = h.storyH ?? 2.95;
  const yAtt = Math.min(yE - 0.03, yE + 0.12 - ovE * ta - (thatch ? T / Math.cos(a) + 0.16 : 0.22) - 0.03 + ovE * Math.tan(pp));
  const beamTop = yAtt - (pd - 0.12) * Math.tan(pp) - Tp / Math.cos(pp) - 0.005;
  const beam = beamTop - 0.18 + 0.05;
  const fringe = thatch ? yAtt - (pd + 0.32) * Math.tan(pp) - Tp - 0.17 + 0.05 : Infinity;
  return Math.min(beam, fringe);
};
function raisePorch(h) {
  if (!h.porch || (h.stories ?? 1) > 1 || h.roof === 'gableFront') return;
  // only the ones you'd duck under (the metal-roofed porches clear about 2 m as Tidewater builds them)
  if (porchClearance(h) >= 1.8) return;
  h.porchPitch = Math.min(h.porchPitch ?? 0.26, 0.15);
  h.storyH = (h.storyH ?? 2.95) + Math.max(0, PORCH_CLEAR - porchClearance(h));
  console.log(`porch raised: ${h.name} walls ${h.storyH.toFixed(2)} m, porch pitch ${h.porchPitch}, clearance ${porchClearance(h).toFixed(2)} m`);
}

// The boatyard's slipway. Tidewater lays each rail as one straight beam from the shed to 6.5 m
// out, so it cuts through the sand where the beach dips and stops dead on the sand short of the
// sea, and it gives each rail its own short ties, off-centre: two broken half-ladders. The bake
// leaves those out and lays one slipway: both rails following the sand in half-metre lengths
// from the shed on into the water, full-width ties across the pair every 0.6 m.
let boathouse = null;
let boathouseDepth = -1;
const SLIP = { rails: [-0.55, 1.25], tie: 0.6, wet: 2.5, step: 0.5 };
const walkIn = () => house && hasInterior(house.name);

// The pier's handrails. Tidewater lays each bay's top rail 16 cm longer than the bay and each mid
// rail 10 cm longer, so neighbouring pieces overlap over every post, on the same faces (the head's
// runs don't even jitter apart): they z-fight, a flickering patchwork at the joints. The bake lays
// them end to end instead: each piece is clipped where one already laid stops (a rail still
// caps the post at the end of a run), and the top rails sit level, without the per-bay wobble.
const { PIER } = await import(url('world/Pier.js'));
const RAIL = { top: PIER.deck + 0.95 + 0.022, mid: PIER.deck + 0.48 };
// the life ring and the rods in the deep walk's gateway (Pier.js: south edge), and what they go in
const DK_PIER = PIER.deck;
const RAIL_Z = PIER.zEnd - 0.25;
const DEEP_GEAR = { ring: [55.8, DK_PIER + 0.58, RAIL_Z + 0.12], rods: [56.55, 56.9] };
let deepGear = null;
/** rowboats whose open bow the bake closed (see the rowboat patch below) */
let stems = 0;
let oarsIn = 0;
/** how far each of the pier head's two rods was set back (see the rods' patch) */
const rodBackLog = [];
// the gateways the walks you build leave the pier head by (src/woodworks/gates.ts): the head's
// rails stop either side of each
const { WALKS } = await import('../src/woodworks/gates.ts');
/** a laid rail's stretch [a0, a1] along its line, less any gateway on that line */
const gapped = (alongX, c, a0, a1) => {
  let out = [[a0, a1]];
  for (const w of WALKS) {
    const g = w.gate;
    if (g.alongX !== alongX || Math.abs(c - g.line) > 0.3) continue;
    out = out.flatMap(([p, q]) => (q <= g.from || p >= g.to ? [[p, q]] : [...(g.from - p > 0.05 ? [[p, g.from]] : []), ...(q - g.to > 0.05 ? [[g.to, q]] : [])]));
  }
  return out;
};
const railsLaid = { top: [], mid: [] };
/** the walkway bent (a row of piles across the pier) nearest z: Pier.js's own spacing */
const bentAt = (z) => {
  const zb0 = PIER.zStart + 0.35;
  const zbN = PIER.headZ0 + 0.25;
  const nB = Math.round((zbN - zb0) / 3.0);
  const step = (zbN - zb0) / nB;
  return zb0 + Math.max(0, Math.min(nB, Math.round((z - zb0) / step))) * step;
};
/** a harbour-frame piece inside the pier's footprint */
const onPier = (B, x, z) => B.stack.length === 0 && x > PIER.headX0 - 0.5 && x < PIER.headX1 + 0.5 && z > PIER.zStart - 0.5 && z < PIER.zEnd + 0.5;
/**
 * Clip a rail running along x (alongX) or z over [a0, a1], `half` thick either side of `c`,
 * against the rails of its kind already laid; returns the free stretch, or null.
 */
const clipRail = (kind, alongX, a0, a1, c, half) => {
  for (const r of railsLaid[kind]) {
    // the laid piece's extent along this one's axis, and across it
    const [e0, e1] = alongX ? r.x : r.z;
    const [f0, f1] = alongX ? r.z : r.x;
    if (f1 <= c - half + 1e-4 || f0 >= c + half - 1e-4 || e1 <= a0 + 1e-4 || e0 >= a1 - 1e-4) continue;
    if (e0 <= a0 + 1e-4) a0 = e1;
    else if (e1 >= a1 - 1e-4) a1 = e0;
  }
  if (a1 - a0 < 0.02) return null;
  const cross = [c - half, c + half];
  railsLaid[kind].push(alongX ? { x: [a0, a1], z: cross } : { x: cross, z: [a0, a1] });
  return [a0, a1];
};
{
  const { Village: V } = await import(url('world/Village.js'));
  const layout = V.prototype._layout;
  V.prototype._layout = function (rand) {
    const specs = layout.call(this, rand);
    for (const h of specs.houses ?? []) if (DEMOLISHED.includes(h.name)) demolished.set(h.name, h);
    specs.houses = (specs.houses ?? []).filter((h) => !DEMOLISHED.includes(h.name));
    // the village's four outhouses (Tidewater's sheds) are gone too: no shed, no pad, no colliders
    specs.sheds = [];
    for (const h of specs.houses) raisePorch(h);
    for (const h of specs.houses) houseAt.set(`${h.x},${h.z}`, h);
    boathouse = specs.boathouse ?? null;
    return specs;
  };
  const { Builder, slabPart } = await import(url('world/village/GeoBuilder.js'));
  const { pushAt, pop, box, beam, part, lathe, tube, add } = Builder.prototype;
  deepGear = new Builder();
  // Tidewater's rowboat() (Props.js) lays its hull in sections from 2 % to 98 % of its length and
  // closes the stern with a transom, but not the bow: its last section, still a hand wide and a
  // foot deep, is left open, a hole in the front of every boat on the island. The bake closes it
  // with a stem plate cut to that section, in the hull's paint, and a stem post up its front in
  // the trim's. The hull's rails give the section away (its gunwales' ends, then the keel's), and
  // the transom is laid straight after them, in the boat's frame.
  let gunwale = null;
  let stem = null;
  // Its oars lie from the stern thwart forward, 35 cm off the centre line and low in the bilge,
  // where the bow has already narrowed to 20-odd cm: both blades came out through its sides. The
  // bake lays each blade's end inboard and higher up (the loom follows), inside the hull.
  const OARS = [
    { p0: [-0.3, 0.55, -1.2], p1: [-0.1, 0.62, 1.2] },
    { p0: [0.32, 0.55, -1.1], p1: [0.11, 0.64, 1.25] },
  ];
  let blade = null;
  const { rod, cyl } = Builder.prototype;
  // The two rods on the pier head's south rail (the deep walk's gear, above) stand 25 cm inside
  // the rail at a lean that ran them straight through its top rail. Each butt is set back so the
  // rod, at the same lean, rests on the top rail's inner edge; its reel goes with it.
  const RAIL_IN = RAIL_Z - 0.1;
  const RAIL_TOP = DK_PIER + 0.995;
  const rodBack = new Map();
  Builder.prototype.cyl = function (key, x, y, z, rTop, rBot, h, o) {
    const back = key === 'hard' && near(y, DK_PIER + 0.35) && near(z, RAIL_Z - 0.18) ? rodBack.get(Math.round((x - 0.02) * 100)) : undefined;
    return cyl.call(this, key, x, y, z + (back ?? 0), rTop, rBot, h, o);
  };
  Builder.prototype.rod = function (key, p0, p1, r0, r1, o) {
    if (key === 'hard' && r0 === 0.016 && r1 === 0.005 && DEEP_GEAR.rods.some((rx) => near(p0[0], rx, 1e-6)) && near(p0[1], DK_PIER + 0.01) && near(p0[2], RAIL_Z - 0.25)) {
      // at the top rail's height, the rod's side against the rail's inner edge
      const lean = (p1[2] - p0[2]) / (p1[1] - p0[1]);
      const back = RAIL_IN - r0 - 0.004 - (RAIL_TOP + r0 - p0[1]) * lean - p0[2];
      rodBack.set(Math.round(p0[0] * 100), back);
      rodBackLog.push(back);
      return rod.call(this, key, [p0[0], p0[1], p0[2] + back], [p1[0], p1[1], p1[2] + back], r0, r1, o);
    }
    // oar(): the loom, from the handle to where the blade starts, 0.55 m short of its end
    const D = p0[1] / 0.55;
    const oarAt = key === 'wood' && r0 === 0.022 && r1 === 0.024 && o?.segs === 6 && OARS.find((k) => near(p0[0], k.p0[0], 1e-6) && near(p0[2], k.p0[2], 1e-6) && D > 0.3 && D < 0.8);
    if (oarAt) {
      const end = [oarAt.p1[0], oarAt.p1[1] * D, oarAt.p1[2]];
      const d = end.map((v, i) => v - p0[i]);
      const L = Math.hypot(...d);
      const pb = p0.map((v, i) => v + (d[i] / L) * (L - 0.55));
      blade = { pb, end };
      oarsIn++;
      return rod.call(this, key, p0, pb, r0, r1, o);
    }
    return rod.call(this, key, p0, p1, r0, r1, o);
  };
  /** rowboat()'s section at its bow, `s` across (−1 port .. 1 starboard): hullSection, secPoint */
  const bowPoint = (st, sv) => {
    const ang = (Math.abs(sv) * Math.PI) / 2;
    return new E.Vector3(st.halfB * Math.sign(sv) * Math.pow(Math.sin(ang), 0.85), st.keel + (st.sheer - st.keel) * (1 - Math.pow(Math.cos(ang), 1.25)), st.z);
  };

  // Tidewater hangs a life ring on the pier head's south rail and leans two rods against it, in
  // the deep walk's gateway: once the rail's cut there they'd hang in the air across the way out.
  // The bake leaves them out of the pier and ships them on their own (village class `deepGear`),
  // so the walk (woodworks/walks.ts) can move them along the rail as its rope drops.
  Builder.prototype.add = function (key, pt, local, tint, data) {
    // the transom, straight after a rowboat's keel: close its bow as well
    if (stem && stem.B === this && key === 'wood') {
      const st = stem;
      stem = null;
      const out = add.call(this, key, pt, local, tint, data);
      const sec = [];
      for (let j = 0; j <= 10; j++) sec.push(bowPoint(st, -1 + (2 * j) / 10));
      add.call(this, 'wood', slabPart(sec, 0.035, new E.Vector3(1, 0, 0), new E.Vector3(0, 0, 1)), new E.Matrix4(), tint, data);
      this.rod('wood', [0, st.keel - 0.015, st.z], [0, st.sheer + 0.03, st.z + 0.02], 0.03, 0.03, { segs: 6, tint: st.trim, data });
      stems++;
      return out;
    }
    if (this !== deepGear && (key === 'hard' || key === 'rope')) {
      const m = new E.Matrix4().multiplyMatrices(this.frame, local).elements;
      const [x, y, z] = [m[12], m[13], m[14]];
      const ring = near(x, DEEP_GEAR.ring[0]) && near(y, DEEP_GEAR.ring[1]) && near(z, DEEP_GEAR.ring[2]);
      // each rod from its butt on the deck, and the reel clamped on it
      // (set back from where Tidewater stood them: see the rods' patch below)
      const back = z > RAIL_Z - 0.7 && z < RAIL_Z;
      const rod = DEEP_GEAR.rods.some((rx) => (near(x, rx) && near(y, DK_PIER + 0.01) && back) || (near(x, rx + 0.02) && near(y, DK_PIER + 0.35) && back));
      if (ring || rod) {
        deepGear.frame.copy(this.frame);
        return add.call(deepGear, key, pt, local, tint, data);
      }
    }
    return add.call(this, key, pt, local, tint, data);
  };
  // Tidewater hangs a string of floats on the pier head's west rail, one of them from z 37.1 to
  // 38.9: straight across the reef walk's gateway, a line strung over the way out. The bake hangs
  // that string on along the rail past the gateway instead, floats and all.
  let floats = null;
  const floatZ = (z) => floats.a2 + ((z - floats.a) * (floats.b2 - floats.a2)) / (floats.b - floats.a);
  Builder.prototype.tube = function (key, points, radius, o) {
    if (key === 'rope' && points.length > 2 && onPier(this, points[0].x, points[0].z)) {
      const x = points[0].x;
      const a = Math.min(points[0].z, points.at(-1).z);
      const b = Math.max(points[0].z, points.at(-1).z);
      const w = points.every((p) => Math.abs(p.x - x) < 1e-3) && WALKS.find((k) => !k.gate.alongX && Math.abs(x - k.gate.line) < 0.3 && a < k.gate.to && b > k.gate.from);
      if (w) {
        const a2 = w.gate.to + 0.15;
        floats = { x, a, b, a2, b2: Math.min(PIER.zEnd - 0.15, a2 + (b - a)) };
        points = points.map((p) => p.clone().setZ(floatZ(p.z)));
        console.log(`floats moved off the ${w.id} walk's gateway: z ${a.toFixed(2)}–${b.toFixed(2)} → ${floats.a2.toFixed(2)}–${floats.b2.toFixed(2)}`);
      }
    }
    const out = tube.call(this, key, points, radius, o);
    // a rowboat's rails: 17 points, 2.8 cm, four-sided; the keel's on its centre line
    if (key === 'wood' && radius === 0.028 && o?.radial === 4 && points.length === 17) {
      const last = points.at(-1);
      if (points.every((p) => p.x === 0)) {
        if (gunwale) stem = { B: this, halfB: gunwale.p.x + 0.012, sheer: gunwale.p.y - 0.01, keel: last.y + 0.015, z: last.z, trim: gunwale.tint };
        gunwale = null;
      } else if (last.x > 0) gunwale = { p: last, tint: o.tint };
    }
    return out;
  };
  Builder.prototype.pushAt = function (x, y, z, ...r) {
    // the floats on that string, after it
    if (floats && this.stack.length === 0 && Math.abs(x - floats.x) < 0.05 && z > floats.a - 0.01 && z < floats.b + 0.01) z = floatZ(z);
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
    // A rowboat's thwarts (3.5 × 22 cm, the width of the hull at the gunwale less a little) are
    // wider than the round bilge a hand under the gunwale, where they sit: the forward one's corner
    // came out through the side. They're cut a tenth narrower.
    if (key === 'wood' && sy === 0.035 && sz === 0.22 && o?.grain === 0 && x === 0) sx *= 0.9;
    // the pier's top rails (0.2 wide, 0.045 deep) and the head's mid rails (0.05 thick, 0.14 deep)
    const top = sy === 0.045 && Math.min(sx, sz) === 0.2 && Math.abs(y - RAIL.top) < 0.02;
    const mid = sy === 0.14 && Math.min(sx, sz) === 0.05 && Math.abs(y - RAIL.mid) < 0.01;
    if (key === 'wood' && (top || mid) && Math.max(sx, sz) > 0.5 && onPier(this, x, z)) {
      const alongX = sx > sz;
      const len = alongX ? sx : sz;
      // the walkway's top rails wander a centimetre off their posts, bay by bay: back on the line
      if (top && !alongX) for (const px of [PIER.x - PIER.pileOff, PIER.x + PIER.pileOff]) if (Math.abs(x - px) < 0.02) x = px;
      const c = alongX ? z : x;
      const ab = clipRail(top ? 'top' : 'mid', alongX, (alongX ? x : z) - len / 2, (alongX ? x : z) + len / 2, c, Math.min(sx, sz) / 2);
      if (!ab) return;
      const o2 = top ? { ...o, rx: 0, rz: 0 } : o;
      let out;
      for (const [p, q] of gapped(alongX, c, ab[0], ab[1])) {
        const m = (p + q) / 2;
        const L = q - p;
        out = box.call(this, key, alongX ? m : x, top ? RAIL.top : y, alongX ? z : m, alongX ? L : sx, sy, alongX ? sz : L, o2);
      }
      return out;
    }
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
    // the oar's blade, after its loom (see OARS)
    if (blade && key === 'wood' && w === 0.14 && h === 0.018) {
      const b = blade;
      blade = null;
      return beam.call(this, key, b.pb, b.end, w, h, o);
    }
    // A tall stair's handrail (buildHouse stairRun: 6 × 5 cm, from 0.9 m over the porch's front
    // edge down to its newel post) stopped short in the air, 17 cm out from the porch railing's
    // post at the side of the stair gap and 5 cm inside it. Its top end is carried back onto that
    // post, 10 cm under its top, the way a stair rail dies into its newel.
    if (key === 'wood' && w === 0.06 && h === 0.05 && house?.porch && this.stack.length === houseDepth && p0[0] === p1[0] && p1[2] > p0[2]) {
      const pz1 = house.d / 2 + house.porch.depth;
      if (near(p0[2], pz1 + 0.05)) {
        const stairX = house.porch.stairX ?? house.doorX ?? 0;
        const gx = stairX + Math.sign(p0[0] - stairX) * 0.68;
        return beam.call(this, key, [gx, p0[1], pz1 - 0.12 + 0.05], p1, w, h, o);
      }
    }
    // the walkway's mid rails, one per bay along z: laid end to end (a sagging one keeps its sag)
    if (key === 'wood' && w === 0.05 && h === 0.14 && p0[0] === p1[0] && Math.abs(p0[1] - RAIL.mid) < 0.4 && onPier(this, p0[0], p0[2])) {
      const ab = clipRail('mid', false, Math.min(p0[2], p1[2]), Math.max(p0[2], p1[2]), p0[0], w / 2);
      if (!ab) return;
      const level = Math.abs(p0[1] - p1[1]) < 0.03;
      const lerpY = (zz) => p0[1] + ((p1[1] - p0[1]) * (zz - p0[2])) / (p1[2] - p0[2]);
      const y0 = level ? RAIL.mid : lerpY(ab[0]);
      const y1 = level ? RAIL.mid : lerpY(ab[1]);
      return beam.call(this, key, [p0[0], y0, ab[0]], [p1[0], y1, ab[1]], w, h, o);
    }
    // The walkway's sway braces, a diagonal down the outside of each pile line on alternate bays,
    // stop 25–45 cm short of the piles at both ends: planks floating in the air. The bake carries
    // each end onto its pile (the bent's centre line) and snugs the brace in against the piles'
    // faces, so it is spiked to them the way a real sway brace is.
    if (key === 'wood' && w === 0.05 && p0[0] === p1[0] && onPier(this, p0[0], p0[2])) {
      const side = Math.sign(p0[0] - PIER.x);
      if (near(p0[0], PIER.x + side * (PIER.pileOff + PIER.pileR + 0.03), 1e-4) && Math.abs(p1[2] - p0[2]) > 1.5) {
        const xo = PIER.x + side * (PIER.pileOff + PIER.pileR * 0.84 + 0.02);
        return beam.call(this, key, [xo, p0[1], bentAt(p0[2])], [xo, p1[1], bentAt(p1[2])], w, h, o);
      }
    }
    // A metal roof's fascia boards (buildHouse fascia(): 3.2 × 20 cm, the only beam that size)
    // are laid flush with the roof sheet's edge: a rake board's outer face is the sheet's cut
    // side, the same face, so the two z-fight and the roofs flickered along their sides. Each
    // board is 2 cm thicker about its centre line, so it stands a centimetre proud of the sheet.
    if (key === 'wood' && w === 0.032 && h === 0.2) return beam.call(this, key, p0, p1, w + 0.02, h, o);
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
// The helter skelter's plot (src/skelter/site.ts): levelled to the ground's mean height, so the
// tower's plinth sits on it, before anything grows or the rocks are placed.
const { SKELTER } = await import('../src/skelter/site.ts');
{
  let sum = 0;
  let n = 0;
  for (let r = 0; r <= SKELTER.radius; r += 4)
    for (let a = 0; a < Math.PI * 2; a += 0.5) {
      sum += terrain.heightAt(SKELTER.x + Math.cos(a) * r, SKELTER.z + Math.sin(a) * r);
      n++;
    }
  terrain.flatten(SKELTER.x, SKELTER.z, SKELTER.radius, sum / n, 16);
  console.log(`helter skelter plot levelled at ${(sum / n).toFixed(2)} m`);
}
/** on the helter skelter's plot (grown by `pad`) */
const onPlot = (x, z, pad) => Math.hypot(x - SKELTER.x, z - SKELTER.z) < SKELTER.radius + pad;
// The fire dancers' camps (src/camps/sites.ts): each hidden plot levelled a little below the
// ground's mean, a shallow hollow round the fire, so the flames sit down out of sight of the bay
// (and the beach party's patch of sand just levelled).
const { ALL_CAMPS: CAMPS, CAMP_PLOT, CAMP_BLEND, campSink } = await import('../src/camps/sites.ts');
for (const c of CAMPS) {
  let sum = 0;
  let n = 0;
  for (let r = 0; r <= CAMP_PLOT; r += 2.5)
    for (let a = 0; a < Math.PI * 2; a += 0.5) {
      sum += terrain.heightAt(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r);
      n++;
    }
  terrain.flatten(c.x, c.z, CAMP_PLOT, sum / n - campSink(c), CAMP_BLEND);
  console.log(`camp ${c.id} levelled at ${(sum / n - campSink(c)).toFixed(2)} m`);
}
/** on a camp's plot (grown by `pad`) */
const onCamp = (x, z, pad) => CAMPS.some((c) => Math.hypot(x - c.x, z - c.z) < CAMP_PLOT + pad);
// Where everything grows (Tidewater's own land-cover scatter, clear of the houses and paths)
const vegSite = new VegSite(terrain, { footprints: village.getFootprints() });
const veg = scatterVegetation(vegSite);
// where the grass grows (Tidewater's grass mask: R dune grass, G meadow, B sea oats, A creeper)
const grassMask = buildGrassMask(vegSite);
// no grass up through the camps' fires and chests: trodden bare, feathering back in at the plot's edge
{
  const res = grassMask.res;
  const texel = terrain.size / res;
  for (const c of CAMPS) {
    const r = CAMP_PLOT + 2;
    for (let j = Math.floor((c.z - r - terrain.origin) / texel); j <= Math.ceil((c.z + r - terrain.origin) / texel); j++)
      for (let i = Math.floor((c.x - r - terrain.origin) / texel); i <= Math.ceil((c.x + r - terrain.origin) / texel); i++) {
        if (i < 0 || j < 0 || i >= res || j >= res) continue;
        const d = Math.hypot(terrain.origin + (i + 0.5) * texel - c.x, terrain.origin + (j + 0.5) * texel - c.z);
        const keep = Math.min(1, Math.max(0, (d - (CAMP_PLOT - 2)) / 4));
        for (let ch = 0; ch < 4; ch++) grassMask.data[(j * res + i) * 4 + ch] = Math.round(grassMask.data[(j * res + i) * 4 + ch] * keep);
      }
  }
}
// Rocks: Tidewater's placement; the emergent ones join the collision world as it does
const rocks = Rocks.prototype._place.call({ terrainData: terrain, village }, mulberry32(4242)).filter((r) => !onPlot(r.x, r.z, 4) && !onCamp(r.x, r.z, 3));
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
      // the helter skelter's plot: trodden bare
      const plot = 1 - smooth(SKELTER.radius - 5, SKELTER.radius + 3, Math.hypot(T.origin + (si + 0.5) * T.texel - SKELTER.x, T.origin + (sj + 0.5) * T.texel - SKELTER.z));
      if (plot > 0) c = mix(c, mix(PAL.path, PAL.soil, sat(0.4 + n)), plot * 0.8);
      // the dancers' camps: sand carried up from the beach, scuffed into the earth round the fire
      for (const cp of CAMPS) {
        const dc = Math.hypot(T.origin + (si + 0.5) * T.texel - cp.x, T.origin + (sj + 0.5) * T.texel - cp.z);
        const k = 1 - smooth(CAMP_PLOT - 3, CAMP_PLOT + 2, dc + n * 2.5);
        if (k > 0) c = mix(c, mix(PAL.sand, PAL.path, sat(0.35 + n * 1.2 + smooth(0, 2.2, dc) * 0.2 - smooth(1.8, 0, dc) * 0.3)), k * 0.85);
      }
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
// the deep walk's life ring and rods: their own class, in world coordinates (see the Builder.add patch)
for (const [key, b] of Object.entries(deepGear.batches)) {
  const geometry = b.build();
  (groups.deepGear ??= []).push({ o: { geometry, matrixWorld: new E.Matrix4(), updateWorldMatrix() {} }, kind: key });
}
console.log(`rowboats' bows closed: ${stems}, oars laid inside them: ${oarsIn}`);
console.log(`the deep walk's rods set back off the rail: ${[...rodBackLog].map((b) => b.toFixed(2)).join(', ')} m`);
console.log(`deep walk's gear moved off the pier: ${Object.values(deepGear.batches).reduce((n, b) => n + b.vcount, 0)} vertices`);
village.group.traverse((o) => {
  if (!o.geometry || o.isInstancedMesh) return;
  const name = o.name;
  // fish props are GPU-instanced shader geometry: not shipped (yet)
  if (name.startsWith('village_fish') || name.startsWith('FishProps')) return;
  // the painted fish board under the pier's entrance arch: the village hangs its own sign there
  // (village/signs.ts), from the same point (world.json pierSign)
  if (name.startsWith('village_sign_')) return;
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
  // the roofs' own texture coordinates (Tidewater's: metres up the slope from the eave, and along
  // it) and what each vertex is: [255 a metal roof / 128 thatch / 0 anything else, its rust or age]
  const ruv = [];
  const roof = [];
  const v = new E.Vector3();
  const nm = new E.Matrix3();
  for (const { o, kind } of parts) {
    const g = o.geometry;
    const P = g.attributes.position.array;
    const Nn = g.attributes.normal.array;
    const tint = g.attributes.tint?.array;
    const vd = g.attributes.vdata?.array;
    const UV = g.attributes.uv?.array;
    const roofKind = kind === 'roofMetal' ? 255 : kind === 'thatch' ? 128 : 0;
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
        ruv.push(roofKind && UV ? UV[src * 2] : 0, roofKind && UV ? UV[src * 2 + 1] : 0);
        roof.push(roofKind, roofKind ? Math.round(sat(dt[1]) * 255) : 0);
      }
      idx.push(dst);
    }
  }
  villageArrays[`${cls}.position`] = new Float32Array(pos);
  villageArrays[`${cls}.normal`] = new Int8Array(nrm);
  villageArrays[`${cls}.color`] = new Uint8Array(col);
  villageArrays[`${cls}.index`] = pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  if (glow.some((g) => g > 0)) villageArrays[`${cls}.glow`] = new Uint8Array(glow);
  if (roof.some((r, i) => i % 2 === 0 && r > 0)) {
    villageArrays[`${cls}.ruv`] = new Float32Array(ruv);
    villageArrays[`${cls}.roof`] = new Uint8Array(roof);
  }
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
  // the woodlots (src/woodworks/lots.ts): the scatter keeps clear of their trees and log pile
  {
    const { WEST_TREES, EAST_TREES, EAST_PILE, YARD } = await import('../src/woodworks/lots.ts');
    const spots = [...WEST_TREES, ...EAST_TREES, EAST_PILE, YARD];
    for (const type of Object.keys(veg)) {
      const list = veg[type];
      if (!Array.isArray(list)) continue;
      const r = type === 'trees' || type === 'palms' ? 4.5 : 2.2;
      const keep = list.filter((p) => !spots.some(([x, z]) => Math.hypot(p.x - x, p.z - z) < r));
      cleared += list.length - keep.length;
      veg[type] = keep;
    }
  }
  // the dancers' camps are cleared to their plots' edges (crowns further, so none hangs over a fire)
  for (const type of Object.keys(veg)) {
    const list = veg[type];
    if (!Array.isArray(list)) continue;
    const keep = list.filter((p) => !onCamp(p.x, p.z, type === 'trees' || type === 'palms' ? 5 : 1.5));
    cleared += list.length - keep.length;
    veg[type] = keep;
  }
  // the helter skelter's plot is cleared to the edge of the levelling
  for (const type of Object.keys(veg)) {
    const list = veg[type];
    if (!Array.isArray(list)) continue;
    const keep = list.filter((p) => !onPlot(p.x, p.z, type === 'trees' || type === 'palms' ? 10 : 6));
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
  // where the sign hangs under the pier's entrance arch: the tops of its two chains (x, y, z)
  pierSign: village.pierInfo?.signPivot ? [r3(village.pierInfo.signPivot.x), r3(village.pierInfo.signPivot.y), r3(village.pierInfo.signPivot.z)] : null,
  buildings,
  colliders: { boxes, cylinders },
};
writeFileSync(resolve(OUT, 'world.json'), JSON.stringify(world));

const mb = (b) => (b.length / 1048576).toFixed(2) + ' MB';
console.log(`terrain.bin ${mb(terrainBin)}  village.bin ${mb(villageBin)}  veg.bin ${mb(vegBin)}`);
console.log('vegetation', vegCounts, 'rocks', rocks.length);
console.log('village', villageMeta);
console.log(`colliders: ${boxes.length} boxes (${boxes.filter((b) => b.walkable).length} walkable), ${cylinders.length} cylinders`);
console.log(`pier rails laid end to end: ${railsLaid.top.length} top, ${railsLaid.mid.length} mid`);
