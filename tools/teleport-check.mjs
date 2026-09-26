#!/usr/bin/env node
/**
 * TELEPORT, on the island — headless.
 *
 *   npm run bake
 *   node tools/teleport-check.mjs
 *
 * Drives the SAME world/surfaces.ts the headset runs (Node strips the types)
 * against the baked island, and checks the rules a player would notice:
 *
 *   1. THE TUNING. Every number is ff2's club number.
 *   2. STANDING. The start spot resolves to the boardwalk, not the sand under it.
 *   3. THE SEA. An arc thrown off the end of the pier lands on water — refused.
 *   4. THE PIER. Hops along the deck are free (the under-deck beams sit below
 *      you); a hop from the sand straight through the rails is not; the pier
 *      is reached by its steps.
 *   5. FALLING ONTO DECKS. An arc falling onto the pier from above lands on
 *      the deck, but an arc from the sand under it doesn't pop up through it.
 *   6. THE ISLAND. Dry beach is standable, the swash and cliffs are not.
 *   7. WALK-IN BUILDINGS. Through the door, not through the walls.
 *   8. NO CRAWLING UNDER. An arc thrown at a doorway from the ground (your hand
 *      below the room's floor) lands on the porch or the floor, never on the
 *      ground under the house; arcs thrown around a room land on its floor.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeTerrain } from '../src/world/data.ts';
import { Heightfield } from '../src/world/heightfield.ts';
import { Surfaces, simulateArc } from '../src/world/surfaces.ts';
import { TELEPORT, TELEPORT_COLOURS } from '../src/locomotion/config.ts';
import { hasInterior, openColliders } from '../src/village/interiors.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = JSON.parse(readFileSync(resolve(ROOT, 'public/world/world.json'), 'utf8'));
const tb = readFileSync(resolve(ROOT, 'public/world/terrain.bin'));
const grid = decodeTerrain(json, tb.buffer.slice(tb.byteOffset, tb.byteOffset + tb.byteLength));
const hf = new Heightfield(grid);
const S0 = new Surfaces(hf, json.colliders);
const S = S0;

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? ` — ${detail}` : ''}`);
};
const f2 = (v) => v.toFixed(2);

/** Aim from a standing spot: controller at chest height, pitched `pitchDeg`
 *  up, toward yaw (0 = −z). Returns the arc result plus the club verdict. */
function aim(x, z, standY, yaw, pitchDeg = 20, S = S0) {
  const p = (pitchDeg * Math.PI) / 180;
  const dir = { x: -Math.sin(yaw) * Math.cos(p), y: Math.sin(p), z: -Math.cos(yaw) * Math.cos(p) };
  const origin = { x, y: standY + 1.2, z };
  const buf = new Float32Array(TELEPORT.arcPoints * 3);
  const r = simulateArc(S, origin, dir, buf);
  const fromY = S.floorYAt(x, z, standY);
  const hopY = Math.max(fromY, r.area?.y ?? 0);
  const valid = r.landed && S.standable(r.area, r.landing.x, r.landing.z) && !S.crossesWall(x, z, r.landing.x, r.landing.z, hopY);
  return { ...r, valid, dist: Math.hypot(r.landing.x - x, r.landing.z - z) };
}

console.log('\n1. the tuning (ff2 src/rave/club/config.ts TELEPORT)');
const ff2 = { engage: 0.5, release: 0.35, launchSpeed: 7.5, gravity: 9.8, arcPoints: 48, arcStep: 0.035, snapAngle: (35 * Math.PI) / 180, snapEngage: 0.7, snapReset: 0.3 };
for (const [k, v] of Object.entries(ff2)) check(`TELEPORT.${k}`, TELEPORT[k] === v, TELEPORT[k]);
check('stepBack probes', JSON.stringify(TELEPORT.stepBack) === '[0.5,0.34,0.2]');
check('colours: sea-glass for a good landing, ff2 hazard red for a refused one', TELEPORT_COLOURS.ok === 0x5ee8d8 && TELEPORT_COLOURS.refused === 0xe8352a);
const flat = aim(0, 0, 0, 0, 45);
console.log(`       (reference: max throw from 1.2 m at 45° ≈ ${f2(flat.dist)} m over open water)`);

console.log('\n2. standing');
const st = json.layout.start;
const startArea = S.areaNear(st.x, st.z, 10);
check('start is on a deck', startArea.kind === 'deck', `${startArea.tag} @ y ${f2(startArea.y)} (sand ${f2(hf.heightAt(st.x, st.z))})`);

