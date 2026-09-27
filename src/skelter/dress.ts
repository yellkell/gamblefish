/**
 * The helter skelter's foot, painted: the plinth's top laid in sandstone flags, a kerb of red and
 * cream stones round its edge and two courses of dressed stone down its side, and the boarded band
 * round the drum's foot painted like a fairground front, red boards under a cream rail with the
 * ride's name on a board every few metres. Canvas textures, drawn once (the band's lettering again
 * when the fonts come in).
 */

import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { font, onFontsReady } from '../ui/fonts.ts';
import { mulberry32 } from './fx.ts';

/** a colour a touch lighter or darker than `hex` (0.9..1.1 by `k`) */
function shade(rgb: [number, number, number], k: number): string {
  return `rgb(${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * k)))).join(',')})`;
}

function texture(canvas: HTMLCanvasElement, repeatX = 1): CanvasTexture {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  if (repeatX !== 1) {
    t.wrapS = RepeatWrapping;
    t.repeat.x = repeatX;
  }
  return t;
}

/** Grit and stains over whatever's drawn: small specks and a few soft blotches. */
function weather(c: CanvasRenderingContext2D, w: number, h: number, r: () => number, specks: number, blotches: number): void {
  for (let i = 0; i < specks; i++) {
    c.fillStyle = r() < 0.5 ? 'rgba(40, 30, 20, 0.16)' : 'rgba(255, 250, 235, 0.14)';
    c.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
  for (let i = 0; i < blotches; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = 10 + r() * 40;
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(60, 45, 30, 0.12)');
    g.addColorStop(1, 'rgba(60, 45, 30, 0)');
    c.fillStyle = g;
    c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

/**
 * The plinth's top, for a CylinderGeometry cap of radius `R` (m): its texture is the disc seen from
 * above. Only the ring outside the drum (from `inner`) is laid: courses of flags, each course a
 * little different in width, the flags staggered; then the kerb, red and cream by turns.
 */
export function plinthTopTexture(R: number, inner: number): CanvasTexture {
  const S = 2048;
  const c0 = S / 2;
  const k = c0 / R; // px per metre
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const c = canvas.getContext('2d')!;
  const r = mulberry32(71);
  // mortar
  c.fillStyle = '#8e8373';
  c.fillRect(0, 0, S, S);
  const gap = 2.2; // px of mortar round each stone
  const stone = (r0: number, r1: number, a0: number, a1: number, fill: string): void => {
    const p0 = r0 * k + gap / 2;
    const p1 = r1 * k - gap / 2;
    const da0 = gap / 2 / p0;
    const da1 = gap / 2 / p1;
    c.beginPath();
    c.arc(c0, c0, p1, a0 + da1, a1 - da1);
    c.arc(c0, c0, p0, a1 - da0, a0 + da0, true);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
  };
  const sand: [number, number, number] = [206, 188, 156];
  const kerb = R - 0.75;
  let rr = inner - 0.4;
  let course = 0;
  while (rr < kerb - 0.2) {
    const w = Math.min(kerb - rr, 0.55 + r() * 0.3);
    const mid = rr + w / 2;
    const n = Math.max(12, Math.round((Math.PI * 2 * mid) / (0.8 + r() * 0.35)));
    const off = r() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a0 = off + (i / n) * Math.PI * 2;
      const a1 = off + ((i + 1) / n) * Math.PI * 2;
      const tone = 0.86 + r() * 0.2 - (course % 2) * 0.02;
      const warm: [number, number, number] = [sand[0] * (1 + (r() - 0.5) * 0.06), sand[1], sand[2] * (1 - r() * 0.08)];
      stone(rr, rr + w, a0, a1, shade(warm, tone));
    }
    rr += w;
    course++;
  }
  // the kerb: red and cream stones by turns, as the tower's own stripes
  {
    const n = Math.round((Math.PI * 2 * (kerb + R) * 0.5) / 0.9 / 2) * 2;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      const t = 0.92 + r() * 0.12;
      stone(kerb, R + 0.05, a0, a1, i % 2 ? shade([236, 224, 198], t) : shade([196, 58, 44], t));
    }
  }
  weather(c, S, S, r, 26000, 260);
  return texture(canvas);
}

/** The plinth's side: two courses of dressed stone under a red-and-cream kerb (`around` m round it). */
export function plinthSideTexture(around: number): CanvasTexture {
  // one tile: 8 m round, the plinth's 0.6 m up
  const W = 1024;
  const H = 96;
  const tile = 8;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d')!;
  const r = mulberry32(72);
  const k = W / tile;
  c.fillStyle = '#7e7466';
  c.fillRect(0, 0, W, H);
  // the kerb's edge along the top (canvas y down = down the side)
  const kerbH = 0.14 * (H / 0.6);
  const nk = Math.round(tile / 0.9 / 2) * 2;
  for (let i = 0; i < nk; i++) {
    c.fillStyle = i % 2 ? shade([236, 224, 198], 0.9 + r() * 0.1) : shade([196, 58, 44], 0.9 + r() * 0.1);
    c.fillRect((i * W) / nk + 1, 0, W / nk - 2, kerbH - 1.5);
  }
  // two courses of blocks, staggered
  const courseH = (H - kerbH) / 2;
  for (let row = 0; row < 2; row++) {
    const y = kerbH + row * courseH;
    let x = row ? -0.5 * k : 0;
    while (x < W) {
      const w = (0.9 + r() * 0.5) * k;
      c.fillStyle = shade([188, 172, 144], 0.82 + r() * 0.2);
      c.fillRect(x + 1.2, y + 1.2, Math.min(w, W - x) - 2.4, courseH - 2.4);
      x += w;
    }
  }
  weather(c, W, H, r, 2500, 20);
  return texture(canvas, Math.max(1, Math.round(around / tile)));
}

/**
 * The band round the drum's foot, `around` m round and `tall` m up: upright red boards, a cream
 * rail along the top with gold beading, a darker kick board at the foot, and every tile a cream
 * board with HELTER SKELTER on it between two gold stars.
 */
export function skirtTexture(around: number, tall: number): CanvasTexture {
  const tile = 8;
  const W = 1024;
  const H = Math.round((W * tall) / tile);
  const k = W / tile;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d')!;
  const t = texture(canvas, Math.max(1, Math.round(around / tile)));
  const paint = (): void => {
    const r = mulberry32(73);
    // boards, 20 cm, each its own shade of red, grain down them, a dark seam between
    const bw = 0.2 * k;
    for (let x = 0, i = 0; x < W; x += bw, i++) {
      c.fillStyle = shade([150, 46, 38], 0.85 + r() * 0.22);
      c.fillRect(x, 0, bw, H);
      c.strokeStyle = 'rgba(40, 10, 8, 0.18)';
      c.lineWidth = 1;
      for (let g = 0; g < 4; g++) {
        const gx = x + 3 + r() * (bw - 6);
        c.beginPath();
        c.moveTo(gx, 0);
        c.bezierCurveTo(gx + (r() - 0.5) * 6, H * 0.3, gx + (r() - 0.5) * 6, H * 0.7, gx, H);
        c.stroke();
      }
      c.fillStyle = 'rgba(30, 8, 6, 0.55)';
      c.fillRect(x, 0, 2, H);
      // nail heads at the rails behind
      c.fillStyle = 'rgba(40, 36, 32, 0.8)';
      for (const y of [0.15, 0.5, 0.85]) {
        c.beginPath();
        c.arc(x + bw / 2, H * y, 2, 0, Math.PI * 2);
        c.fill();
      }
    }
    // the cream rail at the top with gold beading under it, a kick board at the foot
    const rail = 0.34 * k;
    c.fillStyle = '#efe2c4';
    c.fillRect(0, 0, W, rail);
    c.fillStyle = '#d9a93a';
    c.fillRect(0, rail, W, 0.06 * k);
    c.fillStyle = '#5a2019';
    c.fillRect(0, H - 0.4 * k, W, 0.4 * k);
    c.fillStyle = '#d9a93a';
    c.fillRect(0, H - 0.44 * k, W, 0.04 * k);
    // the name board: cream, red rim, the ride's name in red on it, a gold star either side
    const bwid = 5.2 * k;
    const bh = 1.15 * k;
    const bx = (W - bwid) / 2;
    const by = H * 0.42 - bh / 2;
    c.fillStyle = '#f3e6c6';
    c.strokeStyle = '#c23b2e';
    c.lineWidth = 0.08 * k;
    c.beginPath();
    c.roundRect(bx, by, bwid, bh, 0.18 * k);
    c.fill();
    c.stroke();
    c.fillStyle = '#c23b2e';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = font(700, Math.round(0.62 * k));
    c.fillText('HELTER SKELTER', W / 2, by + bh / 2 + 0.03 * k, bwid - 0.5 * k);
    const star = (x: number, y: number, R: number): void => {
      c.beginPath();
      for (let p = 0; p < 10; p++) {
        const a = (p / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = p % 2 ? R * 0.45 : R;
        c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      c.closePath();
      c.fillStyle = '#e8b83a';
      c.fill();
      c.strokeStyle = '#8a5a14';
      c.lineWidth = 3;
      c.stroke();
    };
    star(bx - 0.62 * k, by + bh / 2, 0.42 * k);
    star(bx + bwid + 0.62 * k, by + bh / 2, 0.42 * k);
    weather(c, W, H, r, 9000, 60);
    t.needsUpdate = true;
  };
  paint();
  // (the lettering again once the real glyphs are in)
  onFontsReady(paint);
  return t;
}
