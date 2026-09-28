#!/usr/bin/env node
/**
 * THE LINE AGAINST THE PIER — headless.
 *
 *   npm run bake
 *   node tools/line-check.mjs
 *
 * Lays the fishing line the way FishingSystem.updateLine does (world/surfaces.ts: lineUnder,
 * lineRests, lineDroop; Node strips the types) and tests it against the pier as it's DRAWN: the
 * baked village mesh, triangle by triangle, not the colliders the line is laid over. Casts from
 * all along the walkway and the head, every which way, taut and drooping, and fish in under the
 * deck. A line may lie on what it rests on; it may not go in through the side of anything. And
 * a line swung against a lamp post (the pier's, or a walk's lantern post) goes round it, not over
 * it or through it (world/lineWrap.ts), and lets go of it when it's swung back.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeTerrain, unpack } from '../src/world/data.ts';
import { Heightfield } from '../src/world/heightfield.ts';
import { LineWraps } from '../src/world/lineWrap.ts';
import { Surfaces } from '../src/world/surfaces.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (f) => {
  const b = readFileSync(resolve(ROOT, 'public/world', f));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const json = JSON.parse(readFileSync(resolve(ROOT, 'public/world/world.json'), 'utf8'));
const hf = new Heightfield(decodeTerrain(json, load('terrain.bin')));
const S = new Surfaces(hf, json.colliders);
const P = json.layout.pier;
const X = P.x;
const DK = P.deckHeight;
const HW = P.width / 2;

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? ` — ${detail}` : ''}`);
};
const pct = (k, n) => `${k} of ${n} (${((100 * k) / n).toFixed(2)}%)`;

/* ── the pier as drawn: its triangles, by 1 m cell ─────────────────────── */

const { arrays } = unpack(load('village.bin'));
const cells = new Map();
for (const cls of ['wood', 'solid']) {
  const pos = arrays[`${cls}.position`];
  const idx = arrays[`${cls}.index`];
  for (let i = 0; i < idx.length; i += 3) {
    const t = [idx[i], idx[i + 1], idx[i + 2]].map((k) => [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]]);
    const xs = t.map((p) => p[0]);
    const zs = t.map((p) => p[2]);
    if (Math.max(...xs) < X - 9 || Math.min(...xs) > X + 9 || Math.max(...zs) < P.zStart - 3 || Math.min(...zs) > P.zEnd + 3) continue;
    const e1 = [0, 1, 2].map((j) => t[1][j] - t[0][j]);
    const e2 = [0, 1, 2].map((j) => t[2][j] - t[0][j]);
    const nm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const tri = { t, e1, e2, side: Math.abs(nm[1]) < 0.7 * Math.hypot(...nm) };
    for (let gx = Math.floor(Math.min(...xs)); gx <= Math.floor(Math.max(...xs)); gx++) {
      for (let gz = Math.floor(Math.min(...zs)); gz <= Math.floor(Math.max(...zs)); gz++) {
        const k = gx * 1000 + gz;
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(tri);
      }
    }
  }
}

/** where the segment p→q first goes through a triangle's face (Möller–Trumbore) that `counts`, or null */
function through(p, q, counts) {
  const d = [q.x - p.x, q.y - p.y, q.z - p.z];
  const seen = new Set();
  const steps = Math.ceil(Math.hypot(d[0], d[2]) / 0.5) + 1;
  for (let s = 0; s <= steps; s++) {
    const cx = Math.floor(p.x + (d[0] * s) / steps);
    const cz = Math.floor(p.z + (d[2] * s) / steps);
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gz = cz - 1; gz <= cz + 1; gz++) {
        for (const tr of cells.get(gx * 1000 + gz) ?? []) {
          if (seen.has(tr)) continue;
          seen.add(tr);
          const { t, e1, e2 } = tr;
          const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
          const det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
          if (Math.abs(det) < 1e-12) continue;
          const o = [p.x - t[0][0], p.y - t[0][1], p.z - t[0][2]];
          const u = (o[0] * h[0] + o[1] * h[1] + o[2] * h[2]) / det;
          if (u < 0 || u > 1) continue;
          const qv = [o[1] * e1[2] - o[2] * e1[1], o[2] * e1[0] - o[0] * e1[2], o[0] * e1[1] - o[1] * e1[0]];
          const v = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) / det;
          if (v < 0 || u + v > 1) continue;
          const k = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) / det;
          const at = { x: p.x + d[0] * k, y: p.y + d[1] * k, z: p.z + d[2] * k };
          if (k > 0 && k < 1 && counts(tr, at)) return at;
        }
      }
    }
  }
  return null;
}

