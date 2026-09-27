/**
 * Where a teleport may land on the island, and what it may not pass through:
 * the island's answer to ff2's club floor table (`TELEPORT_AREAS`,
 * `floorYAt`, `crossesWall` in `src/rave/club/config.ts`).
 *
 * The club had two kinds of thing and so does the island:
 *
 *  - FLOOR AREAS carry their own height and the rig lands at it. In the club
 *    they were hand-placed rectangles; here they're Tidewater's walkable
 *    colliders (pier deck, pier steps, boardwalks, stairs, porches, stoops —
 *    oriented boxes, so they follow the boardwalk's bends) PLUS the natural
 *    ground, which the club never had: the heightfield, and the sea over it.
 *  - WALLS a hop may not cross, each with a SILL — the height at which it
 *    stops being a wall and becomes something you're standing on top of.
 *    Tidewater's solid colliders map straight onto that: a box or post is a
 *    wall up to its top. A pier rail blocks a hop from the deck to the beach;
 *    the pier's own cross-beams, which sit under the deck, don't block a hop
 *    along it, but do block one from the sand underneath.
 *
 * Pure (no three.js): tools/teleport-check.mjs drives this same file.
 */

import type { BoxCollider, CylinderCollider } from './data.ts';
import type { Heightfield } from './heightfield.ts';
import { GROUND, TELEPORT } from '../locomotion/config.ts';

export type AreaKind = 'deck' | 'ground' | 'water';

/** A landing surface: its height, and what it is. */
export interface FloorArea {
  y: number;
  kind: AreaKind;
  /** the collider tag for decks ('pierDeck', 'boardwalk', …) */
  tag: string;
}

interface Deck {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  cos: number;
  sin: number;
  r: number;
  top: number;
  tag: string;
  /** solid from its top down into the ground (a porch, a stoop, a room's floor): nothing gets
   *  under it, so it catches an arc from below too */
  toGround: boolean;
}

interface Wall {
  /** XZ corners (boxes) — four points, closed loop */
  pts: [number, number][] | null;
  /** posts */
  x: number;
  z: number;
  r: number;
  sill: number;
  bottom: number;
  /** clutter on the ground you can teleport over, low enough (HOP_OVER) */
  over: boolean;
  /** what it is (the collider's tag) */
  tag: string;
  /** bounding circle for the cheap reject */
  bx: number;
  bz: number;
  br: number;
}

/** Tidewater tags that are walkable in its character controller but not a
 *  place to stand after a teleport. */
const NOT_A_FLOOR = new Set(['ladder']);

/** Things lying about that the teleport arcs over (up to GROUND.hopOver tall), instead of
 *  refusing the hop: boats pulled up on the sand, the wreck, crates, traps, barrels, benches,
 *  tables, log piles, bollards, a bucket, rocks, a build crate. Rails, fences, walls, counters,
 *  furniture indoors and standing trees still stop you. */
const HOP_OVER = new Set(['rowboat', 'boat', 'wreck', 'crate', 'crates', 'trap', 'traps', 'barrel', 'bench', 'table', 'woodpile', 'logPile', 'bollard', 'bucket', 'rock', 'buildCrate']);

const _n = { x: 0, y: 1, z: 0 };

export class Surfaces {
  readonly decks: Deck[] = [];
  readonly walls: Wall[] = [];
  readonly terrain: Heightfield;

  constructor(terrain: Heightfield, colliders: { boxes: BoxCollider[]; cylinders: CylinderCollider[] }) {
    this.terrain = terrain;
    for (const b of colliders.boxes) this.addBox(b);
    for (const c of colliders.cylinders) {
      this.walls.push({ pts: null, x: c.x, z: c.z, r: c.r, sill: c.top, bottom: c.bottom, over: HOP_OVER.has(c.tag), tag: c.tag, bx: c.x, bz: c.z, br: c.r });
    }
  }

