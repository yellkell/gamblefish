/**
 * What every building in the village IS. Tidewater builds the houses; this decides who lives
 * in them. Every one is a casino game, a shop, your place, or the house of the one you're
 * trying to impress by getting rich.
 *
 * Names are Tidewater's building ids (world.json `buildings`). Change a role here and the sign
 * on the building changes with it.
 */

export type Role = 'casino' | 'shop' | 'home' | 'love' | 'outbuilding';

export interface BuildingRole {
  role: Role;
  /** the sign */
  title: string;
  sub?: string;
  /** neon colour for casinos, paint colour for boards (CSS) */
  colour: string;
  /** what's inside (for the interiors to come) */
  does: string;
  /** no sign outside (a home, or a place everyone knows) */
  sign?: false;
}

/**
 * Tidewater's houses the village does without: the bake leaves them out altogether (no house, no
 * pad, no colliders) and plants a little garden where each stood (tools/bake-world.mjs).
 */
export const DEMOLISHED: readonly string[] = ['I', 'M'];

/** The one you're trying to impress. */
export const LOVE_INTEREST = { name: 'Coral' };

export const ROLES: Record<string, BuildingRole> = {
  // ── the casinos (roulette, slots, blackjack) ──
  C: { role: 'casino', title: 'THE LUCKY LURE', sub: 'ROULETTE', colour: '#ff3fb4', does: 'roulette' },
  B: { role: 'casino', title: "REEL 'EM IN", sub: 'SLOTS', colour: '#3fd6ff', does: 'slots' },
  G: { role: 'casino', title: 'THE CARD SHARK', sub: 'BLACKJACK', colour: '#7dff5a', does: 'blackjack' },

  // ── the shops ──
  stall: { role: 'shop', title: 'FISH MARKET', sub: 'we buy your catch', colour: '#2f6fa8', does: 'sell fish' },
  S3: { role: 'shop', title: 'TACKLE SHOP', sub: 'rods · reels · line · hooks', colour: '#c23b2e', does: 'rod, reel and line upgrades (fishing/gear.ts)' },
  S2: { role: 'shop', title: 'BAIT SHOP', sub: 'live bait for bigger fish', colour: '#3f7f55', does: 'bait: what the big fish take (fishing/gear.ts)' },
  boathouse: { role: 'shop', title: 'BOATYARD', sub: 'chandlery · fuel', colour: '#2f6fa8', does: 'boat, fuel, fish finder, bigger backpack', sign: false },
  A: { role: 'shop', title: 'JEWELLER', sub: 'rings · pearls · crystal', colour: '#8a5ac2', does: "sparkle for Coral's villa (village/homeGoods.ts)" },
  D: { role: 'shop', title: 'FLORIST', sub: 'palms · orchids · ferns', colour: '#d8508a', does: 'house plants for your shack (village/homeGoods.ts)' },
  E: { role: 'shop', title: 'BOUTIQUE', sub: 'fine furnishings', colour: '#2f8a8a', does: "furnishings for Coral's villa (village/homeGoods.ts)" },
  H: { role: 'shop', title: 'ISLAND BANK', sub: 'coins sold here', colour: '#b08d4a', does: 'buy coins' },
  F: { role: 'shop', title: 'CARPENTER', sub: 'beds · tables · shelves', colour: '#6a7a3a', does: 'furniture for your shack (village/homeGoods.ts)' },
  J: { role: 'shop', title: 'PAWN SHOP', sub: 'curios & antiques', colour: '#5a5a6a', does: 'nautical curios for your shack (village/homeGoods.ts)' },
  K: { role: 'shop', title: 'TAXIDERMIST', sub: 'your catch, mounted', colour: '#6b4a32', does: 'trophy mounts' },
  N: { role: 'shop', title: 'ISLAND ENGINEER', sub: 'gadgets · repairs', colour: '#2c3a44', does: 'gadgets that bring the rare ones in (fishing/gear.ts)' },

  // ── your place, and theirs ──
  S1: { role: 'home', title: 'HOME', sub: 'sweet shack', colour: '#8c7a62', does: 'your house', sign: false },
  L: { role: 'love', title: LOVE_INTEREST.name.toUpperCase(), sub: 'Villa Mar', colour: '#e8506a', does: 'the love interest', sign: false },
  // (the four sheds, Tidewater's outhouses, are left out of the village: tools/bake-world.mjs)
};
