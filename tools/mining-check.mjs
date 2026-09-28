#!/usr/bin/env node
/**
 * THE GEM ROCKS, headless.
 *
 *   npm run bake
 *   node tools/mining-check.mjs
 *
 * Reads the baked island through the same code the headset does (world/surfaces.ts,
 * mining/sites.ts, mining/gems.ts) and checks what a player would notice:
 *
 *   1. OUT IN THE WILDS. Every rock is on dry land, well away from the village, and on the ground
 *      its gems come from (the shore by the sea, the forest, the high ground, the peaks).
 *   2. THERE TO SWING AT. You can stand beside each rock, within reach of it; no plant grows
 *      through it and none of Tidewater's own rocks sits on it.
 *   3. REACHABLE. Every rock can be walked to from the start, a hop at a time.
 *   4. THE STONES. A rock holds a handful of stones from its own ground, each in its own slot of
 *      the tray, each worth what its carats say; the pouch and the book fill, the Jeweller's
 *      window empties the pouch, and a save round-trips.
 *   5. ONCE ONLY. A broken rock is in the save, with the stones still lying in it, so it stays
 *      broken (nothing grows back); a save from before that has every rock whole.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeTerrain, unpack } from '../src/world/data.ts';
import { Heightfield } from '../src/world/heightfield.ts';
import { Surfaces } from '../src/world/surfaces.ts';
import { ROCK_CLEAR, ROCK_CLEAR_TREES, ROCK_R, ROCK_SITES } from '../src/mining/sites.ts';
import { freshGems, GEM_IDS, GEMS, gemsOf, gemValue, GROUND_IDS, pocket, readGems, ROCK_GEMS, ROCK_GRID, rockStock, sellGems } from '../src/mining/gems.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = JSON.parse(readFileSync(resolve(ROOT, 'public/world/world.json'), 'utf8'));
const tb = readFileSync(resolve(ROOT, 'public/world/terrain.bin'));
const grid = decodeTerrain(json, tb.buffer.slice(tb.byteOffset, tb.byteOffset + tb.byteLength));
const hf = new Heightfield(grid);
const S = new Surfaces(hf, json.colliders);
const vb = readFileSync(resolve(ROOT, 'public/world/veg.bin'));
const veg = unpack(vb.buffer.slice(vb.byteOffset, vb.byteOffset + vb.byteLength));

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? `: ${detail}` : ''}`);
};

/** the height band of each ground (m), and the shore's reach from the sea */
const BAND = { shore: [0.6, 5], forest: [8, 50], high: [50, 105], peak: [112, 400] };
const village = json.layout.village;

/* ── 1. out in the wilds ───────────────────────────────────────────────── */

console.log('\n1. out in the wilds, on their own ground');
for (const r of ROCK_SITES) {
  const h = hf.heightAt(r.x, r.z);
  const [lo, hi] = BAND[r.ground];
  check(`${r.id}: dry, on ${r.ground} ground`, h >= lo && h <= hi, `${h.toFixed(1)} m (${lo}–${hi})`);
  const d = Math.hypot(r.x - village.x, r.z - village.z);
  check(`${r.id}: out of the village`, d > village.radius + 10, `${Math.round(d)} m from its middle`);
  if (r.ground === 'shore') {
    let sea = Infinity;
    for (let d2 = 2; d2 < 40 && sea === Infinity; d2 += 2) for (let a = 0; a < 24; a++) if (hf.heightAt(r.x + Math.cos((a / 24) * Math.PI * 2) * d2, r.z + Math.sin((a / 24) * Math.PI * 2) * d2) < 0) sea = d2;
    check(`${r.id}: by the sea`, sea < 30, `${sea} m from the water`);
  }
}
for (const g of GROUND_IDS) check(`six rocks on ${g} ground`, ROCK_SITES.filter((r) => r.ground === g).length === 6);
{
  let close = Infinity;
  for (const a of ROCK_SITES) for (const b of ROCK_SITES) if (a !== b) close = Math.min(close, Math.hypot(a.x - b.x, a.z - b.z));
  check('the rocks are spread out', close > 50, `nearest two ${Math.round(close)} m apart`);
}