  /**
   * One of Tidewater's box colliders: a walkable one becomes a floor area, a solid one a wall.
   * (Also for things that arrive later: the furniture you buy for your shack.)
   */
  addBox(b: BoxCollider): void {
    const cos = Math.cos(b.rotY);
    const sin = Math.sin(b.rotY);
    if (b.walkable) {
      if (NOT_A_FLOOR.has(b.tag)) return;
      const toGround = b.solid && b.bottom <= this.terrain.heightAt(b.cx, b.cz) + 0.05;
      const d: Deck = { cx: b.cx, cz: b.cz, hx: b.hx, hz: b.hz, cos, sin, r: Math.hypot(b.hx, b.hz), top: b.top, tag: b.tag, toGround };
      this.decks.push(d);
      this.added.set(b, d);
      this.deckGrid = null;
    } else if (b.solid) {
      // Tidewater's local frame: local = R(rotY)·(world − centre), with
      // lx = dx·cos − dz·sin, lz = dx·sin + dz·cos; invert for the corners.
      const pts: [number, number][] = [
        [-b.hx, -b.hz],
        [b.hx, -b.hz],
        [b.hx, b.hz],
        [-b.hx, b.hz],
      ].map(([lx, lz]) => [b.cx + lx * cos + lz * sin, b.cz - lx * sin + lz * cos]);
      const w: Wall = { pts, x: 0, z: 0, r: 0, sill: b.top, bottom: b.bottom, over: HOP_OVER.has(b.tag), tag: b.tag, bx: b.cx, bz: b.cz, br: Math.hypot(b.hx, b.hz) };
      this.walls.push(w);
      this.added.set(b, w);
    }
  }

  /** what each box added became, so a box that goes away again can be taken out */
  private readonly added = new Map<BoxCollider, Deck | Wall>();

  /** Take out a box added earlier (a rail across a gateway that has opened). */
  removeBox(b: BoxCollider): void {
    const o = this.added.get(b);
    if (!o) return;
    this.added.delete(b);
    const i = this.decks.indexOf(o as Deck);
    if (i >= 0) {
      this.decks.splice(i, 1);
      this.deckGrid = null;
    }
    const j = this.walls.indexOf(o as Wall);
    if (j >= 0) this.walls.splice(j, 1);
  }

  /** decks by 4 m cell (for deckOver: the grass asks thousands of times per re-grow) */
  private deckGrid: Map<number, Deck[]> | null = null;

  /**
   * The highest floor (deck, path, porch, stair, room) over (x, z), its footprint grown by
   * `margin` m — or −Infinity if there's none. The grass keeps out from under the raised paths.
   */
  deckOver(x: number, z: number, margin = 0): number {
    const C = 4;
    if (!this.deckGrid) {
      const g = new Map<number, Deck[]>();
      for (const d of this.decks) {
        const r = d.r + 1;
        for (let i = Math.floor((d.cx - r) / C); i <= Math.floor((d.cx + r) / C); i++) {
          for (let j = Math.floor((d.cz - r) / C); j <= Math.floor((d.cz + r) / C); j++) {
            const k = i * 100003 + j;
            let list = g.get(k);
            if (!list) g.set(k, (list = []));
            list.push(d);
          }
        }
      }
      this.deckGrid = g;
    }
    let top = -Infinity;
    for (const d of this.deckGrid.get(Math.floor(x / C) * 100003 + Math.floor(z / C)) ?? []) {
      const dx = x - d.cx;
      const dz = z - d.cz;
      const lx = dx * d.cos - dz * d.sin;
      const lz = dx * d.sin + dz * d.cos;
      if (Math.abs(lx) <= d.hx + margin && Math.abs(lz) <= d.hz + margin && d.top > top) top = d.top;
    }
    return top;
  }

  /** The natural surface at (x, z): the ground, or the sea over it. */
  groundAt(x: number, z: number): FloorArea {
    const h = this.terrain.heightAt(x, z);
    return h >= GROUND.waterY ? { y: h, kind: 'ground', tag: '' } : { y: GROUND.waterY, kind: 'water', tag: '' };
  }

