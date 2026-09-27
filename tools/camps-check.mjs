#!/usr/bin/env node
/**
 * THE FIRE DANCERS' CAMPS, headless.
 *
 *   npm run bake
 *   node tools/camps-check.mjs
 *
 * Reads the baked island through the same code the headset does (world/surfaces.ts,
 * camps/sites.ts, camps/stock.ts) and checks what a player would notice:
 *
 *   1. HIDDEN. No camp can be seen from the start area: sight lines from the boardwalk, the pier
 *      foot, along the pier to its head and the beach either side all hit the hills before the
 *      tops of the flames, the dancers' raised glowsticks or the chest.
 *   2. THERE TO STAND ON. Each plot is level, dry, clear of rocks, and you can teleport onto it and
 *      up to the chest.
 *   3. REACHABLE. Every camp can be walked to from the start, a hop at a time, without crossing
 *      the sea or a slope too steep to land on.
 *   4. THE CHESTS. The same day fills a chest the same way; the next day, differently; every fish
 *      lies inside the chest's grid without overlapping, would fit the smallest backpack, and is
 *      worth its tier.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeTerrain } from '../src/world/data.ts';
import { Heightfield } from '../src/world/heightfield.ts';
import { Surfaces } from '../src/world/surfaces.ts';
import { CAMPS, CAMP_PLOT, CHEST_R, chestSpot } from '../src/camps/sites.ts';
import { CHEST_GRID, CHEST_MAX_LEN, TIER_VALUE, stockFor } from '../src/camps/stock.ts';
import { bounds, cellsOf, GRID_SIZES } from '../src/backpack/logic.ts';
import { fishValue } from '../src/fishing/tidewater.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = JSON.parse(readFileSync(resolve(ROOT, 'public/world/world.json'), 'utf8'));
const tb = readFileSync(resolve(ROOT, 'public/world/terrain.bin'));
const grid = decodeTerrain(json, tb.buffer.slice(tb.byteOffset, tb.byteOffset + tb.byteLength));
const hf = new Heightfield(grid);
const S = new Surfaces(hf, json.colliders);

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? `: ${detail}` : ''}`);
};

/* ── 1. hidden ─────────────────────────────────────────────────────────── */

const st = json.layout.start;
const P = json.layout.pier;
const deckEye = P.deckHeight + 1.7;
const ground = (x, z) => Math.max(0, hf.heightAt(x, z));
// where you stand at the start and all round it: the boardwalk, the pier to its head, the sand
const EYES = [
  [st.x, st.z, S.floorYAt(st.x, st.z, 10) + 1.7],
  [P.x, P.zStart, deckEye],
  [P.x, (P.zStart + P.zEnd) / 2, deckEye],
  [P.x, P.zEnd - 1, deckEye],
  [P.x - P.headWidth / 2, P.zEnd - 1, deckEye],
  [P.x + P.headWidth / 2, P.zEnd - 1, deckEye],
  [P.x - 25, P.zStart + 4, ground(P.x - 25, P.zStart + 4) + 1.7],
  [P.x + 25, P.zStart + 4, ground(P.x + 25, P.zStart + 4) + 1.7],
];
/** Can an eye see (x, y, z)? The terrain blocks (a 20 cm margin); nothing else is counted. */
function seen(x, y, z) {
  for (const [ex, ez, ey] of EYES) {
    const d = Math.hypot(x - ex, z - ez);
    const n = Math.ceil(d);
    let blocked = false;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (hf.heightAt(ex + (x - ex) * t, ez + (z - ez) * t) > ey + (y - ey) * t + 0.2) {
        blocked = true;
        break;
      }
    }
    if (!blocked) return true;
  }
  return false;
}

console.log('\n1. hidden from the start');
for (const c of CAMPS) {
  const g = hf.heightAt(c.x, c.z);
  // the fire's flames and the brightest of its glow; the dancers' raised sticks round it; the chest
  const pts = [[c.x, g + 3.4, c.z]];
  for (let a = 0; a < 12; a++) pts.push([c.x + Math.cos((a * Math.PI) / 6) * 3.8, g + 2.5, c.z + Math.sin((a * Math.PI) / 6) * 3.8]);
  const [cx, cz] = chestSpot(c);
  pts.push([cx, hf.heightAt(cx, cz) + 0.8, cz]);
  const shown = pts.filter(([x, y, z]) => seen(x, y, z)).length;
  const far = Math.round(Math.hypot(c.x - st.x, c.z - st.z));
  check(`${c.name}: nothing of it in sight`, shown === 0, `${shown}/${pts.length} points seen, ${far} m from the start`);
}

/* ── 2. there to stand on ──────────────────────────────────────────────── */

