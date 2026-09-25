/**
 * The gear the village sells, on Tidewater's own upgrade tracks (game/Gear.js). Tidewater's rod,
 * reel and line each get one more level at the top — the big-game tackle the trophy fish need
 * (fishing/trophyFish.ts) — and two tracks join them:
 *
 *   bait    the BAIT SHOP: what's on the hook. Better bait brings the bites quicker, and the
 *           trophy fish won't look at frozen shrimp.
 *   charm   the FORTUNE TELLER: luck. A charm makes the trophy fish bite more often.
 *
 * Everything reads through Tidewater's gearStats(state.upgrades), so buying a level is
 * state.buy(key) and the stats follow; a save from before these tracks just starts them at 0.
 * Plain data, so Node runs this file as it is (tools/fish-check.mjs).
 */

type Level = { cost: number; label: string } & Record<string, unknown>;
type Tracks = Record<string, { name: string; levels: Level[] }>;

/** one more level on top of each of Tidewater's rod-and-reel tracks */
const TOP: Record<string, Level> = {
  rod: { cost: 800, label: 'Carbon big-game rod', castM: 60 },
  reel: { cost: 900, label: 'Two-speed lever drag', reelSpeed: 3.0 },
  line: { cost: 1200, label: '100 lb big-game braid', lineKg: 90 },
};

/** the new tracks */
const NEW: Tracks = {
  bait: {
    name: 'Bait',
    levels: [
      { cost: 0, label: 'Frozen shrimp', baitTier: 0, biteMul: 1 },
      { cost: 150, label: 'Live pilchards', baitTier: 1, biteMul: 0.85 },
      { cost: 450, label: 'Live squid', baitTier: 2, biteMul: 0.72 },
      { cost: 1100, label: 'Glow-lit squid rig', baitTier: 3, biteMul: 0.6 },
    ],
  },
  charm: {
    name: 'Luck charm',
    levels: [
      { cost: 0, label: 'No charm', luck: 1 },
      { cost: 300, label: 'Shark-tooth necklace', luck: 1.6 },
      { cost: 900, label: 'Lucky black pearl', luck: 2.4 },
      { cost: 2500, label: "Mermaid's comb", luck: 3.5 },
    ],
  },
};

/** a line of patter for each level, on the shop boards */
export const GEAR_BLURB: Record<string, string[]> = {
  rod: ['bends like a willow', 'light and quick', 'reaches past the breakers', 'casts out past the drop-off'],
  reel: ['it squeaks', 'no more squeak', 'cranks like a winch', 'the one the marlin boats use'],
  line: ['snaps if you look at it', 'good for the pier', 'holds a jack', 'holds a tarpon', 'holds anything that swims'],
  bait: ['the fish are used to it', 'a jack can’t leave it alone', 'the big pelagics come up for it', 'swordfish hunt by its light'],
  charm: ['', 'the sea owes you one', 'the rare ones find you', 'the sea gives up its best'],
};

/** Which tracks each village shop sells (village/gearShop.ts). */
export const GEAR_SHOPS: Record<string, string[]> = {
  S3: ['rod', 'reel', 'line'],
  S2: ['bait'],
  N: ['charm'],
};

/** Add the levels and tracks to Tidewater's table. Idempotent. */
export function registerGear(upgrades: Tracks): void {
  for (const [k, lv] of Object.entries(TOP)) {
    const t = upgrades[k];
    if (t && !t.levels.some((l) => l.label === lv.label)) t.levels.push(lv);
  }
  for (const [k, t] of Object.entries(NEW)) if (!upgrades[k]) upgrades[k] = t;
}
