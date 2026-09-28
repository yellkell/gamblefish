/**
 * THE ISLAND'S GEMS, as plain data (no three.js, no DOM), so tools/mining-check.mjs runs the same
 * code the headset does.
 *
 * Big rocks stand out in the wilds (mining/sites.ts). Break one with the Jeweller's pickaxe and
 * what's inside depends on the ground it stands on, the way real stones do:
 *
 *   THE SHORE       peridot, olivine washed out of old lava (it turns whole beaches green), and
 *                   aquamarine, the sea's own colour
 *   THE FOREST      tourmaline, pink at the heart and green at the rind, and emerald
 *   THE HIGH GROUND amethyst out of the geodes in the basalt, and opal, with fire inside it
 *   THE PEAKS       sapphire and ruby: corundum, up where the island's oldest rock is
 *
 * The common one of each pair is most of what a rock holds; the rare one turns up now and then.
 * Each stone comes out cut (the rock gives you its best side) and weighs so many carats; the
 * Jeweller's second window buys them by the carat. Everything you've found is written up in the
 * field guide's gem pages (backpack/fieldGuide.ts), which appear once the pickaxe is yours.
 */

export type Ground = 'shore' | 'forest' | 'high' | 'peak';

/** how a stone is cut (mining/gemMesh.ts builds each) */
export type Cut = 'oval' | 'pear' | 'emerald' | 'baguette' | 'trillion' | 'cabochon' | 'cushion' | 'heart';

/** how its light behaves: a clear faceted stone, an opal's play of colour, or a watermelon's zones */
export type Optic = 'facet' | 'opal' | 'watermelon';

export interface GemInfo {
  name: string;
  /** the mineral, as the book gives it */
  mineral: string;
  cut: Cut;
  optic: Optic;
  /** its colour (sRGB): the body, and a second (the opal's fire base, the watermelon's rind) */
  colour: string;
  colour2?: string;
  /** refractive index and how much it splits light into colours (its fire) */
  ior: number;
  fire: number;
  where: Ground;
  /** how often it's the one you find, against the other of its ground */
  rarity: number;
  /** carats: the smallest and the biggest a rock gives */
  ct: [number, number];
  /** what the Jeweller pays a carat */
  perCt: number;
  /** one true thing about it */
  fact: string;
}

/**
 * Each ground: its name, where its rocks are (the book's "Found in" line), and the signs to look
 * for, the book's hint for a gem you haven't found yet (the conditions, never the gem).
 */
export const GROUNDS: Record<Ground, { name: string; where: string; signs: string }> = {
  shore: { name: 'THE SHORE', where: 'big rocks on the far shores', signs: 'Down on the sand within sound of the surf, far from the village, salt dried white on the stone.' },
  forest: { name: 'THE FOREST', where: 'big rocks deep in the forest', signs: 'In the shade under the trees, 10 to 45 m up, where moss has crept over the stone.' },
  high: { name: 'THE HIGH GROUND', where: 'big rocks on the high ground', signs: 'Out on the bare shoulders of the hills, 55 to 90 m up, in dark basalt spotted with rusty lichen.' },
  peak: { name: 'THE PEAKS', where: 'big rocks up on the peaks', signs: 'On the island’s summits, 120 m and higher, in pale speckled granite. A long climb.' },
};

