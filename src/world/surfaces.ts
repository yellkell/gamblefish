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
  /** bounding circle for the cheap reject */
  bx: number;
  bz: number;
  br: number;
}

/** Tidewater tags that are walkable in its character controller but not a
 *  place to stand after a teleport. */
const NOT_A_FLOOR = new Set(['ladder']);

const _n = { x: 0, y: 1, z: 0 };

export class Surfaces {
  readonly decks: Deck[] = [];
  readonly walls: Wall[] = [];
  readonly terrain: Heightfield;

  constructor(terrain: Heightfield, colliders: { boxes: BoxCollider[]; cylinders: CylinderCollider[] }) {
    this.terrain = terrain;
    for (const b of colliders.boxes) {
      const cos = Math.cos(b.rotY);
      const sin = Math.sin(b.rotY);
      if (b.walkable) {
        if (NOT_A_FLOOR.has(b.tag)) continue;
        const toGround = b.solid && b.bottom <= terrain.heightAt(b.cx, b.cz) + 0.05;
        this.decks.push({ cx: b.cx, cz: b.cz, hx: b.hx, hz: b.hz, cos, sin, r: Math.hypot(b.hx, b.hz), top: b.top, tag: b.tag, toGround });
      } else if (b.solid) {
        // Tidewater's local frame: local = R(rotY)·(world − centre), with
        // lx = dx·cos − dz·sin, lz = dx·sin + dz·cos; invert for the corners.
        const pts: [number, number][] = [
          [-b.hx, -b.hz],
          [b.hx, -b.hz],
          [b.hx, b.hz],
          [-b.hx, b.hz],
        ].map(([lx, lz]) => [b.cx + lx * cos + lz * sin, b.cz - lx * sin + lz * cos]);
        this.walls.push({ pts, x: 0, z: 0, r: 0, sill: b.top, bottom: b.bottom, bx: b.cx, bz: b.cz, br: Math.hypot(b.hx, b.hz) });
      }
    }
    for (const c of colliders.cylinders) {
      this.walls.push({ pts: null, x: c.x, z: c.z, r: c.r, sill: c.top, bottom: c.bottom, bx: c.x, bz: c.z, br: c.r });
    }
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
   * standing inside can't trap you.
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
}

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
