#!/usr/bin/env node
/**
 * THE FISH THAT KEEP THEIR OWN HOURS, AND THE TROPHY FISH — headless. Drives fishing/tidewater.ts's pickSpecies (Node
 * strips the types) over a day: each timed fish (fishing/timedFish.ts) bites only in its window,
 * and does bite in it, at a spot it lives in; Tidewater's own fish keep biting round the clock.
 * Each trophy fish (fishing/trophyFish.ts) never bites without every piece of gear it needs and
 * its depth of water, does bite with them, and bites more with a luck charm. The great white
 * (fishing/shark.ts) waits for a full field guide and deep water, and is only beaten by holding
 * its runs two-handed.
 *
 *   node tools/fish-check.mjs
 */

import { FISH, FISH_IDS, UPGRADES, fishValue, fishLengthCm, pickSpecies } from '../src/fishing/tidewater.ts';
import { TIMED, biting } from '../src/fishing/timedFish.ts';
import { TROPHY } from '../src/fishing/trophyFish.ts';
import { SHARK_DEPTH, SHARK_ID, SharkFight, RUNS } from '../src/fishing/shark.ts';

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

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
