/**
 * THE BOUTIQUE's finer things (E), for Coral's villa: a velvet Récamier chaise, a gilded cheval
 * mirror, rose silk drapes caught back with gold cord, a baby grand piano, and (new) a painted
 * silk folding screen.
 */

import { BufferGeometry, DoubleSide, ExtrudeGeometry, Group, Float32BufferAttribute, Shape, TorusGeometry, Vector3, type Object3D } from 'three';
import { Batch, M, rng, rounded, stalk, turned, welded, type Kit } from '../craft.ts';
import { turnedLeg } from './builder.ts';

/* ── the chaise longue ──────────────────────────────────────────────── */

export function chaise(k: Kit): Object3D {
  const b = new Batch();
  const velvet = M.cloth(k.renderer, '#1f5a5a', 'velvet');
  const gold = M.gold(k.renderer);
  const wood = M.gloss(k.renderer, '#2a1810');
  // lengthwise along z (the head at −z), 0.72 wide
  const L = 1.72;
  // the seat: a deep upholstered cushion on a gilt-edged frame
  b.at(wood, rounded(0.72, 0.12, L, 0.03), 0, 0.28, 0);
  b.at(gold, rounded(0.73, 0.018, L + 0.01, 0.006), 0, 0.225, 0);
  b.at(velvet, rounded(0.7, 0.13, L - 0.04, 0.06, 3), 0, 0.39, 0);
  // tufting buttons in a diamond grid
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) b.at(M.cloth(k.renderer, '#123a3a', 'velvet'), turned([[0, 0], [0.012, 0.002], [0, 0.006]], 8), -0.15 + j * 0.3 + (i % 2) * 0.15 - 0.075, 0.453, -0.6 + i * 0.24);
  // the scrolled end at the head, and a lower one at the foot: upholstered rolls on gilt scrolls
  const scroll = (z: number, h: number, dir: number): void => {
    b.at(velvet, rounded(0.7, h, 0.14, 0.06, 3), 0, 0.33 + h / 2, z);
    b.at(velvet, turned([[0, -0.35], [0.075, -0.35], [0.08, -0.34], [0.08, 0.34], [0.075, 0.35], [0, 0.35]], 20), 0, 0.33 + h + 0.02, z + dir * 0.02, 0, 0, Math.PI / 2);
    for (const sx of [-1, 1]) b.at(gold, new TorusGeometry(0.05, 0.012, 6, 20, Math.PI * 1.6), sx * 0.36, 0.33 + h - 0.02, z + dir * 0.02, 0, Math.PI / 2, 0);
  };
  scroll(-L / 2 + 0.07, 0.34, -1);
  scroll(L / 2 - 0.07, 0.12, 1);
  // a half back along one side, sloping down toward the foot
  const back = new Shape();
  back.moveTo(-L / 2 + 0.1, 0);
  back.lineTo(L * 0.1, 0);
  back.quadraticCurveTo(-L * 0.1, 0.2, -L / 2 + 0.1, 0.36);
  back.lineTo(-L / 2 + 0.1, 0);
  const bg = welded(new ExtrudeGeometry(back, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 16 }));
  b.at(velvet, bg, -0.26, 0.42, 0, 0, -Math.PI / 2, 0);
  b.at(gold, new TorusGeometry(0.03, 0.008, 5, 16), -0.36, 0.72, -L / 2 + 0.14, 0, Math.PI / 2, 0);
  // a bolster with gold tassel ends
  b.at(M.cloth(k.renderer, '#f4ead6', 'velvet'), turned([[0, -0.26], [0.07, -0.25], [0.08, -0.22], [0.08, 0.22], [0.07, 0.25], [0, 0.26]], 20), 0.02, 0.53, -L / 2 + 0.22, 0, 0, Math.PI / 2);
  for (const sx of [-1, 1]) b.at(gold, turned([[0, 0], [0.015, -0.005], [0.02, -0.05], [0, -0.055]], 8), sx * 0.29, 0.52, -L / 2 + 0.22);
  // gilt turned feet
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.at(gold, turned(turnedLeg(0.22, 0.03), 12), sx * 0.3, 0, sz * (L / 2 - 0.08));
  return b.group();
}

