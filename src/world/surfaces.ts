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
 *  tables, log piles, bollards, a bucket, rocks (the gem rocks too), a build crate. Rails, fences, walls, counters,
 *  furniture indoors and standing trees still stop you. */
const HOP_OVER = new Set(['rowboat', 'boat', 'wreck', 'crate', 'crates', 'trap', 'traps', 'barrel', 'bench', 'table', 'woodpile', 'logPile', 'bollard', 'bucket', 'rock', 'gemRock', 'buildCrate']);

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
    return this.deckAt(x, z, margin)?.top ?? -Infinity;
  }

  /** The highest deck over (x, z) (its footprint grown by `margin` m), or null. */
  private deckAt(x: number, z: number, margin = 0): Deck | null {
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
    let best: Deck | null = null;
    for (const d of this.deckGrid.get(Math.floor(x / C) * 100003 + Math.floor(z / C)) ?? []) {
      const dx = x - d.cx;
      const dz = z - d.cz;
      const lx = dx * d.cos - dz * d.sin;
      const lz = dx * d.sin + dz * d.cos;
      if (Math.abs(lx) <= d.hx + margin && Math.abs(lz) <= d.hz + margin && (!best || d.top > best.top)) best = d;
    }
    return best;
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
   * a slope you'd actually stand on; the sea never is. Given `fromY`, the
   * floor you're hopping from, ground well below it may be steeper
   * (GROUND.downhillNormalY): scrambling down is allowed, so no hillside
   * leaves you stuck.
   */
  standable(area: FloorArea | null, x: number, z: number, fromY?: number): boolean {
    if (!area) return false;
    if (area.kind === 'deck') return true;
    if (area.kind === 'water') return false;
    if (area.y < GROUND.waterY + GROUND.dryMargin) return false;
    const down = fromY !== undefined && area.y <= fromY - GROUND.downhillDrop;
    return this.terrain.normalAt(x, z, _n).y >= (down ? GROUND.downhillNormalY : GROUND.minNormalY);
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
      if (covers(w, x, z, 0)) h = top;
    }
    return h;
  }

  /**
   * A fish under a deck (the pier: they do go under when you're bringing them in): the line to it
   * comes down outside the deck's edge, clear of the rail, the posts and the beam ends, and in
   * under the beams to the fish, through a gap between the piles if there's one. Finds that way
   * out (the nearest, counting the line's way back up to the tip at `a`) and gives the line's two
   * bends there: `top`, where it comes down, and `under`, beneath the beams. False if the fish at
   * `b` isn't under a deck.
   */
  lineUnder(a: Vec3, b: Vec3, top: Vec3, under: Vec3, lift = 0.02): boolean {
    const first = this.deckAt(b.x, b.z);
    if (!first || !(first.top > b.y + 0.3)) return false;
    const deckOn = (x: number, z: number): Deck | null => {
      const d = this.deckAt(x, z);
      return d && d.top > b.y + 0.3 ? d : null;
    };
    const pad = LINE_PAD;
    const reach = 14;
    const walls = this.walls.filter((w) => w.sill > b.y && Math.abs(w.bx - b.x) < reach + w.br && Math.abs(w.bz - b.z) < reach + w.br);
    // (under the beams of the deck it's under: the height of the line's way out)
    const underY = (d: Deck): number => Math.max(b.y, d.top - (DECK_DEPTH[d.tag] ?? DECK_DEPTH.other) - EDGE_CLEAR);
    let best = Infinity;
    let bestFree = false;
    let edge: Deck = first;
    const tryDir = (dx: number, dz: number): void => {
      let last: Deck = first;
      for (let d = 0.05; d <= 12; d += 0.05) {
        const hit = deckOn(b.x + dx * d, b.z + dz * d);
        if (hit) {
          last = hit;
          continue;
        }
        // the edge itself, between the last step under the deck and this one out from it
        let lo = d - 0.05;
        let hi = d;
        for (let k = 0; k < 8; k++) {
          const m = (lo + hi) / 2;
          if (deckOn(b.x + dx * m, b.z + dz * m)) lo = m;
          else hi = m;
        }
        // on out past what stands about the edge, from the beams under it to the rail over it
        const yU = underY(last);
        const about = (x: number, z: number): boolean => walls.some((w) => w.bottom < last.top + 0.1 && w.sill > yU && covers(w, x, z, pad));
        let out = hi;
        while (out < hi + 1.5 && about(b.x + dx * out, b.z + dz * out)) out += 0.02;
        out += EDGE_CLEAR;
        // and is the way out from the fish clear, between the piles (and not across a row of them,
        // where the cross-braces are, but for a fish in among it already)?
        let free = true;
        for (let d2 = 0.1; d2 < out && free; d2 += 0.05) {
          const x = b.x + dx * d2;
          const z = b.z + dz * d2;
          const y = b.y + ((yU - b.y) * d2) / out;
          for (const w of walls) {
            if (!covers(w, x, z, pad)) continue;
            if ((w.bottom < y && w.sill > y) || (w.tag === 'pierCap' && !covers(w, b.x, b.z, pad))) {
              free = false;
              break;
            }
          }
        }
        const x = b.x + dx * out;
        const z = b.z + dz * out;
        const cost = out + Math.hypot(a.x - x, a.z - z);
        if ((free && !bestFree) || (free === bestFree && cost < best)) {
          best = cost;
          bestFree = free;
          edge = last;
          top.x = under.x = x;
          top.z = under.z = z;
        }
        return;
      }
    };
    const toA = Math.hypot(a.x - b.x, a.z - b.z);
    if (toA > 1e-3) tryDir((a.x - b.x) / toA, (a.z - b.z) / toA);
    for (let i = 0; i < 32; i++) tryDir(Math.cos((i / 32) * Math.PI * 2), Math.sin((i / 32) * Math.PI * 2));
    if (best === Infinity) return false;
    // it comes down clear of it all to under the beams (lineRests lays it over the rail on its way)
    under.y = underY(edge);
    top.y = Math.max(under.y, this.topAt(top.x, top.z) + lift);
    return true;
  }

  /**
   * A fishing line from a rod tip at `a` to the fish (or float) at `b` lies over whatever stands
   * between them: the sand, a deck's edge, a rail, a post. Pulled taut, it takes the upper hull of
   * all of it: the corners it comes to rest on are written to `out` in order from `a` (at most its
   * length, dropping the least of them on a long run over the sand), and their count returned.
   * `lift` is how far over a surface the line lies. Footprints are grown by LINE_PAD: the timber's
   * drawn a little proud of its collider (piles lean, rail tops and plank ends overhang), and a
   * line resting on a collider's very edge cut the corner off what's drawn.
   */
  lineRests(a: Vec3, b: Vec3, out: Vec3[], lift = 0.02): number {
    const n = this.lineSpan(a, b, 0.05, lift);
    if (n === 0 || out.length === 0) return 0;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const pad = LINE_PAD;
    const H = this.lineH;
    const base = this.lineBase;
    const hull = this.lineHull;
    const W = this.lineWalls;
    const held = this.lineHeld;
    held.fill(0, 0, W.length);
    // What the line passes under all the way across (the pier's beams, to a fish under the deck)
    // doesn't hold it up; what it meets anywhere does, all over (a line through a rail that dips
    // under the rail's foot on its far side still rests on the rail's top). Held up, it's higher,
    // and may meet what it passed under before: again, until nothing new is met.
    let m = 1;
    hull[0] = 0;
    hull[1] = n;
    H[0] = a.y;
    H[n] = b.y;
    for (let pass = 0; pass < 4; pass++) {
      let more = false;
      for (let j = 0; j < W.length; j++) {
        if (held[j]) continue;
        const w = W[j];
        let k = 1;
        for (let i = this.lineI0[j]; i <= this.lineI1[j]; i++) {
          while (hull[k] < i) k++;
          const i0 = hull[k - 1];
          const y = H[i0] + ((H[hull[k]] - H[i0]) * (i - i0)) / (hull[k] - i0);
          if (y >= w.bottom && covers(w, a.x + (dx * i) / n, a.z + (dz * i) / n, pad)) {
            held[j] = 1;
            more = true;
            break;
          }
        }
      }
      if (!more && pass > 0) break;
      for (let i = 1; i < n; i++) H[i] = base[i];
      for (let j = 0; j < W.length; j++) {
        if (!held[j]) continue;
        const w = W[j];
        const top = w.sill + (LINE_TOP[w.tag] ?? 0) + lift;
        for (let i = this.lineI0[j]; i <= this.lineI1[j]; i++) if (top > H[i] && covers(w, a.x + (dx * i) / n, a.z + (dz * i) / n, pad)) H[i] = top;
      }
      // the upper hull, tip to fish
      m = 0;
      for (let i = 0; i <= n; i++) {
        while (m >= 2 && (hull[m - 1] - hull[m - 2]) * (H[i] - H[hull[m - 2]]) - (H[hull[m - 1]] - H[hull[m - 2]]) * (i - hull[m - 2]) >= 0) m--;
        hull[m++] = i;
      }
      m--;
    }
    // hull[1 .. m-1] are the corners; over the sand there can be a great many, a centimetre
    // apart: the least of them go (those that lie nearest the line between their neighbours)
    let tol = 0.005;
    let count = m - 1;
    while (count > out.length) {
      tol *= 2;
      let j = 0;
      count = 0;
      for (let k = 1; k < m; k++) {
        // keep hull[k] unless the line from the last kept to the next one passes within tol of it
        const i0 = hull[j];
        const i1 = hull[k + 1];
        const y = H[i0] + ((H[i1] - H[i0]) * (hull[k] - i0)) / (i1 - i0);
        if (H[hull[k]] - y <= tol) continue;
        hull[++j] = hull[k];
        count++;
      }
      hull[++j] = hull[m];
      m = j;
    }
    // each corner to the very edge of what it rests on, between the samples: towards the fish if
    // it comes off there, else towards the tip if it came up there
    const hAt = (s: number): number => {
      const x = a.x + dx * s;
      const z = a.z + dz * s;
      let h = Math.max(this.terrain.heightAt(x, z), this.deckOver(x, z, pad)) + lift;
      for (let j = 0; j < W.length; j++) {
        const w = W[j];
        const top = w.sill + (LINE_TOP[w.tag] ?? 0) + lift;
        if (held[j] && top > h && covers(w, x, z, pad)) h = top;
      }
      return h;
    };
    for (let k = 1; k < m; k++) {
      const i = hull[k];
      const h = H[i];
      let s = i / n;
      const step = H[i + 1] < h - 1e-4 ? 1 / n : H[i - 1] < h - 1e-4 ? -1 / n : 0;
      if (step !== 0) {
        let on = s;
        let off = s + step;
        for (let r = 0; r < 7; r++) {
          const mid = (on + off) / 2;
          if (hAt(mid) >= h - 1e-4) on = mid;
          else off = mid;
        }
        s = on;
      }
      const o = out[k - 1];
      o.x = a.x + dx * s;
      o.y = h;
      o.z = a.z + dz * s;
    }
    return m - 1;
  }

  /**
   * How far a line from `a` to `b` that rests on nothing may droop, at most `sag` (FishingSystem's
   * curve: the straight line let down by 2·t·(1 − t)·sag), before its belly comes down on what it
   * passes over: a rail it clears taut, the deck's edge, the sand. It lies on it instead.
   */
  lineDroop(a: Vec3, b: Vec3, sag: number, lift = 0.02): number {
    if (sag <= 0) return sag;
    // every 10 cm: a rail's footprint, grown, is 30 cm across
    const n = this.lineSpan(a, b, 0.1, lift, sag);
    if (n === 0) return sag;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const H = this.lineH;
    const base = this.lineBase;
    const W = this.lineWalls;
    for (let i = 1; i < n; i++) H[i] = base[i];
    // what it goes over (not what it passes under)
    for (let j = 0; j < W.length; j++) {
      const w = W[j];
      const top = w.sill + (LINE_TOP[w.tag] ?? 0) + lift;
      for (let i = this.lineI0[j]; i <= this.lineI1[j]; i++) {
        const yl = a.y + ((b.y - a.y) * i) / n;
        if (top > H[i] && w.bottom <= yl && covers(w, a.x + (dx * i) / n, a.z + (dz * i) / n, LINE_PAD)) H[i] = top;
      }
    }
    for (let i = 1; i < n; i++) {
      const s = i / n;
      const yl = a.y + (b.y - a.y) * s;
      if (H[i] > yl) continue;
      sag = Math.min(sag, (yl - H[i]) / (2 * s * (1 - s)));
    }
    return Math.max(0, sag);
  }

  /**
   * Lay out a line from `a` to `b` for lineRests and lineDroop: samples every `step` m along it
   * (their count returned, 0 if it's too short to bother), the ground or a deck under each
   * (lineBase, `lift` over it), and the walls it passes near, each with the run of samples its
   * footprint (grown by LINE_PAD) could take in (lineWalls, lineI0, lineI1). Walls wholly under
   * both ends (and `drop` more) can't be in its way.
   */
  private lineSpan(a: Vec3, b: Vec3, step: number, lift: number, drop = 0): number {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const L = Math.hypot(dx, dz);
    if (L < 0.1) return 0;
    const n = Math.min(LINE_SAMPLES, Math.ceil(L / step));
    const pad = LINE_PAD;
    for (let i = 1; i < n; i++) {
      const x = a.x + (dx * i) / n;
      const z = a.z + (dz * i) / n;
      this.lineBase[i] = Math.max(this.terrain.heightAt(x, z), this.deckOver(x, z, pad)) + lift;
    }
    const W = this.lineWalls;
    W.length = 0;
    const lo = Math.min(a.y, b.y) - drop;
    const ux = dx / L;
    const uz = dz / L;
    for (const w of this.walls) {
      if (w.sill + (LINE_TOP[w.tag] ?? 0) + lift <= lo) continue;
      const r = w.br + pad;
      const px = w.bx - a.x;
      const pz = w.bz - a.z;
      const off = Math.abs(px * uz - pz * ux);
      if (off > r) continue;
      const along = px * ux + pz * uz;
      const half = Math.sqrt(r * r - off * off);
      const i0 = Math.max(1, Math.floor(((along - half) / L) * n));
      const i1 = Math.min(n - 1, Math.ceil(((along + half) / L) * n));
      if (i0 > i1) continue;
      this.lineI0[W.length] = i0;
      this.lineI1[W.length] = i1;
      W.push(w);
      if (W.length === LINE_WALLS) break;
    }
    return n;
  }

  /** a line's samples: the ground or deck under each, the heights it's held up to, its hull */
  private readonly lineBase = new Float64Array(LINE_SAMPLES + 1);
  private readonly lineH = new Float64Array(LINE_SAMPLES + 1);
  private readonly lineHull = new Int32Array(LINE_SAMPLES + 1);
  /** the walls a line passes near, the run of its samples each could take in, and which hold it up */
  private readonly lineWalls: Wall[] = [];
  private readonly lineI0 = new Int32Array(LINE_WALLS);
  private readonly lineI1 = new Int32Array(LINE_WALLS);
  private readonly lineHeld = new Uint8Array(LINE_WALLS);

}

