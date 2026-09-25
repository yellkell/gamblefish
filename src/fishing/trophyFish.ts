/**
 * TROPHY FISH: five extravagant species that only bite for proper tackle. Each needs levels on
 * the gear tracks (fishing/gear.ts: the tackle shop's rod, reel and line, the bait shop's bait,
 * the fortune teller's charm) and water deep enough under the bobber. Without them, they're
 * not there at all. A luck charm makes them bite more often.
 *
 *   roosterfish   a comb of long dorsal spines    live pilchards on 30 lb braid
 *   opah          round, rose-red, scarlet fins     live squid, cast past 8 m of water
 *   sailfish      a cobalt sail and a bill          big-game rod, 60 lb, live squid, 10 m
 *   swordfish     a broad sword, only at night      glow rig, 100 lb, lever drag, 12 m
 *   blue marlin   the king                          everything at the top, and a charm
 *
 * Like the timed fish (fishing/timedFish.ts): a row in Tidewater's table, and a body made
 * Tidewater's way from one of its anatomies (world/fish/FishSpecies.js), reshaped — here with a
 * bill grown on the snout and new fins. The bake registers the bodies (tools/bake-props.mjs),
 * the runtime the rows (fishing/tidewater.ts). Plain data, so Node runs this file as it is.
 */

type Curve = [number, number][];
type Fin = { from: number; to: number; rays: number; spiny: boolean; h: Curve; rake: [number, number]; notch: number };
type Anatomy = Record<string, unknown> & {
  top: Curve;
  bot: Curve;
  wid: Curve;
  mouth: { corner: number };
  eye: { u: number; r: number };
  opercle: number;
  dorsal: Fin[];
  anal: Fin[];
  pectoral: { u: number; len: number };
  pelvic: { u: number; len: number };
  caudal: Record<string, unknown>;
  finlets?: { from: number; to: number };
};

const spiny = (from: number, to: number, rays: number, h: Curve, rake: [number, number], notch = 0.16): Fin => ({ from, to, rays, spiny: true, h, rake, notch });
const soft = (from: number, to: number, rays: number, h: Curve, rake: [number, number], notch = 0.015): Fin => ({ from, to, rays, spiny: false, h, rake, notch });

/** the gear levels a trophy needs (fishing/gear.ts track → level index) */
export type Needs = Partial<Record<'rod' | 'reel' | 'line' | 'bait' | 'charm', number>>;

interface TrophyFish {
  row: {
    name: string;
    sci: string;
    lw: [number, number];
    habitat: Record<string, number>;
    kg: [number, number];
    price: number;
    fight: number;
    stamina: number;
    rarity: number;
  };
  needs: Needs;
  /** metres of water under the bobber */
  minDepth: number;
  /** when it bites (hours, wrapping past midnight), if only some of the time */
  hours?: [number, number];
  /** said on the catch card */
  when: string;
  body: {
    base: string;
    deep?: number;
    wide?: number;
    eye?: number;
    metal?: number;
    iris?: number;
    /** a bill: this fraction of the length, grown in front of the snout */
    bill?: number;
    /** the bill's half-thickness at its base (a sword is broad and flat) */
    billW?: number;
    /** its own fins (after the bill, in the new body's u) */
    fins?: (S: Anatomy) => void;
  };
  skin: { back: number; flank: number; belly: number; fin: number; edge: number; rough: number };
}