/* ── 2. there to swing at ──────────────────────────────────────────────── */

console.log('\n2. room to stand and swing, nothing growing through them');
const stride = veg.meta.stride;
for (const r of ROCK_SITES) {
  const reach = ROCK_R * r.size + 0.7;
  let spots = 0;
  for (let a = 0; a < 16; a++) {
    const x = r.x + Math.cos((a / 16) * Math.PI * 2) * reach;
    const z = r.z + Math.sin((a / 16) * Math.PI * 2) * reach;
    if (S.standable(S.areaNear(x, z, hf.heightAt(x, z)), x, z)) spots++;
  }
  check(`${r.id}: somewhere to stand within reach`, spots >= 6, `${spots}/16 round it`);
  const rocks = json.colliders.cylinders.filter((k) => k.tag === 'rock' && Math.hypot(k.x - r.x, k.z - r.z) < ROCK_R * r.size + k.r + 0.5);
  check(`${r.id}: none of the island's rocks on it`, rocks.length === 0, rocks.length || undefined);
  let plants = 0;
  for (const [k, a] of Object.entries(veg.arrays)) {
    if (!k.startsWith('veg.')) continue;
    const big = k === 'veg.trees' || k === 'veg.palms';
    const clear = ROCK_R * r.size + (big ? ROCK_CLEAR_TREES : ROCK_CLEAR) - 0.5;
    for (let i = 0; i < a.length; i += stride) if (Math.hypot(a[i] - r.x, a[i + 2] - r.z) < clear) plants++;
  }
  check(`${r.id}: no plants growing through it`, plants === 0, plants || undefined);
}

/* ── 3. reachable ──────────────────────────────────────────────────────── */

console.log('\n3. reachable on foot from the start');
{
  const st = json.layout.start;
  const G = 2;
  const O = grid.origin;
  const N = Math.round((grid.res * grid.cell) / G);
  const seen = new Uint8Array(N * N);
  const ok = (x, z) => S.standable(S.groundAt(x, z), x, z);
  const cell = (x, z) => [Math.round((x - O) / G), Math.round((z - O) / G)];
  const [i0, j0] = cell(st.x, st.z + 6);
  const q = [[i0, j0]];
  seen[j0 * N + i0] = 1;
  while (q.length) {
    const [i, j] = q.pop();
    const h0 = hf.heightAt(O + i * G, O + j * G);
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= N || b >= N || seen[b * N + a]) continue;
      const x = O + a * G;
      const z = O + b * G;
      if (!ok(x, z) || Math.abs(hf.heightAt(x, z) - h0) > 1.6) continue;
      seen[b * N + a] = 1;
      q.push([a, b]);
    }
  }
  for (const r of ROCK_SITES) {
    // any cell just outside its footprint
    let found = false;
    for (let a = 0; a < 16 && !found; a++) {
      const [i, j] = cell(r.x + Math.cos((a / 16) * Math.PI * 2) * (ROCK_R * r.size + 1.5), r.z + Math.sin((a / 16) * Math.PI * 2) * (ROCK_R * r.size + 1.5));
      found = seen[j * N + i] === 1;
    }
    const far = Math.round(Math.hypot(r.x - st.x, r.z - st.z));
    check(`${r.id}: a way there`, found, `${far} m from the start as the crow flies`);
  }
}

/* ── 4. the stones ─────────────────────────────────────────────────────── */

