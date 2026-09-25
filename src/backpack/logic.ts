/**
 * The backpack's rules — Tarkov's grid, Backpack Battles' merging — as pure functions (no
 * three.js, no DOM), so tools/backpack-check.mjs runs the same code the headset does.
 *
 *  SHAPES   A fish takes the cells its real length needs (CELL_CM per cell, up to 7). Slender
 *           and small fish are one cell tall; deep-bodied or heavy fish three cells long or more
 *           are two tall with a one-cell tail fin at the tail end — so a snapper packs like a
 *           Tetris piece and a houndfish like a bar. Pieces turn in 90° steps.
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
export const MAX_LEN = 7;
export const TIERS = ['Common', 'Silver', 'Gold', 'Legendary'] as const;
/** value multiplier applied to the combined value when merging INTO tier i (index = new tier) */
export const MERGE_BONUS = [1, 1.5, 1.75, 2];
/** backpack size per `hold` upgrade level */
export const GRID_SIZES: [number, number][] = [
  [6, 4],
  [8, 5],
  [10, 6],
];

/** Deep-bodied species (two cells tall from 2 cells long). */
const DEEP = new Set(['angel', 'tang', 'chromis', 'sergeant', 'grunt', 'parrot', 'grouper', 'redSnapper', 'jack', 'mahi', 'tuna', 'wrasse', 'yellowtail']);

/** The piece a fish of `cm` makes, at rotation 0: cells [col, row], tail at col 0. */
export function shapeFor(species: string, cm: number, kg: number): Cell[] {
  const len = Math.max(1, Math.min(MAX_LEN, Math.round(cm / CELL_CM)));
  // a second row only where the fish is long enough to look that deep in its slot
  const tall = len >= 3 && (DEEP.has(species) || kg >= 5);
  const cells: Cell[] = [];
  for (let c = 0; c < len; c++) {
    cells.push([c, 0]);
    // the tail fin column stays one cell; the body behind the head is two deep
    if (tall && c > 0) cells.push([c, 1]);
  }
  return cells;
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
