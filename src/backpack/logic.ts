/**
 * The backpack's rules — Tarkov's grid, Backpack Battles' merging — as pure functions (no
 * three.js, no DOM), so tools/backpack-check.mjs runs the same code the headset does.
 *
 *  SHAPES   A fish takes the cells its real length needs (CELL_CM per cell, up to 6: the first
 *           backpack's width, so every fish but the great white fits an empty one), in its own
 *           silhouette, column by column from the tail (BODY): a houndfish is a bar, a snapper
 *           an S, a reef fish a plus sign, a grouper a club with its big head. Fast swimmers have
 *           a forked tail with a notch in it, and the roosterfish a comb with gaps between its
 *           spines, where a one-cell fish can tuck in. Pieces turn in 90° steps.
 *  GRID     The backpack's size follows the fish-hold upgrade (Tidewater's `hold` track):
 *           6×4, then 8×5, then 10×6.
 *  MERGING  Put a fish down touching another of the same species and tier and they fuse into
 *           one of the next tier: worth more than the two apart (MERGE_BONUS), taking only the
 *           larger of their two shapes — so merging is how you make room as well as money.
 *           A merge can set off another (the new fish now touches a match of ITS tier).
 */

export type Rot = 0 | 1 | 2 | 3;
export type Cell = [number, number]; // [col, row]

export const CELL_CM = 22;
/** the longest a fish gets: the first backpack's width, so even a marlin fits an empty one */
export const MAX_LEN = 6;
export const TIERS = ['Common', 'Silver', 'Gold', 'Legendary'] as const;
/** value multiplier applied to the combined value when merging INTO tier i (index = new tier) */
export const MERGE_BONUS = [1, 1.5, 1.75, 2];
/** backpack size per `hold` upgrade level */
export const GRID_SIZES: [number, number][] = [
  [6, 4],
  [8, 5],
  [10, 6],
];

/**
 * A column of a fish's piece: which of three rows it fills (1 the belly, 2 the middle, 4 the
 * back). A piece lies with its back toward the higher rows (backpack/tray.ts slotMatrix).
 */
const MID = 0b010;
const BELLY = 0b001;
/** the middle and the belly, the middle and the back, all three */
const LOW = 0b011;
const HIGH = 0b110;
const ALL = 0b111;
/** a forked tail: the two lobes, and the notch between them */
const FORK = 0b101;

const rep = (m: number, n: number): number[] => Array.from({ length: Math.max(0, n) }, () => m);
/** a forked tail and the root of it (two columns), for the fast swimmers */
const tail = [FORK, ALL];

/**
 * Each body plan's columns, tail first, for a fish `n` cells long (one cell is one cell for
 * everyone). The tails and fins make the notches and gaps.
 */
const PLANS: Record<string, (n: number) => number[]> = {
  /** a bar: the houndfish, the silverside */
  bar: (n) => rep(MID, n),
  /** slender, with a forked tail: the mullet, the yellowtail, the bonefish, the barracuda */
  fork: (n) => (n === 2 ? [LOW, MID] : [...tail, ...rep(MID, n - 2)]),
  /** forked tail and a deep back behind the head: the jack, the tuna, the tarpon */
  deepFork: (n) => (n === 2 ? [ALL, MID] : [...tail, ...rep(HIGH, n - 3), MID]),
  /** deep, tail high and snout low, so it packs like an S: the snappers, grunts, parrotfish */
  deep: (n) => (n === 2 ? [MID, LOW] : [MID, ...rep(LOW, n - 2), BELLY]),
  /** the hogfish: an S with its long rooting snout */
  hog: (n) => (n < 4 ? PLANS.deep(n) : [MID, ...rep(LOW, n - 3), BELLY, BELLY]),
  /** the grouper: a slim tail, a heavy body and a great head, like a club */
  club: (n) => (n === 2 ? [MID, ALL] : [MID, ...rep(LOW, n - 2), ALL]),
  /** round as a coin, tail and snout a cell each: a plus sign, or a hexagon */
  disc: (n) => (n === 2 ? [MID, ALL] : [MID, ...rep(ALL, n - 2), MID]),
  /** a disc with long trailing fins (or a deep forked tail): the angelfish, the permit */
  kite: (n) => (n === 2 ? [FORK, ALL] : [FORK, ...rep(ALL, n - 2), MID]),
  /** the triggerfish: its spine up at the front */
  trigger: (n) => (n === 2 ? [MID, HIGH] : PLANS.disc(n)),
  /** the mahi: a forked tail and the bull's blunt square forehead */
  bull: (n) => (n < 4 ? PLANS.fork(n) : [...tail, ...rep(MID, n - 3), ALL]),
  /** the roosterfish: its comb of long spines, with gaps between them */
  comb: (n) => (n < 5 ? PLANS.fork(n) : [...tail, ...Array.from({ length: n - 3 }, (_, i) => (i % 2 ? HIGH : MID)), MID]),
  /** the sailfish: the sail along its back, and its bill */
  sail: (n) => (n < 5 ? PLANS.fork(n) : [...tail, MID, ...rep(HIGH, n - 4), MID]),
  /** the swordfish: a tall dorsal, and a long sword */
  sword: (n) => (n < 5 ? PLANS.fork(n) : [...tail, ...rep(MID, n - 5), HIGH, MID, MID]),
  /** the marlin: the heaviest, a dorsal just behind the head, and its spear */
  spear: (n) => (n < 5 ? PLANS.deepFork(n) : [...tail, ...rep(ALL, n - 5), HIGH, MID, MID]),
  /** the great white: its dorsal fin */
  shark: (n) => (n < 4 ? PLANS.fork(n) : [...tail, ...rep(MID, n - 4), HIGH, MID]),
};