/* ── the cheval mirror ──────────────────────────────────────────────── */

export function chevalMirror(k: Kit): Object3D {
  const b = new Batch();
  const gold = M.gold(k.renderer);
  // an oval frame with a moulded edge (extruded ring), a crest of gilt scrolls on top
  const oval = (rx: number, ry: number): Shape => {
    const s = new Shape();
    s.absellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0);
    return s;
  };
  const ring = oval(0.44, 0.8);
  ring.holes.push(oval(0.37, 0.72));
  b.at(gold, welded(new ExtrudeGeometry(ring, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.014, bevelSegments: 3, curveSegments: 48 })), 0, 1.08, -0.02);
  b.at(M.silver(k.renderer), welded(new ExtrudeGeometry(oval(0.375, 0.725), { depth: 0.01, bevelEnabled: false, curveSegments: 48 })), 0, 1.08, -0.01);
  // beads round the inside edge
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2;
    b.at(gold, turned([[0, 0], [0.008, 0.003], [0, 0.008]], 6), Math.cos(a) * 0.4, 1.08 + Math.sin(a) * 0.755, 0.03, Math.PI / 2);
  }
  // the crest: two scrolls and a shell
  for (const s of [-1, 1]) b.add(gold, stalk([new Vector3(0, 1.88, 0.01), new Vector3(s * 0.08, 1.93, 0.01), new Vector3(s * 0.15, 1.9, 0.01), new Vector3(s * 0.14, 1.85, 0.01), new Vector3(s * 0.1, 1.86, 0.01)], 0.012, 0.007, 6, 18));
  b.at(gold, turned([[0, 0], [0.05, 0.01], [0.045, 0.04], [0.02, 0.07], [0, 0.08]], 12).scale(1, 1, 0.4), 0, 1.87, 0.01);
  // the stand: two turned uprights on splayed feet, pivots at the frame's waist
  const wood = M.wood(k.renderer, 'walnut', 0.3);
  for (const sx of [-1, 1]) {
    b.at(wood, turned([[0.028, 0], [0.022, 0.1], [0.02, 0.6], [0.028, 0.7], [0.018, 0.78], [0.018, 1.1], [0.026, 1.14], [0.012, 1.2], [0, 1.2]], 12), sx * 0.52, 0, 0);
    b.at(gold, turned([[0, 0], [0.02, 0.006], [0.028, 0.03], [0.012, 0.05], [0, 0.055]], 10), sx * 0.52, 1.2, 0);
    b.add(wood, stalk([new Vector3(sx * 0.52, 0.04, -0.22), new Vector3(sx * 0.52, 0.07, 0), new Vector3(sx * 0.52, 0.04, 0.22)], 0.025, 0.025, 8, 10, true));
    b.at(gold, turned([[0, 0], [0.022, 0], [0.022, 0.03], [0, 0.03]], 10), sx * 0.47, 1.08, -0.005, 0, 0, Math.PI / 2);
  }
  b.at(wood, rounded(1.0, 0.035, 0.035, 0.01), 0, 0.25, 0);
  return b.group();
}

/* ── the silk drapes ────────────────────────────────────────────────── */

/**
 * A curtain panel: `w` wide at the rod, hanging `h`, folded in `folds` soft pleats, gathered in
 * toward `tieX` at the tie-back height `tieY` (then falling out again to the floor).
 */
