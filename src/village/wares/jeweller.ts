/**
 * THE JEWELLER's sparkle (A), for Coral's villa: a crystal chandelier, a dressing table with its
 * jewellery box, three strands of pearls on a velvet bust, a diamond ring under a glass cloche,
 * and (new) a mermaid's tiara on a velvet cushion, on its own little gilt table.
 */

import { CylinderGeometry, OctahedronGeometry, SphereGeometry, TorusGeometry, Vector3, type BufferGeometry, type Object3D } from 'three';
import { Batch, M, rounded, stalk, turned, type Kit } from '../craft.ts';

/** a brilliant-cut stone, table up: crown and pavilion, faceted (flat shaded) */
export function brilliant(r: number, facets = 8): BufferGeometry {
  return turned([[0, -r * 1.05], [r, -r * 0.05], [r, 0.02 * r], [r * 0.6, r * 0.42], [0, r * 0.42]], facets);
}

/** a string of beads along a curve */
function beads(b: Batch, mat: import('three').Material, pts: Vector3[], r: number, gap = 1.02, cut = false): void {
  let carry = 0;
  // a cut crystal bead is an octahedron (eight facets); a pearl is round
  const g = cut ? new OctahedronGeometry(r * 1.2) : new SphereGeometry(r, 8, 6);
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = pts[i].distanceTo(pts[i + 1]);
    let d = carry;
    while (d < seg) {
      const p = pts[i].clone().lerp(pts[i + 1], d / seg);
      b.at(mat, g, p.x, p.y, p.z);
      d += r * 2 * gap;
    }
    carry = d - seg;
  }
}

/** a hanging curve between two points, sagging by `sag` */
function swag(a: Vector3, c: Vector3, sag: number, n = 12): Vector3[] {
  const out: Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(a.clone().lerp(c, t).add(new Vector3(0, -sag * 4 * t * (1 - t), 0)));
  }
  return out;
}

/* ── the chandelier ─────────────────────────────────────────────────── */

