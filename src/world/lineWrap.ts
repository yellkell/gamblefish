/**
 * A fishing line caught round a post: the pier's lamp posts, a walk's lantern posts. Swung against
 * one from the side, the line bends round it, the post staying on the side of the line it came
 * from, and it stays bent round it (the post can be on its far side by then) until it's swung back
 * clear, or lifted over the top. Only a line that was already over a post's top when it came to it
 * lies over it, as it does over a rail (world/surfaces.ts lineRests): one that comes at it from the
 * side can't climb it.
 *
 * Seen from above, the line from the tip runs straight to the first post it's round, round it
 * (on the side it's caught on), straight on to the next, and so to the fish. Each straight stretch
 * lies over what it passes over (lineRests: a rail, the deck's edge), and the whole of it is pulled
 * taut, round the posts and over all it rests on (as a thread wound round a pole is: unrolled,
 * it's straight between what holds it up). The pier's lamp posts stand right by the rail, so a line
 * round one comes to the rail just past it and is held up by it there.
 *
 * Pure (no three.js): tools/line-check.mjs drives this same file.
 */

import { LINE_PAD, type Surfaces, type Vec3, type Wall } from './surfaces.ts';

/** how far off a post's footprint the line goes round it (a centimetre past where lineRests keeps off anything) */
const CLEAR = LINE_PAD + 0.01;
/** the most posts one line is round at once */
const MOST = 4;
/** the arc round a post: a point at least every this many radians of it */
const ARC_STEP = 0.45;
/** the most points on one arc (where it meets the post and leaves it included) */
const ARC_PTS = 8;
/** the most places one straight stretch of it rests (lineRests) */
const RESTS = 16;
/** how far over the deck it lies (as lineRests) */
const LIFT = 0.02;

/** A post's footprint as the line goes round it: a circle about it (a square post's corners in it). */
const radius = (w: Wall): number => w.br + CLEAR;
const cross = (px: number, pz: number, qx: number, qz: number): number => px * qz - pz * qx;

export class LineWraps {
  /** the posts it's round, from the tip out, and the side of the line each is on: +1 its left,
   *  −1 its right, looking out along it */
  private readonly round: { w: Wall; s: number }[] = [];
  /** the side of the line each post was on the last time the line was clear of it, and whether
   *  the line was over its top */
  private readonly seen = new Map<Wall, { s: number; over: boolean }>();
  /** round each post (lay's result): where the line comes to it, round it, and where it leaves it */
  readonly bends: Vec3[][] = Array.from({ length: MOST }, () => Array.from({ length: ARC_PTS }, () => ({ x: 0, y: 0, z: 0 })));
  readonly counts = new Int32Array(MOST);
  /** where it rests on each straight stretch of it (lay's result): stretch k is from the tip, or
   *  where it leaves post k − 1, to where it comes to post k, or the end */
  readonly rests: Vec3[][] = Array.from({ length: MOST + 1 }, () => Array.from({ length: RESTS }, () => ({ x: 0, y: 0, z: 0 })));
  readonly restCounts = new Int32Array(MOST + 1);
  /** the posts the line doesn't lie over, for lineRests and lineDroop: all but those it came to
   *  over the top */
  readonly skip = new Set<Wall>();

  private readonly surfaces: Surfaces;

  constructor(surfaces: Surfaces) {
    this.surfaces = surfaces;
  }

  /** The line's in: nothing's caught, and nothing's remembered. */
  reset(): void {
    this.round.length = 0;
    this.seen.clear();
    this.skip.clear();
  }

  /**
   * The line from the tip at `a` to `b` (the fish, or where it comes down to go in under the deck
   * to it): catches it on the posts it's come against from the side, lets go of those it's clear
   * of, lays each stretch over what it passes over, and gives the count of posts it's round, m.
   * From the tip, stretch by stretch (k = 0 .. m): it rests on rests[k][0 .. restCounts[k] − 1],
   * then (k < m) goes round post k through bends[k][0 .. counts[k] − 1]; then the end.
   */
  lay(a: Vec3, b: Vec3): number {
    this.skipping();
    for (let pass = 0; pass < 2 * MOST; pass++) {
      this.build(a, b);
      if (!this.slip(a, b) && !this.catch(a, b)) break;
    }
    this.build(a, b);
    this.remember(a, b);
    this.skipping();
    // what each stretch rests on, and round the posts held up by it: again, over what it rests on
    // now it's up (a stretch starting higher may clear what the lower one rested on)
    const m = this.round.length;
    for (let pass = 0; ; pass++) {
      for (let k = 0; k <= m; k++) {
        this.restCounts[k] = k < m && this.counts[k] === 0 ? 0 : this.surfaces.lineRests(this.from(k, a), this.to(k, b), this.rests[k], this.skip);
      }
      if (m === 0 || pass === 2 || !this.tauten(a, b)) break;
    }
    return m;
  }