  /** Visit every deck whose footprint contains (x, z). */
  private forDecksAt(x: number, z: number, fn: (d: Deck) => void): void {
    for (const d of this.decks) {
      const dx = x - d.cx;
      const dz = z - d.cz;
      if (Math.abs(dx) > d.r || Math.abs(dz) > d.r) continue;
      const lx = dx * d.cos - dz * d.sin;
      const lz = dx * d.sin + dz * d.cos;
      if (Math.abs(lx) <= d.hx && Math.abs(lz) <= d.hz) fn(d);
    }
  }

  /**
   * What a falling arc point at (x, y, z) — last sample at `prevY` — comes
   * to rest on, or null if it's still in the air.
   *
   * The club's arc rule, kept: the GROUND is solid from any direction (the
   * club floor caught an arc even on its way up), but a raised FLOOR AREA
   * only catches an arc that's falling onto it from above — so you can
   * throw an arc up past the end of the pier and have it land on the deck,
   * but not up through the deck from the sand below.
   */
  catchArc(x: number, y: number, z: number, prevY: number, falling: boolean): FloorArea | null {
    let best: FloorArea = this.groundAt(x, z);
    // A floor that's solid down to the ground (a porch, a stoop, a room's floor) has no
    // underneath: like the ground, it catches an arc from any direction. Otherwise an arc thrown
    // at a doorway from the ground — your hand below the room's floor — slipped under the
    // floorboards and came down on the ground beneath the house.
    this.forDecksAt(x, z, (d) => {
      if (((falling && d.top <= prevY + 1e-6) || d.toGround) && d.top > best.y) best = { y: d.top, kind: 'deck', tag: d.tag };
    });
    return y <= best.y ? best : null;
  }

  /**
   * The floor area at (x, z) nearest to height `nearY` — where someone whose
   * feet are at nearY is standing. (ff2's `floorYAt`, which only ever had
   * one area per spot to choose from.)
   */
  areaNear(x: number, z: number, nearY: number): FloorArea {
    let best = this.groundAt(x, z);
    let bestD = Math.abs(best.y - nearY);
    this.forDecksAt(x, z, (d) => {
      const dd = Math.abs(d.top - nearY);
      if (dd < bestD) {
        bestD = dd;
        best = { y: d.top, kind: 'deck', tag: d.tag };
      }
    });
    return best;
  }

  /** Floor height under (x, z) for someone standing at about `nearY`. */
  floorYAt(x: number, z: number, nearY: number): number {
    return this.areaNear(x, z, nearY).y;
  }

  /**
   * Is this a place you may stand? Decks always are (like every club area).
   * Natural ground has to be dry — clear of the swash — and no steeper than
   * a slope you'd actually stand on; the sea never is.
   */
  standable(area: FloorArea | null, x: number, z: number): boolean {
    if (!area) return false;
    if (area.kind === 'deck') return true;
    if (area.kind === 'water') return false;
    if (area.y < GROUND.waterY + GROUND.dryMargin) return false;
    return this.terrain.normalAt(x, z, _n).y >= GROUND.minNormalY;
  }

  /**
   * Does the straight path (x0,z0)→(x1,z1) cross any solid wall?
   *
   * `atY` is the HIGHER of the two ends' floor heights — the height the hop
   * is really travelling at. A wall stops being an obstacle once you're at
   * or above its top (its sill), which is what makes hopping along the pier
   * legal over the pier's own under-deck beams without also opening them to
   * anyone standing on the sand beneath. Anything whose underside is above
   * head height is overhead, not in the way. An obstacle you're already
   * standing inside can't trap you. Low clutter on the ground (HOP_OVER) is
   * hopped over, but you can't land in it.
   */
  crossesWall(x0: number, z0: number, x1: number, z1: number, atY = 0): boolean {
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minZ = Math.min(z0, z1);
    const maxZ = Math.max(z0, z1);
    for (const w of this.walls) {
      if (atY >= w.sill - 1e-6) continue;
      if (w.bottom >= atY + GROUND.headroom) continue;
      if (w.bx + w.br < minX || w.bx - w.br > maxX || w.bz + w.br < minZ || w.bz - w.br > maxZ) continue;
      if (w.over && w.sill <= atY + GROUND.hopOver) {
        // over it, as long as you don't come down in it
        if (w.pts ? insidePoly(x1, z1, w.pts) && !insidePoly(x0, z0, w.pts) : Math.hypot(x1 - w.x, z1 - w.z) <= w.r && Math.hypot(x0 - w.x, z0 - w.z) > w.r) return true;
        continue;
      }
      if (w.pts) {
        if (insidePoly(x0, z0, w.pts)) continue;
        for (let i = 0; i < 4; i++) {
          const a = w.pts[i];
          const b = w.pts[(i + 1) & 3];
          if (segmentsCross(x0, z0, x1, z1, a[0], a[1], b[0], b[1])) return true;
        }
      } else {
        if (Math.hypot(x0 - w.x, z0 - w.z) <= w.r) continue;
        if (segmentPointDist(x0, z0, x1, z1, w.x, w.z) <= w.r) return true;
      }
    }
    return false;
  }

