#!/usr/bin/env node
/**
 * THE BACKPACK — headless. Drives src/backpack/logic.ts (Node strips the types):
 * shapes from real lengths, rotation, fitting, merging and chain merges.
 *
 *   node tools/backpack-check.mjs
 */

import { shapeFor, rotate, bounds, fits, findSpot, touching, mergePartners, merge, fill, GRID_SIZES, MERGE_BONUS } from '../src/backpack/logic.ts';

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? ` — ${detail}` : ''}`);
};
const piece = (id, species, cm, kg, extra = {}) => ({ id, species, cm, kg, tier: 0, value: 10, placed: true, x: 0, y: 0, rot: 0, shape: shapeFor(species, cm, kg), ...extra });

console.log('\nshapes');
const needle = shapeFor('needlefish', 94, 1.57);
check('a 94 cm houndfish is a 4-long bar', needle.length === 4 && bounds(needle).h === 1, JSON.stringify(needle));
const snapper = shapeFor('redSnapper', 75, 5.29);
check('a 75 cm snapper is 3 long, 2 deep with a 1-cell tail', snapper.length === 5 && bounds(snapper).w === 3 && bounds(snapper).h === 2, JSON.stringify(snapper));
check('a tiny silverside is one cell', shapeFor('silverside', 12, 0.03).length === 1);
check('nothing longer than 7', shapeFor('tarpon', 250, 40).length <= 14 && bounds(shapeFor('tarpon', 250, 40)).w === 7);

console.log('\nrotation');
const r1 = rotate(needle, 1);
check('a bar turned 90° stands up', bounds(r1).w === 1 && bounds(r1).h === 4);
check('four turns come back to the start', JSON.stringify(rotate(snapper, 0)) === JSON.stringify(rotate(rotate(rotate(rotate(snapper, 1), 1), 1), 1)));
check('rotations keep the cell count', [0, 1, 2, 3].every((r) => rotate(snapper, r).length === snapper.length));

console.log('\nfitting');
const [C, R] = GRID_SIZES[0];
const a = piece(1, 'needlefish', 94, 1.5, { x: 0, y: 0 });
check('a bar fits along the top row', fits(a, [], C, R));
check('it does not fit hanging off the edge', !fits({ ...a, x: 3 }, [], C, R));
const b = piece(2, 'needlefish', 94, 1.5, { x: 0, y: 0 });
check('two pieces cannot share cells', !fits(b, [a], C, R));
const spot = findSpot({ ...b, placed: false }, [a], C, R);
check('findSpot finds the next free row', spot && spot.y === 1, JSON.stringify(spot));

console.log('\nmerging');
const m1 = piece(10, 'grunt', 40, 0.8, { x: 0, y: 0, value: 12 });
const m2 = piece(11, 'grunt', 44, 0.9, { x: 0, y: 2, value: 14 });
check('same species + tier, edge to edge: touching', touching(m1, m2));
check('…and they are merge partners', mergePartners(m2, [m1]).length === 1);
const other = piece(12, 'jack', 40, 1, { x: 0, y: 2 });
check('a different species never merges', mergePartners(other, [m1]).length === 0);
const silver = piece(13, 'grunt', 40, 0.8, { x: 0, y: 2, tier: 1 });
check('a different tier never merges', mergePartners(silver, [m1]).length === 0);
const res = merge(m2, m1, [m1, m2], C, R, 99);
check('the merge makes one Silver fish', res && res.piece.tier === 1 && res.piece.id === 99);
check(`worth the pair × ${MERGE_BONUS[1]}`, res && res.piece.value === Math.round(26 * MERGE_BONUS[1]), res?.piece.value);
check('weighing both', res && Math.abs(res.piece.kg - 1.7) < 1e-9);
check('taking only the bigger shape (frees space)', res && res.piece.shape.length === Math.max(m1.shape.length, m2.shape.length));
const before = fill([m1, m2], C, R).used;
const after = fill([res.piece], C, R).used;
check('the backpack has more room after', after < before, `${before} → ${after} cells`);

console.log('\nchain merge');
// two Silvers touching → Gold
const s1 = piece(20, 'tang', 30, 0.4, { tier: 1, value: 30, x: 0, y: 0 });
const s2 = piece(21, 'tang', 30, 0.4, { tier: 1, value: 30, x: 1, y: 0 });
check('two Silver tangs touching are partners', mergePartners(s2, [s1]).length === 1);
const g = merge(s2, s1, [s1, s2], C, R, 50);
check('…and fuse into Gold', g && g.piece.tier === 2 && g.piece.value === Math.round(60 * MERGE_BONUS[2]));
const legend = piece(30, 'tang', 30, 0.4, { tier: 3, x: 4, y: 0 });
const legend2 = piece(31, 'tang', 30, 0.4, { tier: 3, x: 4, y: 2 });
check('Legendary is the top: it never merges further', mergePartners(legend2, [legend]).length === 0);

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