  /** the posts lineRests leaves out: all but those the line came to over the top */
  private skipping(): void {
    this.skip.clear();
    for (const w of this.surfaces.posts) if (!this.seen.get(w)?.over) this.skip.add(w);
  }

  /** the line unrolled, for tauten: how far along it (seen from above) and how high, the tip, what
   *  it rests on, the deck under each bend round a post, the end; and how far along it each bend is */
  private readonly hullS = new Float64Array((MOST + 1) * RESTS + MOST * ARC_PTS + 2);
  private readonly hullY = new Float64Array((MOST + 1) * RESTS + MOST * ARC_PTS + 2);
  private readonly bendS = new Float64Array(MOST * ARC_PTS);

  /**
   * Lifts the line round the posts onto the line pulled taut from the tip over all it rests on to
   * the end (its upper hull, unrolled: height against the distance along it), and over the deck
   * the post stands on (to a fish in under the deck by a post at its edge, it goes round the post
   * and then over the edge, not round under the planks). True if it moved.
   */
  private tauten(a: Vec3, b: Vec3): boolean {
    const m = this.round.length;
    const S = this.hullS;
    const Y = this.hullY;
    let n = 0;
    let along = 0;
    let px = a.x;
    let pz = a.z;
    const on = (o: Vec3): number => {
      along += Math.hypot(o.x - px, o.z - pz);
      px = o.x;
      pz = o.z;
      return along;
    };
    const hold = (s: number, y: number): void => {
      while (n >= 2 && (S[n - 1] - S[n - 2]) * (y - Y[n - 2]) - (Y[n - 1] - Y[n - 2]) * (s - S[n - 2]) >= 0) n--;
      S[n] = s;
      Y[n++] = y;
    };
    hold(0, a.y);
    for (let k = 0; k <= m; k++) {
      for (let j = 0; j < this.restCounts[k]; j++) hold(on(this.rests[k][j]), this.rests[k][j].y);
      if (k < m) {
        for (let j = 0; j < this.counts[k]; j++) {
          const o = this.bends[k][j];
          const s = (this.bendS[k * ARC_PTS + j] = on(o));
          // (the post's own deck, all round it: one at the deck's edge, it goes round over the edge)
          const w = this.round[k].w;
          hold(s, Math.max(this.surfaces.terrain.heightAt(o.x, o.z), this.surfaces.deckOver(w.bx, w.bz, LINE_PAD)) + LIFT);
        }
      }
    }
    hold(on(b), b.y);
    let moved = false;
    let i = 1;
    for (let k = 0; k < m; k++) {
      for (let j = 0; j < this.counts[k]; j++) {
        const s = this.bendS[k * ARC_PTS + j];
        while (i < n - 1 && S[i] < s) i++;
        const y = Y[i - 1] + ((Y[i] - Y[i - 1]) * (s - S[i - 1])) / Math.max(S[i] - S[i - 1], 1e-9);
        const o = this.bends[k][j];
        if (Math.abs(y - o.y) > 1e-3) moved = true;
        o.y = y;
      }
    }
    return moved;
  }

  /** the ends of straight stretch `k` of the line: the tip or where it leaves post k − 1, to where
   *  it comes to post k or the end (past any it's got no bends round) */
  private from(k: number, a: Vec3): Vec3 {
    for (let j = k - 1; j >= 0; j--) if (this.counts[j] > 0) return this.bends[j][this.counts[j] - 1];
    return a;
  }
  private to(k: number, b: Vec3): Vec3 {
    for (let j = k; j < this.round.length; j++) if (this.counts[j] > 0) return this.bends[j][0];
    return b;
  }