export function chandelier(k: Kit): Object3D {
  const b = new Batch();
  const gold = M.gold(k.renderer);
  const crystal = M.crystal(k.renderer);
  // the chain up to the ceiling (left out of the board's picture)
  const chain = new Batch();
  // down from the villa's ceiling, 2 m over its top
  for (let i = 0; i < 43; i++) chain.at(gold, new TorusGeometry(0.022, 0.006, 5, 10), 0, 0.42 + i * 0.038, 0, 0, i % 2 ? Math.PI / 2 : 0, 0);
  const cg = chain.group();
  cg.userData.noThumb = true;
  // the column: turned gold, a crystal ball in its waist
  b.add(gold, turned([[0, -0.42], [0.03, -0.4], [0.05, -0.34], [0.03, -0.3], [0.02, -0.18], [0.045, -0.12], [0.06, -0.05], [0.04, 0.0], [0.02, 0.1], [0.03, 0.2], [0.05, 0.28], [0.03, 0.34], [0.015, 0.4], [0, 0.42]], 20));
  b.at(crystal, new SphereGeometry(0.07, 16, 10), 0, 0.14, 0);
  b.at(crystal, brilliant(0.05, 10), 0, -0.47, 0, Math.PI);
  // two tiers of S-curved arms, each with a drip pan, a candle, a flame, and prisms hanging
  const tiers: [number, number, number][] = [[8, 0.5, -0.06], [5, 0.3, 0.2]];
  const flame = M.gloss(k.renderer, '#fff2c0');
  const wax = M.glaze(k.renderer, '#f8f0e0');
  for (const [n, R, y0] of tiers) {
    const tips: Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (R < 0.4 ? Math.PI / n : 0);
      const out = new Vector3(Math.cos(a), 0, Math.sin(a));
      const p0 = new Vector3(0, y0, 0).addScaledVector(out, 0.04);
      const tip = new Vector3(0, y0 + 0.1, 0).addScaledVector(out, R);
      const pts = [p0, p0.clone().addScaledVector(out, R * 0.3).add(new Vector3(0, -0.07, 0)), p0.clone().addScaledVector(out, R * 0.75).add(new Vector3(0, -0.05, 0)), tip.clone().add(new Vector3(0, -0.02, 0)), tip];
      b.add(gold, stalk(pts, 0.011, 0.008, 6, 16));
      // a curl under the arm
      b.at(gold, new TorusGeometry(0.03, 0.005, 5, 14, Math.PI * 1.4), p0.x + out.x * R * 0.4, y0 - 0.1, p0.z + out.z * R * 0.4, 0, -a, 0);
      b.at(gold, turned([[0, 0], [0.05, 0.005], [0.055, 0.015], [0.03, 0.012], [0.015, 0.02], [0, 0.02]], 16), tip.x, tip.y, tip.z);
      b.at(wax, turned([[0.014, 0], [0.014, 0.1], [0.01, 0.105], [0, 0.106]], 12), tip.x, tip.y + 0.02, tip.z);
      b.at(flame, turned([[0, 0], [0.008, 0.008], [0.006, 0.02], [0, 0.034]], 8), tip.x, tip.y + 0.13, tip.z);
      // prisms hanging from the pan's rim
      for (let j = 0; j < 3; j++) {
        const q = (j / 3) * Math.PI * 2 + a;
        const hp = tip.clone().add(new Vector3(Math.cos(q) * 0.045, -0.035, Math.sin(q) * 0.045));
        b.at(crystal, new OctahedronGeometry(0.018).scale(0.7, 1.6, 0.7), hp.x, hp.y, hp.z);
      }
      tips.push(tip.clone());
    }
    // bead garlands swagged between the arms
    for (let i = 0; i < n; i++) {
      const a = tips[i].clone().add(new Vector3(0, -0.01, 0));
      const c = tips[(i + 1) % n].clone().add(new Vector3(0, -0.01, 0));
      beads(b, crystal, swag(a, c, 0.09 + R * 0.08), 0.008, 1.3, true);
    }
  }
  // a skirt of long drops under the lower tier
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const p = new Vector3(Math.cos(a) * 0.16, -0.22 - (i % 2) * 0.05, Math.sin(a) * 0.16);
    beads(b, crystal, [new Vector3(p.x * 0.4, -0.12, p.z * 0.4), p], 0.007, 1.2, true);
    b.at(crystal, new OctahedronGeometry(0.02).scale(0.7, 1.8, 0.7), p.x, p.y - 0.035, p.z);
  }
  const g = b.group();
  g.add(cg);
  return g;
}

/* ── the dressing table and its jewellery box ───────────────────────── */

