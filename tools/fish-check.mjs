#!/usr/bin/env node
/**
 * THE FISH THAT KEEP THEIR OWN HOURS, AND THE TROPHY FISH — headless. Drives fishing/tidewater.ts's pickSpecies (Node
 * strips the types) over a day: each timed fish (fishing/timedFish.ts) bites only in its window,
 * and does bite in it, at a spot it lives in; Tidewater's own fish keep biting round the clock.
 * Each trophy fish (fishing/trophyFish.ts) never bites without every piece of gear it needs and
 * its depth of water, does bite with them, and bites more with a luck charm. The great white
 * (fishing/shark.ts) waits for a full field guide and deep water, and is only beaten by holding
 * its runs two-handed. A fish hooked straight under the rod off the pier (fishing/fight.ts) still
 * runs, and doesn't come in until it's tired.
 *
 *   node tools/fish-check.mjs
 */

import { FISH, FISH_IDS, UPGRADES, createGameState, fishValue, fishLengthCm, pickSpecies } from '../src/fishing/tidewater.ts';
import { shownLevel } from '../src/fishing/gear.ts';
import { TIMED, biting } from '../src/fishing/timedFish.ts';
import { TROPHY } from '../src/fishing/trophyFish.ts';
import { SHARK_DEPTH, SHARK_ID, SharkFight, RUNS } from '../src/fishing/shark.ts';
import { FishFight, LAND_AT } from '../src/fishing/fight.ts';

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? ` — ${detail}` : ''}`);
};
let seed = 12345;
const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const hm = (h) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const spot = (habitat) => ({ shallows: 0, reef: 0, pier: 0, bay: 0, deep: 0, ...habitat });

console.log('\nthe table');
check('29 species: Tidewater\'s 18, 5 that keep their hours, 5 trophies and the great white, last', FISH_IDS.length === 29 && [...Object.keys(TIMED), ...Object.keys(TROPHY)].every((id) => FISH_IDS.includes(id)) && FISH_IDS.at(-1) === SHARK_ID);
for (const id of [...Object.keys(TIMED), ...Object.keys(TROPHY)]) {
  const f = FISH[id];
  const kg = (f.kg[0] + f.kg[1]) / 2;
  check(`${f.name}: priced and measured like any fish`, fishValue(id, kg) > 0 && fishLengthCm(id, kg) > 5, `$${fishValue(id, kg)} at ${kg.toFixed(1)} kg, ${Math.round(fishLengthCm(id, kg))} cm`);
}

console.log('\nwhen they bite (2,000 bites an hour, at a spot each one lives in)');
for (const [id, t] of Object.entries(TIMED)) {
  const where = spot(t.row.habitat);
  let inside = 0;
  let outside = 0;
  for (let h = 0; h < 24; h += 0.5) {
    let n = 0;
    for (let i = 0; i < 2000; i++) if (pickSpecies(where, h, rng) === id) n++;
    if (biting(id, h)) inside += n;
    else outside += n;
  }
  check(`${FISH[id].name} ${t.when} (${hm(t.hours[0])}–${hm(t.hours[1])})`, outside === 0 && inside > 0, `${inside} in its hours, ${outside} outside`);
}

console.log('\nthe rest of the sea');
{
  const pier = spot({ pier: 1, bay: 0.5 });
  const grunt = [3, 12, 23].map((h) => {
    let n = 0;
    for (let i = 0; i < 3000; i++) if (pickSpecies(pier, h, rng) === 'grunt') n++;
    return n;
  });
  check('Tidewater\'s fish still bite at every hour (grunts off the pier)', grunt.every((n) => n > 0), grunt.join(' / '));
}

console.log('\nthe trophy fish (2,000 bites at each spot)');
{
  const top = Object.fromEntries(Object.entries(UPGRADES).map(([k, t]) => [k, t.levels.length - 1]));
  const none = Object.fromEntries(Object.keys(UPGRADES).map((k) => [k, 0]));
  const count = (id, where, hour, rig) => {
    let n = 0;
    for (let i = 0; i < 2000; i++) if (pickSpecies(where, hour, rng, rig) === id) n++;
    return n;
  };
  for (const [id, t] of Object.entries(TROPHY)) {
    const where = spot(t.row.habitat);
    const hour = t.hours ? t.hours[0] + 0.5 : 12;
    const deep = t.minDepth + 1;
    const noRig = count(id, where, hour, undefined);
    const bare = count(id, where, hour, { depth: deep, gear: none });
    // each thing it needs, one level short
    const short = Object.entries(t.needs).map(([k, n]) => count(id, where, hour, { depth: deep, gear: { ...top, [k]: n - 1 } }));
    const shallow = count(id, where, hour, { depth: t.minDepth - 0.5, gear: top });
    const rigged = count(id, where, hour, { depth: deep, gear: { ...top, charm: t.needs.charm ?? 0 } });
    check(`${FISH[id].name}: never without its gear or its depth`, noRig + bare + short.reduce((a, b) => a + b, 0) + shallow === 0, `no rig ${noRig}, starter gear ${bare}, one level short ${short.join('/')}, too shallow ${shallow}`);
    check(`${FISH[id].name}: bites for the rig that can take it`, rigged > 0, `${rigged} of 2,000`);
    const lucky = count(id, where, hour, { depth: deep, gear: top });
    check(`${FISH[id].name}: bites more with the best charm`, lucky > rigged, `${rigged} → ${lucky}`);
    if (t.hours) {
      const off = count(id, where, 12, { depth: deep, gear: top });
      check(`${FISH[id].name}: only at night`, off === 0, `${off} at noon`);
    }
  }
}

console.log('\nthe great white');
{
  const top = Object.fromEntries(Object.entries(UPGRADES).map(([k, t]) => [k, t.levels.length - 1]));
  const deep = spot({ deep: 1 });
  const all = Object.fromEntries(FISH_IDS.filter((id) => id !== SHARK_ID).map((id) => [id, { count: 1 }]));
  const oneShort = { ...all };
  delete oneShort.tarpon;
  const count = (rig) => {
    let n = 0;
    for (let i = 0; i < 2000; i++) if (pickSpecies(deep, 12, rng, rig) === SHARK_ID) n++;
    return n;
  };
  const locked = count({ depth: 12, gear: top, log: oneShort }) + count({ depth: 12, gear: top }) + count(undefined);
  check('never before every other fish is in the book', locked === 0, `${locked} bites`);
  const shallow = count({ depth: SHARK_DEPTH - 0.5, gear: top, log: all });
  check(`never in less than ${SHARK_DEPTH} m of water`, shallow === 0, `${shallow} bites`);
  const open = count({ depth: 12, gear: { rod: 0, reel: 0, line: 0, bait: 0, charm: 0 }, log: all });
  check('with a full book, it takes a bait in deep water often, on any gear', open > 300, `${open} of 2,000`);
  const f = FISH[SHARK_ID];
  const cm = fishLengthCm(SHARK_ID, 700);
  check('a 700 kg great white is about 4.2 m', cm > 390 && cm < 450, `${Math.round(cm)} cm`);

  // the fight: 1/60 s steps, reeling between runs, the other hand on the rod (or not) in a run
  const fight = (twoHands, reelInRuns) => {
    const s = new SharkFight(700, 25, rng);
    for (let i = 0; i < 60 * 240 && s.state === 'fighting'; i++) {
      const run = s.phase === 'run';
      s.update(1 / 60, run ? reelInRuns : s.tension < 0.8, run && twoHands);
    }
    return s;
  };
  const held = fight(true, false);
  check(`held two-handed, ${RUNS} runs are broken and it's landed`, held.state === 'caught' && held.broken === RUNS, `${held.state}, ${held.broken} runs`);
  const oneHand = fight(false, false);
  check('one-handed, it never tires: it takes all the line', oneHand.state === 'escaped' && oneHand.broken === 0, `${oneHand.state}`);
  const reeled = fight(false, true);
  check('reeling against a run snaps the line', reeled.state === 'snapped', reeled.state);
  const both = fight(true, true);
  check('two hands on it, reeling through the run is safe', both.state === 'caught', both.state);
  check(`its value is a bounty ($${fishValue(SHARK_ID, 700)})`, fishValue(SHARK_ID, 700) > 5000 && f.price > 0);
}