export const TROPHY: Record<string, TrophyFish> = {
  roosterfish: {
    row: { name: 'Roosterfish', sci: 'Nematistius pectoralis', lw: [0.0158, 3.0], habitat: { shallows: 0.5, bay: 1, pier: 0.4 }, kg: [4, 22], price: 26, fight: 0.8, stamina: 14, rarity: 0.3 },
    needs: { bait: 1, line: 2 },
    minDepth: 2.5,
    when: 'takes live bait, on 30 lb braid',
    body: {
      base: 'jack',
      deep: 1.05,
      metal: 0.55,
      // the comb: seven long spines, far taller than the fish is deep
      fins: (S) => {
        S.dorsal = [spiny(0.3, 0.45, 7, [[0, 0.3], [0.2, 0.34], [0.55, 0.28], [0.85, 0.2], [1, 0.1]], [0.12, 0.32], 0.55), S.dorsal[1]];
      },
    },
    skin: { back: 0x44525c, flank: 0xc4cacc, belly: 0xf2f2ee, fin: 0x1a1e24, edge: 0x6a7278, rough: 0.28 },
  },
  opah: {
    row: { name: 'Opah', sci: 'Lampris guttatus', lw: [0.0321, 2.95], habitat: { bay: 1, deep: 1 }, kg: [8, 40], price: 30, fight: 0.6, stamina: 13, rarity: 0.25 },
    needs: { bait: 2, rod: 2 },
    minDepth: 8,
    when: 'takes live squid, out past 8 m of water',
    body: {
      base: 'jack',
      deep: 1.75,
      wide: 1.15,
      eye: 1.25,
      metal: 0.75,
      iris: 0xf0c040,
      fins: (S) => {
        S.dorsal = [soft(0.3, 0.8, 40, [[0, 0.24], [0.12, 0.2], [0.35, 0.06], [1, 0.03]], [0.25, 0.9])];
        S.pectoral = { ...S.pectoral, len: 0.24 };
        S.pelvic = { ...S.pelvic, len: 0.16 };
      },
    },
    skin: { back: 0x6a2e62, flank: 0xe07470, belly: 0xf4c4b4, fin: 0xe01c24, edge: 0xff5038, rough: 0.26 },
  },
  sailfish: {
    row: { name: 'Sailfish', sci: 'Istiophorus platypterus', lw: [0.0011, 3.1], habitat: { bay: 1, deep: 1 }, kg: [15, 45], price: 34, fight: 0.9, stamina: 16, rarity: 0.2 },
    needs: { rod: 3, line: 3, bait: 2 },
    minDepth: 10,
    when: 'big-game rod, 60 lb braid, live squid — past the drop-off',
    body: {
      base: 'tuna',
      deep: 0.72,
      wide: 0.75,
      bill: 0.2,
      metal: 0.5,
      iris: 0x303a50,
      // the sail: from behind the head nearly to the tail, taller than the body is deep
      fins: (S) => {
        S.dorsal = [soft(0.3, 0.8, 44, [[0, 0.12], [0.1, 0.2], [0.35, 0.22], [0.7, 0.16], [0.92, 0.07], [1, 0.03]], [0.15, 0.6])];
        S.pelvic = { ...S.pelvic, len: 0.2 };
        S.finlets = undefined;
      },
    },
    skin: { back: 0x14245e, flank: 0x3a5aa8, belly: 0xe6eaf0, fin: 0x1a3aa0, edge: 0x5ab8ff, rough: 0.26 },
  },
  swordfish: {
    row: { name: 'Swordfish', sci: 'Xiphias gladius', lw: [0.0021, 3.1], habitat: { bay: 0.8, deep: 1 }, kg: [30, 100], price: 36, fight: 0.95, stamina: 20, rarity: 0.2 },
    needs: { bait: 3, line: 4, reel: 3 },
    minDepth: 12,
    hours: [20, 5],
    when: 'only at night: glow rig, 100 lb braid, lever drag, 12 m down',
    body: {
      base: 'tuna',
      deep: 0.95,
      bill: 0.32,
      billW: 0.014,
      metal: 0.4,
      iris: 0x283040,
      fins: (S) => {
        S.dorsal = [soft(0.38, 0.47, 16, [[0, 0.17], [0.3, 0.15], [0.7, 0.06], [1, 0.02]], [0.35, 0.9])];
        S.pelvic = { ...S.pelvic, len: 0.001 };
        S.finlets = undefined;
      },
    },
    skin: { back: 0x2a1e30, flank: 0x6a5a6e, belly: 0xcfc6c4, fin: 0x2a2030, edge: 0x4a3a52, rough: 0.3 },
  },
  marlin: {
    row: { name: 'Blue marlin', sci: 'Makaira nigricans', lw: [0.0021, 3.1], habitat: { bay: 0.6, deep: 1 }, kg: [45, 130], price: 42, fight: 1, stamina: 24, rarity: 0.12 },
    needs: { rod: 3, reel: 3, line: 4, bait: 3, charm: 1 },
    minDepth: 13,
    when: 'the king: the best of everything, and a little luck',
    body: {
      base: 'tuna',
      deep: 1.0,
      bill: 0.18,
      metal: 0.55,
      iris: 0x202838,
      fins: (S) => {
        S.dorsal = [soft(0.32, 0.78, 40, [[0, 0.17], [0.1, 0.15], [0.3, 0.05], [0.9, 0.035], [1, 0.03]], [0.25, 0.8])];
        S.anal = [soft(0.62, 0.74, 14, [[0, 0.09], [0.4, 0.04], [1, 0.02]], [0.4, 0.9])];
        S.pelvic = { ...S.pelvic, len: 0.12 };
        S.finlets = undefined;
      },
    },
    skin: { back: 0x0c1a44, flank: 0x2e64b0, belly: 0xeef2f6, fin: 0x10306e, edge: 0x3aa0ff, rough: 0.26 },
  },
};

