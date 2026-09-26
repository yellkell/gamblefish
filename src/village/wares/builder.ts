/**
 * THE BUILDER's furniture (F), for your shack: a driftwood bed made up with a patchwork quilt,
 * a turned table with two ladder-back chairs, a kilim rug, a bookshelf full of books, and a
 * sea chest for the foot of the bed.
 *
 * Joinery the way it's made: turned legs, slatted boards, rounded edges, real wood grain
 * (village/craft.ts), cloth that's cloth.
 */

import { BoxGeometry, CylinderGeometry, Mesh, PlaneGeometry, TorusGeometry, Vector3, type Material, type Object3D } from 'three';
import { Batch, M, rng, rounded, stalk, tint, turned, type Kit } from '../craft.ts';

/** a plain block (cheap: for the many small parts) */
const block = (w: number, h: number, d: number): BoxGeometry => new BoxGeometry(w, h, d);

/** a turned leg, `h` tall, standing on y = 0 */
export function turnedLeg(h: number, r: number): [number, number][] {
  return [
    [r * 0.85, 0],
    [r * 0.75, h * 0.05],
    [r * 0.7, h * 0.3],
    [r * 1.05, h * 0.36],
    [r * 0.8, h * 0.42],
    [r * 0.7, h * 0.46],
    [r * 1.0, h * 0.62],
    [r * 1.1, h * 0.8],
    [r * 1.1, h],
    [0, h],
  ];
}

/* ── the bed ─────────────────────────────────────────────────────────── */

function quilt(g: CanvasRenderingContext2D, w: number, h: number): void {
  const colours = ['#2f5f8a', '#e8dcc0', '#6aa0b8', '#c85a3a', '#f4ecd8', '#3a7a78', '#d8b070'];
  const n = 8;
  const m = 10;
  const r = rng(5);
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i * w) / n;
      const y = (j * h) / m;
      const cw = w / n;
      const ch = h / m;
      g.fillStyle = colours[Math.floor(r() * colours.length)];
      g.fillRect(x, y, cw, ch);
      // half-square triangles on some patches
      if (r() < 0.45) {
        g.fillStyle = colours[Math.floor(r() * colours.length)];
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + cw, y);
        g.lineTo(x, y + ch);
        g.fill();
      }
      g.strokeStyle = 'rgba(250, 244, 230, 0.8)';
      g.setLineDash([4, 4]);
      g.lineWidth = 2;
      g.strokeRect(x + 4, y + 4, cw - 8, ch - 8);
      g.setLineDash([]);
      g.strokeStyle = 'rgba(40, 30, 20, 0.35)';
      g.lineWidth = 2;
      g.strokeRect(x, y, cw, ch);
    }
  }
}

