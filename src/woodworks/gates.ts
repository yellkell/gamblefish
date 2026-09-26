/**
 * The two walks you build off the pier head with wood (woodworks/walks.ts), as plain data: the
 * world bake (tools/bake-world.mjs) cuts their gateways in the pier head's rails, and the
 * runtime cuts the rails' colliders there and builds the walks out from them.
 *
 *   REEF WALK   from a gateway in the head's west rail, 60 m out toward the reef, to a platform
 *               over its edge (4–5 m of water all the way).
 *   DEEP WALK   from a gateway in the head's south rail, straight out past the drop-off, to a
 *               platform over 14 m of water. It opens once the reef walk is finished.
 */

export type WalkId = 'reef' | 'deep';

export interface WalkDef {
  id: WalkId;
  title: string;
  /** the gateway: where the walk leaves the pier head (world x, z), and the rail it's cut in */
  gate: { x: number; z: number; alongX: boolean; line: number; from: number; to: number };
  /** the direction it runs (unit, x z) */
  dir: [number, number];
  /** its bays (each `bay` m long), then a platform `head` w × d at the end */
  bays: number;
  bay: number;
  head: [number, number];
  /** logs per step (a bay, or a quarter of the platform) */
  cost: number;
  /** the walk that must be finished first */
  after?: WalkId;
}

const reefDir = ((): [number, number] => {
  // from the west gateway toward the middle of the reef (Tidewater's layout: reef at −78, 58)
  const dx = -78 - 48;
  const dz = 58 - 37.52;
  const l = Math.hypot(dx, dz);
  return [dx / l, dz / l];
})();

export const WALKS: WalkDef[] = [
  {
    id: 'reef',
    title: 'THE REEF WALK',
    // between the corner post and the lobster traps (Tidewater's crates stand by the other stretch)
    gate: { x: 48.0, z: 37.52, alongX: false, line: 48.3, from: 36.8, to: 38.25 },
    dir: reefDir,
    bays: 20,
    bay: 3,
    head: [6, 5],
    cost: 2,
  },
  {
    id: 'deep',
    title: 'THE DEEP WALK',
    // between the bench and the table
    gate: { x: 56.35, z: 40.0, alongX: true, line: 39.75, from: 55.35, to: 57.35 },
    dir: [0, 1],
    bays: 18,
    bay: 3,
    head: [6, 5],
    cost: 2,
    after: 'reef',
  },
];

/** steps in a walk: its bays, then the platform in four */
export const HEAD_STEPS = 4;
export const stepsOf = (w: WalkDef): number => w.bays + HEAD_STEPS;
export const logsFor = (w: WalkDef): number => stepsOf(w) * w.cost;

/** the pier deck's height (Tidewater's PIER.deckHeight) */
export const DECK = 2.3;
/** the walks' width, deck edge to deck edge */
export const WALK_W = 2.4;

/** where each walk's build crate stands on the pier head, beside its gateway (x, z) */
export const CRATES: Record<WalkId, [number, number]> = { reef: [48.95, 39.05], deep: [54.45, 39.15] };

interface Box {
  tag: string;
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  rotY: number;
}

/** The pier head's rail colliders, cut either side of the gateways (as the bake cuts the rails). */
export function cutGates<T extends Box>(boxes: T[]): T[] {
  const out: T[] = [];
  for (const b of boxes) {
    const w = WALKS.find((k) => b.tag === 'pierRail' && Math.abs(b.rotY) < 1e-3 && (k.gate.alongX ? Math.abs(b.cz - k.gate.line) < 0.3 && b.hx > b.hz : Math.abs(b.cx - k.gate.line) < 0.3 && b.hz > b.hx));
    if (!w) {
      out.push(b);
      continue;
    }
    const g = w.gate;
    const [c, h] = g.alongX ? [b.cx, b.hx] : [b.cz, b.hz];
    const a0 = c - h;
    const a1 = c + h;
    if (a1 <= g.from || a0 >= g.to) {
      out.push(b);
      continue;
    }
    for (const [p, q] of [
      [a0, g.from],
      [g.to, a1],
    ]) {
      if (q - p < 0.05) continue;
      const m = (p + q) / 2;
      out.push({ ...b, ...(g.alongX ? { cx: m, hx: (q - p) / 2 } : { cz: m, hz: (q - p) / 2 }) });
    }
  }
  return out;
}