/** Is hour h inside [from, to), wrapping past midnight when from > to? */
function within(h: number, [from, to]: [number, number]): boolean {
  return from <= to ? h >= from && h < to : h >= from || h < to;
}

/** Where the bobber is and what's on the rod, for the trophy fish. */
export interface Rig {
  /** metres of water under the bobber */
  depth: number;
  /** the gear levels (GameState.upgrades) */
  gear: Record<string, number>;
}

/** Does the rig have everything this trophy needs? The first thing missing, or null. */
export function missing(id: string, gear: Record<string, number>): string | null {
  const t = TROPHY[id];
  if (!t) return null;
  for (const [k, n] of Object.entries(t.needs)) if ((gear[k] | 0) < (n ?? 0)) return k;
  return null;
}

/**
 * How much more (or less) likely this fish is to bite here, now, on this rig: 1 for any fish
 * that isn't a trophy; for a trophy 0 without its gear, its depth or its hours, else the charm's
 * luck. No rig, no trophies.
 */
export function trophyOdds(id: string, hour: number, rig: Rig | undefined, luck = 1): number {
  const t = TROPHY[id];
  if (!t) return 1;
  if (!rig || missing(id, rig.gear) || rig.depth < t.minDepth) return 0;
  if (t.hours && !within(((hour % 24) + 24) % 24, t.hours)) return 0;
  return luck;
}

/** Add the trophies to Tidewater's table (both the fish object and the id list). Idempotent. */
export function registerTrophyFish(fish: Record<string, unknown>, ids: string[]): void {
  for (const [id, t] of Object.entries(TROPHY)) {
    if (fish[id]) continue;
    fish[id] = { ...t.row, model: id, time: 'any' };
    ids.push(id);
  }
}

const scale = (c: Curve, k: number): Curve => c.map(([u, v]) => [u, v * k]);

/** Grow a bill of `b` (fraction of the length) on the snout: the body's u squeezed in behind it. */
function withBill(S: Anatomy, b: number, w: number): void {
  const m = (u: number): number => b + u * (1 - b);
  const bill = (c: Curve, k: number): Curve => [[0, 0.0012], [b * 0.5, w * 0.45 * k], [b * 0.92, w * k], ...c.map(([u, v]) => [m(u), Math.max(v, w * k)] as [number, number])];
  S.top = bill(S.top, 0.8);
  S.bot = bill(S.bot, 0.8);
  S.wid = bill(S.wid, 1);
  S.mouth = { ...S.mouth, corner: m(S.mouth.corner) };
  S.eye = { ...S.eye, u: m(S.eye.u) };
  S.opercle = m(S.opercle);
  S.dorsal = S.dorsal.map((f) => ({ ...f, from: m(f.from), to: m(f.to) }));
  S.anal = S.anal.map((f) => ({ ...f, from: m(f.from), to: m(f.to) }));
  S.pectoral = { ...S.pectoral, u: m(S.pectoral.u) };
  S.pelvic = { ...S.pelvic, u: m(S.pelvic.u) };
  if (S.finlets) S.finlets = { ...S.finlets, from: m(S.finlets.from), to: m(S.finlets.to) };
}

/** Their anatomies and skins, next to Tidewater's (for the bake). Idempotent. */
export function registerTrophyModels(species: Record<string, Record<string, unknown>>, skin: Record<string, unknown>): void {
  for (const [id, t] of Object.entries(TROPHY)) {
    if (species[id]) continue;
    const S = JSON.parse(JSON.stringify(species[t.body.base])) as Anatomy;
    const b = t.body;
    if (b.deep) ((S.top = scale(S.top, b.deep)), (S.bot = scale(S.bot, b.deep)));
    if (b.wide) S.wid = scale(S.wid, b.wide);
    if (b.bill) withBill(S, b.bill, b.billW ?? 0.005);
    if (b.eye) S.eye.r *= b.eye;
    if (b.metal !== undefined) S.metal = b.metal;
    if (b.iris !== undefined) S.iris = b.iris;
    b.fins?.(S);
    species[id] = S;
    skin[id] = t.skin;
  }
}