export const GEMS: Record<string, GemInfo> = {
  peridot: {
    name: 'Peridot',
    mineral: 'gem olivine · (Mg,Fe)₂SiO₄',
    cut: 'oval',
    optic: 'facet',
    colour: '#9fdc2a',
    ior: 1.67,
    fire: 0.5,
    where: 'shore',
    rarity: 1,
    ct: [0.8, 6],
    perCt: 14,
    fact: 'Olivine from lava turns a few beaches green, like Papakōlea in Hawaii. Peridot has even been found inside meteorites.',
  },
  aquamarine: {
    name: 'Aquamarine',
    mineral: 'blue beryl · Be₃Al₂Si₆O₁₈',
    cut: 'pear',
    optic: 'facet',
    colour: '#6fd2ee',
    ior: 1.58,
    fire: 0.45,
    where: 'shore',
    rarity: 0.32,
    ct: [1, 8],
    perCt: 28,
    fact: 'Its name is Latin for “water of the sea”. Sailors carried it as a charm against storms and seasickness.',
  },
  tourmaline: {
    name: 'Watermelon tourmaline',
    mineral: 'elbaite · a borosilicate',
    cut: 'baguette',
    optic: 'watermelon',
    colour: '#ff4f86',
    colour2: '#2fbf5a',
    ior: 1.63,
    fire: 0.35,
    where: 'forest',
    rarity: 1,
    ct: [1, 7],
    perCt: 20,
    fact: 'Warm a tourmaline and its ends take opposite electric charges. Dutch traders used it to pull ash out of their pipes.',
  },
  emerald: {
    name: 'Emerald',
    mineral: 'green beryl · Be₃Al₂Si₆O₁₈',
    cut: 'emerald',
    optic: 'facet',
    colour: '#0fb866',
    ior: 1.58,
    fire: 0.3,
    where: 'forest',
    rarity: 0.3,
    ct: [0.6, 5],
    perCt: 75,
    fact: 'Almost every emerald has tiny flaws inside. Jewellers call them its jardin: its garden.',
  },
  amethyst: {
    name: 'Amethyst',
    mineral: 'purple quartz · SiO₂',
    cut: 'trillion',
    optic: 'facet',
    colour: '#a347ff',
    ior: 1.55,
    fire: 0.45,
    where: 'high',
    rarity: 1,
    ct: [2, 12],
    perCt: 9,
    fact: 'The ancient Greeks thought it kept you sober: its name means “not drunk”. Heat one and it turns golden, as citrine.',
  },
  opal: {
    name: 'Black opal',
    mineral: 'hydrated silica · SiO₂·nH₂O',
    cut: 'cabochon',
    optic: 'opal',
    colour: '#0a1430',
    colour2: '#3ff0c8',
    ior: 1.45,
    fire: 1,
    where: 'high',
    rarity: 0.3,
    ct: [1, 6],
    perCt: 60,
    fact: 'Its colours come from tiny spheres of silica stacked like oranges in a crate, splitting the light. It is part water.',
  },
  sapphire: {
    name: 'Sapphire',
    mineral: 'corundum · Al₂O₃',
    cut: 'cushion',
    optic: 'facet',
    colour: '#2552ff',
    ior: 1.77,
    fire: 0.4,
    where: 'peak',
    rarity: 1,
    ct: [0.8, 6],
    perCt: 55,
    fact: 'Sapphire comes in every colour but one: a red sapphire is called a ruby. Both are corundum, second only to diamond in hardness.',
  },
  ruby: {
    name: 'Ruby',
    mineral: 'red corundum · Al₂O₃ + Cr',
    cut: 'heart',
    optic: 'facet',
    colour: '#ff1040',
    ior: 1.77,
    fire: 0.45,
    where: 'peak',
    rarity: 0.28,
    ct: [0.6, 5],
    perCt: 110,
    fact: 'Many rubies glow red under ultraviolet light, even in sunshine, thanks to the chromium that colours them.',
  },
};

export const GEM_IDS = Object.keys(GEMS);
export const GROUND_IDS = Object.keys(GROUNDS) as Ground[];

/** A stone you've got: which gem, how many carats, and what it's worth. */
export interface Gem {
  id: string;
  ct: number;
  value: number;
}

/** A stone lying in a broken rock's tray, in its slot. */
export interface RockGem extends Gem {
  c: number;
  r: number;
}

/** the tray a broken rock opens into (cols × rows) */
export const ROCK_GRID: [number, number] = [5, 3];
/** how many stones a rock holds */
export const ROCK_GEMS: [number, number] = [3, 5];

/** What a stone of `ct` carats is worth: bigger stones fetch more a carat. */
export function gemValue(id: string, ct: number): number {
  const g = GEMS[id];
  return Math.max(1, Math.round(g.perCt * ct * (1 + 0.12 * ct)));
}

/** The gems a ground gives. */
export function gemsOf(ground: Ground): string[] {
  return GEM_IDS.filter((id) => GEMS[id].where === ground);
}

/** One stone from `ground`: which (weighted by rarity) and how big (most are small). */
export function rollGem(ground: Ground, r: () => number): Gem {
  const ids = gemsOf(ground);
  const w = ids.map((id) => GEMS[id].rarity);
  let t = r() * w.reduce((a, b) => a + b, 0);
  let id = ids[0];
  for (let i = 0; i < ids.length; i++) if ((t -= w[i]) <= 0) {
    id = ids[i];
    break;
  }
  const [lo, hi] = GEMS[id].ct;
  const ct = Math.round((lo + (hi - lo) * Math.pow(r(), 2.2)) * 100) / 100;
  return { id, ct, value: gemValue(id, ct) };
}

