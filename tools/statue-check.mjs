#!/usr/bin/env node
/**
 * THE GOLDEN STATUE, headless.
 *
 *   npm run bake
 *   node tools/statue-check.mjs
 *
 * Reads the baked island and the save through the same code the headset does (world/surfaces.ts,
 * statue/site.ts, statue/journey.ts, fishing/tidewater.ts) and checks:
 *
 *   1. THE PLOT. The plinth stands on dry sand, clear of everything the village put on the beach,
 *      in sight of where you come down off the boardwalk; once it's up you can't land in it, and
 *      you can stand in front of it to read the plaque.
 *   2. THE JOURNEY. A new save has none of it; each leg (the book, the dancers, the gems, the
 *      shops, the helter skelter) counts on its own, and only all five together earn the statue.
 *   3. THE SAVE. The rides, the unveiling and the game clock survive a save and a load; a save
 *      from before them loads with none; a reset takes the statue down and the clock back to 0.
 *      The clock reads the way a speedrunner reads it.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeTerrain } from '../src/world/data.ts';
import { Heightfield } from '../src/world/heightfield.ts';
import { Surfaces } from '../src/world/surfaces.ts';
import { STATUE, STATUE_STAND } from '../src/statue/site.ts';
import { journeyDone, journeyLegs } from '../src/statue/journey.ts';
import { clock } from '../src/statue/save.ts';
import { createGameState, FISH_IDS, UPGRADES } from '../src/fishing/tidewater.ts';
import { GEAR_SHOPS } from '../src/fishing/gear.ts';
import { CAMPS } from '../src/camps/sites.ts';
import { GEM_IDS } from '../src/mining/gems.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = JSON.parse(readFileSync(resolve(ROOT, 'public/world/world.json'), 'utf8'));
const tb = readFileSync(resolve(ROOT, 'public/world/terrain.bin'));
const grid = decodeTerrain(json, tb.buffer.slice(tb.byteOffset, tb.byteOffset + tb.byteLength));
const hf = new Heightfield(grid);
const S = new Surfaces(hf, json.colliders);
// the shops' catalogue: village/homeGoods.ts builds the goods (three, canvases), so read its ids
const GOODS = [...readFileSync(resolve(ROOT, 'src/village/homeGoods.ts'), 'utf8').matchAll(/\{ id: '(\w+)', shop: '/g)].map((m) => m[1]);

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? `: ${detail}` : ''}`);
};

/* ── 1. the plot ───────────────────────────────────────────────────────── */

console.log('1. the plot');
{
  // the first step's footprint, as it's stood up
  const [hx, hz] = STATUE.step.map((v) => (v / 2) * STATUE.scale);
  const c = Math.cos(STATUE.yaw);
  const s = Math.sin(STATUE.yaw);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = -4; i <= 4; i++)
    for (let j = -4; j <= 4; j++) {
      const lx = (i / 4) * hx;
      const lz = (j / 4) * hz;
      const h = hf.heightAt(STATUE.x + lx * c + lz * s, STATUE.z - lx * s + lz * c);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
  check('on dry sand, above the swash', lo > 0.6, `${lo.toFixed(2)}–${hi.toFixed(2)} m under the plinth`);
  check('near enough level for its steps', hi - lo < 0.6, `${(hi - lo).toFixed(2)} m across`);
  const near = (x, z, r) => Math.hypot(x - STATUE.x, z - STATUE.z) < STATUE.radius + r;
  // a box is near if the plot's centre is within the plot's radius of its footprint
  const boxNear = (b) => {
    const dx = STATUE.x - b.cx;
    const dz = STATUE.z - b.cz;
    const lx = dx * Math.cos(b.rotY) - dz * Math.sin(b.rotY);
    const lz = dx * Math.sin(b.rotY) + dz * Math.cos(b.rotY);
    return Math.hypot(Math.max(0, Math.abs(lx) - b.hx), Math.max(0, Math.abs(lz) - b.hz)) < STATUE.radius;
  };
  const boxes = json.colliders.boxes.filter(boxNear);
  const cyls = json.colliders.cylinders.filter((k) => near(k.x, k.z, k.r));
  check('clear of everything on the beach', boxes.length + cyls.length === 0, [...boxes, ...cyls].map((b) => b.tag).join(', ') || undefined);
  const lamps = (json.lamps ?? []).filter((l) => near(l[0], l[2], 0.5));
  check('clear of the lamps', lamps.length === 0, lamps.length || undefined);
  // in sight from the foot of the boardwalk: nothing of the hill between you and the fish
  const st = json.layout.start;
  const eye = [st.x, S.floorYAt(st.x, st.z, 10) + 1.7, st.z];
  let blocked = 0;
  const tip = [STATUE.x, hi + STATUE.top * STATUE.scale + 2, STATUE.z];
  for (let t = 0.05; t < 1; t += 0.02) {
    const x = eye[0] + (tip[0] - eye[0]) * t;
    const y = eye[1] + (tip[1] - eye[1]) * t;
    const z = eye[2] + (tip[2] - eye[2]) * t;
    if (hf.heightAt(x, z) > y) blocked++;
  }
  check('in sight from the start', blocked === 0, `${Math.hypot(tip[0] - eye[0], tip[2] - eye[2]).toFixed(0)} m away`);
  // up: its plinth is solid, the sand in front of the plaque isn't
  const top = hi + STATUE.top * STATUE.scale;
  S.addBox({ tag: 'statue', walkable: false, solid: true, cx: STATUE.x, cz: STATUE.z, hx, hz, rotY: STATUE.yaw, top, bottom: hi - 1 });
  const [sx, sz] = STATUE_STAND;
  check("you can't hop into the plinth", S.crossesWall(sx, sz, STATUE.x, STATUE.z, hf.heightAt(sx, sz)));
  check('you can stand before the plaque', S.standable(S.areaNear(sx, sz, hf.heightAt(sx, sz)), sx, sz), `(${sx.toFixed(1)}, ${sz.toFixed(1)})`);
  // the plaque (its +z) faces the stand, and the stand is between the plaque and the start
  const toStand = Math.atan2(sx - STATUE.x, sz - STATUE.z);
  check('the plaque faces you there', Math.abs(Math.atan2(Math.sin(toStand - STATUE.yaw), Math.cos(toStand - STATUE.yaw))) < 0.05);
}