export function vanity(k: Kit): Object3D {
  const b = new Batch();
  const wood = M.glaze(k.renderer, '#ece0c8');
  const gold = M.gold(k.renderer);
  // cabriole legs: a knee out, an ankle in, a scroll foot
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * 0.5;
      const z = sz * 0.2;
      const out = new Vector3(sx, 0, sz).normalize();
      b.add(wood, stalk([new Vector3(x, 0.72, z), new Vector3(x, 0.6, z).addScaledVector(out, 0.035), new Vector3(x, 0.3, z).addScaledVector(out, -0.01), new Vector3(x, 0.06, z).addScaledVector(out, 0.02), new Vector3(x, 0.0, z).addScaledVector(out, 0.04)], 0.026, 0.014, 8, 14));
      b.at(gold, turned([[0, 0], [0.02, 0], [0.02, 0.012], [0, 0.02]], 10), x + out.x * 0.04, 0, z + out.z * 0.04);
    }
  }
  // the top, and a scalloped apron with a gilt edge
  b.at(wood, rounded(1.14, 0.045, 0.52, 0.015), 0, 0.77, 0);
  b.at(wood, rounded(1.04, 0.11, 0.44, 0.01), 0, 0.695, 0);
  b.at(gold, rounded(1.05, 0.008, 0.008, 0.003), 0, 0.64, 0.221);
  for (const x of [-0.27, 0.27]) b.at(gold, turned([[0, 0], [0.012, 0.004], [0.008, 0.012], [0, 0.014]], 10), x, 0.7, 0.222, Math.PI / 2);
  // the mirror: an oval glass in a gilt frame on a swivel between two posts
  const mirror = M.silver(k.renderer);
  const my = 1.35;
  b.at(gold, new TorusGeometry(0.3, 0.025, 8, 40).scale(1, 1.3, 1), 0, my, -0.2);
  b.at(mirror, new CylinderGeometry(0.3, 0.3, 0.006, 40).rotateX(Math.PI / 2).scale(1, 1.3, 1), 0, my, -0.2);
  b.at(gold, turned([[0, 0], [0.035, 0.01], [0.025, 0.05], [0.008, 0.08], [0, 0.085]], 12), 0, my + 0.4, -0.2);
  for (const sx of [-1, 1]) {
    b.at(wood, turned([[0.02, 0], [0.018, 0.1], [0.014, 0.5], [0.02, 0.56], [0.012, 0.6], [0, 0.6]], 10), sx * 0.34, 0.79, -0.2);
    b.at(gold, turned([[0, 0], [0.02, 0], [0.02, 0.02], [0, 0.02]], 10), sx * 0.33, my, -0.2, 0, 0, Math.PI / 2);
  }
  // the jewellery box: mother-of-pearl, the lid up, velvet inside, pearls spilling out
  const box = M.glaze(k.renderer, '#f6ecf0');
  const velvet = M.cloth(k.renderer, '#7a1030', 'velvet');
  const bx = 0.28;
  const by = 0.793;
  b.at(box, rounded(0.28, 0.1, 0.18, 0.01), bx, by + 0.05, 0.02);
  b.at(velvet, rounded(0.25, 0.01, 0.15, 0.004), bx, by + 0.095, 0.02);
  // the lid, hinged at the back edge, open and leaning back a little
  b.at(box, rounded(0.28, 0.02, 0.18, 0.008), bx, by + 0.1 + 0.97 * 0.09, 0.02 - 0.09 - 0.25 * 0.09, -Math.PI / 2 - 0.25, 0, 0);
  b.at(gold, rounded(0.285, 0.008, 0.185, 0.003), bx, by + 0.06, 0.02);
  const pearl = M.gloss(k.renderer, '#fbf4ee');
  beads(b, pearl, swag(new Vector3(bx - 0.08, by + 0.1, 0.05), new Vector3(bx - 0.2, by + 0.01, 0.12), -0.02, 10).concat([new Vector3(bx - 0.25, by + 0.006, 0.08)]), 0.009);
  b.at(M.crystal(k.renderer, '#ff6a9a'), brilliant(0.014), bx + 0.05, by + 0.115, 0.03);
  // perfume bottles on a little silver tray
  b.at(M.silver(k.renderer), turned([[0, 0], [0.12, 0], [0.125, 0.008], [0.118, 0.01], [0, 0.006]], 24), -0.3, by, 0.02);
  for (const [x, z, tint, h] of [[-0.35, 0.0, '#ffb8c8', 0.1], [-0.26, 0.05, '#ffd89a', 0.08], [-0.25, -0.04, '#c8e0ff', 0.12]] as const) {
    b.at(M.glass(k.renderer, tint, 0.55), turned([[0, 0], [0.03, 0], [0.034, h * 0.5], [0.022, h * 0.85], [0.008, h], [0, h]], 16), x, by + 0.008, z);
    b.at(gold, turned([[0, 0], [0.012, 0], [0.014, 0.02], [0.006, 0.035], [0, 0.036]], 12), x, by + 0.008 + h, z);
  }
  // the stool: a round tufted seat on turned legs, a tassel
  const sz = 0.48;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.at(wood, turned([[0.016, 0], [0.012, 0.1], [0.018, 0.3], [0.014, 0.4], [0, 0.4]], 10), Math.cos(a) * 0.15, 0, sz + Math.sin(a) * 0.15);
  }
  b.at(velvet, turned([[0, 0.4], [0.2, 0.4], [0.21, 0.43], [0.19, 0.47], [0.1, 0.49], [0, 0.49]], 28), 0, 0, sz);
  b.at(gold, new TorusGeometry(0.205, 0.006, 5, 36).rotateX(Math.PI / 2), 0, 0.415, sz);
  return b.group();
}