  /**
   * The top of whatever stands at (x, z) no higher than `below`: the ground, a deck, a rail (at the
   * height of the rail itself, not its collider). `walls` narrows the search to those near by.
   */
  topAt(x: number, z: number, below = Infinity, walls: readonly Wall[] = this.walls): number {
    let h = Math.max(this.terrain.heightAt(x, z), this.deckOver(x, z));
    for (const w of walls) {
      const top = w.sill + (LINE_TOP[w.tag] ?? 0);
      if (top <= h || w.bottom > below) continue;
      if (Math.abs(x - w.bx) > w.br || Math.abs(z - w.bz) > w.br) continue;
      if (w.pts ? insidePoly(x, z, w.pts) : Math.hypot(x - w.x, z - w.z) <= w.r) h = top;
    }
    return h;
  }

  /**
   * A fish under a deck (the pier: they do go under when you're bringing them in): the line to it
   * comes over the deck's edge, down its face and in under it. Finds the edge it wraps round (the
   * nearest way out from under the deck, counting the line's way back up to the tip at `a`) and
   * gives the line's two bends there: `top`, over the edge, and `under`, beneath it. False if the
   * fish at `b` isn't under a deck.
   */
  lineUnder(a: Vec3, b: Vec3, top: Vec3, under: Vec3, lift = 0.02): boolean {
    const over = (x: number, z: number): number => this.deckOver(x, z);
    const deck = over(b.x, b.z);
    if (!(deck > b.y + 0.3)) return false;
    let best = Infinity;
    let edge = deck;
    const tryDir = (dx: number, dz: number): void => {
      let lastTop = deck;
      for (let d = 0.05; d <= 12; d += 0.05) {
        const x = b.x + dx * d;
        const z = b.z + dz * d;
        const t = over(x, z);
        if (t > b.y + 0.3) {
          lastTop = t;
          continue;
        }
        const cost = d + Math.hypot(a.x - x, a.z - z);
        if (cost < best) {
          best = cost;
          edge = lastTop;
          top.x = under.x = x;
          top.z = under.z = z;
        }
        return;
      }
    };
    const toA = Math.hypot(a.x - b.x, a.z - b.z);
    if (toA > 1e-3) tryDir((a.x - b.x) / toA, (a.z - b.z) / toA);
    for (let i = 0; i < 16; i++) tryDir(Math.cos((i / 16) * Math.PI * 2), Math.sin((i / 16) * Math.PI * 2));
    if (best === Infinity) return false;
    // over the planks' top, and under the beams they're laid on
    top.y = edge + lift;
    under.y = Math.max(b.y, edge - DECK_DEPTH);
    return true;
  }