/** each species' body plan (any other: a bar, or deep if it's heavy) */
export const BODY: Record<string, keyof typeof PLANS> = {
  silverside: 'bar',
  needlefish: 'bar',
  mullet: 'fork',
  yellowtail: 'fork',
  bonefish: 'fork',
  barracuda: 'fork',
  jack: 'deepFork',
  tuna: 'deepFork',
  tarpon: 'deepFork',
  grunt: 'deep',
  redSnapper: 'deep',
  parrot: 'deep',
  glasseye: 'deep',
  wrasse: 'hog',
  grouper: 'club',
  sergeant: 'disc',
  chromis: 'disc',
  tang: 'disc',
  lookdown: 'disc',
  opah: 'disc',
  angel: 'kite',
  permit: 'kite',
  trigger: 'trigger',
  mahi: 'bull',
  roosterfish: 'comb',
  sailfish: 'sail',
  swordfish: 'sword',
  marlin: 'spear',
  shark: 'shark',
};

/** The piece a fish of `cm` makes, at rotation 0: cells [col, row], tail at col 0. */
export function shapeFor(species: string, cm: number, kg: number): Cell[] {
  const len = Math.max(1, Math.min(MAX_LEN, Math.round(cm / CELL_CM)));
  if (len === 1) return [[0, 0]];
  const plan = PLANS[BODY[species] ?? (len >= 3 && kg >= 5 ? 'deep' : 'bar')];
  const cells: Cell[] = [];
  plan(len).forEach((m, c) => {
    for (let r = 0; r < 3; r++) if (m & (1 << r)) cells.push([c, r]);
  });
  // down to row 0 (a piece with no belly row starts on its middle one)
  const minR = Math.min(...cells.map((p) => p[1]));
  return cells.map(([c, r]) => [c, r - minR] as Cell);
}

/** Rotate a shape by `rot` quarter turns and shift it back to start at (0, 0). */
export function rotate(shape: Cell[], rot: Rot): Cell[] {
  let cells = shape.map(([c, r]) => [c, r] as Cell);
  for (let i = 0; i < rot; i++) cells = cells.map(([c, r]) => [-r, c] as Cell);
  const minC = Math.min(...cells.map((p) => p[0]));
  const minR = Math.min(...cells.map((p) => p[1]));
  return cells.map(([c, r]) => [c - minC, r - minR] as Cell);
}

export function bounds(cells: Cell[]): { w: number; h: number } {
  return { w: Math.max(...cells.map((p) => p[0])) + 1, h: Math.max(...cells.map((p) => p[1])) + 1 };
}