/* ── the pearls on a velvet bust ─────────────────────────────────────── */

export function pearlBust(k: Kit): Object3D {
  const b = new Batch();
  const marble = M.glaze(k.renderer, '#f4f0ea');
  const gold = M.gold(k.renderer);
  const velvet = M.cloth(k.renderer, '#5a0c26', 'velvet');
  // a fluted column on a stepped plinth
  b.add(marble, turned([[0, 0], [0.22, 0], [0.22, 0.04], [0.19, 0.05], [0.19, 0.08], [0.1, 0.1], [0.08, 0.14], [0.075, 0.9], [0.09, 0.93], [0.16, 0.96], [0.17, 1.0], [0, 1.0]], 28));
  b.at(gold, new TorusGeometry(0.19, 0.006, 5, 36).rotateX(Math.PI / 2), 0, 0.06, 0);
  b.at(gold, new TorusGeometry(0.155, 0.006, 5, 36).rotateX(Math.PI / 2), 0, 0.96, 0);
  // the bust: shoulders and chest (flattened front to back) and a round neck, deep red velvet
  const Y = 1.0;
  const chest: [number, number][] = [[0.02, 0], [0.2, 0.0], [0.225, 0.05], [0.21, 0.11], [0.16, 0.17], [0.09, 0.21], [0.05, 0.225], [0, 0.23]];
  b.at(velvet, turned(chest, 32).scale(1, 1, 0.5), 0, Y, 0);
  b.at(velvet, turned([[0.052, 0.18], [0.05, 0.36], [0.056, 0.4], [0.04, 0.43], [0, 0.435]], 24), 0, Y, 0);
  /** how far forward the chest's surface is at height y (above the bust's base) */
  const chestZ = (y: number): number => {
    for (let i = 0; i < chest.length - 1; i++) {
      const [r0, y0] = chest[i];
      const [r1, y1] = chest[i + 1];
      if (y >= y0 && y <= y1) return 0.5 * (r0 + ((r1 - r0) * (y - y0)) / (y1 - y0));
    }
    return 0;
  };
  // three strands of pearls, graded: round the neck at the back, lying on the chest in front
  const pearl = M.gloss(k.renderer, '#fbf4ee');
  for (const [drop, rx, pr] of [[0.035, 0.062, 0.0085], [0.07, 0.078, 0.0095], [0.105, 0.094, 0.011]] as const) {
    const pts: Vector3[] = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const front = Math.max(0, Math.sin(a));
      const y = 0.215 - drop * Math.pow(front, 2);
      const x = Math.cos(a) * rx * (1 - 0.25 * front);
      const zf = Math.max(Math.sqrt(Math.max(0, 0.052 * 0.052 - x * x)), chestZ(y) * Math.sqrt(Math.max(0, 1 - Math.pow(x / 0.22, 2)))) + pr;
      const z = Math.sin(a) >= 0 ? zf * front + (1 - front) * 0 + Math.sin(a) * 0.001 : Math.sin(a) * (0.052 + pr);
      pts.push(new Vector3(x, Y + y, z));
    }
    beads(b, pearl, pts, pr, 1.04);
  }
  // a teardrop pendant on the shortest
  b.at(M.gloss(k.renderer, '#fff6f0'), turned([[0, -0.022], [0.012, -0.008], [0.009, 0.006], [0, 0.012]], 12), 0, Y + 0.155, 0.078);
  b.at(gold, turned([[0, 0], [0.006, 0.002], [0, 0.008]], 8), 0, Y + 0.168, 0.078);
  return b.group();
}

