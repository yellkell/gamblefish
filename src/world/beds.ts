/**
 * The village beds' flowering plants, made the way the Florist's are (village/craft.ts): every
 * leaf and bract a blade grown from its own stem, nothing floating.
 *
 *  HELICONIA      a clump of paddle leaves on long stalks, arching over, and upright flower
 *                 spikes: boat-shaped bracts, red with a yellow lip, stepping up the spike from
 *                 side to side, a little yellow-green flower peeping out of each.
 *  BIRD OF PARADISE (strelitzia) a fan of grey-green leaves on upright stalks, and flower stalks
 *                 as tall as the leaves ending in the beak: a green spathe with a red edge lying
 *                 on its side, three orange sepals standing up out of it and the blue tongue.
 *
 * Each comes in two builds: `hi` for the plants round you, a coarse one (a few segments per
 * blade, no little flowers) for the rest of the bed (world/vegetation.ts swaps them at ~16 m).
 * Both are one geometry for the instanced foliage draw: vertex colours, and texture coordinates
 * on the foliage atlas's opaque block.
 */

import { BufferAttribute, Color, Vector3, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { aim, blade, OUTLINE, rng, stalk } from '../village/craft.ts';

const UP = new Vector3(0, 1, 0);
const DOWN = new Vector3(0, -1, 0);

/** the foliage atlas's opaque white block (world/vegetation.ts SOLID_U / SOLID_V) */
const SOLID: [number, number] = [0.99, 0.01];

/** a paddle: an oblong blade with a rounded base and a short point (banana, heliconia) */
const PADDLE = (t: number): number => Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.94 + 0.03)), 0.45);
/** a strelitzia leaf: oblong, tapering to both ends */
const OBLONG = (t: number): number => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.6);

/** Onto the foliage atlas's opaque block, coloured `hex` where it isn't already. */
function solid(g: BufferGeometry, hex?: string): BufferGeometry {
  const n = g.getAttribute('position').count;
  if (hex !== undefined || !g.getAttribute('color')) {
    const c = new Color(hex ?? '#ffffff');
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new BufferAttribute(a, 3));
  }
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) uv.set(SOLID, i * 2);
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  return g;
}

/** tangent and point along a polyline at fraction u */
function along(pts: Vector3[], u: number, p: Vector3, t: Vector3): void {
  const f = Math.max(0, Math.min(1, u)) * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(f));
  p.lerpVectors(pts[i], pts[i + 1], f - i);
  t.subVectors(pts[i + 1], pts[i]).normalize();
}

class Parts {
  readonly list: BufferGeometry[] = [];
  add(g: BufferGeometry, hex?: string): void {
    this.list.push(solid(g, hex));
  }
  /** a blade placed: its spine along `up`, bending toward `lean` */
  place(g: BufferGeometry, at: Vector3, up: Vector3, lean: Vector3): void {
    g.applyMatrix4(aim(at, up, lean));
    this.add(g);
  }
  merged(): BufferGeometry {
    return mergeGeometries(this.list, false)!;
  }
}

/* ── heliconia ─────────────────────────────────────────────────────────── */

export function heliconia(hi: boolean): BufferGeometry {
  const r = rng(41);
  const P = new Parts();
  // the leaves: stalks fanning up out of the clump, each blade carrying on its line and arching over
  const leaves = 7;
  for (let i = 0; i < leaves; i++) {
    const az = i * 2.4 + r() * 0.5;
    const out = new Vector3(Math.cos(az), 0, Math.sin(az));
    const H = 0.5 + r() * 0.45;
    const base = out.clone().multiplyScalar(0.03 + r() * 0.05);
    const top = base.clone().addScaledVector(UP, H).addScaledVector(out, H * (0.14 + r() * 0.22));
    const mid = base.clone().lerp(top, 0.5).addScaledVector(out, -0.03);
    P.add(stalk([base, mid, top], 0.02, 0.009, hi ? 5 : 3, hi ? 6 : 2), '#4a7630');
    const dir = top.clone().sub(mid).normalize().lerp(out, 0.4).normalize();
    P.place(
      blade({ len: 0.68 + r() * 0.3, width: 0.25 + r() * 0.06, outline: PADDLE, fold: 0.14, arch: 1.0 + r() * 0.5, archPow: 1.3, twist: (r() - 0.5) * 0.5, ripple: hi ? 0.05 : 0, ripples: 3, segs: hi ? 8 : 3, across: hi ? 2 : 1, base: '#2a5a22', tip: '#3f7c2e', rib: '#a4c070', rim: '#2c5424' }),
      top,
      dir,
      DOWN,
    );
  }
  // the flower spikes: up out of the middle of the clump, bracts stepping up them side to side
  const p = new Vector3();
  const t = new Vector3();
  for (let s = 0; s < 2; s++) {
    const az = s * Math.PI + 0.7 + r() * 0.6;
    const out = new Vector3(Math.cos(az), 0, Math.sin(az));
    const H = 1.05 + r() * 0.3 - s * 0.15;
    const base = out.clone().multiplyScalar(0.04);
    const pts = [0, 0.35, 0.7, 1].map((k) => base.clone().addScaledVector(UP, H * k).addScaledVector(out, 0.1 * k * k));
    P.add(stalk(pts, 0.015, 0.009, hi ? 5 : 3, hi ? 8 : 3), '#6f7f34');
    // the bracts lie in one plane across the spike, alternating
    const across = new Vector3(-out.z, 0, out.x);
    const n = 7;
    for (let k = 0; k < n; k++) {
      const u = 0.4 + (0.58 * k) / (n - 1);
      along(pts, u, p, t);
      const side = k % 2 ? 1 : -1;
      const size = 1 - (0.5 * k) / (n - 1);
      const dir = across.clone().multiplyScalar(side * 0.72).addScaledVector(t, 0.7).normalize();
      P.place(
        blade({ len: 0.24 * size, width: 0.11 * size, outline: OUTLINE.lance, fold: 0.95, arch: 0.55, archPow: 1.2, segs: hi ? 5 : 2, across: hi ? 2 : 1, base: '#d0181c', tip: '#ff4024', rim: '#ffd84a', rib: '#e0241e' }),
        p,
        dir,
        t,
      );
      if (hi) {
        // its flower, just showing over the lip
        const a = p.clone().addScaledVector(dir, 0.03 * size).addScaledVector(t, 0.012);
        const b = p.clone().addScaledVector(dir, 0.16 * size).addScaledVector(t, 0.06 * size);
        P.add(stalk([a, a.clone().lerp(b, 0.5).addScaledVector(t, 0.01), b], 0.0045, 0.003, 4, 3), '#d8d860');
      }
    }
  }
  return P.merged();
}

