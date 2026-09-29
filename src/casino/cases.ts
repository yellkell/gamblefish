/**
 * The case wall's rules: what's in THE LURE CASE, how rare each grade is, and the fair draw, as
 * pure functions (no three.js, no DOM), so tools/casino-check.mjs can prove the odds and the
 * return.
 *
 * Every prize is an item in one of seven grades, named and coloured the way a CS case does it.
 * The gems are only in the case once the Jeweller's pickaxe is yours (the pouch comes with it);
 * before that each grade holds just its logs and fish. Either way every grade has something in it;
 * the case returns about 91% with the gems, 94.5% without (RETURNS, which tools/casino-check.mjs
 * proves).
 *
 * The draw picks a grade by its odds, then an item in it (all equally likely), then the item's
 * size: a fish's weight, a stone's carats. What it's worth is what the island pays for it (the
 * fish stand, the Jeweller, the timber yard's $4 a log). One fish in ten comes out a tier up, a
 * Silver (worth three of its kind, as merging makes one), like a StatTrak.
 *
 * The prize is drawn FIRST (crypto RNG). The strip of cards that spins past the marker is dressed
 * round it afterwards, its other cards drawn by the same odds: the spin only shows what you got.
 */

import { fishLengthCm, fishValue, FISH } from '../fishing/tidewater.ts';
import { gemValue, GEMS } from '../mining/gems.ts';
import { TIER_VALUE } from '../camps/stock.ts';
import { fairRandom } from './roulette.ts';

export const CASE_PRICE = 50;
/** what a log is worth: the timber yard sells them at $40 for ten */
export const LOG_VALUE = 4;
/** what the case pays back on average (%), with the gems in it and without */
export const RETURNS = { gems: 90.8, noGems: 94.5 };
/** how often a fish comes out a tier up (Silver) */
export const SILVER_CHANCE = 0.1;

export type GradeId = 'consumer' | 'industrial' | 'milspec' | 'restricted' | 'classified' | 'covert' | 'rare';

export interface Grade {
  id: GradeId;
  name: string;
  /** CS's own colour for the grade */
  colour: string;
  /** chance in 10,000 */
  odds: number;
}

/** Commonest first. The odds add up to 10,000. */
export const GRADES: Grade[] = [
  { id: 'consumer', name: 'Consumer Grade', colour: '#b0c3d9', odds: 5535 },
  { id: 'industrial', name: 'Industrial Grade', colour: '#5e98d9', odds: 2600 },
  { id: 'milspec', name: 'Mil-Spec', colour: '#4b69ff', odds: 1150 },
  { id: 'restricted', name: 'Restricted', colour: '#8847ff', odds: 500 },
  { id: 'classified', name: 'Classified', colour: '#d32ce6', odds: 160 },
  { id: 'covert', name: 'Covert', colour: '#eb4b4b', odds: 45 },
  { id: 'rare', name: '★ Rare Special', colour: '#e4ae39', odds: 10 },
];

export type ItemKind = 'logs' | 'fish' | 'gem';

export interface CaseItem {
  /** the card's id (a fish's species, a gem's id, or logs and how many) */
  id: string;
  grade: GradeId;
  kind: ItemKind;
  /** the fish's species or the gem's id */
  of?: string;
  /** logs: how many */
  count?: number;
  /** a fish's weight or a stone's carats, the range it comes in (most come in small) */
  size?: [number, number];
}

const logs = (grade: GradeId, count: number): CaseItem => ({ id: `logs${count}`, grade, kind: 'logs', count });
const fish = (grade: GradeId, of: string, kg: [number, number]): CaseItem => ({ id: of, grade, kind: 'fish', of, size: kg });
const gem = (grade: GradeId, of: string, ct: [number, number]): CaseItem => ({ id: of, grade, kind: 'gem', of, size: ct });

/**
 * What's in the case: logs and small fish at the bottom, gems and the rare fish at the top. The
 * common stones (peridot, amethyst) are Mil-Spec; the rest are a grade up from where their rarity
 * alone would put them, up to the ruby beside the marlin. The case's stones are big ones, from
 * the top of what the rocks give, which keeps the case paying back about 91% with them in it.
 */