console.log('\n2. level, dry, clear, standable');
for (const c of CAMPS) {
  let lo = Infinity;
  let hi = -Infinity;
  let standable = 0;
  let n = 0;
  for (let r = 0; r <= CAMP_PLOT - 1; r += 1.5)
    for (let a = 0; a < 16; a++) {
      const x = c.x + Math.cos((a * Math.PI) / 8) * r;
      const z = c.z + Math.sin((a * Math.PI) / 8) * r;
      const h = hf.heightAt(x, z);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
      n++;
      if (S.standable(S.areaNear(x, z, h), x, z)) standable++;
    }
  check(`${c.name}: level`, hi - lo < 0.4, `${(hi - lo).toFixed(2)} m across the plot, at ${lo.toFixed(1)} m`);
  check(`${c.name}: all of it standable`, standable === n, `${standable}/${n}`);
  const rocks = json.colliders.cylinders.filter((k) => k.tag === 'rock' && Math.hypot(k.x - c.x, k.z - c.z) < CAMP_PLOT + k.r);
  check(`${c.name}: no rocks on it`, rocks.length === 0, rocks.length || undefined);
  // in front of the chest, outside the ring of dancers, where you'd stand to open it
  const stand = [c.x + Math.cos(c.chestAt) * (CHEST_R + 1.2), c.z + Math.sin(c.chestAt) * (CHEST_R + 1.2)];
  check(`${c.name}: you can stand at the chest`, S.standable(S.areaNear(stand[0], stand[1], hf.heightAt(stand[0], stand[1])), stand[0], stand[1]));
}

/* ── 3. reachable ──────────────────────────────────────────────────────── */

console.log('\n3. reachable on foot from the start');
{
  // flood the island a 2 m cell at a time: dry and not too steep to land on, no cliff between
  const G = 2;
  const O = grid.origin;
  const N = Math.round((grid.res * grid.cell) / G);
  const seenCell = new Uint8Array(N * N);
  const ok = (x, z) => S.standable(S.groundAt(x, z), x, z);
  const cell = (x, z) => [Math.round((x - O) / G), Math.round((z - O) / G)];
  // step off the boardwalk onto the sand below it
  const [i0, j0] = cell(st.x, st.z + 6);
  const q = [[i0, j0]];
  seenCell[j0 * N + i0] = 1;
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
      if (a < 0 || b < 0 || a >= N || b >= N || seenCell[b * N + a]) continue;
      const x = O + a * G;
      const z = O + b * G;
      if (!ok(x, z) || Math.abs(hf.heightAt(x, z) - h0) > 1.6) continue;
      seenCell[b * N + a] = 1;
      q.push([a, b]);
    }
  }
  for (const c of CAMPS) {
    const [i, j] = cell(c.x + 2, c.z);
    check(`${c.name}: a way there`, seenCell[j * N + i] === 1);
  }
}

/* ── 4. the chests ─────────────────────────────────────────────────────── */

console.log('\n4. the chests');
const [C, R] = CHEST_GRID;
const [minC] = GRID_SIZES[0];
check('tier values follow the merges (×1, ×3, ×10.5, ×42)', JSON.stringify(TIER_VALUE) === '[1,3,10.5,42]', JSON.stringify(TIER_VALUE));
for (const c of CAMPS) {
  const day = 20000;
  const a = stockFor(c, day);
  const b = stockFor(c, day);
  const next = stockFor(c, day + 1);
  check(`${c.name}: the same day, the same chest`, JSON.stringify(a) === JSON.stringify(b));
  check(`${c.name}: tomorrow, a fresh one`, JSON.stringify(a.fish) !== JSON.stringify(next.fish));
  let fits = true;
  let backpackable = true;
  let worth = true;
  const taken = new Set();
  for (let d = day; d < day + 60; d++) {
    const s = stockFor(c, d);
    if (s.fish.length < 3 || s.logs < c.logs[0] || s.logs > c.logs[1]) fits = false;
    for (const f of s.fish) {
      for (const [x, y] of cellsOf(f)) {
        if (x < 0 || y < 0 || x >= C || y >= R || taken.has(`${d},${x},${y}`)) fits = false;
        taken.add(`${d},${x},${y}`);
      }
      if (bounds(f.shape).w > Math.min(CHEST_MAX_LEN, minC)) backpackable = false;
      if (f.tier > c.bestTier || f.value !== Math.round(fishValue(f.species, f.kg) * TIER_VALUE[f.tier])) worth = false;
    }
  }
  check(`${c.name}: 60 days of chests, every fish in the grid, none overlapping`, fits);
  check(`${c.name}: every fish would fit the smallest backpack`, backpackable);
  check(`${c.name}: every fish worth its tier, none above the camp's best`, worth);
  console.log(`       (day ${day}: ${a.fish.map((f) => `${f.species}${f.tier ? `*${f.tier}` : ''}`).join(', ')}; ${a.logs} logs)`);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
