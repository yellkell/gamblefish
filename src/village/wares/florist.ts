/**
 * THE FLORIST's plants (D), for your shack: a kentia palm, a hibiscus in bloom, a Boston fern in
 * a macramé hanger, a moth orchid on a bamboo stand, and a monstera in a woven basket.
 *
 * Every leaf, leaflet and petal is a blade (village/craft.ts) grown from the plant's own stems:
 * nothing floats. Each plant is seeded, so it grows the same every time.
 */

import { Vector3, type BufferGeometry, type Object3D } from 'three';
import { aim, Batch, blade, bladeSurface, M, OUTLINE, patch, rng, stalk, turned, type Kit } from '../craft.ts';

const UP = new Vector3(0, 1, 0);
const DOWN = new Vector3(0, -1, 0);

/** a pot: a lathe profile with a rolled rim, down inside to the soil; returns the soil's height */
export function pot(k: Kit, b: Batch, r: number, h: number, mat = M.terracotta(k.renderer), soilAt = 0.9): number {
  b.add(
    mat,
    turned([
      [0, 0],
      [r * 0.7, 0],
      [r * 0.74, 0.012],
      [r * 0.92, h * 0.84],
      [r * 1.0, h * 0.86],
      [r * 1.04, h * 0.93],
      [r * 1.02, h],
      [r * 0.95, h * 1.005],
      [r * 0.91, h * 0.97],
      [r * 0.89, h * soilAt],
    ]),
  );
  const top = h * soilAt;
  b.add(M.soil(k.renderer), turned([[0, top + 0.012], [r * 0.5, top + 0.008], [r * 0.9, top]], 20));
  return top;
}

/** a point along a curve that leaves `from` along `dir` and bends toward `bend` (rad over its length) */
function arc(from: Vector3, dir: Vector3, len: number, bendTo: Vector3, bend: number, n = 6): Vector3[] {
  const pts = [from.clone()];
  const d = dir.clone().normalize();
  const axis = new Vector3().crossVectors(d, bendTo).normalize();
  const step = len / n;
  const p = from.clone();
  for (let i = 1; i <= n; i++) {
    const cur = d.clone().applyAxisAngle(axis, (bend * (i - 0.5)) / n);
    p.addScaledVector(cur, step);
    pts.push(p.clone());
  }
  return pts;
}

/** tangent of a polyline at fraction u, and the point there */
function along(pts: Vector3[], u: number, p: Vector3, t: Vector3): void {
  const f = u * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(f));
  p.lerpVectors(pts[i], pts[i + 1], f - i);
  t.subVectors(pts[i + 1], pts[i]).normalize();
}

const _p = new Vector3();
const _t = new Vector3();

/* ── the kentia palm ─────────────────────────────────────────────────── */

export function kentia(k: Kit): Object3D {
  const b = new Batch();
  const r = rng(11);
  const soil = pot(k, b, 0.2, 0.4, M.glaze(k.renderer, '#2a5e6e'));
  const stem = M.satin(k.renderer, '#5c6a30');
  const leaf = M.leaf(k.renderer);
  const fronds = 8;
  for (let f = 0; f < fronds; f++) {
    const az = (f / fronds) * Math.PI * 2 + r() * 0.5;
    const out = new Vector3(Math.cos(az), 0, Math.sin(az));
    const base = new Vector3(out.x * 0.04, soil, out.z * 0.04);
    const H = 0.45 + r() * 0.5;
    // the stem: up, leaning out a little
    const top = base.clone().addScaledVector(UP, H).addScaledVector(out, H * (0.18 + r() * 0.12));
    const mid = base.clone().lerp(top, 0.5).addScaledVector(out, -0.02);
    b.add(stem, stalk([base, mid, top], 0.011, 0.007, 6, 8));
    // the frond: the rachis carries on up and out, arching over and down
    const dir = top.clone().sub(mid).normalize().lerp(out, 0.35).normalize();
    const L = 0.55 + r() * 0.25;
    const rachis = arc(top, dir, L, DOWN, 1.5 + r() * 0.4, 8);
    b.add(stem, stalk(rachis, 0.006, 0.0015, 5, 16));
    const n = 17;
    for (let i = 0; i < n; i++) {
      const u = 0.06 + (0.92 * i) / (n - 1);
      along(rachis, u, _p, _t);
      const side0 = new Vector3().crossVectors(_t, UP).normalize();
      for (const side of [-1, 1]) {
        const len = 0.25 * Math.pow(Math.sin(Math.PI * (0.12 + 0.82 * u)), 0.7);
        const d = side0.clone().multiplyScalar(side).multiplyScalar(0.8).addScaledVector(_t, 0.55).addScaledVector(UP, -0.18 - u * 0.2).normalize();
        const g = blade({ len, width: 0.024, outline: OUTLINE.strap, fold: 0.55, arch: 0.7, segs: 5, across: 1, base: '#1e4e1e', tip: '#3c7a2a', rib: '#6a9a4a' });
        b.add(leaf, g, aim(_p, d, DOWN));
      }
    }
  }
  return b.group();
}