  /** Lays the line round the posts it's round, as it is: the bends, and their heights. A post it
   *  can't go round (an end's in it, or it's come round the wrong way) gets no bends. */
  private build(a: Vec3, b: Vec3): void {
    const m = this.round.length;
    for (let k = 0; k < m; k++) {
      const { w, s } = this.round[k];
      const R = radius(w);
      const p = this.from(k, a);
      // it leaves this post for the next one's middle (near enough: they're a few metres apart
      // and 15 cm through), or the end
      const q = k + 1 < m ? { x: this.round[k + 1].w.bx, z: this.round[k + 1].w.bz } : b;
      const pts = this.bends[k];
      this.counts[k] = 0;
      const t0 = tangent(p.x, p.z, w.bx, w.bz, R, s);
      const t1 = tangent(q.x, q.z, w.bx, w.bz, R, -s);
      if (!t0 || !t1) continue;
      const f0 = Math.atan2(t0[1] - w.bz, t0[0] - w.bx);
      const f1 = Math.atan2(t1[1] - w.bz, t1[0] - w.bx);
      // round it with the post on its left is anticlockwise from above (the angle grows)
      let sweep = f1 - f0;
      if (s > 0) while (sweep < 0) sweep += 2 * Math.PI;
      else while (sweep > 0) sweep -= 2 * Math.PI;
      if (Math.abs(sweep) > 1.6 * Math.PI) continue;
      const n = Math.min(ARC_PTS - 1, Math.max(1, Math.ceil(Math.abs(sweep) / ARC_STEP)));
      for (let j = 0; j <= n; j++) {
        const f = f0 + (sweep * j) / n;
        pts[j].x = w.bx + R * Math.cos(f);
        pts[j].z = w.bz + R * Math.sin(f);
      }
      this.counts[k] = n + 1;
    }
    // taut the whole way: its height falls evenly with the distance along it, seen from above
    let total = 0;
    let px = a.x;
    let pz = a.z;
    for (let k = 0; k < m; k++) {
      for (let j = 0; j < this.counts[k]; j++) {
        const o = this.bends[k][j];
        total += Math.hypot(o.x - px, o.z - pz);
        o.y = total;
        px = o.x;
        pz = o.z;
      }
    }
    total += Math.hypot(b.x - px, b.z - pz);
    for (let k = 0; k < m; k++) for (let j = 0; j < this.counts[k]; j++) {
      const o = this.bends[k][j];
      o.y = a.y + ((b.y - a.y) * o.y) / Math.max(total, 1e-6);
    }
  }

  /** Lets go of one post the line's no longer round, if there is one: it's swung back clear of it,
   *  been lifted over its top, or an end's gone into it. */
  private slip(a: Vec3, b: Vec3): boolean {
    for (let k = 0; k < this.round.length; k++) {
      const { w, s } = this.round[k];
      let gone = this.counts[k] === 0;
      if (!gone) {
        // straight from where it comes from to where it goes on to, would it clear the post on its side?
        const p = this.from(k, a);
        const q = this.to(k + 1, b);
        const dx = q.x - p.x;
        const dz = q.z - p.z;
        const L = Math.hypot(dx, dz);
        gone = L < 1e-6 || (s * cross(dx, dz, w.bx - p.x, w.bz - p.z)) / L >= radius(w) || this.bends[k][0].y > w.sill + 0.02;
      }
      if (gone) {
        this.round.splice(k, 1);
        return true;
      }
    }
    return false;
  }

  /** where a straight stretch rests, for how high it is at a post */
  private readonly scratch: Vec3[] = Array.from({ length: RESTS }, () => ({ x: 0, y: 0, z: 0 }));

  /**
   * Does the straight stretch p→q come up against post `w` (see meets), and how far along it: how
   * high it is there as it's laid, over what it rests on (from a tip held low under the rail, it's
   * under the deck at the post drawn straight, but lifted onto the rail beside it, into it).
   */
  private meets(p: Vec3, q: Vec3, w: Wall): number {
    return meets(p, q, w, (t) => {
      const n = this.surfaces.lineRests(p, q, this.scratch, this.skip);
      const L = Math.hypot(q.x - p.x, q.z - p.z);
      let s0 = 0;
      let y0 = p.y;
      for (let j = 0; j <= n; j++) {
        const o = j < n ? this.scratch[j] : q;
        const s1 = j < n ? Math.hypot(o.x - p.x, o.z - p.z) / L : 1;
        if (t <= s1) return y0 + ((o.y - y0) * (t - s0)) / Math.max(s1 - s0, 1e-9);
        s0 = s1;
        y0 = o.y;
      }
      return q.y;
    });
  }

