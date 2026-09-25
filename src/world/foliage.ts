/**
 * Foliage textures, painted once at load on a canvas (nothing to download):
 *
 *   tree sprites   four far-forest crowns, each painted leaf by leaf over Tidewater's crown
 *                  lobes (TREE_LOBES) with a trunk and fork below — what a hillside of trees
 *                  looks like from the bay, on two triangles each
 *   leaf cluster   a spray of leaves for the near trees' leaf cards
 *   shrub cluster  smaller, lighter leaves
 *   palm frond     a feather: the rachis and its leaflets, base on the left, tip on the right
 *   fern frond     the same, finer
 *
 * Everything is drawn with hard-edged alpha for alpha-to-coverage (MSAA turns the cut-out into a
 * soft edge on Quest, and it sorts like opaque).
 */

import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';

type Lobe = [number, number, number, number];

export const ATLAS = 1024;
/** Regions in UV space: [u0, v0, u1, v1] (v up, three's convention). */
export const REGION = {
  tree: (i: number): [number, number, number, number] => {
    const x = (i % 2) * 0.25;
    const y = 1 - (Math.floor(i / 2) + 1) * 0.25;
    return [x, y, x + 0.25, y + 0.25];
  },
  leaf: [0.5, 0.75, 0.75, 1] as [number, number, number, number],
  shrub: [0.75, 0.75, 1, 1] as [number, number, number, number],
  frond: [0.5, 0.625, 1, 0.75] as [number, number, number, number],
  fern: [0.5, 0.5, 0.75, 0.625] as [number, number, number, number],
  grass: [0, 0.25, 0.5, 0.5] as [number, number, number, number],
};

/** Metres the tree sprite spans (width, height) at scale 1. */
export const TREE_SPRITE = { w: 14, h: 14 };

let seed = 1;
const rnd = (): number => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

function leaf(c: CanvasRenderingContext2D, x: number, y: number, len: number, wid: number, ang: number, fill: string, rib: string): void {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(len * 0.5, -wid, len, 0);
  c.quadraticCurveTo(len * 0.5, wid, 0, 0);
  c.fillStyle = fill;
  c.fill();
  c.strokeStyle = rib;
  c.lineWidth = Math.max(0.6, wid * 0.12);
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(len * 0.9, 0);
  c.stroke();
  c.restore();
}

const hsl = (h: number, s: number, l: number): string => `hsl(${h.toFixed(0)}, ${s.toFixed(0)}%, ${l.toFixed(0)}%)`;

/** One far-forest crown in a square tile. */
function paintTree(c: CanvasRenderingContext2D, ox: number, oy: number, size: number, lobes: Lobe[], variant: number): void {
  seed = 97 + variant * 131;
  const m = size / TREE_SPRITE.w; // px per metre
  const px = (x: number): number => ox + size / 2 + x * m;
  const py = (y: number): number => oy + size - y * m;
  // trunk and fork
  c.strokeStyle = '#5b4a3a';
  c.lineCap = 'round';
  c.lineWidth = 0.55 * m;
  c.beginPath();
  c.moveTo(px(0), py(0));
  c.lineTo(px(0.1), py(4.2));
  c.stroke();
  c.lineWidth = 0.3 * m;
  for (const [x, y] of [[-2.2, 7], [2.6, 6.8], [0.4, 8.6]]) {
    c.beginPath();
    c.moveTo(px(0.1), py(3.8));
    c.lineTo(px(x * 0.8), py(y * 0.9));
    c.stroke();
  }
  // leaves lobe by lobe, back to front (deeper lobes darker), each lobe lit from the upper left
  const order = lobes
    .map((l, i) => ({ l, k: l[2] + (variant % 2 ? -1 : 1) * i * 0.1 }))
    .sort((a, b) => a.k - b.k)
    .map((e) => e.l);
  const flip = variant >= 2 ? -1 : 1;
  const hue = 92 + variant * 5;
  for (const [lx0, ly, lz, r] of order) {
    const lx = lx0 * flip;
    const depth = 0.5 + lz / 8;
    const n = Math.round(r * r * 34);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * r;
      const x = lx + Math.cos(a) * d;
      const y = ly + Math.sin(a) * d * 0.85;
      // light: from above-left, and the lobe's rim catches more of it
      const lit = 0.5 + 0.5 * ((y - ly) / r) * 0.8 - 0.25 * ((x - lx) / r) + (d / r) * 0.12;
      const l = 14 + lit * 20 + depth * 6 + rnd() * 6;
      leaf(c, px(x), py(y), (0.55 + rnd() * 0.35) * m, (0.18 + rnd() * 0.1) * m, rnd() * Math.PI * 2, hsl(hue + rnd() * 18 - 9, 42 + rnd() * 18, l), hsl(hue, 30, l - 8));
    }
  }
}