console.log('\n4. the stones');
for (const g of GROUND_IDS) check(`${g}: a common gem and a rare one`, gemsOf(g).length === 2 && GEMS[gemsOf(g)[0]].rarity > GEMS[gemsOf(g)[1]].rarity, gemsOf(g).join(', '));
check('every gem has a fact and a cut', GEM_IDS.every((id) => GEMS[id].fact.length > 40 && GEMS[id].cut));
{
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const [C, R] = ROCK_GRID;
  let slots = true;
  let own = true;
  let worth = true;
  let count = true;
  const seen = {};
  for (const g of GROUND_IDS) {
    for (let n = 0; n < 400; n++) {
      const stock = rockStock(g, rng);
      if (stock.length < ROCK_GEMS[0] || stock.length > ROCK_GEMS[1]) count = false;
      const taken = new Set();
      for (const s of stock) {
        if (s.c < 0 || s.r < 0 || s.c >= C || s.r >= R || taken.has(`${s.c},${s.r}`)) slots = false;
        taken.add(`${s.c},${s.r}`);
        if (GEMS[s.id].where !== g) own = false;
        const [lo, hi] = GEMS[s.id].ct;
        if (s.ct < lo - 1e-9 || s.ct > hi + 1e-9 || s.value !== gemValue(s.id, s.ct)) worth = false;
        seen[s.id] = (seen[s.id] ?? 0) + 1;
      }
    }
  }
  check('a rock holds 3 to 5 stones', count);
  check('each stone in its own slot of the tray', slots);
  check('every stone from the rock’s own ground', own);
  check('every stone worth its carats', worth);
  check('every gem turns up, the rare ones less often', GEM_IDS.every((id) => seen[id] > 0) && GROUND_IDS.every((g) => seen[gemsOf(g)[0]] > seen[gemsOf(g)[1]] * 1.5), JSON.stringify(seen));
}
{
  const save = freshGems();
  const a = pocket(save, { id: 'ruby', ct: 1.2, value: gemValue('ruby', 1.2) });
  const b = pocket(save, { id: 'ruby', ct: 2.5, value: gemValue('ruby', 2.5) });
  pocket(save, { id: 'peridot', ct: 3, value: gemValue('peridot', 3) });
  check('the first of a kind is new to the book, a bigger one a record', a.first && !a.best && !b.first && b.best && save.log.ruby.count === 2 && save.log.ruby.bestCt === 2.5);
  save.pick = true;
  save.mined['forest-glen'] = rockStock('forest', Math.random);
  save.mined['peak-crown'] = [];
  const back = readGems(JSON.parse(JSON.stringify({ gems: save })));
  check('the save round-trips', JSON.stringify(back) === JSON.stringify(save));
  check('a save from before the gems has none', JSON.stringify(readGems({})) === JSON.stringify(freshGems()));
  const rubies = sellGems(save, 'ruby');
  check('the Jeweller buys one kind', rubies.count === 2 && rubies.total === gemValue('ruby', 1.2) + gemValue('ruby', 2.5) && save.pouch.length === 1);
  const rest = sellGems(save, null);
  check('…and then the rest', rest.count === 1 && save.pouch.length === 0 && save.log.ruby.count === 2);
}

console.log('\n5. once only');
{
  const save = freshGems();
  check('a new game has every rock whole', Object.keys(save.mined).length === 0);
  const left = rockStock('high', Math.random);
  save.mined['high-glade'] = left.slice(1);
  save.mined['shore-west'] = [];
  const back = readGems(JSON.parse(JSON.stringify({ gems: save })));
  check('a broken rock stays broken, with what you left in it', back.mined['high-glade']?.length === left.length - 1 && JSON.stringify(back.mined['high-glade']) === JSON.stringify(left.slice(1)));
  check('an emptied rock stays broken (and empty)', Array.isArray(back.mined['shore-west']) && back.mined['shore-west'].length === 0);
  check('a whole rock is not in the save', !('forest-glen' in back.mined));
  const junk = readGems({ gems: { mined: { a: 'x', b: [{ id: 'nope', ct: 1, value: 1, c: 0, r: 0 }, { id: 'ruby', ct: 1, value: 9, c: 99, r: 0 }, null] } } });
  check('junk in the save is dropped', !('a' in junk.mined) && junk.mined.b.length === 0);
  check('every rock has its own id', new Set(ROCK_SITES.map((r) => r.id)).size === ROCK_SITES.length);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