console.log('\nthe fight, dropped straight down off the pier (3 m of line, a steady hand on the reel)');
{
  // reel while the tension's low, ease off when it climbs
  const fight = (species, kg, lineKg = 7, reelSpeed = 1.1) => {
    const f = new FishFight({ species, kg, lineKg, reelSpeed, distance: 3, rng });
    let t = 0;
    let far = f.distance;
    while (f.state === 'fighting' && t < 300) {
      f.update(1 / 72, f.tension < 0.7);
      t += 1 / 72;
      far = Math.max(far, f.distance);
    }
    return { f, t, far };
  };
  const small = fight('sergeant', 0.2);
  const jack = fight('jack', 6, 13, 1.6);
  const tarpon = fight('tarpon', 30, 90, 3);
  check('a sergeant major runs a little, and comes in within a few seconds', small.f.state === 'caught' && small.far > 4 && small.t < 8, `out to ${small.far.toFixed(1)} m, ${small.t.toFixed(1)} s`);
  check('a crevalle jack takes line well out on its first run', jack.f.state === 'caught' && jack.far > 9 && jack.t > 7, `out to ${jack.far.toFixed(1)} m, ${jack.t.toFixed(1)} s`);
  check('a tarpon on the best gear still fights, however fast the reel', tarpon.f.state === 'caught' && tarpon.far > 12 && tarpon.t > 10, `out to ${tarpon.far.toFixed(1)} m, ${tarpon.t.toFixed(1)} s, bolted ${tarpon.f.bolts}×`);
  let early = 0;
  let caught = 0;
  for (const id of FISH_IDS) {
    if (id === SHARK_ID) continue;
    const [lo, hi] = FISH[id].kg;
    for (let i = 0; i < 20; i++) {
      const { f } = fight(id, lo + (hi - lo) * rng(), 90, 3);
      if (f.state !== 'caught') continue;
      caught++;
      if (f.stamina > LAND_AT) early++;
    }
  }
  check(`no fish comes to the rod before it's tired (stamina ${LAND_AT} or less)`, caught > 0 && early === 0, `${caught} landed, ${early} fresh`);
  const f = new FishFight({ species: 'jack', kg: 8, lineKg: 90, reelSpeed: 3, distance: 3, rng });
  f.run = 0;
  for (let t = 0; t < 1.5 && f.state === 'fighting'; t += 1 / 72) f.update(1 / 72, true);
  check('a fresh fish reeled right in bolts again', f.state === 'fighting' && f.bolts > 0, `${f.bolts} bolt(s), ${f.distance.toFixed(1)} m out`);
}

