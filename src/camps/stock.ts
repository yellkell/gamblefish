/**
 * What's in a camp's chest: the dancers' share of the day's catch and the wood they didn't burn.
 * Pure (no three.js, no DOM), so tools/camps-check.mjs runs the same code the headset does.
 *
 *  - FISH: four to six, drawn from the waters the camp fishes (CampSite.sea) the way Tidewater
 *    picks a bite, each laid in the chest's grid like the backpack lays them (backpack/logic.ts).
 *    Only fish that would fit the smallest backpack (five cells long at most). One is the
 *    chest's prize, a tier up (the harder camps can hold a Gold); now and then another is too.
 *    A fish a tier up is worth what the merges that made it would have paid (TIER_VALUE).
 *  - LOGS: a stack for your walks (GameState.woodworks.wood).
 *
 * A hidden camp's chest is its dancers' gift to whoever finds them: filled once, the day you
 * find them, and never again. The beach party's (the ninth camp, once you've found all eight)
 * fills every day with a couple of nice fish (NICE), both a tier up or better, and a stack of
 * logs. Either
 * way stockFor is seeded by the camp and the date: the same day fills a chest the same way.
 */

import { fishLengthCm, fishValue, FISH, rollWeight, type CaughtFish } from '../fishing/tidewater.ts';
import { findSpot, MERGE_BONUS, shapeFor, bounds, type Cell, type Piece, type Rot } from '../backpack/logic.ts';
import type { CampSite } from './sites.ts';

/** the chest's grid (cols × rows) */
export const CHEST_GRID: [number, number] = [7, 4];
/** the longest fish a chest holds: the smallest backpack is 6 wide, and a fish has to go in */
export const CHEST_MAX_LEN = 5;

/** a fish's worth at each tier, over a Common one: two of the tier below merged, with its bonus */
export const TIER_VALUE = MERGE_BONUS.reduce<number[]>((acc, b, i) => (acc.push(i === 0 ? 1 : acc[i - 1] * 2 * b), acc), []);

/** The fish Tidewater's table has for the dancers to catch (no timed, trophy or shark fish). */
const CATCH = ['silverside', 'mullet', 'needlefish', 'sergeant', 'grunt', 'yellowtail', 'chromis', 'tang', 'wrasse', 'parrot', 'angel', 'jack', 'barracuda', 'grouper', 'redSnapper', 'tuna', 'mahi'];

/** the beach party's pick: the prized fish of the reef and the deep */
const NICE = ['wrasse', 'angel', 'yellowtail', 'grouper', 'redSnapper', 'tuna', 'mahi', 'barracuda'];
/** what the beach party's chest holds each day */
export const BEACH_FISH = 2;

export interface ChestFish {
  species: string;
  kg: number;
  cm: number;
  tier: number;
  value: number;
  shape: Cell[];
  x: number;
  y: number;
  rot: Rot;
}

export interface ChestStock {
  /** the day it was filled (dayNumber) */
  day: number;
  fish: ChestFish[];
  logs: number;
}

/** A camp's save entry: today's stock, and whether you've ever found the camp. */
export interface CampSave extends ChestStock {
  found: boolean;
}

/** The local calendar day (days since 1970 in the player's time zone): the chests fill at midnight. */
export function dayNumber(now = new Date()): number {
  return Math.floor((now.getTime() - now.getTimezoneOffset() * 60000) / 86400000);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** mulberry32 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A species from the camp's waters, weighted as Tidewater weights a bite (habitat × rarity). */
function pick(site: CampSite, r: () => number): string {
  const from = site.beach ? NICE : CATCH;
  const w = from.map((id) => {
    const f = FISH[id];
    if (!f) return 0;
    let hw = 0;
    for (const [k, v] of Object.entries(site.sea)) hw += (f.habitat[k as keyof typeof f.habitat] ?? 0) * (v ?? 0);
    return hw * f.rarity;
  });
  let t = r() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) if ((t -= w[i]) <= 0) return from[i];
  return from[0];
}

/** The chest at `site` on `day`: the same every time for the same day. */
export function stockFor(site: CampSite, day: number): ChestStock {
  const r = rng(hash(site.id) ^ Math.imul(day, 2654435761));
  const [C, R] = CHEST_GRID;
  const want = site.beach ? BEACH_FISH : 4 + Math.floor(r() * 3);
  const laid: Piece[] = [];
  const fish: ChestFish[] = [];
  for (let tries = 0; fish.length < want && tries < 40; tries++) {
    const species = pick(site, r);
    const kg = Math.round(rollWeight(species, r) * 100) / 100;
    const cm = Math.round(fishLengthCm(species, kg));
    const shape = shapeFor(species, cm, kg);
    if (bounds(shape).w > CHEST_MAX_LEN) continue;
    // the first is the prize, a tier up (Gold, sometimes, where the camp runs to it); the rest
    // are mostly Common
    // (the beach party's are all a tier up: nice fish)
    const tier = fish.length === 0 || site.beach ? (site.bestTier >= 2 && r() < 0.4 ? 2 : Math.min(1, site.bestTier)) : r() < 0.15 ? Math.min(1, site.bestTier) : 0;
    const piece = { id: fish.length + 1, species, kg, cm, tier, value: 0, placed: true, x: 0, y: 0, rot: 0 as Rot, shape };
    const spot = findSpot(piece, laid, C, R);
    if (!spot) continue;
    Object.assign(piece, spot);
    laid.push(piece);
    fish.push({ species, kg, cm, tier, value: Math.round(fishValue(species, kg) * TIER_VALUE[tier]), shape, x: spot.x, y: spot.y, rot: spot.rot });
  }
  const [lo, hi] = site.logs;
  return { day, fish, logs: lo + Math.floor(r() * (hi - lo + 1)) };
}

/** A chest fish as a save entry for the backpack (its id from the save's own counter). */
export function toCaught(f: ChestFish, id: number, hour: number): CaughtFish & Pick<Piece, 'tier' | 'shape' | 'placed' | 'x' | 'y' | 'rot'> {
  return { id, species: f.species, kg: f.kg, cm: f.cm, value: f.value, caughtAt: hour, record: false, tier: f.tier, shape: f.shape.map(([c, r]) => [c, r] as Cell), placed: false, x: 0, y: 0, rot: 0 };
}