export function bed(k: Kit): Object3D {
  const b = new Batch();
  const wood = M.wood(k.renderer, 'drift', 0.6);
  const linen = M.cloth(k.renderer, '#f2ece0');
  const W = 0.95;
  const L = 1.95;
  // four turned corner posts, ball finials, the head ones tall
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const h = sz < 0 ? 1.0 : 0.64;
      b.at(wood, turned(turnedLeg(h, 0.034), 12), (sx * (W - 0.07)) / 2, 0, (sz * (L - 0.07)) / 2);
      b.at(wood, turned([[0, 0], [0.024, 0.01], [0.032, 0.035], [0.024, 0.06], [0.008, 0.07], [0, 0.072]], 12), (sx * (W - 0.07)) / 2, h, (sz * (L - 0.07)) / 2);
    }
  }
  // side rails, and slats at head and foot between a top and bottom rail
  for (const sx of [-1, 1]) b.at(wood, rounded(0.045, 0.16, L - 0.1, 0.012), (sx * (W - 0.07)) / 2, 0.3, 0);
  const board = (z: number, top: number, n: number): void => {
    b.at(wood, rounded(W - 0.1, 0.07, 0.05, 0.015), 0, top, z);
    b.at(wood, rounded(W - 0.1, 0.05, 0.04, 0.012), 0, 0.42, z);
    for (let i = 0; i < n; i++) b.at(wood, rounded(0.06, top - 0.46, 0.022, 0.006), -((W - 0.2) / 2) + ((W - 0.2) * i) / (n - 1), (top + 0.42) / 2, z);
  };
  board(-(L - 0.07) / 2, 0.94, 7);
  board((L - 0.07) / 2, 0.58, 5);
  // the mattress, the quilt with its sides hanging down, the sheet turned down over it
  b.at(linen, rounded(W - 0.1, 0.18, L - 0.12, 0.05, 3), 0, 0.46, 0);
  const q = M.painted(k.renderer, 'quilt', 512, 640, quilt, 0.9);
  b.at(q, rounded(W - 0.02, 0.05, 1.28, 0.022, 3), 0, 0.565, 0.3);
  // its sides hang down over the mattress, bound in navy
  const binding = M.cloth(k.renderer, '#2f5f8a');
  for (const sx of [-1, 1]) b.at(binding, rounded(0.025, 0.2, 1.28, 0.01), (sx * (W - 0.02)) / 2, 0.47, 0.3);
  b.at(binding, rounded(W - 0.02, 0.2, 0.025, 0.01), 0, 0.47, 0.3 + 0.64);
  b.at(linen, rounded(W - 0.01, 0.06, 0.18, 0.025, 3), 0, 0.585, -0.3);
  // two pillows, plump, leaning on the headboard
  for (const sx of [-1, 1]) b.at(linen, rounded(0.38, 0.13, 0.26, 0.06, 3), sx * 0.2, 0.62, -0.76, -0.35, sx * 0.05, 0);
  // a striped throw folded over the foot
  const throwMat = M.painted(k.renderer, 'throw', 256, 128, (g, w, h) => {
    const bands = ['#c85a3a', '#f4ecd8', '#2f5f8a', '#f4ecd8', '#e8b84a'];
    for (let i = 0; i < 16; i++) {
      g.fillStyle = bands[i % bands.length];
      g.fillRect((i * w) / 16, 0, w / 16 + 1, h);
    }
  });
  b.at(throwMat, rounded(W + 0.02, 0.035, 0.32, 0.015, 2), 0, 0.605, 0.72);
  for (const sx of [-1, 1]) b.at(throwMat, rounded(0.02, 0.16, 0.32, 0.008), (sx * (W + 0.02)) / 2, 0.52, 0.72);
  return b.group();
}

/* ── the table and chairs ────────────────────────────────────────────── */

function chair(k: Kit, b: Batch, x: number, z: number, ry: number): void {
  const wood = M.wood(k.renderer, 'teak', 0.4);
  const rush = M.rattan(k.renderer, '#b8985a');
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  // place a part given in the chair's own frame (its back toward −z)
  const put = (m: Material, g: import('three').BufferGeometry, lx: number, ly: number, lz: number, rx = 0): void => {
    b.at(m, g, x + lx * c + lz * s, ly, z - lx * s + lz * c, rx, ry, 0);
  };
  for (const sx of [-1, 1]) {
    put(wood, turned(turnedLeg(0.44, 0.022), 10), sx * 0.19, 0, 0.17);
    // the back posts run on up, leaning back a touch
    put(wood, turned([[0.02, 0], [0.02, 0.44], [0.022, 0.46], [0.018, 0.9], [0.024, 0.93], [0.014, 0.97], [0, 0.98]], 10), sx * 0.19, 0, -0.18, -0.06);
  }
  // the seat: a rush weave in a frame
  put(wood, rounded(0.42, 0.04, 0.4, 0.01), 0, 0.44, 0);
  put(rush, rounded(0.37, 0.03, 0.35, 0.012), 0, 0.46, 0.005);
  // ladder back: three bowed slats
  for (const y of [0.6, 0.72, 0.84]) put(wood, rounded(0.36, 0.055, 0.02, 0.008), 0, y, -0.18 - (y - 0.44) * 0.06 - 0.005, -0.06);
  // stretchers
  for (const sx of [-1, 1]) put(wood, new CylinderGeometry(0.009, 0.009, 0.34, 6).rotateX(Math.PI / 2), sx * 0.19, 0.15, 0);
  put(wood, new CylinderGeometry(0.009, 0.009, 0.36, 6).rotateZ(Math.PI / 2), 0, 0.2, 0.17);
}