const P = json.layout.pier;
const deckY = P.deckHeight;
const pierMidZ = (P.zStart + P.zEnd) / 2;
const onPier = S.areaNear(P.x, pierMidZ, deckY);
check('pier middle is the pier deck', onPier.kind === 'deck' && Math.abs(onPier.y - deckY) < 0.05, `${onPier.tag} @ ${f2(onPier.y)}`);

console.log('\n3. the sea');
const headZ = P.zEnd - 1.5;
const sea = aim(P.x, headZ, deckY, Math.PI, 25); // yaw π faces +z: out to sea
check('arc off the pier head lands on water', sea.landed && sea.area?.kind === 'water', `${sea.area?.kind} ${f2(sea.dist)} m out`);
check('…and is refused', !sea.valid);

console.log('\n4. the pier');
const along = aim(P.x, pierMidZ, deckY, Math.PI, 12);
check('hop along the deck lands on the deck', along.area?.kind === 'deck', `${along.area?.tag} ${f2(along.dist)} m`);
check('…and is allowed (under-deck beams sit below the hop)', along.valid);
// Standing on the sand east of the pier, throwing west across it.
let beachZ = null;
for (let z = P.zStart + 2; z < P.zEnd; z += 0.5) {
  const h = hf.heightAt(P.x + 5, z);
  if (h > 0.4 && h < 1.2) {
    beachZ = z;
    break;
  }
}
if (beachZ === null) {
  check('found a beach spot beside the pier', false);
} else {
  const bx = P.x + 5;
  const by = hf.heightAt(bx, beachZ);
  const blocked = S.crossesWall(bx, beachZ, P.x, beachZ, Math.max(by, deckY));
  check('beach → pier deck straight through the rails is blocked', blocked, `from (${f2(bx)}, ${f2(beachZ)}) sand ${f2(by)}`);
}
const railHop = S.crossesWall(P.x, pierMidZ, P.x + 6, pierMidZ, deckY);
check('deck → over the side rail is blocked', railHop);

console.log('\n5. falling onto decks');
// From high above the pier, an arc falling onto it must land on the deck.
const drop = simulateArc(S, { x: P.x, y: deckY + 4, z: pierMidZ - 3 }, { x: 0, y: 0, z: 1 }, new Float32Array(TELEPORT.arcPoints * 3));
check('arc falling onto the pier lands on the deck', drop.area?.kind === 'deck', `${drop.area?.tag} @ ${f2(drop.landing.y)}`);
// From the sand under the pier, rising: must not land on the deck's underside.
const under = simulateArc(S, { x: P.x, y: 1.0, z: -30 }, { x: 0, y: 0.35, z: 0.94 }, new Float32Array(TELEPORT.arcPoints * 3));
check('arc from under the pier does not pop up onto it', under.area?.kind !== 'deck' || under.landing.y < deckY - 0.1, `${under.area?.kind} @ ${f2(under.landing.y)}`);

console.log('\n6. the island');
let dry = 0;
let swash = 0;
let steepRefused = 0;
let steepSeen = 0;
const n = { x: 0, y: 0, z: 0 };
for (let x = -140; x <= 160; x += 3) {
  for (let z = -120; z <= 20; z += 3) {
    const a = S.groundAt(x, z);
    if (a.kind !== 'ground') continue;
    if (a.y > 1.5 && a.y < 20 && hf.normalAt(x, z, n).y > 0.95 && S.standable(a, x, z)) dry++;
    if (a.y < 0.2 && !S.standable(a, x, z)) swash++;
    if (hf.normalAt(x, z, n).y < 0.6) {
      steepSeen++;
      if (!S.standable(a, x, z)) steepRefused++;
    }
  }
}
check('there is dry, standable ground around the bay', dry > 50, `${dry} samples`);
check('the swash line is refused', swash > 0, `${swash} samples`);
check('slopes steeper than 38° are refused', steepSeen === 0 || steepRefused === steepSeen, `${steepRefused}/${steepSeen}`);

