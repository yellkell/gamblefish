/**
 * THE JOURNEY: everything the island has to give, and whether you've had it all. Once you have,
 * a golden statue of the sailfish off the logo goes up on the beach (statue/statue.ts).
 *
 *  THE BOOK      every page of the field guide filled: every fish in the sea, the great white too
 *  THE DANCERS   all twelve hidden camps found (the beach party comes of that, and isn't counted)
 *  THE GEMS      every kind of stone the rocks hold, found
 *  THE SHOPS     everything the island sells that stays yours: every piece for your shack and
 *                Coral's villa, every level of rod, reel, line, hooks, bait and charm, the axe and
 *                the pickaxe (logs are firewood, not keepsakes)
 *  THE SKELTER   one full descent of the helter skelter: all three tiers, to the bottom
 *
 * Plain data over the save, so Node runs it (tools/statue-check.mjs). The shops' catalogue is
 * handed in (village/homeGoods.ts GOODS ids): that file builds the goods, and Node can't load it.
 */

import { CAMPS } from '../camps/sites.ts';
import { GEAR_SHOPS } from '../fishing/gear.ts';
import { FISH_IDS, UPGRADES, type GameState } from '../fishing/tidewater.ts';
import { GEM_IDS } from '../mining/gems.ts';

export type LegId = 'book' | 'dancers' | 'gems' | 'shops' | 'skelter';

export interface Leg {
  id: LegId;
  text: string;
  have: number;
  of: number;
}

type Save = Pick<GameState, 'log' | 'camps' | 'gems' | 'home' | 'upgrades' | 'woodworks' | 'journey'>;

/** every gear level the village's shops sell, track by track (its top level's index) */
const gearTops = (): [string, number][] =>
  Object.values(GEAR_SHOPS)
    .flat()
    .map((k) => [k, (UPGRADES[k]?.levels.length ?? 1) - 1]);

/** How far along each leg of the journey you are. */
export function journeyLegs(s: Save, goods: readonly string[]): Leg[] {
  const tops = gearTops();
  const home = new Set(s.home);
  const shops = goods.filter((id) => home.has(id)).length + tops.reduce((a, [k, top]) => a + Math.min(top, Math.max(0, s.upgrades[k] | 0)), 0) + (s.woodworks.axe ? 1 : 0) + (s.gems.pick ? 1 : 0);
  return [
    { id: 'book', text: 'Every fish in the book', have: FISH_IDS.filter((id) => (s.log[id]?.count ?? 0) > 0).length, of: FISH_IDS.length },
    { id: 'dancers', text: 'Every dance group found', have: CAMPS.filter((c) => s.camps[c.id]?.found).length, of: CAMPS.length },
    { id: 'gems', text: 'Every kind of gem found', have: GEM_IDS.filter((id) => (s.gems.log[id]?.count ?? 0) > 0).length, of: GEM_IDS.length },
    { id: 'shops', text: 'Everything in the shops bought', have: shops, of: goods.length + tops.reduce((a, [, top]) => a + top, 0) + 2 },
    { id: 'skelter', text: 'All the way down the helter skelter', have: Math.min(1, s.journey.rides), of: 1 },
  ];
}

/** Have you had everything the island has to give? */
export function journeyDone(s: Save, goods: readonly string[]): boolean {
  return journeyLegs(s, goods).every((l) => l.have >= l.of);
}