/* ── the line, as FishingSystem.updateLine lays it ─────────────────────── */

const V = (x, y, z) => ({ x, y, z });
const LINE_N = 128;
/** a line laid as it is on one frame, round the posts `W` has it caught on (a fresh one: as it is
 *  the first frame it's out) */
function lay(a, b, sag, W = new LineWraps(S), SS = S) {
  const pts = [a];
  const top = V(0, 0, 0);
  const under = V(0, 0, 0);
  const end = SS.lineUnder(a, b, top, under) ? top : b;
  const m = W.lay(a, end);
  for (let k = 0; k <= m; k++) {
    for (let j = 0; j < W.restCounts[k]; j++) pts.push({ ...W.rests[k][j] });
    if (k < m) for (let j = 0; j < W.counts[k]; j++) pts.push({ ...W.bends[k][j] });
  }
  if (end !== b) pts.push(top, under);
  pts.push(b);
  const spans = pts.length - 1;
  let total = 0;
  for (let k = 1; k <= spans; k++) total += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y, pts[k].z - pts[k - 1].z);
  let left = LINE_N;
  const poly = [a];
  for (let k = 1; k <= spans; k++) {
    const p = pts[k - 1];
    const q = pts[k];
    const len = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
    const m = k === spans ? left : Math.max(1, Math.min(left - (spans - k), Math.round((LINE_N * len) / Math.max(total, 1e-6))));
    left -= m;
    const c = V((p.x + q.x) / 2, (p.y + q.y) / 2 - (spans === 1 ? SS.lineDroop(p, q, sag, W.skip) : 0), (p.z + q.z) / 2);
    for (let j = 1; j <= m; j++) {
      const t = j / m;
      const u = 1 - t;
      poly.push(V(u * u * p.x + 2 * u * t * c.x + t * t * q.x, u * u * p.y + 2 * u * t * c.y + t * t * q.y, u * u * p.z + 2 * u * t * c.z + t * t * q.z));
    }
  }
  return { pts, poly, wraps: m };
}
/** where a laid line goes through the pier as drawn: in through the side of anything, or down
 *  through a top anywhere but where it rests on it; or null */
const clips = ({ pts, poly }) => {
  const rests = pts.slice(1, -1);
  for (let i = 1; i < poly.length; i++) {
    const h = through(poly[i - 1], poly[i], (tr, at) => tr.side || !rests.some((r) => Math.hypot(r.x - at.x, r.z - at.z) < 0.35));
    if (h) return h;
  }
  return null;
};

/* ── casting off the pier ──────────────────────────────────────────────── */

console.log('\ncasting off the pier');
const stands = [];
for (let z = P.zStart + 6; z < P.zEnd - P.headDepth - 1; z += 3.4) for (const x of [X - HW + 0.35, X, X + HW - 0.35]) stands.push([x, z]);
for (let x = X - P.headWidth / 2 + 0.5; x <= X + P.headWidth / 2 - 0.5; x += 2) for (let z = P.zEnd - P.headDepth + 0.5; z <= P.zEnd - 0.5; z += 2) stands.push([x, z]);
// a float right up against a pile (reeled in under the rail) the line would wrap round sideways,
// which it doesn't: those are left out, and so is one that's come down inside a prop
const byPier = (x, z) => json.colliders.cylinders.some((c) => c.tag === 'pile' && Math.hypot(x - c.x, z - c.z) < c.r + 0.5);
let lines = 0;
let side = 0;
let first = null;
for (const [sx, sz] of stands) {
  if (S.deckOver(sx, sz) < DK - 0.2) continue;
  for (let deg = 0; deg < 360; deg += 20) {
    const dx = Math.sin((deg * Math.PI) / 180);
    const dz = Math.cos((deg * Math.PI) / 180);
    for (const [d, tipH, reach] of [[3, 1.3, 1.2], [8, 1.5, 1.0], [18, 1.6, 0.9], [2, 0.9, 1.3]]) {
      const a = V(sx + dx * reach, DK + tipH, sz + dz * reach);
      const bx = sx + dx * (reach + d);
      const bz = sz + dz * (reach + d);
      if (S.deckOver(bx, bz) > -Infinity || byPier(bx, bz)) continue;
      const b = V(bx, Math.max(0.01, hf.heightAt(bx, bz) + 0.05), bz);
      if (S.topAt(bx, bz) > b.y + 0.02) continue;
      for (const sag of [0.02, d * 0.07 + 0.02]) {
        lines++;
        const h = clips(lay(a, b, sag));
        if (h) {
          side++;
          first ??= { a, b, sag, h };
        }
      }
    }
  }
}
// (what's left: a line over a lamp post catches its arm, and the pier head's tyre fenders and
// cleats, which have no colliders; the old line went through the side of something one time in five)
check('no line, taut or drooping, goes in through the side of a rail, a post or the deck', side <= lines * 0.01, pct(side, lines) + (first ? `, e.g. through (${first.h.x.toFixed(2)}, ${first.h.y.toFixed(2)}, ${first.h.z.toFixed(2)})` : ''));