/* ── the hibiscus ─────────────────────────────────────────────────────── */

/** a hibiscus flower at `at`, facing `face` */
function hibiscusFlower(k: Kit, b: Batch, at: Vector3, face: Vector3, r: () => number, size = 1): void {
  const f = face.clone().normalize();
  const u0 = new Vector3().crossVectors(f, Math.abs(f.y) > 0.9 ? new Vector3(1, 0, 0) : UP).normalize();
  const v0 = new Vector3().crossVectors(f, u0);
  const petal = M.petal(k.renderer);
  const spin = r() * Math.PI;
  for (let i = 0; i < 5; i++) {
    const a = spin + (i / 5) * Math.PI * 2;
    const radial = u0.clone().multiplyScalar(Math.cos(a)).addScaledVector(v0, Math.sin(a));
    const up = radial.clone().multiplyScalar(Math.cos(0.75)).addScaledVector(f, Math.sin(0.75));
    const g = blade({ len: 0.085 * size, width: 0.085 * size, outline: OUTLINE.petal, fold: 0.05, cup: -0.12, arch: 0.85, archPow: 1.2, twist: 0.35, ripple: 0.06, ripples: 2, segs: 8, across: 3, base: '#7a0630', tip: '#ff6a92', rim: '#ffa8c0', rib: '#c8104a' });
    // each petal a hair further out than the last: they overlap like a pinwheel, not in a fight
    b.add(petal, g, aim(at.clone().addScaledVector(f, i * 0.0012 * size), up, f.clone().negate()));
  }
  // the staminal column, curving up and out, dusted with pollen at its end
  const col = [at.clone(), at.clone().addScaledVector(f, 0.03 * size).addScaledVector(v0, 0.004), at.clone().addScaledVector(f, 0.06 * size).addScaledVector(v0, 0.012)];
  b.add(M.satin(k.renderer, '#ffc8d6'), stalk(col, 0.0028 * size, 0.0018 * size, 5, 6));
  const tip = col[2];
  const pollen = M.satin(k.renderer, '#ffcc30');
  for (let j = 0; j < 7; j++) {
    const a = (j / 7) * Math.PI * 2;
    const p = tip.clone().addScaledVector(f, -0.012 * size + (j % 3) * 0.004 * size).addScaledVector(u0, Math.cos(a) * 0.004 * size).addScaledVector(v0, Math.sin(a) * 0.004 * size);
    b.at(pollen, turned([[0, -0.003], [0.0032, 0], [0, 0.003]], 6), p.x, p.y, p.z, 0, 0, 0, size);
  }
  b.at(M.satin(k.renderer, '#b01030'), turned([[0, -0.003], [0.004, 0], [0, 0.004]], 8), tip.x, tip.y, tip.z, 0, 0, 0, size);
  // the calyx behind it
  for (let i = 0; i < 5; i++) {
    const a = spin + ((i + 0.5) / 5) * Math.PI * 2;
    const radial = u0.clone().multiplyScalar(Math.cos(a)).addScaledVector(v0, Math.sin(a));
    b.add(M.leaf(k.renderer), blade({ len: 0.028 * size, width: 0.014 * size, outline: OUTLINE.lance, fold: 0.3, segs: 3, across: 1, base: '#2e5a22', tip: '#4a7a30' }), aim(at.clone().addScaledVector(f, -0.004), radial.clone().addScaledVector(f, -0.35), f));
  }
}

