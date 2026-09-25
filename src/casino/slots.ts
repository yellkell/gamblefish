/**
 * The slot machines' rules — three reels, one payline across the middle — as pure functions, so
 * tools/casino-check.mjs can enumerate every stop and prove the return.
 *
 * Honest reels: each reel stops on any of its 24 positions with equal chance (crypto RNG), and
 * what the window shows is exactly those stops. There's no weighting behind the art and no
 * steered near-misses. The house edge comes from the paytable alone, about 5% (RTP ≈ 94.9%).
 *
 *   3 × CHEST   300      3 × HOOK     12
 *   3 × MARLIN   64      3 × SHELL     8
 *   3 × ANCHOR   25      3 × WORM      5
 *   WORM WORM –   3      WORM – –      1   (from the left)
 */

export const SYMBOLS = ['worm', 'shell', 'hook', 'anchor', 'marlin', 'chest'] as const;
export type Symbol = (typeof SYMBOLS)[number];

/** Three strips, 24 stops each: 6 worms, 5 shells, 4 hooks, 4 anchors, 3 marlins, 2 chests. */
export const REELS: Symbol[][] = [
  ['worm', 'shell', 'hook', 'worm', 'anchor', 'marlin', 'worm', 'shell', 'chest', 'hook', 'worm', 'anchor', 'shell', 'marlin', 'worm', 'hook', 'shell', 'anchor', 'chest', 'worm', 'hook', 'shell', 'marlin', 'anchor'],
  ['shell', 'worm', 'anchor', 'hook', 'worm', 'marlin', 'shell', 'chest', 'worm', 'hook', 'anchor', 'shell', 'worm', 'marlin', 'hook', 'worm', 'anchor', 'shell', 'chest', 'hook', 'worm', 'marlin', 'shell', 'anchor'],
  ['hook', 'worm', 'shell', 'anchor', 'marlin', 'worm', 'chest', 'shell', 'hook', 'worm', 'anchor', 'marlin', 'shell', 'worm', 'hook', 'chest', 'anchor', 'worm', 'shell', 'hook', 'marlin', 'worm', 'anchor', 'shell'],
];
export const STOPS = 24;

/** Three of a kind pays these multiples of the bet. */
export const THREE: Record<Symbol, number> = { worm: 5, shell: 8, hook: 12, anchor: 25, marlin: 64, chest: 300 };
export const TWO_WORMS = 3;
export const ONE_WORM = 1;

/** The payline's three symbols for these stops. */
export function line(stops: number[]): Symbol[] {
  return stops.map((s, r) => REELS[r][((s % STOPS) + STOPS) % STOPS]);
}

/** What a line pays, as a multiple of the bet (0 = nothing), and which reels made it. */
export function pays(symbols: Symbol[]): { mult: number; reels: number } {
  const [a, b, c] = symbols;
  if (a === b && b === c) return { mult: THREE[a], reels: 3 };
  if (a === 'worm' && b === 'worm') return { mult: TWO_WORMS, reels: 2 };
  if (a === 'worm') return { mult: ONE_WORM, reels: 1 };
  return { mult: 0, reels: 0 };
}

/** A fair pull: one stop per reel (crypto RNG where there is one). */
export function pull(rng: () => number = fairRandom): number[] {
  return REELS.map(() => Math.floor(rng() * STOPS) % STOPS);
}

function fairRandom(): number {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) {
    const a = new Uint32Array(1);
    c.getRandomValues(a);
    return a[0] / 4294967296;
  }
  return Math.random();
}