export const ITEMS: CaseItem[] = [
  logs('consumer', 6),
  fish('consumer', 'mullet', [0.8, 2.2]),
  fish('consumer', 'grunt', [0.6, 1.2]),
  fish('consumer', 'tang', [0.3, 0.6]),
  fish('consumer', 'sergeant', [0.2, 0.35]),

  logs('industrial', 15),
  fish('industrial', 'yellowtail', [0.8, 1.6]),
  fish('industrial', 'angel', [0.8, 1.6]),
  fish('industrial', 'parrot', [1.5, 4]),
  fish('industrial', 'trigger', [1, 2.5]),

  logs('milspec', 30),
  fish('milspec', 'wrasse', [2, 4]),
  fish('milspec', 'bonefish', [2, 4.5]),
  gem('milspec', 'peridot', [3.5, 6]),
  gem('milspec', 'amethyst', [7, 12]),

  fish('restricted', 'redSnapper', [4, 9]),
  fish('restricted', 'grouper', [6, 14]),
  fish('restricted', 'permit', [6, 14]),
  gem('restricted', 'tourmaline', [4, 7]),

  fish('classified', 'roosterfish', [8, 22]),
  gem('classified', 'aquamarine', [4.5, 8]),
  gem('classified', 'sapphire', [4, 6]),

  fish('covert', 'opah', [15, 40]),
  gem('covert', 'emerald', [3.5, 5]),
  gem('covert', 'opal', [4, 6]),

  fish('rare', 'marlin', [45, 130]),
  gem('rare', 'ruby', [4, 5]),
];

export const gradeOf = (id: GradeId): Grade => GRADES.find((g) => g.id === id)!;
/** What's in the case: everything, or (no pickaxe yet: `gems` false) all but the gems. */
export const contents = (gems: boolean): CaseItem[] => (gems ? ITEMS : ITEMS.filter((i) => i.kind !== 'gem'));
export const itemsOf = (id: GradeId, gems = true): CaseItem[] => contents(gems).filter((i) => i.grade === id);

/** A card's name: "6 Logs", "Blue tang", "Ruby". */
export function itemName(i: CaseItem): string {
  if (i.kind === 'logs') return `${i.count} Logs`;
  if (i.kind === 'fish') return FISH[i.of!]?.name ?? i.of!;
  return GEMS[i.of!]?.name ?? i.of!;
}

/** What came out of the case. */
export interface Prize {
  item: CaseItem;
  /** fish: kg; gem: carats */
  size: number;
  /** fish: its length (cm) */
  cm: number;
  /** fish: 0 plain, 1 Silver */
  tier: number;
  value: number;
}

/** A grade by its odds. */
export function rollGrade(r: () => number): Grade {
  let t = Math.floor(r() * 10000);
  for (const g of GRADES) if ((t -= g.odds) < 0) return g;
  return GRADES[0];
}

/** An item: a grade by its odds, then any item in it (the gems among them only if `gems`). */
export function rollItem(r: () => number, gems = true): CaseItem {
  const list = itemsOf(rollGrade(r).id, gems);
  return list[Math.min(list.length - 1, Math.floor(r() * list.length))];
}

/** How big a prize this one is, and so what it's worth. */
export function sizeUp(item: CaseItem, r: () => number): Prize {
  if (item.kind === 'logs') return { item, size: item.count!, cm: 0, tier: 0, value: item.count! * LOG_VALUE };
  const [lo, hi] = item.size!;
  // most come in toward the small end, as off the line or out of the rock
  const size = Math.round((lo + (hi - lo) * Math.pow(r(), 1.6)) * 100) / 100;
  if (item.kind === 'gem') return { item, size, cm: 0, tier: 0, value: gemValue(item.of!, size) };
  const tier = r() < SILVER_CHANCE ? 1 : 0;
  return { item, size, cm: Math.round(fishLengthCm(item.of!, size)), tier, value: Math.round(fishValue(item.of!, size) * TIER_VALUE[tier]) };
}

/** Open a case: the prize, drawn fairly (a gem only if `gems`: the pickaxe is yours). */
export function openCase(r: () => number = fairRandom, gems = true): Prize {
  return sizeUp(rollItem(r, gems), r);
}

/**
 * The strip that spins past the marker: `n` cards, the prize's item at `at`, the rest drawn by
 * the case's own odds (so the strip looks the way the case really runs).
 */
export function stripFor(prize: Prize, n: number, at: number, r: () => number = Math.random, gems = true): CaseItem[] {
  return Array.from({ length: n }, (_, k) => (k === at ? prize.item : rollItem(r, gems)));
}