export function hibiscus(k: Kit): Object3D {
  const b = new Batch();
  const r = rng(23);
  const soil = pot(k, b, 0.17, 0.3);
  const wood = M.satin(k.renderer, '#5a4028');
  const leaf = M.leaf(k.renderer);
  const tips: { p: Vector3; d: Vector3 }[] = [];
  const branch = (from: Vector3, dir: Vector3, len: number, depth: number): void => {
    const pts = arc(from, dir, len, UP, 0.25 - r() * 0.5, 4);
    b.add(wood, stalk(pts, 0.009 - depth * 0.003, 0.004, 5, 8));
    // leaves along the outer two thirds, alternating round the branch
    const n = Math.round(len * 26);
    for (let i = 0; i < n; i++) {
      const u = 0.3 + (0.68 * i) / Math.max(1, n - 1);
      along(pts, u, _p, _t);
      const a = i * 2.4 + r();
      const side = new Vector3().crossVectors(_t, UP).normalize();
      const round = side.clone().applyAxisAngle(_t, a);
      const d = round.addScaledVector(_t, 0.7).addScaledVector(UP, 0.25).normalize();
      const L = 0.085 + r() * 0.04;
      b.add(leaf, blade({ len: L, width: L * 0.72, outline: OUTLINE.ovate, fold: 0.28, arch: 0.8, ripple: 0.07, ripples: 4, segs: 6, across: 2, base: '#1e4a1a', tip: '#3c7a2c', rib: '#6a9a48' }), aim(_p, d, DOWN));
    }
    along(pts, 1, _p, _t);
    if (depth === 0) {
      // a side shoot
      along(pts, 0.55, _p, _t);
      const side = new Vector3().crossVectors(_t, UP).normalize().multiplyScalar(r() < 0.5 ? 1 : -1);
      branch(_p.clone(), _t.clone().lerp(side, 0.6).normalize(), len * 0.55, 1);
    }
    along(pts, 1, _p, _t);
    tips.push({ p: _p.clone(), d: _t.clone() });
  };
  for (let i = 0; i < 5; i++) {
    const az = (i / 5) * Math.PI * 2 + r() * 0.4;
    const out = new Vector3(Math.cos(az), 0, Math.sin(az));
    branch(new Vector3(out.x * 0.03, soil, out.z * 0.03), out.clone().multiplyScalar(0.45).add(UP).normalize(), 0.42 + r() * 0.2, 0);
  }
  // flowers at most tips, buds at the rest
  tips.forEach((t, i) => {
    const face = t.d.clone().setY(0).normalize().multiplyScalar(0.8).addScaledVector(UP, 0.7).normalize();
    if (i % 3 !== 2) hibiscusFlower(k, b, t.p.clone().addScaledVector(t.d, 0.012), face, r, 0.9 + r() * 0.25);
    else {
      const bud = t.p.clone().addScaledVector(t.d, 0.02);
      b.at(M.satin(k.renderer, '#e8406a'), turned([[0, 0], [0.012, 0.012], [0.011, 0.03], [0, 0.05]], 8), bud.x, bud.y, bud.z, 0, 0, 0);
      b.at(M.satin(k.renderer, '#3a6a28'), turned([[0, -0.004], [0.013, 0.008], [0.01, 0.018], [0.0, 0.014]], 8), bud.x, bud.y, bud.z);
    }
  });
  return b.group();
}

/* ── the Boston fern, hung in macramé ─────────────────────────────────── */