export function tableChairs(k: Kit): Object3D {
  const b = new Batch();
  const wood = M.wood(k.renderer, 'teak', 0.35);
  b.at(wood, rounded(0.9, 0.045, 0.7, 0.012), 0, 0.745, 0);
  // the apron under the top
  for (const sz of [-1, 1]) b.at(wood, block(0.76, 0.07, 0.022), 0, 0.685, sz * 0.28);
  for (const sx of [-1, 1]) b.at(wood, block(0.022, 0.07, 0.56), sx * 0.38, 0.685, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.at(wood, turned(turnedLeg(0.72, 0.03), 12), sx * 0.38, 0, sz * 0.28);
  // a linen runner and a candle in a brass stick
  b.at(M.cloth(k.renderer, '#e8dcc4'), rounded(0.26, 0.006, 0.72, 0.002), 0, 0.771, 0);
  b.at(M.brass(k.renderer), turned([[0, 0], [0.05, 0], [0.052, 0.008], [0.03, 0.014], [0.012, 0.02], [0.01, 0.1], [0.022, 0.11], [0.024, 0.12], [0.014, 0.125], [0, 0.125]], 18), 0.12, 0.768, 0.05);
  b.at(M.satin(k.renderer, '#f4ecd8'), turned([[0, 0], [0.012, 0], [0.012, 0.09], [0.008, 0.095], [0, 0.096]], 12), 0.12, 0.89, 0.05);
  b.at(M.satin(k.renderer, '#2a2a2a'), turned([[0, 0], [0.0015, 0.0], [0.001, 0.012], [0, 0.013]], 5), 0.12, 0.985, 0.05);
  chair(k, b, 0, -0.62, 0);
  chair(k, b, 0, 0.62, Math.PI);
  return b.group();
}

/* ── the kilim ───────────────────────────────────────────────────────── */

function kilim(g: CanvasRenderingContext2D, w: number, h: number): void {
  const madder = '#9a2c24';
  const indigo = '#1f3050';
  const cream = '#efe2c4';
  const saffron = '#d89a2a';
  const teal = '#2f6a64';
  g.fillStyle = madder;
  g.fillRect(0, 0, w, h);
  // borders
  const band = (inset: number, width: number, colour: string): void => {
    g.strokeStyle = colour;
    g.lineWidth = width;
    g.strokeRect(inset + width / 2, inset + width / 2, w - 2 * inset - width, h - 2 * inset - width);
  };
  band(0, 22, indigo);
  band(22, 6, cream);
  // a running-dogs border: little stepped hooks between the bands
  g.fillStyle = saffron;
  for (let x = 40; x < w - 40; x += 28) {
    g.fillRect(x, 34, 12, 8);
    g.fillRect(x, h - 42, 12, 8);
  }
  for (let y = 40; y < h - 40; y += 28) {
    g.fillRect(34, y, 8, 12);
    g.fillRect(w - 42, y, 8, 12);
  }
  band(50, 4, cream);
  // three stepped diamond medallions down the middle
  const diamond = (cx: number, cy: number, r: number, colours: string[]): void => {
    colours.forEach((c, i) => {
      const rr = r * (1 - i / colours.length);
      g.fillStyle = c;
      g.beginPath();
      // stepped edge: the kilim's slit-weave look
      const steps = 6;
      for (let q = 0; q < 4; q++) {
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          const ang = (q * Math.PI) / 2;
          const x0 = Math.cos(ang) * rr;
          const y0 = Math.sin(ang) * rr;
          const x1 = Math.cos(ang + Math.PI / 2) * rr;
          const y1 = Math.sin(ang + Math.PI / 2) * rr;
          const px = x0 + (x1 - x0) * Math.floor(u * steps) / steps;
          const py = y0 + (y1 - y0) * Math.ceil(u * steps) / steps;
          g.lineTo(cx + px, cy + py);
        }
      }
      g.closePath();
      g.fill();
    });
  };
  const cy = h / 2;
  for (const cx of [w * 0.22, w * 0.5, w * 0.78]) diamond(cx, cy, h * 0.3, [cream, indigo, saffron, teal, cream]);
  // small motifs scattered in the field
  g.fillStyle = cream;
  for (const [x, y] of [[0.36, 0.25], [0.36, 0.75], [0.64, 0.25], [0.64, 0.75], [0.1, 0.5], [0.9, 0.5]]) {
    g.fillRect(w * x - 5, h * y - 12, 10, 24);
    g.fillRect(w * x - 12, h * y - 5, 24, 10);
  }
  // the weave: fine horizontal wefts
  for (let y = 0; y < h; y += 3) {
    g.fillStyle = `rgba(0,0,0,${0.05 + ((y * 7) % 5) * 0.012})`;
    g.fillRect(0, y, w, 1);
  }
}

