/**
 * Fish that keep their own hours. Now that the island has a day (world/sky.ts), five more
 * species join Tidewater's eighteen, and each bites ONLY in its window of the day — outside it
 * they're simply not there. All can be reached from the pier.
 *
 *   bonefish         at dawn           5:00– 7:30   the shallows
 *   queen trigger    at midday        11:00–14:00   the reef and round the pier
 *   permit           at sunset        17:30–19:30   the bay and the flats
 *   lookdown         at night         21:00– 3:00   under the pier lamps
 *   glasseye snapper after midnight    0:00– 4:00   the reef and the pier
 *
 * Each is a row in Tidewater's own fish table (game/FishTable.js format: length–weight, price
 * per kg, fight, where it lives), and a body made the way Tidewater makes its fish — one of its
 * species' anatomies (world/fish/FishSpecies.js) reshaped, in its own colours. The same list
 * registers them twice: here at runtime (fishing/tidewater.ts), and in the bake that builds
 * their meshes (tools/bake-props.mjs). Plain data, so Node runs this file as it is.
 */

type Curve = [number, number][];

interface TimedFish {
  /** the table row (Tidewater's format; `model` is the fish's own id) */
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
  /** when it bites: [from, to) hours, wrapping past midnight when from > to */
  hours: [number, number];
  /** said on the catch card */
  when: string;
  /** its body: a Tidewater species reshaped (deeper, wider, a bigger eye) */
  body: { base: string; deep?: number; wide?: number; eye?: number; metal?: number; iris?: number };
  /** its colours (FishSpecies.js SKIN: sRGB hex) */
  skin: { back: number; flank: number; belly: number; fin: number; edge: number; rough: number };
}

export const TIMED: Record<string, TimedFish> = {
  bonefish: {
    row: { name: 'Bonefish', sci: 'Albula vulpes', lw: [0.0095, 3.04], habitat: { shallows: 1, pier: 0.3 }, kg: [0.8, 4.5], price: 22, fight: 0.75, stamina: 11, rarity: 0.7 },
    hours: [5, 7.5],
    when: 'only bites at dawn',
    body: { base: 'mullet', deep: 1.08, metal: 0.65 },
    skin: { back: 0x5a6c74, flank: 0xd2dade, belly: 0xf0f2f2, fin: 0x9aa6aa, edge: 0x56646a, rough: 0.28 },
  },
  trigger: {
    row: { name: 'Queen triggerfish', sci: 'Balistes vetula', lw: [0.0288, 2.95], habitat: { reef: 0.9, pier: 0.6 }, kg: [0.5, 2.5], price: 20, fight: 0.45, stamina: 6, rarity: 0.6 },
    hours: [11, 14],
    when: 'only bites at midday',
    body: { base: 'angel', deep: 0.82, eye: 0.9 },
    skin: { back: 0x4a6a3a, flank: 0x9aa858, belly: 0xd8cc90, fin: 0x2e6ab4, edge: 0x44b4e6, rough: 0.4 },
  },
  permit: {
    row: { name: 'Permit', sci: 'Trachinotus falcatus', lw: [0.0245, 2.95], habitat: { shallows: 0.6, bay: 0.8, pier: 0.5 }, kg: [2, 14], price: 18, fight: 0.85, stamina: 14, rarity: 0.55 },
    hours: [17.5, 19.5],
    when: 'only bites at sunset',
    body: { base: 'jack', deep: 1.22, metal: 0.6 },
    skin: { back: 0x3a4a58, flank: 0xc4ccd2, belly: 0xeef0ea, fin: 0x444c54, edge: 0x2a3036, rough: 0.28 },
  },
  lookdown: {
    row: { name: 'Lookdown', sci: 'Selene vomer', lw: [0.0301, 2.9], habitat: { pier: 1, bay: 0.4 }, kg: [0.3, 1.8], price: 26, fight: 0.4, stamina: 6, rarity: 0.75 },
    hours: [21, 3],
    when: 'only bites at night, under the pier lamps',
    body: { base: 'jack', deep: 1.7, wide: 0.75, metal: 0.8, iris: 0xe0e4e8 },
    skin: { back: 0x8a9aa6, flank: 0xe2e8ec, belly: 0xf6f8f8, fin: 0xc8d0d4, edge: 0x9aa4aa, rough: 0.22 },
  },
  glasseye: {
    row: { name: 'Glasseye snapper', sci: 'Heteropriacanthus cruentatus', lw: [0.0185, 3.0], habitat: { reef: 0.8, pier: 0.7 }, kg: [0.3, 1.5], price: 30, fight: 0.4, stamina: 6, rarity: 0.7 },
    hours: [0, 4],
    when: 'only bites after midnight',
    body: { base: 'redSnapper', deep: 1.05, eye: 1.6, iris: 0xd83a2a },
    skin: { back: 0xb02a2a, flank: 0xe04c44, belly: 0xf0a494, fin: 0xd83a30, edge: 0xa82a24, rough: 0.33 },
  },
};

/** Is hour h (0..24) inside [from, to) — wrapping past midnight when from > to? */
function within(h: number, [from, to]: [number, number]): boolean {
  return from <= to ? h >= from && h < to : h >= from || h < to;
}

/** 1 when this fish bites at this hour, 0 when it's not about (any other fish: always 1). */
export function biting(id: string, hour: number): number {
  const t = TIMED[id];
  return !t || within(((hour % 24) + 24) % 24, t.hours) ? 1 : 0;
}

/** Add the timed fish to Tidewater's table (both the fish object and the id list). Idempotent. */
export function registerTimedFish(fish: Record<string, unknown>, ids: string[]): void {
  for (const [id, t] of Object.entries(TIMED)) {
    if (fish[id]) continue;
    fish[id] = { ...t.row, model: id, time: 'any' };
    ids.push(id);
  }
}

const scale = (c: Curve, k: number): Curve => c.map(([u, v]) => [u, v * k]);

/** Their anatomies and skins, next to Tidewater's (for the bake). Idempotent. */
export function registerTimedModels(species: Record<string, Record<string, unknown>>, skin: Record<string, unknown>): void {
  for (const [id, t] of Object.entries(TIMED)) {
    if (species[id]) continue;
    const S = JSON.parse(JSON.stringify(species[t.body.base])) as Record<string, unknown> & { top: Curve; bot: Curve; wid: Curve; eye: { r: number } };
    const b = t.body;
    if (b.deep) ((S.top = scale(S.top, b.deep)), (S.bot = scale(S.bot, b.deep)));
    if (b.wide) S.wid = scale(S.wid, b.wide);
    if (b.eye) S.eye.r *= b.eye;
    if (b.metal !== undefined) S.metal = b.metal;
    if (b.iris !== undefined) S.iris = b.iris;
    species[id] = S;
    skin[id] = t.skin;
  }
}