export function fern(k: Kit): Object3D {
  const b = new Batch();
  const r = rng(37);
  const rat = M.rattan(k.renderer, '#b89060');
  const R = 0.17;
  // the basket: a woven bowl with a rolled rim
  b.add(rat, turned([[0, -0.15], [R * 0.5, -0.14], [R * 0.85, -0.1], [R, -0.03], [R * 1.02, 0.01], [R * 0.95, 0.015], [R * 0.9, -0.005]], 24));
  b.add(M.soil(k.renderer), turned([[0, 0.004], [R * 0.9, -0.004]], 20));
  // the hanger: three cords from the rim, knotted, up to a ring under the ceiling
  const jute = M.satin(k.renderer, '#c8a878');
  const ring = new Vector3(0, 0.42, 0);
  const knot = new Vector3(0, 0.3, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    const rim = new Vector3(Math.cos(a) * R * 1.02, 0.0, Math.sin(a) * R * 1.02);
    const under = new Vector3(Math.cos(a) * R * 0.7, -0.16, Math.sin(a) * R * 0.7);
    b.add(jute, stalk([under, rim.clone().setY(-0.06).multiplyScalar(1.06).setY(-0.06), rim, rim.clone().lerp(knot, 0.5).setY(0.16), knot], 0.004, 0.004, 5, 14));
  }
  b.add(jute, turned([[0, 0.28], [0.014, 0.29], [0.016, 0.31], [0.012, 0.325], [0, 0.33]], 10));
  b.add(jute, stalk([knot, ring], 0.005, 0.005, 5, 3));
  b.at(M.brass(k.renderer), turned([[0.02, -0.004], [0.024, 0], [0.02, 0.004], [0.016, 0]], 12), ring.x, ring.y + 0.02, ring.z, Math.PI / 2);
  // the fronds: up out of the soil, arching over the rim and hanging down past the basket
  const stem = M.satin(k.renderer, '#3e6a2a');
  const leaf = M.leaf(k.renderer);
  const n = 22;
  for (let f = 0; f < n; f++) {
    const az = (f / n) * Math.PI * 2 * 2.618 + r() * 0.3;
    const out = new Vector3(Math.cos(az), 0, Math.sin(az));
    const inner = f % 3 === 0;
    const start = new Vector3(out.x * 0.04, 0.005, out.z * 0.04);
    const dir = out.clone().multiplyScalar(inner ? 0.4 : 0.8).addScaledVector(UP, inner ? 1 : 0.7).normalize();
    const L = inner ? 0.3 + r() * 0.12 : 0.45 + r() * 0.2;
    const rachis = arc(start, dir, L, DOWN, inner ? 1.4 : 2.4 + r() * 0.4, 9);
    b.add(stem, stalk(rachis, 0.0025, 0.001, 4, 12));
    const m = inner ? 16 : 22;
    for (let i = 0; i < m; i++) {
      const u = 0.06 + (0.92 * i) / (m - 1);
      along(rachis, u, _p, _t);
      const side0 = new Vector3().crossVectors(_t, UP);
      if (side0.lengthSq() < 1e-6) side0.set(1, 0, 0);
      side0.normalize();
      for (const side of [-1, 1]) {
        const len = 0.05 * Math.pow(Math.sin(Math.PI * (0.1 + 0.85 * u)), 0.6);
        const d = side0.clone().multiplyScalar(side * 0.85).addScaledVector(_t, 0.5).normalize();
        b.add(leaf, blade({ len, width: 0.014, outline: OUTLINE.lance, fold: 0.35, arch: 0.4, ripple: 0.12, ripples: 3, segs: 3, across: 1, base: '#1e5018', tip: '#4a8a2a', rib: '#6aa048' }), aim(_p, d, DOWN));
      }
    }
  }
  return b.group();
}

/* ── the moth orchid on its stand ─────────────────────────────────────── */

function orchidFlower(k: Kit, b: Batch, at: Vector3, face: Vector3, s = 1): void {
  const f = face.clone().normalize();
  const right = new Vector3().crossVectors(UP, f).normalize();
  const up = new Vector3().crossVectors(f, right).normalize();
  const petal = M.petal(k.renderer);
  const dirAt = (deg: number): Vector3 => {
    const a = (deg * Math.PI) / 180;
    return right.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
  };
  const place = (deg: number, o: Parameters<typeof blade>[0], lift: number): void => {
    const d = dirAt(deg).addScaledVector(f, 0.12).normalize();
    b.add(petal, blade(o), aim(at.clone().addScaledVector(f, lift), d, f));
  };
  const white = { base: '#c8306e', tip: '#fbe6f0', rim: '#ffffff', rib: '#e070a0' };
  // sepals: the dorsal one up, two below
  for (const deg of [90, 215, 325]) place(deg, { len: 0.036 * s, width: 0.022 * s, outline: OUTLINE.ovate, fold: 0.05, cup: 0.15, arch: -0.25, segs: 5, across: 2, ...white, base: '#e090b8' }, 0);
  // the two broad petals, either side, a little in front
  for (const deg of [22, 158]) place(deg, { len: 0.036 * s, width: 0.05 * s, outline: OUTLINE.round, fold: 0.04, cup: 0.12, arch: -0.2, segs: 6, across: 3, ...white }, 0.002 * s);
  // the lip: small, cupped, magenta with a yellow throat
  place(270, { len: 0.024 * s, width: 0.02 * s, outline: OUTLINE.petal, cup: 0.9, arch: 0.6, segs: 5, across: 2, base: '#f0c030', tip: '#b01860', rib: '#ffd860', rim: '#90104a' }, 0.004 * s);
  // the column
  b.at(M.gloss(k.renderer, '#fff8f0'), turned([[0, 0], [0.004, 0.003], [0.003, 0.009], [0, 0.011]], 8), at.x, at.y, at.z, Math.PI / 2 - 0.3, Math.atan2(f.x, f.z), 0, s);
}

