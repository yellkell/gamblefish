/**
 * The gear the village sells, on Tidewater's own upgrade tracks (game/Gear.js). Tidewater's rod,
 * reel and line each get one more level at the top — the big-game tackle the trophy fish need
 * (fishing/trophyFish.ts) — and three tracks join them:
 *
 *   hooks   the TACKLE SHOP: a sharper hook holds on longer when a fish takes it, so the
 *           window to strike is longer.
 *   bait    the BAIT SHOP: what's on the hook. Better bait brings the bites quicker, and the
 *           trophy fish won't look at frozen shrimp. The cheapest step up is goop bait: a
 *           Goopliath no bigger than your thumb (village/wares/goop.ts), off FIRE FIGHT 2.
 *   charm   the ISLAND ENGINEER: gadgets that bring the big ones in (a rattle, a lure light,
 *           a flasher, a sea-caller). A gadget makes the trophy fish bite more often. (The track
 *           is still `charm` in the save, and its stat still `luck`.)
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
  hooks: {
    name: 'Hooks',
    levels: [
      { cost: 0, label: 'Rusty J-hooks', strikeMul: 1 },
      { cost: 120, label: 'Sharpened hooks', strikeMul: 1.25 },
      { cost: 380, label: 'Forged circle hooks', strikeMul: 1.5 },
      { cost: 950, label: 'Big-game circle hooks', strikeMul: 1.8 },
    ],
  },
  bait: {
    name: 'Bait',
    levels: [
      { cost: 0, label: 'Frozen shrimp', baitTier: 0, biteMul: 1 },
      // cheap, and the fish will have a go at it; the trophy fish won't
      { cost: 25, label: 'Goop bait', baitTier: 0, biteMul: 0.93 },
      { cost: 150, label: 'Live pilchards', baitTier: 1, biteMul: 0.85 },
      { cost: 450, label: 'Live squid', baitTier: 2, biteMul: 0.72 },
      { cost: 1100, label: 'Glow-lit squid rig', baitTier: 3, biteMul: 0.6 },
      { cost: 2400, label: 'Live bonito', baitTier: 4, biteMul: 0.5 },
    ],
  },
  charm: {
    name: 'Gadget',
    levels: [
      { cost: 0, label: 'No gadget', luck: 1 },
      { cost: 300, label: 'Brass line rattle', luck: 1.6 },
      { cost: 900, label: 'Deep-drop lure light', luck: 2.4 },
      { cost: 2500, label: 'Clockwork flasher', luck: 3.5 },
      { cost: 6000, label: 'Sonic sea-caller', luck: 5 },
    ],
  },
};

/** a fraction as a whole percentage */
const pct = (x: number): string => `${Math.round(x * 100)}%`;

/**
 * What a level does for you, in plain numbers, for the shop boards: the stat it sets, and (for one
 * you haven't got) how that compares with what you have now.
 */
export function gearEffect(levels: Level[], track: string, level: number, have: number): string {
  const lv = levels[level] as Record<string, number>;
  const cur = levels[Math.min(have, levels.length - 1)] as Record<string, number>;
  const up = level > have;
  switch (track) {
    case 'rod':
      return up ? `Casts ${lv.castM - cur.castM} m further (${lv.castM} m)` : `Casts ${lv.castM} m`;
    case 'reel':
      return up ? `Reels in ${pct(lv.reelSpeed / cur.reelSpeed - 1)} faster (${lv.reelSpeed} m/s)` : `Reels in ${lv.reelSpeed} m/s`;
    case 'line':
      return up ? `Line strength ${lv.lineKg} kg, up from ${cur.lineKg}` : `Line strength ${lv.lineKg} kg`;
    case 'hooks':
      return level === 0 ? 'The usual time to strike' : `${pct(lv.strikeMul - 1)} longer to strike after a bite`;
    case 'bait':
      return level === 0 ? 'Bites at the usual pace' : `Bites come ${pct(1 - lv.biteMul)} sooner` + (up && have > 0 ? ` (yours ${pct(1 - cur.biteMul)})` : '');
    case 'charm':
      return level === 0 ? 'No effect' : `Trophy fish bite ${lv.luck}× as often` + (up && have > 0 ? ` (yours ${cur.luck}×)` : '');
    default:
      return '';
  }
}

/**
 * Goop bait went in as the bait track's second level, so a save from before it (which has no
 * `baitGoop` mark) has every bait bought above shrimp one level lower than it is now: this is
 * how many to add.
 */
export const baitShift = (d: { baitGoop?: unknown; upgrades?: { bait?: unknown } }): number => (d.baitGoop !== true && Number(d.upgrades?.bait) >= 1 ? 1 : 0);

/**
 * The level of a track you're showing: the one you picked (`looks`: the rod and reel on the
 * tackle shop's rack board, the bait at the bait shop) if you still have it, else your best. Only the look: what the
 * gear does always goes by your best.
 */
export const shownLevel = (upgrades: Record<string, number>, looks: Record<string, number> | undefined, track: string): number => {
  const best = upgrades[track] | 0;
  const look = looks?.[track];
  return look !== undefined && Number.isInteger(look) && look >= 0 && look <= best ? look : best;
};

/** The tracks whose look you can pick, and where (village/gearShop.ts). */
export const LOOK_TRACKS = ['rod', 'reel', 'bait'];

/** Which tracks each village shop sells (village/gearShop.ts). */
export const GEAR_SHOPS: Record<string, string[]> = {
  S3: ['rod', 'reel', 'line', 'hooks'],
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