export function curtain(w: number, h: number, folds: number, tieX: number, tieY: number, depth: number): BufferGeometry {
  const nu = folds * 8;
  const nv = 30;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nv; j++) {
    const v = j / nv; // 0 at the rod, 1 at the floor
    const y = -v * h;
    // how gathered: tight at the tie, loose at rod and floor
    const d = Math.abs(-y - tieY) / h;
    const gather = Math.max(0, 1 - d * 3.2);
    const pull = 0.62 * Math.pow(gather, 0.8);
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const x0 = -w / 2 + u * w;
      const x = x0 + (tieX - x0) * pull;
      const amp = depth * (1 + gather * 1.4) * (0.6 + 0.4 * v);
      const z = Math.sin(u * folds * Math.PI * 2) * amp + gather * 0.08;
      // the hem pools a little on the floor
      const pool = v > 0.96 ? (v - 0.96) * 2 : 0;
      pos.push(x, y + pool * 0.3, z + pool * 0.4);
      uv.push(u * folds, v * 4);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      const c = a + nu + 1;
      idx.push(a, c, a + 1, c, c + 1, a + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function drapes(k: Kit): Object3D {
  const b = new Batch();
  const gold = M.gold(k.renderer);
  const silk = M.cloth(k.renderer, '#d8607a', 'velvet');
  silk.side = DoubleSide; // seen from behind too
  const top = 3.4;
  // the rod, its rings and its finials
  b.at(gold, turned([[0.02, -0.72], [0.02, 0.72]], 12), 0, top, 0.05, 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) b.at(gold, turned([[0, 0], [0.03, 0.01], [0.04, 0.04], [0.02, 0.07], [0.03, 0.09], [0, 0.12]], 14), s * 0.72, top, 0.05, 0, 0, (-s * Math.PI) / 2);
  // two panels, each caught back toward its own side
  for (const s of [-1, 1]) {
    const g = curtain(0.72, top - 0.02, 5, s * 0.22, 1.15, 0.035);
    b.at(silk, g, s * 0.34, top - 0.02, 0.05);
    for (let i = 0; i < 8; i++) b.at(gold, new TorusGeometry(0.028, 0.005, 5, 12), s * (0.04 + i * 0.085), top, 0.05);
    // the tie-back: a gold cord looped round, a tassel hanging
    b.at(gold, new TorusGeometry(0.07, 0.01, 6, 20).scale(1, 0.5, 1), s * (0.34 + 0.2) - s * 0.08, 1.15, 0.12, Math.PI / 2 - 0.2, 0, 0);
    b.at(gold, turned([[0, 0], [0.018, -0.01], [0.028, -0.1], [0, -0.11]], 10), s * 0.47, 1.1, 0.16);
  }
  // a swagged pelmet across the top
  const pel = curtain(1.5, 0.28, 3, 0, 0.28, 0.03);
  b.at(silk, pel, 0, top + 0.04, 0.09);
  return b.group();
}

/* ── the baby grand ─────────────────────────────────────────────────── */

export function piano(k: Kit): Object3D {
  const b = new Batch();
  const black = M.gloss(k.renderer, '#0a0a0e');
  const brass = M.brass(k.renderer);
  // the case, from above: straight on the bass side (−x), the bentside curving in to the tail
  const W = 1.42;
  const D = 1.5;
  const outline = new Shape();
  outline.moveTo(-W / 2, 0);
  outline.lineTo(W / 2, 0);
  outline.lineTo(W / 2, -0.35);
  outline.bezierCurveTo(W / 2, -0.75, 0.05, -0.7, 0.0, -1.0);
  outline.bezierCurveTo(-0.08, -1.3, -0.2, -D, -W / 2 + 0.3, -D);
  outline.quadraticCurveTo(-W / 2, -D, -W / 2, -D + 0.25);
  outline.lineTo(-W / 2, 0);
  const caseG = welded(new ExtrudeGeometry(outline, { depth: 0.28, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 24 }));
  // extruded along +z: lay it down so it stands 0.28 tall (its plan in x, z)
  caseG.rotateX(Math.PI / 2);
  b.at(black, caseG, 0, 0.98, 0);
  // inside: the gold iron frame and the strings, seen under the open lid
  const inner = new Shape();
  inner.moveTo(-W / 2 + 0.06, -0.12);
  inner.lineTo(W / 2 - 0.06, -0.12);
  inner.lineTo(W / 2 - 0.06, -0.36);
  inner.bezierCurveTo(W / 2 - 0.06, -0.7, 0.02, -0.66, -0.04, -0.98);
  inner.bezierCurveTo(-0.12, -1.26, -0.22, -D + 0.06, -W / 2 + 0.32, -D + 0.06);
  inner.quadraticCurveTo(-W / 2 + 0.06, -D + 0.06, -W / 2 + 0.06, -D + 0.3);
  inner.lineTo(-W / 2 + 0.06, -0.12);
  const plate = welded(new ExtrudeGeometry(inner, { depth: 0.01, bevelEnabled: false, curveSegments: 24 }));
  plate.rotateX(Math.PI / 2);
  b.at(M.metal(k.renderer, '#b8903a', 0.4), plate, 0, 0.95, 0);
  const strings = M.metal(k.renderer, '#d8d8d0', 0.3);
  for (let i = 0; i < 30; i++) {
    const x = -W / 2 + 0.1 + i * 0.042;
    const len = x < 0 ? 1.25 - (x + W / 2) * 0.1 : 1.1 - (x - 0) * 1.3;
    b.at(strings, rounded(0.003, 0.003, Math.max(0.2, len), 0.001, 1), x, 0.955, -0.14 - Math.max(0.2, len) / 2);
  }
  // the lid, propped open on its stick
  const lidG = welded(new ExtrudeGeometry(outline, { depth: 0.02, bevelEnabled: false, curveSegments: 24 }));
  lidG.rotateX(Math.PI / 2);
  // hinge along the bass side (x = −W/2): lift the treble side up
  lidG.translate(W / 2, 0, 0);
  lidG.rotateZ(0.5);
  lidG.translate(-W / 2, 0, 0);
  b.at(black, lidG, 0, 1.0, 0);
  // (the lid meets the stick 1.21 m out from its hinge: 1.0 + 1.21 sin 0.5 up)
  b.add(black, stalk([new Vector3(0.35, 0.99, -0.5), new Vector3(0.35, 1.57, -0.5)], 0.01, 0.01, 6, 2));
  // the keyboard: a key bed, white keys, black keys in their twos and threes, cheeks either side
  b.at(black, rounded(W, 0.07, 0.3, 0.01), 0, 0.73, 0.14);
  const ivory = M.gloss(k.renderer, '#f6f2e8');
  const n = 36;
  const kw = (W - 0.16) / n;
  for (let i = 0; i < n; i++) b.at(ivory, rounded(kw - 0.002, 0.022, 0.15, 0.003, 1), -W / 2 + 0.08 + (i + 0.5) * kw, 0.776, 0.2);
  for (let i = 0; i < n - 1; i++) {
    const deg = i % 7;
    if (deg === 2 || deg === 6) continue;
    b.at(black, rounded(kw * 0.55, 0.02, 0.09, 0.003, 1), -W / 2 + 0.08 + (i + 1) * kw, 0.795, 0.17);
  }
  for (const sx of [-1, 1]) b.at(black, rounded(0.07, 0.12, 0.32, 0.02), sx * (W / 2 - 0.035), 0.79, 0.14);
  b.at(black, rounded(W - 0.14, 0.05, 0.03, 0.01), 0, 0.84, 0.05);
  // the music desk, with a page of music on it
  b.at(black, rounded(0.7, 0.26, 0.018, 0.006), 0, 1.13, -0.05, -0.28, 0, 0);
  b.at(M.painted(k.renderer, 'score', 256, 180, (g, w, h) => {
    g.fillStyle = '#f4ecd8';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#3a3030';
    g.lineWidth = 1;
    const r = rng(8);
    for (let s = 0; s < 4; s++) {
      for (let l = 0; l < 5; l++) {
        g.beginPath();
        g.moveTo(12, 20 + s * 40 + l * 4);
        g.lineTo(w - 12, 20 + s * 40 + l * 4);
        g.stroke();
      }
      g.fillStyle = '#2a2020';
      for (let x = 30; x < w - 20; x += 12 + r() * 10) {
        g.beginPath();
        g.ellipse(x, 20 + s * 40 + Math.floor(r() * 9) * 2, 3, 2.2, -0.3, 0, Math.PI * 2);
        g.fill();
      }
    }
  }), rounded(0.38, 0.2, 0.002, 0.0005, 1), 0, 1.14, -0.035, -0.28, 0, 0);
  // three legs with brass casters, and the pedal lyre
  for (const [x, z] of [[-W / 2 + 0.1, 0.1], [W / 2 - 0.1, 0.1], [-0.35, -D + 0.18]] as const) {
    b.at(black, turned([[0.05, 0.06], [0.045, 0.1], [0.04, 0.3], [0.05, 0.55], [0.07, 0.68], [0.07, 0.72], [0, 0.72]], 16), x, 0.12, z);
    b.at(brass, turned([[0, 0], [0.04, 0.02], [0.04, 0.06], [0.05, 0.1], [0.05, 0.12], [0, 0.12]], 14), x, 0, z);
  }
  for (const sx of [-1, 1]) b.add(black, stalk([new Vector3(sx * 0.05, 0.72, 0.02), new Vector3(sx * 0.1, 0.4, 0.02), new Vector3(sx * 0.06, 0.1, 0.02)], 0.015, 0.012, 8, 10));
  b.at(black, rounded(0.24, 0.04, 0.12, 0.01), 0, 0.08, 0.04);
  for (let i = 0; i < 3; i++) b.at(brass, rounded(0.03, 0.012, 0.12, 0.004), (i - 1) * 0.06, 0.07, 0.12);
  // the bench: tufted leather on four turned legs
  const bench = 0.62;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.at(black, turned(turnedLeg(0.46, 0.022), 10), sx * 0.34, 0, bench + sz * 0.14);
  b.at(black, rounded(0.78, 0.05, 0.34, 0.012), 0, 0.47, bench);
  b.at(M.cloth(k.renderer, '#2a1a14', 'velvet'), rounded(0.74, 0.06, 0.3, 0.025, 3), 0, 0.515, bench);
  // centred on its footprint (tail to bench, −1.5 to +0.8), so its spot and its collider agree
  const centred = b.group();
  centred.position.z = 0.35;
  const g = new Group();
  g.add(centred);
  return g;
}

/* ── the folding screen (new) ───────────────────────────────────────── */

function silkPanel(g: CanvasRenderingContext2D, w: number, h: number, which: number): void {
  const r = rng(60 + which);
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#f2e6cc');
  bg.addColorStop(1, '#e8d4b0');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  // a branch of flowering bough crossing the panels, birds of paradise perched and flying
  g.strokeStyle = '#4a3226';
  g.lineCap = 'round';
  const branch = (x0: number, y0: number, x1: number, y1: number, wd: number): void => {
    g.lineWidth = wd;
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo((x0 + x1) / 2 + (r() - 0.5) * 60, (y0 + y1) / 2 - 30, x1, y1);
    g.stroke();
  };
  const bx = which === 0 ? w : which === 2 ? 0 : w / 2;
  branch(which === 0 ? 0 : -20, h * 0.55, bx, h * (0.42 + which * 0.05), 14);
  for (let i = 0; i < 6; i++) branch(r() * w, h * (0.35 + r() * 0.3), r() * w, h * (0.2 + r() * 0.3), 4 + r() * 4);
  // blossom: five-petal flowers in coral and white
  for (let i = 0; i < 40; i++) {
    const x = r() * w;
    const y = h * (0.15 + r() * 0.5);
    const c = r() < 0.5 ? '#e8707a' : '#fbf2ea';
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      g.fillStyle = c;
      g.beginPath();
      g.ellipse(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 5, 3.5, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#e8b030';
    g.beginPath();
    g.arc(x, y, 2, 0, Math.PI * 2);
    g.fill();
  }
  // a bird: teal body, a long flowing tail
  const bird = (x: number, y: number, s: number, flip: number): void => {
    g.save();
    g.translate(x, y);
    g.scale(flip * s, s);
    g.fillStyle = '#1f7a7a';
    g.beginPath();
    g.ellipse(0, 0, 22, 12, -0.3, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(18, -12, 8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e8a030';
    g.beginPath();
    g.moveTo(25, -13);
    g.lineTo(34, -10);
    g.lineTo(25, -9);
    g.fill();
    g.strokeStyle = '#2a8a8a';
    g.lineWidth = 3;
    for (let t = 0; t < 3; t++) {
      g.beginPath();
      g.moveTo(-18, 4);
      g.bezierCurveTo(-50, 20 + t * 8, -60, 60 + t * 10, -90 + t * 10, 90 + t * 12);
      g.stroke();
    }
    g.fillStyle = '#c8303a';
    g.beginPath();
    g.ellipse(-4, -6, 12, 5, -0.6, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  if (which === 0) bird(w * 0.55, h * 0.45, 1.4, 1);
  if (which === 1) bird(w * 0.4, h * 0.22, 1.0, -1);
  if (which === 2) bird(w * 0.4, h * 0.5, 1.2, -1);
  // distant hills and a mist band low down
  g.fillStyle = 'rgba(120, 140, 130, 0.35)';
  g.beginPath();
  g.moveTo(0, h * 0.85);
  for (let x = 0; x <= w; x += 20) g.lineTo(x, h * (0.78 - 0.05 * Math.sin(x * 0.02 + which * 2)));
  g.lineTo(w, h);
  g.lineTo(0, h);
  g.fill();
  // silk: a faint sheen streak
  for (let y = 0; y < h; y += 2) {
    g.fillStyle = `rgba(255,255,255,${0.02 + 0.02 * Math.sin(y * 0.05)})`;
    g.fillRect(0, y, w, 1);
  }
}

export function screen(k: Kit): Object3D {
  const b = new Batch();
  const frame = M.wood(k.renderer, 'ebony', 0.25);
  const gold = M.gold(k.renderer);
  const PW = 0.52;
  const H = 1.78;
  // three panels hinged in a zigzag: the middle one flat, the outer two swung forward
  const angle = 0.55;
  const panels: { x: number; z: number; ry: number }[] = [
    { x: -PW / 2 - (Math.cos(angle) * PW) / 2, z: (Math.sin(angle) * PW) / 2, ry: angle },
    { x: 0, z: 0, ry: 0 },
    { x: PW / 2 + (Math.cos(angle) * PW) / 2, z: (Math.sin(angle) * PW) / 2, ry: -angle },
  ];
  panels.forEach((p, i) => {
    const c = Math.cos(p.ry);
    const s = Math.sin(p.ry);
    const put = (m: import('three').Material, g: BufferGeometry, lx: number, ly: number, lz = 0): void => {
      b.at(m, g, p.x + lx * c + lz * s, ly, p.z - lx * s + lz * c, 0, p.ry, 0);
    };
    for (const sx of [-1, 1]) put(frame, rounded(0.04, H, 0.035, 0.008), sx * (PW / 2 - 0.02), H / 2 + 0.04);
    for (const y of [0.1, H - 0.06 + 0.04]) put(frame, rounded(PW, 0.05, 0.035, 0.008), 0, y);
    put(frame, rounded(PW - 0.06, 0.03, 0.03, 0.006), 0, 0.36);
    // the silk, and a gilt fillet round it
    put(M.painted(k.renderer, `screen${i}`, 256, 768, (g, w, h) => silkPanel(g, w, h, i), 0.6), rounded(PW - 0.07, H - 0.44, 0.004, 0.001, 1), 0, 0.38 + (H - 0.44) / 2 + 0.02);
    put(gold, rounded(PW - 0.06, 0.008, 0.008, 0.003), 0, H - 0.04, 0.02);
    put(gold, rounded(PW - 0.06, 0.008, 0.008, 0.003), 0, 0.39, 0.02);
    // a lacquered lower panel with a gold medallion
    put(M.gloss(k.renderer, '#5a1a1a'), rounded(PW - 0.07, 0.22, 0.012, 0.004), 0, 0.23);
    put(gold, turned([[0, 0], [0.04, 0.002], [0.03, 0.006], [0, 0.008]], 16).rotateX(Math.PI / 2), 0, 0.23, 0.008);
    // little feet
    for (const sx of [-1, 1]) put(frame, turned([[0.02, 0], [0.024, 0.02], [0.016, 0.045], [0, 0.045]], 8), sx * (PW / 2 - 0.02), 0);
  });
  // brass hinges between the panels
  for (const sx of [-1, 1]) for (const y of [0.3, 1.0, 1.6]) b.at(M.brass(k.renderer), turned([[0.008, -0.04], [0.008, 0.04]], 8), sx * (PW / 2), y, 0);
  return b.group();
}