/**
 * Where a collider's top differs from the top of the thing itself, for a fishing line lying over
 * it: the pier's rail colliders stand 10 cm over its top rail, the walks' 1.5 cm under theirs.
 */
const LINE_TOP: Record<string, number> = { pierRail: -0.105, walkRail: 0.015 };

/**
 * How deep a deck is at its edge, from the top of its planks to the bottom of the beam flush with
 * its side: Tidewater's pier (planks, stringers, the cap beam along its edge) and the walks you
 * build (boards, joists, cap beams).
 */
const DECK_DEPTH: Record<string, number> = { pierDeck: 0.055 + 0.22 + 0.26, walkDeck: 0.05 + 0.25 + 0.18, other: 0.35 };
/** the most points a line's laid over (every 5 cm, so 40 m of it) */
const LINE_SAMPLES = 800;
/** the most walls a line's laid over */
const LINE_WALLS = 512;
/** how far a fishing line keeps off the footprint of what it lies over (see lineRest) */
const LINE_PAD = 0.06;
/** how far off a deck's edge a line hangs: past the plank ends, clear of LINE_PAD */
const EDGE_CLEAR = LINE_PAD + 0.02;

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

/** Does a wall's footprint, grown by `pad`, take in (x, z)? */
function covers(w: Wall, x: number, z: number, pad: number): boolean {
  if (Math.abs(x - w.bx) > w.br + pad || Math.abs(z - w.bz) > w.br + pad) return false;
  return w.pts ? insidePoly(x, z, w.pts) || (pad > 0 && polyDist(x, z, w.pts) <= pad) : Math.hypot(x - w.x, z - w.z) <= w.r + pad;
}

/** How far (x, z) is from the outline of a polygon. */
function polyDist(x: number, z: number, pts: [number, number][]): number {
  let d = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    d = Math.min(d, segmentPointDist(a[0], a[1], b[0], b[1], x, z));
  }
  return d;
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