/* ── the ring under glass ────────────────────────────────────────────── */

export function ringCloche(k: Kit): Object3D {
  const b = new Batch();
  const marble = M.glaze(k.renderer, '#f4f0ea');
  const gold = M.gold(k.renderer);
  // a square pedestal with gilt mouldings
  b.at(marble, rounded(0.36, 0.08, 0.36, 0.01), 0, 0.04, 0);
  b.at(marble, rounded(0.3, 0.9, 0.3, 0.01), 0, 0.53, 0);
  b.at(marble, rounded(0.38, 0.06, 0.38, 0.012), 0, 1.01, 0);
  for (const y of [0.09, 0.97]) b.at(gold, rounded(0.315, 0.012, 0.315, 0.004), 0, y, 0);
  // a panel inset on each face
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    b.at(gold, rounded(0.2, 0.6, 0.006, 0.003), Math.sin(a) * 0.151, 0.53, Math.cos(a) * 0.151, 0, a, 0);
    b.at(marble, rounded(0.18, 0.58, 0.006, 0.003), Math.sin(a) * 0.153, 0.53, Math.cos(a) * 0.153, 0, a, 0);
  }
  // the tufted cushion, the ring standing in its slot
  const velvet = M.cloth(k.renderer, '#1f2a5a', 'velvet');
  b.at(velvet, rounded(0.16, 0.05, 0.16, 0.022, 3), 0, 1.065, 0);
  b.at(gold, turned([[0, 0], [0.004, 0], [0.003, 0.004], [0, 0.005]], 6), 0, 1.088, 0);
  const band = new TorusGeometry(0.022, 0.0035, 8, 32);
  b.at(gold, band, 0, 1.105, 0);
  // the setting: four prongs and a brilliant
  const top = 1.105 + 0.022;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.add(gold, stalk([new Vector3(0, top - 0.004, 0), new Vector3(Math.cos(a) * 0.006, top + 0.004, Math.sin(a) * 0.006), new Vector3(Math.cos(a) * 0.009, top + 0.012, Math.sin(a) * 0.009)], 0.0013, 0.001, 4, 4));
  }
  b.at(M.crystal(k.renderer), brilliant(0.01, 12), 0, top + 0.011, 0);
  // the cloche: a glass dome with a knob
  const dome: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * (Math.PI / 2);
    dome.push([0.13 * Math.cos(a), 1.04 + 0.2 * Math.sin(a)]);
  }
  dome.push([0, 1.24]);
  b.add(M.glass(k.renderer), turned(dome, 32));
  b.at(M.glass(k.renderer, '#e8f6ff', 0.4), turned([[0, 0], [0.014, 0.004], [0.018, 0.018], [0.008, 0.03], [0, 0.03]], 12), 0, 1.24, 0);
  b.at(gold, new TorusGeometry(0.13, 0.004, 5, 40).rotateX(Math.PI / 2), 0, 1.042, 0);
  return b.group();
}

/* ── the mermaid's tiara (new) ───────────────────────────────────────── */