export interface Piece {
  id: number;
  species: string;
  kg: number;
  cm: number;
  tier: number; // 0 Common .. 3 Legendary
  value: number;
  /** placed in the grid (else it's in your hand / unplaced) */
  placed: boolean;
  x: number;
  y: number;
  rot: Rot;
  /** the shape at rot 0 (kept, so a merged fish keeps the bigger of its parents' shapes) */
  shape: Cell[];
}

/** The cells a piece covers in the grid (at its x, y, rot). */
export function cellsOf(p: Pick<Piece, 'x' | 'y' | 'rot' | 'shape'>): Cell[] {
  return rotate(p.shape, p.rot).map(([c, r]) => [c + p.x, r + p.y] as Cell);
}

/** Would `p` fit at its x, y, rot among `others` in a cols×rows grid? */
export function fits(p: Pick<Piece, 'x' | 'y' | 'rot' | 'shape' | 'id'>, others: Piece[], cols: number, rows: number): boolean {
  const taken = new Set<string>();
  for (const o of others) if (o.placed && o.id !== p.id) for (const [c, r] of cellsOf(o)) taken.add(`${c},${r}`);
  for (const [c, r] of cellsOf(p)) {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return false;
    if (taken.has(`${c},${r}`)) return false;
  }
  return true;
}

/** First spot (scanning rows, then rotations) where `p` fits, or null. */
export function findSpot(p: Piece, others: Piece[], cols: number, rows: number): { x: number; y: number; rot: Rot } | null {
  for (const rot of [p.rot, 0, 1, 2, 3] as Rot[]) {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (fits({ ...p, x, y, rot }, others, cols, rows)) return { x, y, rot };
      }
    }
  }
  return null;
}

/** Do two placed pieces share an edge? */
export function touching(a: Piece, b: Piece): boolean {
  const A = new Set(cellsOf(a).map(([c, r]) => `${c},${r}`));
  for (const [c, r] of cellsOf(b)) {
    if (A.has(`${c + 1},${r}`) || A.has(`${c - 1},${r}`) || A.has(`${c},${r + 1}`) || A.has(`${c},${r - 1}`)) return true;
  }
  return false;
}

/** Pieces that would merge with `p` where it stands: same species, same tier, touching. */
export function mergePartners(p: Piece, others: Piece[]): Piece[] {
  if (p.tier >= TIERS.length - 1) return [];
  return others.filter((o) => o.placed && o.id !== p.id && o.species === p.species && o.tier === p.tier && touching(p, o));
}

export interface MergeResult {
  piece: Piece;
  consumed: [number, number]; // the ids that fused
  gained: number; // value added by the merge
}

/**
 * Fuse `a` (just placed) with `b` (touching, same species and tier). The new fish keeps the
 * larger shape, takes a's spot if it fits there once both are lifted out (else b's, else
 * anywhere), weighs what both did and is worth their sum × the new tier's bonus.
 */
export function merge(a: Piece, b: Piece, others: Piece[], cols: number, rows: number, newId: number): MergeResult | null {
  const tier = a.tier + 1;
  const bigger = a.shape.length >= b.shape.length ? a : b;
  const rest = others.filter((o) => o.id !== a.id && o.id !== b.id);
  const base = { id: newId, species: a.species, kg: Math.round((a.kg + b.kg) * 100) / 100, cm: Math.max(a.cm, b.cm), tier, shape: bigger.shape, placed: true };
  const value = Math.round((a.value + b.value) * MERGE_BONUS[tier]);
  const tryAt = (x: number, y: number, rot: Rot): Piece | null => {
    const p = { ...base, value, x, y, rot } as Piece;
    return fits(p, rest, cols, rows) ? p : null;
  };
  const piece =
    tryAt(a.x, a.y, a.rot) ??
    tryAt(b.x, b.y, b.rot) ??
    tryAt(bigger.x, bigger.y, bigger.rot) ??
    (() => {
      const s = findSpot({ ...base, value, x: 0, y: 0, rot: 0 } as Piece, rest, cols, rows);
      return s ? ({ ...base, value, ...s } as Piece) : null;
    })();
  if (!piece) return null;
  return { piece, consumed: [a.id, b.id], gained: value - a.value - b.value };
}

/** Cells used / total. */
export function fill(pieces: Piece[], cols: number, rows: number): { used: number; total: number } {
  let used = 0;
  for (const p of pieces) if (p.placed) used += p.shape.length;
  return { used, total: cols * rows };
}