export function rug(k: Kit, paint: (w: number, h: number, p: (g: CanvasRenderingContext2D, w: number, h: number) => void) => Material): Object3D {
  const b = new Batch();
  const m = new Mesh(new PlaneGeometry(1.5, 1.05).rotateX(-Math.PI / 2), paint(768, 540, kilim));
  // the fringe at both ends: knotted tassels
  const fringe = M.cloth(k.renderer, '#e8dcc0');
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 18; i++) {
      const z = -0.48 + (0.96 * i) / 17;
      b.at(fringe, block(0.07, 0.004, 0.012), sx * 0.785, 0.002, z, 0, 0, 0);
    }
  }
  const g = b.group();
  g.add(m);
  return g;
}

/* ── the bookshelf ───────────────────────────────────────────────────── */

export function bookshelf(k: Kit): Object3D {
  const b = new Batch();
  const wood = M.wood(k.renderer, 'walnut', 0.45);
  const back = M.wood(k.renderer, 'mahogany', 0.7);
  const W = 0.9;
  const H = 1.72;
  const D = 0.3;
  for (const sx of [-1, 1]) b.at(wood, rounded(0.035, H, D, 0.008), (sx * (W - 0.035)) / 2, H / 2, 0);
  b.at(back, block(W - 0.06, H - 0.04, 0.015), 0, H / 2, -D / 2 + 0.01);
  // the cornice on top, the plinth below
  b.at(wood, rounded(W + 0.05, 0.035, D + 0.03, 0.01), 0, H + 0.0175, 0.01);
  b.at(wood, rounded(W + 0.02, 0.02, D + 0.015, 0.006), 0, H - 0.01, 0.005);
  b.at(wood, rounded(W, 0.09, D, 0.01), 0, 0.045, 0.004);
  const shelves = [0.09, 0.5, 0.9, 1.3];
  for (const y of shelves) b.at(wood, rounded(W - 0.06, 0.025, D - 0.02, 0.005), 0, y + 0.0125, 0.005);
  // the books: cloth and leather, some with gilt bands, a few leaning, a stack lying down
  const r = rng(71);
  const COVERS = ['#6a1e1e', '#1f3a5a', '#2e4a2a', '#8a6a2a', '#4a2a4a', '#a8783a', '#2a2a30', '#7a3a1a', '#c8b890'];
  const cloth = M.tinted(k.renderer);
  const pages = M.satin(k.renderer, '#efe6d0');
  const gilt = M.gold(k.renderer);
  const book = (x: number, y: number, z: number, w: number, h: number, d: number, lean = 0): void => {
    const cover = COVERS[Math.floor(r() * COVERS.length)];
    const rz = lean;
    // pages, and the boards and spine round them
    const c = Math.cos(rz);
    const s = Math.sin(rz);
    const at = (lx: number, ly: number): [number, number] => [x + lx * c - ly * s, y + lx * s + ly * c];
    let p = at(0, h / 2);
    b.at(pages, block(w - 0.005, h - 0.008, d - 0.006), p[0], p[1], z - 0.003, 0, 0, rz);
    for (const side of [-1, 1]) {
      p = at((side * (w - 0.003)) / 2, h / 2);
      b.at(cloth, tint(block(0.003, h, d), cover), p[0], p[1], z, 0, 0, rz);
    }
    p = at(0, h / 2);
    b.at(cloth, tint(rounded(w, h, 0.006, 0.0025, 1), cover), p[0], p[1], z + d / 2 - 0.002, 0, 0, rz);
    if (r() < 0.45) {
      for (const f of [0.14, 0.82]) {
        p = at(0, h * f);
        b.at(gilt, block(w + 0.001, 0.005, 0.002), p[0], p[1], z + d / 2 + 0.0015, 0, 0, rz);
      }
    }
  };
  shelves.forEach((y0, si) => {
    const y = y0 + 0.025;
    let x = -W / 2 + 0.05;
    const end = W / 2 - 0.05;
    const stackAt = si === 1 ? 0.22 : si === 3 ? -0.3 : 99;
    const decorAt = si === 2 ? 0.2 : si === 0 ? -0.25 : 99;
    while (x < end - 0.03) {
      if (Math.abs(x - stackAt) < 0.02) {
        // a stack lying flat
        for (let j = 0; j < 3; j++) {
          const w = 0.03 + r() * 0.012;
          b.at(cloth, tint(rounded(0.2, w, 0.16, 0.004, 1), COVERS[(j + si) % COVERS.length]), x + 0.1, y + w / 2 + j * 0.036, 0.02, 0, (r() - 0.5) * 0.2, 0);
        }
        x += 0.23;
        continue;
      }
      if (Math.abs(x - decorAt) < 0.02) {
        x += 0.17;
        continue;
      }
      const w = 0.024 + r() * 0.022;
      const h = 0.23 + r() * 0.1;
      const d = 0.17 + r() * 0.06;
      const leanNext = r() < 0.08 && x > -0.2;
      book(x + w / 2, y, 0.02 + (0.2 - d) / 2, w, h, d, leanNext ? -0.25 : 0);
      x += w + (leanNext ? 0.07 : 0.002);
    }
  });
  // on the shelves among the books: a conch, a glass fishing float in its net, a brass compass
  const conch = M.glaze(k.renderer, '#f0d8c0');
  b.at(conch, turned([[0, 0], [0.025, 0.01], [0.045, 0.045], [0.04, 0.08], [0.028, 0.1], [0.016, 0.125], [0.008, 0.14], [0, 0.155]], 14), 0.25, 0.93 + 0.04, 0.02, 0, 0, Math.PI / 2 - 0.2);
  b.at(M.glaze(k.renderer, '#f4a8a0'), turned([[0.0, 0.0], [0.03, 0.005], [0.035, 0.03], [0.0, 0.035]], 12), 0.18, 0.93 + 0.035, 0.03, 0, 0, Math.PI / 2 - 0.2);
  const glassF = M.glass(k.renderer, '#5aa8a0', 0.55);
  b.at(glassF, turned(Array.from({ length: 9 }, (_, i) => { const a = -Math.PI / 2 + (i / 8) * Math.PI; return [Math.cos(a) * 0.07, Math.sin(a) * 0.07 + 0.07] as [number, number]; }), 20), -0.2, 0.115, 0.02);
  const net = M.satin(k.renderer, '#b89a70');
  for (let i = 0; i < 4; i++) b.at(net, new TorusGeometry(0.071, 0.0025, 4, 24), -0.2, 0.185, 0.02, 0, (i / 4) * Math.PI, 0);
  b.at(net, new TorusGeometry(0.062, 0.0025, 4, 24).rotateX(Math.PI / 2), -0.2, 0.15, 0.02);
  b.at(M.brass(k.renderer), turned([[0, 0], [0.045, 0], [0.048, 0.006], [0.048, 0.02], [0.044, 0.024], [0, 0.024]], 20), -0.3, 1.34, 0.03);
  b.at(M.painted(k.renderer, 'compass', 128, 128, (g, w, h) => {
    g.fillStyle = '#f4ecd8';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#3a2a1a';
    g.lineWidth = 2;
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const r0 = i % 8 === 0 ? 38 : 48;
      g.beginPath();
      g.moveTo(w / 2 + Math.cos(a) * r0, h / 2 + Math.sin(a) * r0);
      g.lineTo(w / 2 + Math.cos(a) * 56, h / 2 + Math.sin(a) * 56);
      g.stroke();
    }
    g.fillStyle = '#b02020';
    g.beginPath();
    g.moveTo(w / 2, h / 2 - 40);
    g.lineTo(w / 2 + 8, h / 2);
    g.lineTo(w / 2 - 8, h / 2);
    g.fill();
    g.fillStyle = '#2a2a2a';
    g.beginPath();
    g.moveTo(w / 2, h / 2 + 40);
    g.lineTo(w / 2 + 8, h / 2);
    g.lineTo(w / 2 - 8, h / 2);
    g.fill();
  }), new CylinderGeometry(0.041, 0.041, 0.002, 24), -0.3, 1.364, 0.03);
  return b.group();
}