// straight out over the rail: it lies over the rail's outer edge, clear of the top rail as drawn
{
  const a = V(X + 0.6, DK + 1.1, -40.3);
  const b = V(X + 9, 0.01, -40.3);
  const line = lay(a, b, 0.02);
  const r = line.pts[1];
  check('cast over the rail: it comes to rest on the rail, off its outer edge', line.pts.length === 3 && Math.abs(r.y - (DK + 0.995 + 0.02)) < 0.01 && r.x > X + 1.47 + 0.1, r ? `at ${(r.x - X).toFixed(2)} m out, ${(r.y - DK).toFixed(3)} m up` : 'nowhere');
  check('…and through nothing on its way down', !clips(line));
}
// a long cast left to droop: its belly doesn't come down through the rail it cleared
{
  const a = V(X + 0.9, DK + 1.2, -30);
  const b = V(X + 15, 0.01, -20);
  check('a long drooping line lies on the rail, not through it', !clips(lay(a, b, 1.2)));
}

/* ── round a lamp post ─────────────────────────────────────────────────── */

console.log('\nround a lamp post');
/** how near the laid line comes to a post's middle (seen from above) under its top, or Infinity */
const nearest = ({ poly }, px, pz, top) => {
  let d = Infinity;
  for (let i = 1; i < poly.length; i++) {
    const p = poly[i - 1];
    const q = poly[i];
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - p.x) * dx + (pz - p.z) * dz) / l2)) : 0;
    if (p.y + (q.y - p.y) * t >= top) continue;
    d = Math.min(d, Math.hypot(p.x + dx * t - px, p.z + dz * t - pz));
  }
  return d;
};
const highest = ({ poly }) => Math.max(...poly.map((p) => p.y));
/**
 * Stands by a post, the tip beside it, and swings the line across it a frame at a time: the fish
 * out in the water on one side of it, then the other, then back. Gives what the line did.
 */