  /** Catches the line on one more post it's come against from the side, if it has. */
  private catch(a: Vec3, b: Vec3): boolean {
    const m = this.round.length;
    if (m >= MOST) return false;
    for (let k = 0; k <= m; k++) {
      const p = this.from(k, a);
      const q = this.to(k, b);
      let best: Wall | null = null;
      let bestT = Infinity;
      for (const w of this.surfaces.posts) {
        if (this.seen.get(w)?.over || this.round.some((r) => r.w === w)) continue;
        const hit = this.meets(p, q, w);
        if (hit < bestT) {
          best = w;
          bestT = hit;
        }
      }
      if (best) {
        const seen = this.seen.get(best);
        const s = seen ? seen.s : Math.sign(cross(q.x - p.x, q.z - p.z, best.bx - p.x, best.bz - p.z)) || 1;
        this.round.splice(k, 0, { w: best, s });
        return true;
      }
    }
    return false;
  }

  /** For every post the line's clear of: which side of it it's on, and whether it's over the top. */
  private remember(a: Vec3, b: Vec3): void {
    const m = this.round.length;
    for (const w of this.surfaces.posts) {
      if (this.round.some((r) => r.w === w)) continue;
      // the stretch of the line nearest it
      let near = Infinity;
      let s = 0;
      let y = 0;
      for (let k = 0; k <= m; k++) {
        const p = this.from(k, a);
        const q = this.to(k, b);
        const dx = q.x - p.x;
        const dz = q.z - p.z;
        const l2 = dx * dx + dz * dz;
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((w.bx - p.x) * dx + (w.bz - p.z) * dz) / l2)) : 0;
        const d = Math.hypot(p.x + dx * t - w.bx, p.z + dz * t - w.bz);
        if (d >= near) continue;
        near = d;
        s = Math.sign(cross(dx, dz, w.bx - p.x, w.bz - p.z));
        y = p.y + (q.y - p.y) * t;
      }
      const over = y > w.sill;
      // on it and not clear over it (lying over its top, or up against it and not round it: an
      // end's in it, or it's round as many as it can be): as it was
      if (near < radius(w) && !over && this.seen.has(w)) continue;
      const seen = this.seen.get(w);
      if (seen) {
        if (s) seen.s = s;
        seen.over = over;
      } else this.seen.set(w, { s: s || 1, over });
    }
  }
}

/**
 * How far along the straight stretch p→q (0..1) it comes up against post `w` from the side —
 * through its footprint, between its foot and its top — or Infinity if it doesn't (or an end's in
 * it: it can't go round that). `y(t)` is how high the stretch is there.
 */
function meets(p: Vec3, q: Vec3, w: Wall, y: (t: number) => number): number {
  const R = radius(w);
  const dx = q.x - p.x;
  const dz = q.z - p.z;
  const l2 = dx * dx + dz * dz;
  if (l2 < 1e-6) return Infinity;
  if (Math.hypot(p.x - w.bx, p.z - w.bz) <= R + 0.01 || Math.hypot(q.x - w.bx, q.z - w.bz) <= R + 0.01) return Infinity;
  const t = ((w.bx - p.x) * dx + (w.bz - p.z) * dz) / l2;
  if (t <= 0 || t >= 1) return Infinity;
  if (Math.hypot(p.x + dx * t - w.bx, p.z + dz * t - w.bz) >= R) return Infinity;
  const h = y(t);
  return h < w.sill && h > w.bottom ? t : Infinity;
}

/**
 * Where a line from (px, pz) touches the circle of radius R about (cx, cz), passing it with the
 * circle on side `s` (+1 its left, −1 its right); null if the point's in the circle.
 */
function tangent(px: number, pz: number, cx: number, cz: number, R: number, s: number): [number, number] | null {
  const ux = cx - px;
  const uz = cz - pz;
  const d = Math.hypot(ux, uz);
  if (d <= R + 1e-3) return null;
  // turned off the line to the middle by the angle the circle takes up, away from its side
  const th = -s * Math.asin(R / d);
  const c = Math.cos(th);
  const sn = Math.sin(th);
  const L = Math.sqrt(d * d - R * R) / d;
  return [px + (ux * c - uz * sn) * L, pz + (ux * sn + uz * c) * L];
}
