/**
 * The great white's body, built for it (Tidewater's fish builder makes bony fish: its snouts are
 * blunt and its jaws shut, and a shark made with it came out a balloon).
 *
 * Total length 1, snout tip at z = +0.5, tail tip at z = −0.5, x across, y up, the same frame as
 * Tidewater's fish so the swim wave, the skin shader (fishing/fishSkin.ts, pattern 21) and the
 * catch staging all read it the same way. Out come positions, normals, an index, Tidewater's
 * per-vertex aData (u along, part, across, height) and `jaw` (1 on the lower jaw: the vertex
 * shader swings it open about the hinge).
 *
 *  BODY     lofted cross-sections: a sharp conical snout that overhangs the mouth, deepest a third
 *           of the way back, a slim tail stalk flattened into lateral keels.
 *  JAWS     the mouth is cut round the underside of the head, from under the snout back to its
 *           corners below the eye; the lower jaw is its own piece, hinged at the corners, with a
 *           palate above and a tongue below so an open mouth shows a throat, not the inside of
 *           the body.
 *  TEETH    triangular blades along both jaws, biggest at the front, the upper row hanging, the
 *           lower row standing.
 *  FINS     a tall, swept first dorsal with a concave trailing edge; long sickle pectorals; small
 *           pelvics, second dorsal and anal fin; a crescent tail, the upper lobe a little longer.
 *
 * Plain data in and out, no three.js, so the Node bake runs it as it is.
 */

export const TOOTH = 21;
const P = { BODY: 0, DORSAL1: 1, DORSAL2: 2, ANAL: 3, CAUDAL: 4, PECTORAL: 5, PELVIC: 6, MOUTH: 9 };

/** where the mouth runs (u from the snout), and the hinge the lower jaw turns on */
export const MOUTH = { front: 0.05, corner: 0.19 };

/** the body's profile over u (0 snout .. BODY_END, the tail stalk's end): top, bottom, half width, centre line */
const BODY_END = 0.8;
const PROFILE: [number, number, number, number, number][] = [
  // u      top    bottom  width  centre
  [0.0, 0.0, 0.0, 0.0, 0.018],
  [0.012, 0.006, 0.004, 0.005, 0.018],
  [0.035, 0.015, 0.01, 0.012, 0.017],
  [0.07, 0.028, 0.021, 0.025, 0.014],
  [0.12, 0.045, 0.037, 0.04, 0.01],
  [0.19, 0.064, 0.056, 0.056, 0.005],
  [0.27, 0.082, 0.072, 0.07, 0.002],
  [0.36, 0.093, 0.08, 0.077, 0],
  [0.45, 0.09, 0.076, 0.075, 0],
  [0.54, 0.079, 0.065, 0.066, 0.001],
  [0.63, 0.062, 0.05, 0.053, 0.003],
  [0.71, 0.042, 0.033, 0.04, 0.005],
  [0.77, 0.027, 0.021, 0.032, 0.007],
  [0.8, 0.022, 0.018, 0.029, 0.008],
];

function prof(u: number): { T: number; B: number; W: number; c: number } {
  const p = PROFILE;
  if (u <= 0) return { T: 0, B: 0, W: 0, c: p[0][4] };
  for (let i = 1; i < p.length; i++)
    if (u <= p[i][0]) {
      const a = p[i - 1];
      const b = p[i];
      const k = (u - a[0]) / (b[0] - a[0]);
      const s = k * k * (3 - 2 * k) * 0.35 + k * 0.65; // a little smoothing between keys
      const l = (i: number): number => a[i] + (b[i] - a[i]) * s;
      return { T: l(1), B: l(2), W: l(3), c: l(4) };
    }
  const e = p[p.length - 1];
  return { T: e[1], B: e[2], W: e[3], c: e[4] };
}

/** a point on the section at u, angle phi (0 top, PI/2 the right flank, PI the belly) */
function onBody(u: number, phi: number): [number, number, number] {
  const { T, B, W, c } = prof(u);
  const s = Math.sin(phi);
  const k = Math.cos(phi);
  // round over the back, a flatter belly; toward the tail the section widens into the keels
  const keel = Math.max(0, (u - 0.66) / 0.14);
  const ex = 1 - 0.25 * keel;
  const ey = k >= 0 ? 1 : 0.85;
  const x = W * Math.sign(s) * Math.pow(Math.abs(s), ex);
  const y = c + (k >= 0 ? T : B) * Math.sign(k) * Math.pow(Math.abs(k), ey);
  return [x, y, 0.5 - u];
}