  /**
   * A fishing line from a rod tip at `a` to the fish (or float) at `b` lies over whatever stands
   * between them: the sand, a deck's edge, a rail. Of everything along the way that the straight
   * line would go through, the one it comes to rest on is the one it has to climb to most steeply
   * from the fish's end; that point (`out`, on top of it) is returned, or false if the line clears
   * everything. `lift` is how far over a surface the line lies.
   */
  lineRest(a: Vec3, b: Vec3, out: Vec3, lift = 0.02): boolean {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const L = Math.hypot(dx, dz);
    if (L < 0.1) return false;
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minZ = Math.min(a.z, b.z);
    const maxZ = Math.max(a.z, b.z);
    const lo = Math.min(a.y, b.y);
    const near = this.walls.filter((w) => w.sill > lo && !(w.bx + w.br < minX || w.bx - w.br > maxX || w.bz + w.br < minZ || w.bz - w.br > maxZ));
    // every 5 cm: thin enough not to step over a rail
    const n = Math.min(800, Math.ceil(L / 0.05));
    let best = -Infinity;
    for (let i = 1; i < n; i++) {
      const s = i / n;
      const x = a.x + dx * s;
      const z = a.z + dz * s;
      const yl = a.y + (b.y - a.y) * s;
      const h = this.topAt(x, z, yl, near) + lift;
      if (h <= yl) continue;
      const climb = (h - b.y) / ((1 - s) * L);
      if (climb > best) {
        best = climb;
        out.x = x;
        out.y = h;
        out.z = z;
      }
    }
    return best > -Infinity;
  }
}

/**
 * Where a collider's top differs from the top of the thing itself, for a fishing line lying over
 * it: the pier's rail colliders stand 10 cm over its top rail, the walks' 1.5 cm under theirs.
 */
const LINE_TOP: Record<string, number> = { pierRail: -0.105, walkRail: 0.015 };

/** how deep a deck is at its edge, planks and the beams under them (Tidewater's pier: 0.35 m) */
const DECK_DEPTH = 0.35;

/** Proper crossing of two XZ segments (ff2's `segmentsCross`). */
function segmentsCross(
  ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number, dx: number, dz: number,
): boolean {
  const o = (px: number, pz: number, qx: number, qz: number, rx: number, rz: number): number =>
    (qx - px) * (rz - pz) - (qz - pz) * (rx - px);
  const d1 = o(cx, cz, dx, dz, ax, az);
  const d2 = o(cx, cz, dx, dz, bx, bz);
  const d3 = o(ax, az, bx, bz, cx, cz);
  const d4 = o(ax, az, bx, bz, dx, dz);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function insidePoly(x: number, z: number, pts: [number, number][]): boolean {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const c = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (c === 0) continue;
    const s = c > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

function segmentPointDist(x0: number, z0: number, x1: number, z1: number, px: number, pz: number): number {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / l2)) : 0;
  return Math.hypot(x0 + dx * t - px, z0 + dz * t - pz);
}

/* ── the arc itself ─────────────────────────────────────────────────────── */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ArcResult {
  landed: boolean;
  area: FloorArea | null;
  landing: Vec3;
}

/**
 * ff2's ballistic arc, step for step: launched at `launchSpeed` along the
 * controller ray, `arcPoints` samples `arcStep` seconds apart under
 * `gravity`, every sample written to `buf` (xyz triples) and the tail
 * collapsed onto the landing point so the line ends there.
 */
export function simulateArc(surfaces: Surfaces, origin: Vec3, dir: Vec3, buf: number[] | Float32Array): ArcResult {
  let px = origin.x;
  let py = origin.y;
  let pz = origin.z;
  const vx = dir.x * TELEPORT.launchSpeed;
  let vy = dir.y * TELEPORT.launchSpeed;
  const vz = dir.z * TELEPORT.launchSpeed;
  const put = (i: number): void => {
    buf[i * 3] = px;
    buf[i * 3 + 1] = py;
    buf[i * 3 + 2] = pz;
  };
  let landed = false;
  let area: FloorArea | null = null;
  for (let i = 0; i < TELEPORT.arcPoints; i++) {
    put(i);
    vy -= TELEPORT.gravity * TELEPORT.arcStep;
    const prevY = py;
    px += vx * TELEPORT.arcStep;
    py += vy * TELEPORT.arcStep;
    pz += vz * TELEPORT.arcStep;
    const hit = surfaces.catchArc(px, py, pz, prevY, vy < 0);
    if (hit) {
      py = hit.y;
      landed = true;
      area = hit;
      for (let j = i + 1; j < TELEPORT.arcPoints; j++) put(j);
      break;
    }
  }
  return { landed, area, landing: { x: px, y: py, z: pz } };
}
