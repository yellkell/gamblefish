/**
 * Roulette's rules — European, single zero (37 pockets) — as pure functions, so
 * tools/casino-check.mjs runs the same code the table does.
 *
 *   straight (any number, 0 included)      35 : 1
 *   red / black, odd / even, 1–18 / 19–36    1 : 1
 *   dozens, columns                          2 : 1
 *
 * Zero is green: every outside bet loses on it (How to Fish's "green" is the long shot).
 */

export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type Colour = 'red' | 'black' | 'green';
export const colourOf = (n: number): Colour => (n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black');

/** A bet spot: 'n0'..'n36', 'red', 'black', 'odd', 'even', 'low', 'high', 'dozen1'..3, 'col1'..3. */
export type Spot = string;

export function wins(spot: Spot, n: number): boolean {
  if (spot.startsWith('n')) return Number(spot.slice(1)) === n;
  if (n === 0) return false;
  switch (spot) {
    case 'red':
      return REDS.has(n);
    case 'black':
      return !REDS.has(n);
    case 'odd':
      return n % 2 === 1;
    case 'even':
      return n % 2 === 0;
    case 'low':
      return n <= 18;
    case 'high':
      return n >= 19;
    case 'dozen1':
    case 'dozen2':
    case 'dozen3':
      return Math.ceil(n / 12) === Number(spot.slice(5));
    case 'col1':
    case 'col2':
    case 'col3':
      return ((n - 1) % 3) + 1 === Number(spot.slice(3));
  }
  return false;
}

/** Winnings per unit staked (not counting the stake back). */
export function odds(spot: Spot): number {
  if (spot.startsWith('n')) return 35;
  if (spot.startsWith('dozen') || spot.startsWith('col')) return 2;
  return 1;
}

/** Settle a table of bets on number n: what comes back to the player (stakes on winners + wins). */
export function settle(bets: Map<Spot, number>, n: number): { returned: number; won: number; winners: Spot[] } {
  let returned = 0;
  let won = 0;
  const winners: Spot[] = [];
  for (const [spot, amount] of bets) {
    if (!wins(spot, n)) continue;
    winners.push(spot);
    returned += amount * (odds(spot) + 1);
    won += amount * odds(spot);
  }
  return { returned, won, winners };
}

/** A fair spin: a pocket index on the wheel (crypto RNG where there is one). */
export function spin(rng: () => number = fairRandom): number {
  return Math.floor(rng() * WHEEL.length) % WHEEL.length;
}

export function fairRandom(): number {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) {
    const a = new Uint32Array(1);
    c.getRandomValues(a);
    return a[0] / 4294967296;
  }
  return Math.random();
}