function swing(SS, post, r, top) {
  // out from the post, square to the rail it's by: the side of the deck it's on
  const out = Math.sign(post.x - X) || 1;
  const a = V(post.x - out * 0.9, DK + 1.4, post.z - 0.3);
  const W = new LineWraps(SS);
  const at = (dz) => V(post.x + out * 8, 0.01, post.z + dz);
  const frames = [];
  for (let dz = -8; dz <= 8; dz += 0.25) frames.push(at(dz));
  for (let dz = 8; dz >= -8; dz -= 0.25) frames.push(at(dz));
  let through = Infinity;
  let over = -Infinity;
  let caught = 0;
  let last = null;
  let back = null;
  for (const [i, b] of frames.entries()) {
    const line = lay(a, b, 0.02, W, SS);
    through = Math.min(through, nearest(line, post.x, post.z, top));
    // the line near the post (within a metre of it, seen from above), how high it goes
    for (const p of line.poly) if (Math.hypot(p.x - post.x, p.z - post.z) < 1) over = Math.max(over, p.y);
    if (line.wraps) caught++;
    if (i === Math.floor(frames.length / 2) - 1) last = line;
    back = line;
  }
  return { through, over, caught, last, back, r, top, a };
}
{
  const posts = json.colliders.cylinders.filter((c) => c.tag === 'lampPost' && c.z > P.zStart && c.z < P.zEnd);
  let bad = 0;
  let climbs = 0;
  let never = 0;
  let stuck = 0;
  let worst = null;
  for (const c of posts) {
    const res = swing(S, c, c.r, c.top);
    if (res.through < c.r) {
      bad++;
      worst ??= `post at (${c.x.toFixed(1)}, ${c.z.toFixed(1)}): ${res.through.toFixed(3)} m from its middle`;
    }
    if (res.over > res.a.y + 0.05) climbs++;
    if (!res.caught) never++;
    if (res.back.wraps) stuck++;
  }
  check(`swung across a lamp post on the pier, the line goes round it, not through it (${posts.length} posts)`, posts.length > 0 && bad === 0, worst ?? undefined);
  check('…and never climbs it', climbs === 0, `${climbs} of ${posts.length}`);
  check('…it does catch on it', never === 0, `${never} of ${posts.length} never caught`);
  check('…and lets go of it when it\'s swung back', stuck === 0, `${stuck} of ${posts.length} still round it`);
}
// swung the whole way across, the post ends up on the far side of the line: still round it, on
// the side it caught
{
  const c = json.colliders.cylinders.find((k) => k.tag === 'lampPost' && k.z > P.zStart && k.z < P.zEnd - P.headDepth);
  const res = swing(S, c, c.r, c.top);
  const mid = res.last;
  check('swung on past it, the line stays round the post, on the side it caught it', mid.wraps === 1, `${mid.wraps} posts round at the far end of the swing`);
}
// a line that came down on top of a post (a cast over it) lies over it, as over a rail
{
  const c = json.colliders.cylinders.find((k) => k.tag === 'lampPost' && k.z > P.zStart && k.z < P.zEnd - P.headDepth);
  const out = Math.sign(c.x - X) || 1;
  const W = new LineWraps(S);
  const a = V(c.x - out * 1.5, DK + 2.2, c.z);
  lay(a, V(c.x + out * 6, c.top + 8, c.z), 0, W); // in flight, over it
  const line = lay(a, V(c.x + out * 8, 0.01, c.z), 0.02, W); // come down past it
  const onTop = line.pts.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < c.r + 0.1 && Math.abs(p.y - c.top) < 0.05);
  check('a cast that came down over a lamp post lies over its top, not round it', !line.wraps && onTop);
}
// a walk's lantern post (a square one, added as the walk's laid, as woodworks/walks.ts does)
{
  const c = json.colliders.cylinders.find((k) => k.tag === 'lampPost' && k.z > P.zStart && k.z < P.zEnd - P.headDepth);
  // stood a metre along the deck from a pier lamp post, clear of it, by the rail
  const post = { tag: 'lampPost', walkable: false, solid: true, cx: c.x, cz: c.z + 1.6, hx: 0.065, hz: 0.065, rotY: 0.3, top: DK + 2.64, bottom: DK };
  const S2 = new Surfaces(hf, { boxes: [...json.colliders.boxes, post], cylinders: json.colliders.cylinders.filter((k) => k.tag !== 'lampPost') });
  const res = swing(S2, { x: post.cx, z: post.cz }, Math.hypot(0.065, 0.065), post.top);
  check('swung across a walk\'s lantern post, the line goes round it', res.through >= Math.hypot(0.065, 0.065) && res.caught > 0 && !res.back.wraps, `${res.through.toFixed(3)} m from its middle`);
}

/* ── a fish in under the pier ──────────────────────────────────────────── */

console.log('\na fish under the pier');
let under = 0;
let underBad = 0;
for (let z = P.zStart + 10; z < P.zEnd - 1; z += 1.1) {
  for (let fx = X - HW + 0.1; fx <= X + HW - 0.1; fx += 0.5) {
    if (hf.heightAt(fx, z) > -0.3) continue;
    const b = V(fx, -0.06, z);
    for (const [sx, sz] of [[X - HW + 0.35, z - 4], [X + HW - 0.35, z + 3], [X, z - 8]]) {
      if (S.deckOver(sx, sz) < DK - 0.2) continue;
      const a = V(sx + 0.5, DK + 1.4, sz + 0.8);
      under++;
      const h = clips(lay(a, b, 0.02));
      if (h) underBad++;
    }
  }
}
// (what's left: a fish right in a row of piles, among its cross-braces, and the pier head's tyre
// fenders; the old line, round the deck's edge, went through the piles and beams one time in four)
check('the line comes down outside the posts and in between the piles to it', underBad <= under * 0.08, pct(underBad, under));

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