export function tiara(k: Kit): Object3D {
  const b = new Batch();
  const gold = M.gold(k.renderer);
  const marble = M.glaze(k.renderer, '#eee6f0');
  // a little gilt guéridon: round marble top on three splayed legs
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const out = new Vector3(Math.cos(a), 0, Math.sin(a));
    b.add(gold, stalk([out.clone().multiplyScalar(0.12).setY(0.76), out.clone().multiplyScalar(0.17).setY(0.5), out.clone().multiplyScalar(0.13).setY(0.12), out.clone().multiplyScalar(0.2).setY(0.0)], 0.013, 0.009, 6, 14));
  }
  b.at(gold, new TorusGeometry(0.12, 0.006, 5, 30).rotateX(Math.PI / 2), 0, 0.3, 0);
  b.at(marble, turned([[0, 0.76], [0.25, 0.76], [0.26, 0.775], [0.25, 0.79], [0, 0.79]], 36));
  b.at(gold, new TorusGeometry(0.255, 0.006, 5, 40).rotateX(Math.PI / 2), 0, 0.775, 0);
  // the cushion, tasselled at its corners
  const velvet = M.cloth(k.renderer, '#1a4a5a', 'velvet');
  const Y = 0.79;
  b.at(velvet, rounded(0.26, 0.07, 0.26, 0.03, 3), 0, Y + 0.035, 0, 0, Math.PI / 4, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    b.at(gold, turned([[0, 0], [0.008, -0.004], [0.012, -0.03], [0, -0.034]], 8), Math.cos(a) * 0.18, Y + 0.035, Math.sin(a) * 0.18);
  }
  // the tiara: a band of silver waves rising to a crest, set with pearls and aquamarines
  const silver = M.silver(k.renderer);
  const pearl = M.gloss(k.renderer, '#fbf4ee');
  const aqua = M.crystal(k.renderer, '#7ad8e8');
  const R = 0.085;
  const base = Y + 0.075;
  const arc = Math.PI * 1.1;
  const at = (a: number, h: number): Vector3 => new Vector3(Math.cos(a) * R, base + h, Math.sin(a) * R);
  const a0 = Math.PI / 2 - arc / 2;
  // the band itself
  const bandPts: Vector3[] = [];
  for (let i = 0; i <= 24; i++) bandPts.push(at(a0 + (arc * i) / 24, 0.004));
  b.add(silver, stalk(bandPts, 0.0035, 0.0035, 5, 48));
  // the waves: each rises from the band and curls over, higher toward the middle
  const waves = 9;
  for (let i = 0; i < waves; i++) {
    const u = (i + 0.5) / waves;
    const a = a0 + arc * u;
    const hh = 0.02 + 0.045 * Math.pow(Math.sin(Math.PI * u), 2);
    const next = a + arc / waves / 2;
    const pts = [at(a - arc / waves / 2, 0.004), at(a - 0.05, hh * 0.6), at(a, hh), at(next - 0.02, hh * 0.7), at(next - 0.04, hh * 0.45)];
    b.add(silver, stalk(pts, 0.0025, 0.0018, 5, 14));
    b.at(pearl, new SphereGeometry(0.0055, 8, 6), ...pts[2].clone().add(new Vector3(0, 0.006, 0)).toArray());
    b.at(pearl, new SphereGeometry(0.0035, 8, 6), ...at(a, 0.012).toArray());
  }
  // the crest: a big aquamarine in a silver shell, a pearl drop under it
  const crest = at(Math.PI / 2, 0.06);
  b.add(silver, stalk([at(Math.PI / 2 - 0.12, 0.012), crest.clone().add(new Vector3(-0.012, 0.006, 0.004)), crest.clone().add(new Vector3(0, 0.024, 0.004)), crest.clone().add(new Vector3(0.012, 0.006, 0.004)), at(Math.PI / 2 + 0.12, 0.012)], 0.0025, 0.0025, 5, 20));
  b.at(aqua, brilliant(0.012, 10), crest.x, crest.y + 0.004, crest.z + 0.006, Math.PI / 2, 0, 0);
  b.at(pearl, turned([[0, -0.012], [0.006, -0.004], [0.005, 0.004], [0, 0.007]], 10), crest.x, crest.y - 0.025, crest.z + 0.004);
  for (const s of [-1, 1]) b.at(aqua, brilliant(0.006, 8), ...at(Math.PI / 2 + s * 0.45, 0.03).toArray(), Math.PI / 2, 0, 0);
  return b.group();
}