/** What a rock on `ground` holds when it breaks: a handful of stones, each in its own slot. */
export function rockStock(ground: Ground, r: () => number): RockGem[] {
  const [C, R] = ROCK_GRID;
  const n = ROCK_GEMS[0] + Math.floor(r() * (ROCK_GEMS[1] - ROCK_GEMS[0] + 1));
  const slots: [number, number][] = [];
  for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) slots.push([x, y]);
  const out: RockGem[] = [];
  for (let i = 0; i < n; i++) {
    const [c, row] = slots.splice(Math.floor(r() * slots.length), 1)[0];
    out.push({ ...rollGem(ground, r), c, r: row });
  }
  return out;
}

/* ── the save ─────────────────────────────────────────────────────────── */

export interface GemSave {
  /** the pickaxe is yours (and the book has its gem pages) */
  pick: boolean;
  /** the stones in your pouch, for the Jeweller */
  pouch: Gem[];
  /** every kind you've found: how many, and your biggest */
  log: Record<string, { count: number; bestCt: number }>;
  /** the rocks you've broken (by site id), and the stones still lying in each: a rock breaks
   *  once, for good (none grows back), and what you leave in it waits for you */
  mined: Record<string, RockGem[]>;
}

export const freshGems = (): GemSave => ({ pick: false, pouch: [], log: {}, mined: {} });

/** Read the gems back from a save (anything malformed dropped). */
export function readGems(d: unknown): GemSave {
  const g = (d as { gems?: Partial<GemSave> } | null)?.gems;
  const out = freshGems();
  if (!g || typeof g !== 'object') return out;
  out.pick = g.pick === true;
  if (Array.isArray(g.pouch))
    out.pouch = g.pouch
      .filter((s): s is Gem => !!s && typeof s.id === 'string' && !!GEMS[s.id] && Number.isFinite(s.ct) && Number.isFinite(s.value))
      .map((s) => ({ id: s.id, ct: s.ct, value: Math.max(0, Math.round(s.value)) }));
  if (g.log && typeof g.log === 'object')
    for (const [id, e] of Object.entries(g.log)) {
      if (!GEMS[id] || !e || typeof e !== 'object') continue;
      const count = Math.max(0, Math.floor(Number(e.count) || 0));
      if (count > 0) out.log[id] = { count, bestCt: Math.max(0, Number(e.bestCt) || 0) };
    }
  if (g.mined && typeof g.mined === 'object')
    for (const [site, left] of Object.entries(g.mined)) {
      if (!Array.isArray(left)) continue;
      const [C, R] = ROCK_GRID;
      out.mined[site] = left
        .filter((s): s is RockGem => !!s && typeof s.id === 'string' && !!GEMS[s.id] && Number.isFinite(s.ct) && Number.isFinite(s.value) && Number.isInteger(s.c) && Number.isInteger(s.r) && s.c >= 0 && s.c < C && s.r >= 0 && s.r < R)
        .map((s) => ({ id: s.id, ct: s.ct, value: Math.max(0, Math.round(s.value)), c: s.c, r: s.r }));
    }
  return out;
}

/** A stone into your pouch, and into the book. */
export function pocket(save: GemSave, gem: Gem): { first: boolean; best: boolean } {
  save.pouch.push({ id: gem.id, ct: gem.ct, value: gem.value });
  const e = save.log[gem.id];
  const first = !e;
  const best = !!e && gem.ct > e.bestCt;
  save.log[gem.id] = { count: (e?.count ?? 0) + 1, bestCt: Math.max(e?.bestCt ?? 0, gem.ct) };
  return { first, best };
}

/** Sell the stones of one kind (or all of them): they leave the pouch; what they fetch. */
export function sellGems(save: GemSave, id: string | null): { count: number; total: number } {
  const sold = save.pouch.filter((g) => id === null || g.id === id);
  save.pouch = save.pouch.filter((g) => !(id === null || g.id === id));
  return { count: sold.length, total: sold.reduce((a, g) => a + g.value, 0) };
}