export function orchid(k: Kit): Object3D {
  const b = new Batch();
  // the stand: three bamboo legs splayed a little, a round top and a shelf ring
  const bam = M.wood(k.renderer, 'bamboo', 0.35);
  const H = 0.55;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const foot = new Vector3(Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17);
    const head = new Vector3(Math.cos(a) * 0.12, H - 0.03, Math.sin(a) * 0.12);
    b.add(bam, stalk([foot, head], 0.014, 0.012, 8, 2, true));
    // bamboo nodes
    for (const u of [0.3, 0.65]) {
      const p = foot.clone().lerp(head, u);
      b.at(bam, turned([[0.0145, -0.006], [0.017, 0], [0.0145, 0.006]], 10), p.x, p.y, p.z);
    }
  }
  b.at(bam, turned([[0, -0.02], [0.18, -0.02], [0.185, -0.012], [0.185, 0.0], [0.18, 0.006], [0, 0.006]], 28), 0, H - 0.006, 0);
  b.at(bam, turned([[0.13, -0.008], [0.14, 0], [0.13, 0.008], [0.12, 0]], 24), 0, 0.22, 0);
  // the pot: white glaze, moss on top
  b.at(M.glaze(k.renderer, '#f4f0ea'), turned([[0, 0], [0.07, 0], [0.088, 0.12], [0.095, 0.15], [0.09, 0.155], [0.082, 0.14]], 24), 0, H, 0);
  b.at(M.satin(k.renderer, '#4e5e2a'), turned([[0, 0.145], [0.082, 0.14]], 16), 0, H, 0);
  const top = H + 0.14;
  // the leaves: broad, fleshy, splayed out over the pot's rim
  const leaf = M.leaf(k.renderer);
  [0, Math.PI, 0.5, Math.PI + 0.5].forEach((az, i) => {
    const out = new Vector3(Math.cos(az), 0, Math.sin(az));
    const len = 0.26 - i * 0.025;
    b.add(leaf, blade({ len, width: 0.1, outline: OUTLINE.ovate, fold: 0.28, arch: 1.4, archPow: 1.1, segs: 8, across: 2, base: '#2a5424', tip: '#4c7a34', rib: '#5e8a44' }), aim(new Vector3(out.x * 0.01, top + i * 0.004, out.z * 0.01), out.clone().multiplyScalar(0.5).addScaledVector(UP, 0.85), DOWN));
  });
  // the stake and the flower spike, up it and arching forward
  b.add(bam, stalk([new Vector3(-0.015, top - 0.02, -0.02), new Vector3(-0.015, top + 0.3, -0.02)], 0.003, 0.0025, 5, 2, true));
  const spike = [new Vector3(-0.01, top, -0.01), new Vector3(-0.012, top + 0.14, -0.016), new Vector3(-0.01, top + 0.27, -0.014), new Vector3(0.0, top + 0.34, 0.03), new Vector3(0.0, top + 0.36, 0.11), new Vector3(0.0, top + 0.33, 0.19), new Vector3(0.0, top + 0.28, 0.25)];
  b.add(M.satin(k.renderer, '#4a5a2a'), stalk(spike, 0.003, 0.0018, 5, 24));
  b.at(M.gloss(k.renderer, '#e8e0d0'), turned([[0.0045, -0.004], [0.0055, 0], [0.0045, 0.004]], 8), -0.013, top + 0.2, -0.018);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const u = 0.52 + (0.4 * i) / (n - 1);
    along(spike, u, _p, _t);
    // hanging just under the spike, facing out front and a touch down
    const at = _p.clone().add(new Vector3(0, -0.035, 0.016));
    b.add(M.satin(k.renderer, '#4a5a2a'), stalk([_p.clone(), _p.clone().add(new Vector3(0, -0.015, 0.004)), at], 0.0014, 0.0012, 4, 4));
    orchidFlower(k, b, at, new Vector3((i % 2 ? 0.3 : -0.3), -0.1, 1), 1.75 - i * 0.06);
  }
  // buds at the tip
  along(spike, 1, _p, _t);
  for (let i = 0; i < 2; i++) {
    const p = _p.clone().add(new Vector3(0, -0.008 - i * 0.012, 0.01 + i * 0.012));
    b.at(M.satin(k.renderer, i ? '#c8d8a0' : '#e8c0d8'), turned([[0, -0.008], [0.007, -0.002], [0.006, 0.004], [0, 0.008]], 8), p.x, p.y, p.z);
  }
  return b.group();
}