/* ── bird of paradise ──────────────────────────────────────────────────── */

export function strelitzia(hi: boolean): BufferGeometry {
  const r = rng(57);
  const P = new Parts();
  // the leaves: a fan of long upright stalks, the blades standing up off them, bending out
  const leaves = 9;
  for (let i = 0; i < leaves; i++) {
    const az = i * 2.4 + r() * 0.4;
    const out = new Vector3(Math.cos(az), 0, Math.sin(az));
    const H = 0.42 + r() * 0.35;
    const base = out.clone().multiplyScalar(0.02 + r() * 0.04);
    const top = base.clone().addScaledVector(UP, H).addScaledVector(out, H * (0.1 + r() * 0.3));
    const mid = base.clone().lerp(top, 0.5).addScaledVector(out, -0.02);
    P.add(stalk([base, mid, top], 0.012, 0.007, hi ? 5 : 3, hi ? 6 : 2), '#5c7c4a');
    const dir = top.clone().sub(mid).normalize().lerp(out, 0.2).normalize();
    P.place(
      blade({ len: 0.4 + r() * 0.16, width: 0.15 + r() * 0.03, outline: OBLONG, fold: 0.28, arch: 0.45 + r() * 0.4, twist: (r() - 0.5) * 0.4, segs: hi ? 7 : 3, across: hi ? 2 : 1, base: '#3c6c36', tip: '#5c8e4a', rib: '#c0d4a8', rim: '#4a7a3e' }),
      top,
      dir,
      out,
    );
  }
  // the flowers: a stalk up to the leaves' height, then the beak lying out on its side
  for (let f = 0; f < 3; f++) {
    const az = f * 2.1 + 0.4 + r() * 0.5;
    const out = new Vector3(Math.cos(az), 0, Math.sin(az));
    const side = new Vector3(-out.z, 0, out.x);
    const H = 0.85 + r() * 0.25;
    const base = out.clone().multiplyScalar(0.03);
    const top = base.clone().addScaledVector(UP, H).addScaledVector(out, 0.1 + r() * 0.06);
    const bend = top.clone().addScaledVector(out, 0.03).addScaledVector(UP, 0.02);
    P.add(stalk([base, base.clone().lerp(top, 0.5).addScaledVector(out, 0.01), top, bend], 0.01, 0.008, hi ? 5 : 3, hi ? 8 : 3), '#6e8c5a');
    // the spathe: a boat of green, flushed purple at the tip, edged in red
    const beak = out.clone().addScaledVector(UP, 0.18).normalize();
    const L = 0.22;
    P.place(blade({ len: L, width: 0.05, outline: OUTLINE.lance, fold: 1.15, arch: 0.3, segs: hi ? 6 : 2, across: hi ? 2 : 1, base: '#46683e', tip: '#6a4c62', rim: '#c0402a', rib: '#3e5c3a' }), bend, beak, UP);
    // out of it: three orange sepals in a crest, and the blue tongue pointing on along the beak
    const at = bend.clone().addScaledVector(beak, L * 0.38).addScaledVector(UP, 0.018);
    for (let j = 0; j < 3; j++) {
      const d = UP.clone().multiplyScalar(0.9).addScaledVector(out, -0.15 + j * 0.22).addScaledVector(side, (j - 1) * 0.22).normalize();
      P.place(blade({ len: 0.14 - j * 0.01, width: 0.034, outline: OUTLINE.lance, fold: 0.35, arch: 0.35, segs: hi ? 5 : 2, across: 1, base: '#e0600a', tip: '#ffa81e', rib: '#f08a14' }), at.clone().addScaledVector(out, j * 0.012), d, out);
    }
    P.place(blade({ len: 0.11, width: 0.024, outline: OUTLINE.lance, fold: 0.6, arch: 0.3, segs: hi ? 4 : 2, across: 1, base: '#1e2c96', tip: '#3c5ce0', rib: '#2a3aa8' }), at.clone().addScaledVector(out, 0.03), out.clone().addScaledVector(UP, 0.75).normalize(), UP);
  }
  return P.merged();
}