/** the mouth line's angle on the section at u (PI under the snout .. MOUTH_PHI at the corners) */
const MOUTH_PHI = Math.PI * 0.64;
function mouthPhi(u: number): number {
  if (u <= MOUTH.front) return Math.PI;
  const k = Math.min(1, (u - MOUTH.front) / (MOUTH.corner - MOUTH.front));
  return Math.PI - (Math.PI - MOUTH_PHI) * Math.sqrt(k);
}

export interface SharkGeometry {
  position: Float32Array;
  normal: Float32Array;
  data: Float32Array;
  jaw: Float32Array;
  index: Uint32Array;
  /** the hinge the lower jaw turns on (z, y) */
  hinge: [number, number];
  eye: { z: number; y: number; r: number };
  /** the gill slits' front, and the black spot behind the pectoral */
  gills: number;
  axil: [number, number];
}

export function sharkGeometry(): SharkGeometry {
  const pos: number[] = [];
  const dat: number[] = [];
  const jaw: number[] = [];
  const idx: number[] = [];
  const v = (p: [number, number, number], d: [number, number, number, number], j = 0): number => {
    pos.push(p[0], p[1], p[2]);
    dat.push(...d);
    jaw.push(j);
    return pos.length / 3 - 1;
  };
  const tri = (a: number, b: number, c: number): void => void idx.push(a, b, c);
  const quad = (a: number, b: number, c: number, d: number): void => (tri(a, b, c), tri(a, c, d));

  /* ── the body ─────────────────────────────────────────────────────── */
  // stations, packed toward the snout; each ring: the upper arc (UP points, over the back from the
  // left mouth seam to the right) and the lower arc (LO points, under the chin, left to right).
  // The seam points are doubled, so the lower jaw can part from the upper.
  const N = 72;
  const UP = 30;
  const LO = 12;
  const stations: number[] = [];
  for (let i = 0; i <= N; i++) stations.push(BODY_END * Math.pow(i / N, 1.35));
  const rings: { up: number[]; lo: number[] }[] = [];
  for (const u of stations) {
    const pm = mouthPhi(u);
    const inJaw = u > MOUTH.front * 0.6 && u < MOUTH.corner;
    const up: number[] = [];
    const lo: number[] = [];
    const across = (phi: number): number => {
      const { T, B, W } = prof(u);
      return (phi / Math.PI) * (T + B + 2 * W) * 0.5;
    };
    // over the back: from the left seam (2PI - pm) up and over (0) and down to the right seam (pm)
    for (let k = 0; k <= UP; k++) {
      const phi = -pm + (2 * pm * k) / UP; // -pm .. +pm
      const p = onBody(u, phi);
      up.push(v(p, [u, P.BODY, Math.sign(phi) * across(Math.abs(phi)), Math.cos(phi)]));
    }
    // under the chin: from the right seam round the belly to the left seam
    for (let k = 0; k <= LO; k++) {
      const phi = pm + ((2 * Math.PI - 2 * pm) * k) / LO;
      const p = onBody(u, phi);
      const a = phi > Math.PI ? -across(2 * Math.PI - phi) : across(phi);
      lo.push(v(p, [u, P.BODY, a, Math.cos(phi)], inJaw ? 1 : 0));
    }
    rings.push({ up, lo });
  }
  for (let i = 0; i < N; i++) {
    const a = rings[i];
    const b = rings[i + 1];
    for (let k = 0; k < UP; k++) quad(a.up[k], a.up[k + 1], b.up[k + 1], b.up[k]);
    for (let k = 0; k < LO; k++) quad(a.lo[k], a.lo[k + 1], b.lo[k + 1], b.lo[k]);
  }
  // cap the tail stalk (the caudal fin hides it)
  {
    const last = rings[N];
    const ring = [...last.up, ...last.lo];
    const p = prof(BODY_END);
    const c = v([0, p.c, 0.5 - BODY_END], [BODY_END, P.BODY, 0, 0]);
    for (let k = 0; k < ring.length - 1; k++) tri(c, ring[k], ring[k + 1]);
  }

  /* ── inside the mouth: palate above, tongue below, the throat between ── */
  {
    const jawStations = stations.map((u, i) => [u, i] as const).filter(([u]) => u > MOUTH.front * 0.6 && u < MOUTH.corner);
    let prevRoof: number[] | null = null;
    let prevFloor: number[] | null = null;
    let lastRoof: number[] = [];
    let lastFloor: number[] = [];
    for (const [u, i] of jawStations) {
      const r = rings[i];
      const L = r.up[0];
      const R = r.up[UP];
      const Lj = r.lo[LO];
      const Rj = r.lo[0];
      const roof: number[] = [];
      const floor: number[] = [];
      const S = 6;
      for (let k = 0; k <= S; k++) {
        const s = k / S;
        const bend = Math.sin(Math.PI * s);
        // the palate arches up into the head; the tongue sags into the chin
        const pu = lerp3(at(pos, L), at(pos, R), s);
        pu[1] += bend * prof(u).T * 0.35;
        const pl = lerp3(at(pos, Lj), at(pos, Rj), s);
        pl[1] -= bend * prof(u).B * 0.25;
        roof.push(v(pu, [u, P.MOUTH, 0.2 + 0.8 * bend, 0], 0));
        floor.push(v(pl, [u, P.MOUTH, 0.2 + 0.8 * bend, 0], 1));
      }
      if (prevRoof && prevFloor)
        for (let k = 0; k < S; k++) {
          quad(prevRoof[k], roof[k], roof[k + 1], prevRoof[k + 1]);
          quad(prevFloor[k], prevFloor[k + 1], floor[k + 1], floor[k]);
        }
      prevRoof = roof;
      prevFloor = floor;
      lastRoof = roof;
      lastFloor = floor;
    }
    // the throat: a dark wall joining palate and tongue at the corners (it stretches as the jaw drops)
    for (let k = 0; k < lastRoof.length - 1; k++) quad(lastRoof[k], lastFloor[k], lastFloor[k + 1], lastRoof[k + 1]);
  }

  /* ── teeth ────────────────────────────────────────────────────────── */
  {
    const teeth = (upper: boolean): void => {
      for (const side of [-1, 1]) {
        const n = 13;
        for (let t = 0; t < n; t++) {
          // from the front of the mouth back toward the corner, biggest at the front
          const u = MOUTH.front + 0.004 + ((MOUTH.corner - MOUTH.front - 0.02) * (t + 0.5)) / n;
          const size = (upper ? 0.015 : 0.012) * (1 - 0.55 * (t / n));
          const pm = mouthPhi(u);
          const phi = side > 0 ? pm : -pm;
          const base = onBody(u, phi);
          // a hair inside the lip, so the gum shows
          const inward: [number, number, number] = [-side * 0.004, upper ? 0.002 : -0.002, 0];
          const b0 = add3(base, inward);
          const along = 0.0045 * (size / 0.015) + 0.002;
          const a: [number, number, number] = [b0[0], b0[1], b0[2] + along];
          const b: [number, number, number] = [b0[0], b0[1], b0[2] - along];
          const c: [number, number, number] = [b0[0] - side * 0.004, b0[1], b0[2]];
          // the blade: down (or up) and a little inward, raked back
          const tip: [number, number, number] = [b0[0] - side * 0.002, b0[1] + (upper ? -size : size), b0[2] - size * 0.15];
          const j = upper ? 0 : 1;
          const d: [number, number, number, number] = [u, TOOTH, 0, 0];
          const tipD: [number, number, number, number] = [u, TOOTH, 1, 0];
          const ia = v(a, d, j);
          const ib = v(b, d, j);
          const ic = v(c, d, j);
          const it = v(tip, tipD, j);
          // wound so each face points out of the blade on either side
          if ((side > 0) === upper) {
            tri(ia, ib, it);
            tri(ib, ic, it);
            tri(ic, ia, it);
          } else {
            tri(ia, it, ib);
            tri(ib, it, ic);
            tri(ic, it, ia);
          }
        }
      }
    };
    teeth(true);
    teeth(false);
  }

  /* ── fins ─────────────────────────────────────────────────────────── */
  // a membrane from a root chord to a tip: rows from root (t 0) to the edge (t 1), columns from
  // the leading edge (w 0) to the trailing edge (w rays)
  const membrane = (
    part: number,
    root: (s: number) => [number, number, number],
    leading: (t: number) => [number, number, number],
    trailing: (t: number) => [number, number, number],
    uOf: (s: number) => number,
    rows = 8,
    cols = 6,
    rays = 8,
  ): void => {
    const grid: number[][] = [];
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      const row: number[] = [];
      for (let c = 0; c <= cols; c++) {
        const s = c / cols;
        const le = t === 0 ? root(0) : leading(t);
        const te = t === 0 ? root(1) : trailing(t);
        const rootPt = root(s);
        // blend: across the chord at this height, anchored on the root at t = 0
        const p = t === 0 ? rootPt : lerp3(le, te, s);
        row.push(v(p, [uOf(s), part, t, s * rays]));
      }
      grid.push(row);
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) quad(grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]);
  };

  // the first dorsal: tall, swept back, a concave trailing edge
  {
    const u0 = 0.33;
    const u1 = 0.47;
    const H = 0.135;
    const topAt = (u: number): [number, number, number] => {
      const p = onBody(u, 0);
      return [0, p[1] - 0.002, p[2]];
    };
    const tip: [number, number, number] = [0, prof(0.4).c + prof(0.4).T + H, 0.5 - 0.465];
    membrane(
      P.DORSAL1,
      (s) => topAt(u0 + (u1 - u0) * s),
      (t) => {
        const a = topAt(u0);
        const q = lerp3(a, tip, t);
        q[2] += 0.012 * Math.sin(Math.PI * t); // a convex leading edge
        return q;
      },
      (t) => {
        const a = topAt(u1);
        const q = lerp3(a, tip, t);
        q[2] += 0.02 * Math.sin(Math.PI * t) * (1 - t * 0.3); // cut away: the falcate trailing edge
        return q;
      },
      (s) => u0 + (u1 - u0) * s,
      10,
      7,
    );
  }
  // the second dorsal and the anal fin: small triangles near the tail
  const smallFin = (part: number, u0: number, u1: number, h: number, down: boolean): void => {
    const edge = (u: number): [number, number, number] => {
      const p = onBody(u, down ? Math.PI : 0);
      return [0, p[1] + (down ? 0.001 : -0.001), p[2]];
    };
    const tip = edge(u1 + 0.01);
    tip[1] += down ? -h : h;
    membrane(part, (s) => edge(u0 + (u1 - u0) * s), (t) => lerp3(edge(u0), tip, t), (t) => lerp3(edge(u1), tip, t), (s) => u0 + (u1 - u0) * s, 3, 3, 4);
  };
  smallFin(P.DORSAL2, 0.7, 0.73, 0.022, false);
  smallFin(P.ANAL, 0.72, 0.745, 0.018, true);

  // the pectorals: long sickles, low on the flank behind the gills, swept down and back
  for (const side of [-1, 1]) {
    const phi = side * Math.PI * 0.66;
    const u0 = 0.215;
    const u1 = 0.315;
    const rootAt = (u: number): [number, number, number] => {
      const p = onBody(u, phi);
      return [p[0] - side * 0.002, p[1], p[2]];
    };
    const r0 = rootAt(u0);
    const tip: [number, number, number] = [r0[0] + side * 0.16, r0[1] - 0.085, r0[2] - 0.15];
    membrane(
      P.PECTORAL,
      (s) => rootAt(u0 + (u1 - u0) * s),
      (t) => lerp3(r0, tip, t),
      (t) => {
        const q = lerp3(rootAt(u1), tip, t);
        q[2] += 0.018 * Math.sin(Math.PI * t) * (1 - t); // the sickle's hollow, near the tip
        return q;
      },
      (s) => u0 + (u1 - u0) * s,
      9,
      5,
    );
  }
  // the pelvics: small, under the belly
  for (const side of [-1, 1]) {
    const phi = side * Math.PI * 0.85;
    const u0 = 0.6;
    const u1 = 0.64;
    const rootAt = (u: number): [number, number, number] => onBody(u, phi);
    const r0 = rootAt(u0);
    const tip: [number, number, number] = [r0[0] + side * 0.025, r0[1] - 0.03, r0[2] - 0.05];
    membrane(P.PELVIC, (s) => rootAt(u0 + (u1 - u0) * s), (t) => lerp3(r0, tip, t), (t) => lerp3(rootAt(u1), tip, t), (s) => u0 + (u1 - u0) * s, 3, 3, 4);
  }

  // the tail: a crescent, the upper lobe a touch the longer, off the end of the stalk
  {
    const e = prof(BODY_END);
    const z0 = 0.5 - BODY_END + 0.012;
    const rootTop: [number, number, number] = [0, e.c + e.T * 0.9, z0];
    const rootBot: [number, number, number] = [0, e.c - e.B * 0.9, z0];
    const upperTip: [number, number, number] = [0, e.c + 0.185, -0.5];
    const lowerTip: [number, number, number] = [0, e.c - 0.16, -0.47];
    const notch: [number, number, number] = [0, e.c + 0.008, z0 - 0.1];
    // the trailing edge, upper tip → notch → lower tip, bowed forward (the crescent)
    const edge = (s: number): [number, number, number] => {
      if (s < 0.5) {
        const k = s / 0.5;
        const q = lerp3(upperTip, notch, k);
        q[2] += 0.022 * Math.sin(Math.PI * k);
        return q;
      }
      const k = (s - 0.5) / 0.5;
      const q = lerp3(notch, lowerTip, k);
      q[2] += 0.02 * Math.sin(Math.PI * k);
      return q;
    };
    const rows = 8;
    const cols = 16;
    const grid: number[][] = [];
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      const row: number[] = [];
      for (let c = 0; c <= cols; c++) {
        const s = c / cols;
        const root = lerp3(rootTop, rootBot, s);
        const q = lerp3(root, edge(s), t);
        // the leading edges bow outward a little (a fuller lobe)
        const lobe = Math.abs(s - 0.5) * 2;
        q[2] -= 0.03 * Math.sin(Math.PI * t) * lobe * lobe;
        row.push(v(q, [BODY_END + (1 - BODY_END) * t, P.CAUDAL, t, s * 12]));
      }
      grid.push(row);
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) quad(grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]);
  }

  /* ── normals: face normals summed onto vertices, shared across coincident vertices of a piece ── */
  const n = pos.length / 3;
  const normal = new Float32Array(n * 3);
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]];
    const ab = sub3(at(pos, b), at(pos, a));
    const ac = sub3(at(pos, c), at(pos, a));
    const f = cross3(ab, ac);
    for (const k of [a, b, c]) for (let d = 0; d < 3; d++) normal[k * 3 + d] += f[d];
  }
  // body vertices at the same place on the same side of the mouth smooth together (the seams)
  const key = (i: number): string => `${Math.round(pos[i * 3] * 1e5)},${Math.round(pos[i * 3 + 1] * 1e5)},${Math.round(pos[i * 3 + 2] * 1e5)},${jaw[i]},${Math.floor(dat[i * 4 + 1])}`;
  const groups = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const k = key(i);
    const g = groups.get(k);
    if (g) g.push(i);
    else groups.set(k, [i]);
  }
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const s = [0, 0, 0];
    for (const i of g) for (let d = 0; d < 3; d++) s[d] += normal[i * 3 + d];
    for (const i of g) for (let d = 0; d < 3; d++) normal[i * 3 + d] = s[d];
  }
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2]) || 1;
    for (let d = 0; d < 3; d++) normal[i * 3 + d] /= l;
  }

  const hinge = onBody(MOUTH.corner, MOUTH_PHI);
  const eyeU = 0.1;
  const eyeP = onBody(eyeU, Math.PI * 0.32);
  const axilP = onBody(0.3, Math.PI * 0.66);
  return {
    position: new Float32Array(pos),
    normal,
    data: new Float32Array(dat),
    jaw: new Float32Array(jaw),
    index: new Uint32Array(idx),
    hinge: [hinge[2], hinge[1]],
    eye: { z: eyeP[2], y: eyeP[1], r: 0.0085 },
    gills: 0.5 - 0.205,
    axil: [axilP[2], axilP[1]],
  };
}

type V3 = [number, number, number];
function at(a: number[], i: number): V3 {
  return [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]];
}
function lerp3(a: V3, b: V3, t: number): V3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function add3(a: V3, b: V3): V3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function sub3(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross3(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