console.log('\nthe gear you show (the bait on your hook, the rod and reel in your hand)');
{
  const u = { bait: 4, rod: 2 };
  check('with nothing picked, your best shows', shownLevel(u, {}, 'bait') === 4 && shownLevel(u, undefined, 'rod') === 2);
  check('any level you have can show (frozen shrimp, the hand-me-down rod too)', shownLevel(u, { bait: 2 }, 'bait') === 2 && shownLevel(u, { bait: 0, rod: 0 }, 'bait') === 0 && shownLevel(u, { rod: 0 }, 'rod') === 0);
  check("one you haven't got falls back to your best", shownLevel(u, { bait: 5 }, 'bait') === 4 && shownLevel(u, { rod: 3 }, 'rod') === 2 && shownLevel(u, { bait: -1 }, 'bait') === 4);
  const s = createGameState();
  s.upgrades.bait = 3;
  s.upgrades.rod = 2;
  s.upgrades.reel = 3;
  s.looks = { bait: 1, rod: 0, reel: 1 };
  const d = JSON.parse(JSON.stringify(s.toJSON()));
  const t = createGameState();
  t.fromJSON(d);
  check('the picks are saved and read back', t.looks.bait === 1 && t.looks.rod === 0 && t.looks.reel === 1, JSON.stringify(d.looks));
  check('and the bites, the cast and the reeling still go by your best', t.stats.biteMul === UPGRADES.bait.levels[3].biteMul && t.stats.castM === UPGRADES.rod.levels[2].castM && t.stats.reelSpeed === UPGRADES.reel.levels[3].reelSpeed, `${t.stats.biteMul}, ${t.stats.castM} m, ${t.stats.reelSpeed} m/s`);
  t.fromJSON({ ...d, looks: { bait: 9, rod: 'x' } });
  check("a pick beyond the save's gear is dropped", Object.keys(t.looks).length === 0);
  t.fromJSON({ ...d, looks: undefined });
  check('an older save has none: your best shows', Object.keys(t.looks).length === 0);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