console.log('\n7. walk-in buildings');
{
  const b = json.buildings.find((x) => x.name === 'C'); // The Lucky Lure
  const open = new Surfaces(hf, { boxes: openColliders(json.colliders.boxes, json.buildings), cylinders: json.colliders.cylinders });
  const fw = (lx, lz) => ({ x: b.x + lx * Math.cos(b.yaw) + lz * Math.sin(b.yaw), z: b.z - lx * Math.sin(b.yaw) + lz * Math.cos(b.yaw) });
  const porch = fw(b.doorX, b.d / 2 + Math.max(1.0, b.porch * 0.6));
  const inside = fw(b.doorX, 0);
  const side = fw(b.w / 2 + 1.5, 0);
  const floor = open.areaNear(inside.x, inside.z, b.floorY);
  check('the Lucky Lure has a floor inside at its floor height', floor.kind === 'deck' && Math.abs(floor.y - b.floorY) < 0.1, `${floor.tag} @ ${f2(floor.y)} (house floor ${f2(b.floorY)})`);
  const porchY = open.floorYAt(porch.x, porch.z, b.floorY);
  check('porch → through the door → inside: not blocked', !open.crossesWall(porch.x, porch.z, inside.x, inside.z, Math.max(porchY, b.floorY)));
  const sideY = open.floorYAt(side.x, side.z, b.floorY);
  check('beside the house → through the side wall: blocked', open.crossesWall(side.x, side.z, inside.x, inside.z, Math.max(sideY, b.floorY)));
  check('inside → back out through the door: not blocked', !open.crossesWall(inside.x, inside.z, porch.x, porch.z, Math.max(porchY, b.floorY)));
  const closed = S.crossesWall(porch.x, porch.z, inside.x, inside.z, Math.max(porchY, b.floorY));
  check('(before opening, the house was solid)', closed);
}

console.log('\n8. no crawling under a house');
{
  const open = new Surfaces(hf, { boxes: openColliders(json.colliders.boxes, json.buildings), cylinders: json.colliders.cylinders });
  for (const b of json.buildings.filter((x) => hasInterior(x.name))) {
    const c = Math.cos(b.yaw);
    const s = Math.sin(b.yaw);
    const fw = (lx, lz) => ({ x: b.x + lx * c + lz * s, z: b.z - lx * s + lz * c });
    const local = (x, z) => ({ lx: (x - b.x) * c - (z - b.z) * s, lz: (x - b.x) * s + (z - b.z) * c });
    // under the house or its porch, below the floor
    const under = (p) => {
      const q = local(p.x, p.z);
      return Math.abs(q.lx) < b.w / 2 && q.lz > -b.d / 2 && q.lz < b.d / 2 + b.porch && p.y < b.floorY - 0.3;
    };
    let arcs = 0;
    let bad = 0;
    // from the ground out front, at the stairs and off to either side, aimed at the room
    for (const out of [2.5, 4, 6]) {
      for (const side of [-1.5, 0, 1.5]) {
        const from = fw(b.doorX + side, b.d / 2 + b.porch + out);
        const g = open.groundAt(from.x, from.z);
        if (g.kind !== 'ground') continue;
        for (const aimX of [-1, 0, 1]) {
          const to = fw(b.doorX + aimX, 0);
          const yaw = Math.atan2(-(to.x - from.x), -(to.z - from.z));
          for (let pitch = -15; pitch <= 35; pitch += 5) {
            const r = aim(from.x, from.z, g.y, yaw, pitch, open);
            if (!r.landed) continue;
            arcs++;
            if (under({ x: r.landing.x, y: r.area.y, z: r.landing.z })) bad++;
          }
        }
      }
    }
    check(`${b.name}: arcs at the door from the ground never land under the floor`, bad === 0, `${bad}/${arcs} under`);
    // inside: from the middle, around the room
    const mid = fw(0, 0);
    let inArcs = 0;
    let inBad = 0;
    for (let yaw = 0; yaw < Math.PI * 2; yaw += Math.PI / 4) {
      for (const pitch of [-60, -45, -30]) {
        const r = aim(mid.x, mid.z, b.floorY + 0.02, yaw, pitch, open);
        if (!r.landed) continue;
        const q = local(r.landing.x, r.landing.z);
        if (Math.abs(q.lx) > b.w / 2 - 0.2 || Math.abs(q.lz) > b.d / 2 - 0.2) continue; // out past the walls
        inArcs++;
        if (Math.abs(r.area.y - (b.floorY + 0.02)) > 0.05 && r.area.tag !== 'furniture') inBad++;
      }
    }
    check(`${b.name}: arcs around the room land on its floor`, inBad === 0, `${inBad}/${inArcs} elsewhere`);
  }
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