/* ── 2. the journey ────────────────────────────────────────────────────── */

console.log('\n2. the journey');
const fresh = () => {
  const s = createGameState();
  s.reset();
  return s;
};
/** every leg of the journey, done in a save */
const legs = {
  book: (s) => FISH_IDS.forEach((id) => (s.log[id] = { count: 1, bestKg: 1 })),
  dancers: (s) => CAMPS.forEach((c) => (s.camps[c.id] = { day: 0, fish: [], logs: 0, found: true })),
  gems: (s) => GEM_IDS.forEach((id) => (s.gems.log[id] = { count: 1, bestCt: 1 })),
  shops: (s) => {
    s.home = [...GOODS];
    for (const k of Object.values(GEAR_SHOPS).flat()) s.upgrades[k] = UPGRADES[k].levels.length - 1;
    s.woodworks.axe = true;
    s.gems.pick = true;
  },
  skelter: (s) => (s.journey.rides = 1),
};
{
  check('the shops sell things to count', GOODS.length >= 28, `${GOODS.length} goods`);
  const s = fresh();
  check('a new save: not earned', !journeyDone(s, GOODS));
  const l0 = journeyLegs(s, GOODS);
  check('a new save: nothing on any leg but what you start with', l0.every((l) => l.id === 'shops' || l.have === 0), l0.map((l) => `${l.id} ${l.have}/${l.of}`).join(', '));
  for (const id of Object.keys(legs)) {
    const one = fresh();
    legs[id](one);
    const l = journeyLegs(one, GOODS).find((x) => x.id === id);
    check(`${id}: done on its own`, l.have === l.of, `${l.have}/${l.of}`);
    check(`${id}: not enough on its own`, !journeyDone(one, GOODS));
    // every other leg done, this one not: still not earned
    const rest = fresh();
    for (const k of Object.keys(legs)) if (k !== id) legs[k](rest);
    check(`${id}: all the others aren't enough without it`, !journeyDone(rest, GOODS));
  }
  const all = fresh();
  for (const k of Object.keys(legs)) legs[k](all);
  check('all five: earned', journeyDone(all, GOODS));
  // one piece short of everything in the shops, one fish short of the book, one camp short
  const short = (tweak) => {
    const t = fresh();
    for (const k of Object.keys(legs)) legs[k](t);
    tweak(t);
    return !journeyDone(t, GOODS);
  };
  check('one piece of furniture short: not earned', short((t) => t.home.pop()));
  check('one level of charm short: not earned', short((t) => (t.upgrades.charm -= 1)));
  check('no pickaxe: not earned', short((t) => (t.gems.pick = false)));
  check('no great white: not earned', short((t) => delete t.log.shark));
  check('one camp not found: not earned', short((t) => (t.camps[CAMPS[0].id].found = false)));
  check('the beach party is not a camp to find', !CAMPS.some((c) => c.beach));
}

/* ── 3. the save ───────────────────────────────────────────────────────── */

console.log('\n3. the save');
{
  const s = fresh();
  s.journey.rides = 3;
  s.journey.unveiled = true;
  s.journey.played = 7654.3;
  s.journey.time = 7530.25;
  const back = fresh();
  back.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
  check('rides, the unveiling and the clock survive a save', back.journey.rides === 3 && back.journey.unveiled === true && back.journey.played === 7654.3 && back.journey.time === 7530.25, JSON.stringify(back.journey));
  const old = s.toJSON();
  delete old.journey;
  const older = fresh();
  older.fromJSON(JSON.parse(JSON.stringify(old)));
  check('a save from before it: nothing ridden, nothing unveiled, no time', older.journey.rides === 0 && older.journey.unveiled === false && older.journey.played === 0 && older.journey.time === null);
  const noClock = s.toJSON();
  delete noClock.journey.played;
  delete noClock.journey.time;
  const early = fresh();
  early.fromJSON(JSON.parse(JSON.stringify(noClock)));
  check('unveiled before the clock: still up, no time to show', early.journey.unveiled === true && early.journey.played === 0 && early.journey.time === null);
  back.reset();
  check('a reset takes it down again, the clock back to 0', back.journey.rides === 0 && back.journey.unveiled === false && back.journey.played === 0 && back.journey.time === null);
  const reads = [[0, '0:00.0'], [59.96, '0:59.9'], [83.45, '1:23.4'], [3599.99, '59:59.9'], [7530.25, '2:05:30.2'], [36000, '10:00:00.0']];
  const bad = reads.filter(([t, want]) => clock(t) !== want);
  check('the clock reads m:ss.t, h:mm:ss.t past the hour', bad.length === 0, bad.map(([t, want]) => `${t} → ${clock(t)} (want ${want})`).join(', ') || undefined);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