/* ── the sea chest (new) ─────────────────────────────────────────────── */

export function seaChest(k: Kit): Object3D {
  const b = new Batch();
  const wood = M.wood(k.renderer, 'teak', 0.55);
  const iron = M.iron(k.renderer);
  const brass = M.brass(k.renderer);
  const W = 0.82;
  const D = 0.46;
  const H = 0.36;
  // the body: planks, each a hair apart, on a plinth
  const planks = 4;
  for (let i = 0; i < planks; i++) {
    const y = 0.04 + (H - 0.04) * ((i + 0.5) / planks);
    const ph = (H - 0.04) / planks - 0.004;
    b.at(wood, rounded(W, ph, D, 0.006), 0, y, 0);
  }
  b.at(wood, rounded(W + 0.02, 0.04, D + 0.02, 0.008), 0, 0.02, 0);
  // the lid: a shallow barrel vault
  const lid = new CylinderGeometry(D / 2 + 0.01, D / 2 + 0.01, W + 0.01, 24, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);
  lid.scale(1, 0.42, 1);
  b.at(wood, lid, 0, H, 0);
  // the lid's ends
  const endCap = new CylinderGeometry(D / 2 + 0.012, D / 2 + 0.012, 0.02, 24, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);
  endCap.scale(1, 0.44, 1);
  for (const sx of [-1, 1]) b.at(wood, endCap, sx * (W / 2 + 0.002), H, 0);
  // iron bands over the lid and down the front and back
  for (const x of [-0.26, 0.26]) {
    const band = new CylinderGeometry(D / 2 + 0.018, D / 2 + 0.018, 0.04, 24, 1, true, 0, Math.PI).rotateZ(Math.PI / 2);
    band.scale(1, 0.45, 1);
    b.at(iron, band, x, H, 0);
    for (const sz of [-1, 1]) b.at(iron, block(0.04, H, 0.008), x, H / 2, (sz * (D + 0.008)) / 2);
    // rivets
    for (let i = 0; i < 4; i++) for (const sz of [-1, 1]) b.at(iron, turned([[0, 0], [0.006, 0], [0, 0.005]], 6), x, 0.06 + i * 0.09, (sz * (D + 0.016)) / 2, (sz * Math.PI) / 2);
  }
  // corner brackets
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.at(iron, block(0.05, 0.1, 0.05), (sx * (W - 0.03)) / 2, 0.07, (sz * (D - 0.03)) / 2);
  // the brass lock plate and hasp
  b.at(brass, rounded(0.08, 0.1, 0.01, 0.004), 0, H - 0.04, D / 2 + 0.006);
  b.at(M.iron(k.renderer), turned([[0.006, -0.002], [0.006, 0.002], [0, 0.002]], 10), 0, H - 0.05, D / 2 + 0.011, Math.PI / 2);
  b.at(brass, rounded(0.05, 0.08, 0.008, 0.003), 0, H + 0.02, D / 2 + 0.012);
  // rope handles at the ends, in wooden cleats
  const rope = M.satin(k.renderer, '#c8a878');
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 + 0.03);
    b.add(rope, stalk([new Vector3(x - sx * 0.02, 0.24, -0.09), new Vector3(x + sx * 0.02, 0.2, -0.05), new Vector3(x + sx * 0.03, 0.18, 0), new Vector3(x + sx * 0.02, 0.2, 0.05), new Vector3(x - sx * 0.02, 0.24, 0.09)], 0.009, 0.009, 6, 16));
    for (const z of [-0.1, 0.1]) b.at(wood, rounded(0.04, 0.05, 0.05, 0.01), sx * (W / 2 + 0.012), 0.24, z);
  }
  return b.group();
}