function paintCluster(c: CanvasRenderingContext2D, ox: number, oy: number, size: number, n: number, len: number, hue: number, light: number): void {
  const cx = ox + size / 2;
  const cy = oy + size / 2;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * size * 0.34;
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d;
    const l = light + ((cy - y) / size) * 18 + rnd() * 10;
    leaf(c, x, y, len * (0.7 + rnd() * 0.5), len * (0.28 + rnd() * 0.12), a + (rnd() - 0.5) * 1.2, hsl(hue + rnd() * 16 - 8, 45 + rnd() * 15, l), hsl(hue, 35, l - 10));
  }
}

/** A feather frond, base at x0, tip at x1, in a horizontal band. */
function paintFrond(c: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, leaflets: number, hue: number): void {
  const cy = y0 + h / 2;
  c.strokeStyle = hsl(60, 35, 38);
  c.lineWidth = h * 0.035;
  c.beginPath();
  c.moveTo(x0, cy);
  c.lineTo(x0 + w, cy);
  c.stroke();
  for (let i = 0; i < leaflets; i++) {
    const t = (i + 0.5) / leaflets;
    const x = x0 + t * w;
    const reach = h * 0.48 * Math.pow(Math.sin(Math.PI * Math.min(0.97, t * 0.92 + 0.06)), 0.55);
    for (const s of [-1, 1]) {
      const l = 26 + t * 14 + rnd() * 6;
      c.strokeStyle = hsl(hue + t * 14 + rnd() * 6, 48, l);
      c.lineWidth = Math.max(1.2, (w / leaflets) * 0.55);
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x, cy);
      // leaflets sweep forward toward the tip
      c.quadraticCurveTo(x + reach * 0.25, cy + s * reach * 0.6, x + reach * 0.55, cy + s * reach);
      c.stroke();
    }
  }
}

/** A strip of grass blades rooted along the bottom edge (white-ish: tinted per tuft). */
function paintGrass(c: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number): void {
  const base = y0 + h;
  for (let i = 0; i < 90; i++) {
    const x = x0 + 6 + rnd() * (w - 12);
    const hgt = h * (0.45 + rnd() * 0.5);
    const lean = (rnd() - 0.5) * h * 0.45;
    const wid = 3 + rnd() * 5;
    // near-white (the tuft is tinted by the ground's own colour), a little darker at the root
    const l = 78 + rnd() * 18;
    const g = c.createLinearGradient(0, base, 0, base - hgt);
    g.addColorStop(0, `hsl(80, 10%, ${l * 0.86}%)`);
    g.addColorStop(1, `hsl(${70 + rnd() * 20}, ${10 + rnd() * 15}%, ${l}%)`);
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x - wid, base);
    c.quadraticCurveTo(x - wid * 0.3 + lean * 0.3, base - hgt * 0.6, x + lean, base - hgt);
    c.quadraticCurveTo(x + wid * 0.3 + lean * 0.3, base - hgt * 0.6, x + wid, base);
    c.closePath();
    c.fill();
  }
}

export function paintFoliage(treeLobes: Lobe[]): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = ATLAS;
  cv.height = ATLAS;
  const c = cv.getContext('2d')!;
  c.clearRect(0, 0, ATLAS, ATLAS);
  const T = ATLAS / 4;
  // canvas y runs down; REGION's v runs up — tile (i) sits at canvas row floor(i/2)
  for (let i = 0; i < 4; i++) paintTree(c, (i % 2) * T, Math.floor(i / 2) * T, T, treeLobes, i);
  seed = 7;
  paintCluster(c, 2 * T, 0, T, 150, T * 0.16, 100, 22);
  seed = 11;
  paintCluster(c, 3 * T, 0, T, 170, T * 0.12, 88, 28);
  seed = 13;
  paintFrond(c, 2 * T + 4, T, 2 * T - 8, T / 2, 46, 88);
  seed = 17;
  paintFrond(c, 2 * T + 4, T * 1.5, T - 8, T / 2, 30, 100);
  seed = 19;
  paintGrass(c, 0, 2 * T, 2 * T, T);
  // an opaque white block for the solid parts that share the leaf material (trunks, cores)
  c.fillStyle = '#ffffff';
  c.fillRect(ATLAS - 64, ATLAS - 64, 64, 64);
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  tex.flipY = true;
  return tex;
}