/* ── the monstera in a basket (new) ───────────────────────────────────── */

/** a monstera leaf: heart-shaped, cut into lobes by slits running out toward the tip */
function monsteraLeaf(len: number, width: number, seed: number): BufferGeometry[] {
  const surf = bladeSurface({ len, width, outline: OUTLINE.heart, fold: 0.1, arch: 0.75, archPow: 1.6, cup: -0.06, base: '#173f18', tip: '#2a6226', rib: '#8ab868', rim: '#224e20' });
  const r = rng(seed);
  const IN = 0.24;
  const parts = [patch(surf, 0, 1, -IN, IN, 16, 4)];
  const lobes = 7;
  const bounds = [0.02];
  for (let i = 1; i < lobes; i++) bounds.push((i / lobes) * 0.92 + (r() - 0.5) * 0.04);
  bounds.push(0.96);
  for (const side of [-1, 1]) {
    for (let i = 0; i < lobes; i++) {
      // the slit between this lobe and the last, widening toward the edge
      const t0 = bounds[i] + (i === 0 ? 0 : 0.028);
      const t1 = bounds[i + 1] - (i === lobes - 1 ? 0 : 0.006);
      parts.push(side < 0 ? patch(surf, t0, t1, -1, -IN, 3, 4, 0.2) : patch(surf, t0, t1, IN, 1, 3, 4, 0.2));
    }
  }
  return parts;
}

export function monstera(k: Kit): Object3D {
  const b = new Batch();
  const r = rng(53);
  // the basket: woven rattan round a hidden liner, with a rolled rim
  const rat = M.rattan(k.renderer, '#c09a60');
  b.add(rat, turned([[0, 0], [0.17, 0], [0.18, 0.01], [0.2, 0.28], [0.215, 0.29], [0.215, 0.31], [0.2, 0.315], [0.19, 0.3]], 28));
  b.add(M.soil(k.renderer), turned([[0, 0.295], [0.19, 0.29]], 20));
  const soil = 0.29;
  // a coir pole for it to climb
  b.add(M.cloth(k.renderer, '#6a4a2e', 'canvas'), stalk([new Vector3(0.02, soil - 0.02, -0.03), new Vector3(0.02, soil + 0.62, -0.03)], 0.022, 0.02, 10, 2, true));
  const petiole = M.satin(k.renderer, '#3a6a2a');
  const leaf = M.leaf(k.renderer);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 * 1.618 + r() * 0.4;
    const out = new Vector3(Math.cos(az), 0, Math.sin(az));
    const h = 0.2 + r() * 0.55;
    const base = new Vector3(out.x * 0.03, soil, out.z * 0.03);
    const tip = base.clone().addScaledVector(UP, h).addScaledVector(out, 0.12 + r() * 0.12);
    const mid = base.clone().lerp(tip, 0.5).addScaledVector(out, -0.03);
    b.add(petiole, stalk([base, mid, tip], 0.008, 0.005, 6, 8));
    const len = 0.3 + r() * 0.16;
    // the leaf held out, face up, drooping at its tip
    const d = out.clone().multiplyScalar(0.95).addScaledVector(UP, 0.3).normalize();
    const m = aim(tip, d, DOWN);
    for (const g of monsteraLeaf(len, len * 1.15, i + 1)) b.add(leaf, g, m);
  }
  return b.group();
}
