/**
 * THE BOARDS: every shop, table and counter's point-and-click panel made into a thing in the
 * world, the way the build boards are (woodworks/buildSign.ts), not a pane of dark glass floating
 * in front of it. Each place has its own LOOK:
 *
 *   face      what the board is made of, painted into its canvas: planks, slate, velvet, linen,
 *             baize, bark cloth... with its border work (a painted rope, gold leaf, stitching)
 *   lettering its faces and inks: sign-writer's hand lettering, gold leaf, chalk, burnt pine
 *   buttons   what you point at: a painted tag, a manila price ticket on its string, a brass
 *             plate, a tarot card, a chalked box
 *   frame     what it's set in, built round it: oak, gilt, brass, painted wood, bamboo
 *
 * `mount` turns a panel into the board: opaque, no longer drawn over everything, and framed.
 * Indoors it's drawn unlit like the rooms are (their light is painted in, interiors.ts), with a
 * lamp's falloff painted onto its face; outdoors it's lit by the sun and moon like everything
 * else there, dimming at dusk with a touch of its own paint showing after dark.
 *
 * `Lettering` is the painter: a board's paint function asks it for the face, a title, a line of
 * text in one of the look's inks, a button; the look decides what each of those looks like.
 */

import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, type Material, type PlaneGeometry, type WebGLRenderer } from 'three';
import { Batch, M, rounded, type Wood } from '../village/craft.ts';
import { handLetter, plankBoard, rngOf, serif, weather } from '../village/signs.ts';
import { font } from './fonts.ts';
import type { Panel } from './panel.ts';
import type { Button, InteractivePanel } from './pointer.ts';

type Ctx = CanvasRenderingContext2D;
type Weight = 500 | 600 | 700;

/** a button: live, under the pointer, not now, or already done ("YOURS ✓"); `alt` a second choice */
export type BtnState = 'go' | 'hover' | 'off' | 'done' | 'alt';

export interface Frame {
  kind: 'wood' | 'metal' | 'paint' | 'bamboo' | 'none';
  wood?: Wood;
  /** a metal or paint colour (CSS) */
  colour?: string;
  /** rail width and depth (m) */
  w: number;
  d: number;
  /** little metal caps on the corners (CSS colour) */
  corners?: string;
}

export interface Look {
  face(c: Ctx, w: number, h: number, seed: number): void;
  /** the title's face, and whether it's lettered by hand */
  titleFont(px: number): string;
  hand: boolean;
  /** body text */
  textFont(weight: Weight, px: number): string;
  /** inks: the title, body text, the quieter lines, prices, yes, no; the title's painted shadow */
  title: string;
  ink: string;
  dim: string;
  accent: string;
  good: string;
  bad: string;
  shadow: string | null;
  /** gold leaf titles (a gradient, a dark edge under) */
  gilt?: boolean;
  /** a pale face (pine, linen, bark cloth): pictures sit on a darker mat */
  light?: boolean;
  button(c: Ctx, x: number, y: number, w: number, h: number, label: string, st: BtnState, px: number, look: Look): void;
  frame: Frame;
  /** outdoors: how much of its own paint shows after dark */
  glow?: number;
}

/* ── painting kit ─────────────────────────────────────────────────────── */

function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** A lamp over the board: brightest at the top middle, falling off to the corners (indoors). */
function lamp(c: Ctx, w: number, h: number, k = 0.28): void {
  const g = c.createRadialGradient(w / 2, -h * 0.25, h * 0.2, w / 2, h * 0.3, Math.max(w, h) * 0.95);
  g.addColorStop(0, 'rgba(255, 240, 210, 0.07)');
  g.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
  g.addColorStop(1, `rgba(0, 0, 0, ${k})`);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}

/** Fine noise over a surface (cloth nap, slate, paper). */
function grain(c: Ctx, w: number, h: number, seed: number, n: number, light: string, dark: string): void {
  const r = rngOf(seed);
  for (let i = 0; i < n; i++) {
    c.fillStyle = r() < 0.5 ? light : dark;
    c.fillRect(r() * w, r() * h, 1 + r() * 1.6, 1 + r() * 1.6);
  }
}

/** A woven texture: fine threads both ways (linen, bark cloth, the sampler). */
function weave(c: Ctx, w: number, h: number, step: number, a: number): void {
  c.strokeStyle = `rgba(0, 0, 0, ${a})`;
  c.lineWidth = 1;
  for (let x = 0; x < w; x += step) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, h);
    c.stroke();
  }
  c.strokeStyle = `rgba(255, 255, 255, ${a * 0.8})`;
  for (let y = 0; y < h; y += step) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(w, y);
    c.stroke();
  }
}

/** Gold leaf over a shape drawn by `draw(fill)`. */
function goldLeaf(c: Ctx, y0: number, y1: number, draw: (fill: string | CanvasGradient, dx: number, dy: number) => void): void {
  draw('rgba(30, 16, 4, 0.75)', 2, 2.5);
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, '#fff2b8');
  g.addColorStop(0.45, '#e8bf5a');
  g.addColorStop(0.55, '#b88a2a');
  g.addColorStop(1, '#f0d27a');
  draw(g, 0, 0);
}

/** A plate: a rounded rectangle filled and edged. */
function plate(c: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient, edge: string | null, lw = 3): void {
  rr(c, x, y, w, h, r);
  c.fillStyle = fill;
  c.fill();
  if (edge) {
    c.lineWidth = lw;
    c.strokeStyle = edge;
    c.stroke();
  }
}

/** A button's word, centred on its plate. */
function word(c: Ctx, label: string, x: number, y: number, w: number, h: number, fnt: string, fill: string, shadow: string | null = null): void {
  c.font = fnt;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  if (shadow) {
    c.fillStyle = shadow;
    c.fillText(label, x + w / 2 + 2, y + h / 2 + 3, w - 18);
  }
  c.fillStyle = fill;
  c.fillText(label, x + w / 2, y + h / 2 + 2, w - 18);
  c.textBaseline = 'alphabetic';
}

/** A metal plate (brass, gold, chrome): a gradient, a bright top edge, a dark bottom one. */
function metalPlate(c: Ctx, x: number, y: number, w: number, h: number, tones: [string, string, string], r = 12): void {
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, tones[0]);
  g.addColorStop(0.5, tones[1]);
  g.addColorStop(1, tones[2]);
  plate(c, x, y, w, h, r, g, 'rgba(30, 18, 6, 0.8)', 2.5);
  c.strokeStyle = 'rgba(255, 255, 240, 0.55)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(x + r, y + 3);
  c.lineTo(x + w - r, y + 3);
  c.stroke();
}

const BRASS: [string, string, string] = ['#f4d98a', '#c89a48', '#8a6424'];
const BRASS_HOT: [string, string, string] = ['#fff4c8', '#f0c870', '#b8883a'];

/* ── the looks ────────────────────────────────────────────────────────── */

const sans = (weight: Weight, px: number): string => font(weight, px);
const serifText = (weight: Weight, px: number): string => serif(weight, px);

/** a painted board (planks) with sign-writer's lettering: the timber yard */
const timber: Look = {
  face(c, w, h, seed) {
    plankBoard(c, 0, 0, w, h, '#6a4a2c', seed, 5);
    weather(c, w, h, seed, 0.5);
  },
  titleFont: (px) => serif(700, px),
  hand: true,
  textFont: serifText,
  title: '#f4ead2',
  ink: '#f4ead2',
  dim: 'rgba(240, 226, 196, 0.72)',
  accent: '#ffd88a',
  good: '#bfe8a0',
  bad: '#ff9a7a',
  shadow: 'rgba(30, 18, 8, 0.55)',
  button(c, x, y, w, h, label, st, px, L) {
    // a board of its own, painted up bright when it's live
    const live = st === 'go' || st === 'hover';
    plankBoard(c, x, y, w, h, st === 'hover' ? '#a07448' : '#8a6038', 11 + Math.round(x), 1);
    rr(c, x, y, w, h, 10);
    c.lineWidth = 4;
    c.strokeStyle = live ? (st === 'hover' ? '#fff4c8' : '#ffc640') : 'rgba(240, 226, 196, 0.3)';
    c.stroke();
    word(c, label, x, y, w, h, L.textFont(700, px), st === 'done' ? L.good : live ? '#fff0d0' : 'rgba(240, 226, 196, 0.45)', L.shadow);
  },
  frame: { kind: 'wood', wood: 'teak', w: 0.045, d: 0.05 },
  // (it stands in the timber yard's shade, under its roof)
  glow: 0.45,
};

/** THE CARPENTER: planed pine, the lettering burnt in */
const pine: Look = {
  light: true,
  face(c, w, h, seed) {
    plankBoard(c, 0, 0, w, h, '#d8b888', seed, 5);
    lamp(c, w, h, 0.22);
  },
  titleFont: (px) => serif(700, px),
  hand: true,
  textFont: serifText,
  title: '#3a2210',
  ink: '#3a2412',
  dim: 'rgba(70, 44, 22, 0.78)',
  accent: '#8a2a12',
  good: '#2f6a2a',
  bad: '#a82a12',
  shadow: 'rgba(120, 70, 30, 0.35)',
  button(c, x, y, w, h, label, st, px, L) {
    const fill = st === 'hover' ? '#b07a44' : st === 'go' ? '#8a5a30' : st === 'done' ? 'rgba(60, 110, 50, 0.25)' : 'rgba(90, 60, 30, 0.18)';
    plate(c, x, y, w, h, 8, fill, 'rgba(58, 34, 16, 0.7)', 3);
    // the inlay's nails
    c.fillStyle = 'rgba(40, 26, 14, 0.7)';
    for (const [nx, ny] of [[x + 10, y + 10], [x + w - 10, y + 10], [x + 10, y + h - 10], [x + w - 10, y + h - 10]]) {
      c.beginPath();
      c.arc(nx, ny, 3, 0, Math.PI * 2);
      c.fill();
    }
    word(c, label, x, y, w, h, L.textFont(700, px), st === 'done' ? L.good : st === 'off' ? 'rgba(58, 34, 16, 0.45)' : '#f6e6c8');
  },
  frame: { kind: 'wood', wood: 'oak', w: 0.06, d: 0.05 },
};

/** a flower, five petals round a middle */
function flower(c: Ctx, x: number, y: number, r: number, petal: string, mid: string, turn: number): void {
  c.fillStyle = petal;
  for (let i = 0; i < 5; i++) {
    const a = turn + (i / 5) * Math.PI * 2;
    c.beginPath();
    c.ellipse(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.55, r * 0.34, a, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = mid;
  c.beginPath();
  c.arc(x, y, r * 0.3, 0, Math.PI * 2);
  c.fill();
}

/** THE FLORIST: sage-green painted boards, flowers painted in round the edge */
const garden: Look = {
  face(c, w, h, seed) {
    plankBoard(c, 0, 0, w, h, '#5c7c58', seed, 5);
    weather(c, w, h, seed, 0.25);
    const r = rngOf(seed + 9);
    // a vine along the top and the foot, leaves and flowers on it
    for (const y of [26, h - 26]) {
      c.strokeStyle = '#3f5a36';
      c.lineWidth = 4;
      c.beginPath();
      for (let x = 10; x <= w - 10; x += 20) c.lineTo(x, y + Math.sin(x / 40) * 7);
      c.stroke();
      for (let x = 30; x < w - 20; x += 46 + r() * 30) {
        c.fillStyle = r() < 0.5 ? '#7fa46a' : '#6a9058';
        c.beginPath();
        c.ellipse(x, y + Math.sin(x / 40) * 7 + (r() < 0.5 ? -8 : 8), 11, 5, r() * 3, 0, Math.PI * 2);
        c.fill();
        if (r() < 0.45) flower(c, x + 8, y + Math.sin(x / 40) * 7, 11, r() < 0.5 ? '#f4a8c4' : '#fbf3e0', '#f2c84a', r() * 6);
      }
    }
    lamp(c, w, h, 0.25);
  },
  titleFont: (px) => `italic ${serif(700, px)}`,
  hand: true,
  textFont: serifText,
  title: '#fbf3e0',
  ink: '#fbf3e0',
  dim: 'rgba(246, 240, 224, 0.75)',
  accent: '#ffd6e2',
  good: '#d8f4b8',
  bad: '#ffb0a0',
  shadow: 'rgba(30, 44, 26, 0.55)',
  button(c, x, y, w, h, label, st, px, L) {
    // a terracotta plant label
    const fill = st === 'hover' ? '#e07e52' : st === 'go' ? '#c8643c' : st === 'done' ? 'rgba(220, 244, 200, 0.2)' : 'rgba(200, 100, 60, 0.25)';
    plate(c, x, y, w, h, h / 2, fill, st === 'off' ? null : 'rgba(80, 36, 16, 0.6)', 3);
    word(c, label, x, y, w, h, L.textFont(700, px), st === 'done' ? L.good : st === 'off' ? 'rgba(246, 240, 224, 0.5)' : '#fff6ea');
  },
  frame: { kind: 'paint', colour: '#eeeae0', w: 0.05, d: 0.04 },
};

/** a brass tack */
function tack(c: Ctx, x: number, y: number): void {
  const g = c.createRadialGradient(x - 2, y - 2, 1, x, y, 7);
  g.addColorStop(0, '#fff0b0');
  g.addColorStop(1, '#8a6424');
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, 6.5, 0, Math.PI * 2);
  c.fill();
}

/** THE PAWN SHOP: old stained wood, brass tacks, prices on manila tickets */
const pawn: Look = {
  face(c, w, h, seed) {
    plankBoard(c, 0, 0, w, h, '#3e2e22', seed, 6);
    weather(c, w, h, seed, 0.35);
    for (let x = 20; x < w; x += 60) {
      tack(c, x, 16);
      tack(c, x, h - 16);
    }
    lamp(c, w, h, 0.35);
  },
  titleFont: (px) => serif(700, px),
  hand: false,
  gilt: true,
  textFont: serifText,
  title: '#e0bc6a',
  ink: '#eadcc0',
  dim: 'rgba(226, 212, 186, 0.7)',
  accent: '#e8c070',
  good: '#b8e098',
  bad: '#ff9a7a',
  shadow: 'rgba(0, 0, 0, 0.6)',
  button(c, x, y, w, h, label, st, px, _L) {
    // a manila ticket: a clipped corner, a punched hole, its string
    const card = st === 'hover' ? '#fff0c8' : st === 'off' ? 'rgba(232, 216, 168, 0.35)' : st === 'done' ? '#cfe0b0' : '#e8d8a8';
    c.save();
    c.translate(x + w / 2, y + h / 2);
    c.rotate(((x * 7 + y) % 5 - 2) * 0.008);
    c.translate(-w / 2, -h / 2);
    c.beginPath();
    c.moveTo(18, 0);
    c.lineTo(w, 0);
    c.lineTo(w, h);
    c.lineTo(18, h);
    c.lineTo(0, h / 2);
    c.closePath();
    c.fillStyle = card;
    c.fill();
    c.strokeStyle = 'rgba(80, 60, 30, 0.6)';
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = '#3e2e22';
    c.beginPath();
    c.arc(18, h / 2, 5, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#d8d0b8';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(18, h / 2);
    c.quadraticCurveTo(-10, h / 2 - 20, -22, h / 2 - 34);
    c.stroke();
    c.restore();
    word(c, label, x + 14, y, w - 14, h, `${st === 'off' ? '' : 'bold '}${serif(700, px)}`, st === 'off' ? 'rgba(62, 46, 34, 0.5)' : '#3a2412');
  },
  frame: { kind: 'wood', wood: 'walnut', w: 0.06, d: 0.05, corners: '#c89a48' },
};

/** THE TAXIDERMIST: an oak lodge board, engraved brass plaques */
const lodge: Look = {
  face(c, w, h, seed) {
    plankBoard(c, 0, 0, w, h, '#5a4430', seed, 4);
    // a sunk panel in the middle, a bevel round it
    c.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    c.lineWidth = 6;
    c.strokeRect(22, 22, w - 44, h - 44);
    c.strokeStyle = 'rgba(255, 236, 200, 0.12)';
    c.lineWidth = 3;
    c.strokeRect(27, 27, w - 54, h - 54);
    lamp(c, w, h, 0.35);
  },
  titleFont: (px) => serif(700, px),
  hand: false,
  gilt: true,
  textFont: serifText,
  title: '#e8c878',
  ink: '#f0e2c8',
  dim: 'rgba(236, 222, 196, 0.72)',
  accent: '#f0cf78',
  good: '#c0e0a0',
  bad: '#ff9a7a',
  shadow: 'rgba(0, 0, 0, 0.6)',
  button(c, x, y, w, h, label, st, px, L) {
    if (st === 'go' || st === 'hover') metalPlate(c, x, y, w, h, st === 'hover' ? BRASS_HOT : BRASS, 6);
    else plate(c, x, y, w, h, 6, st === 'done' ? 'rgba(150, 190, 120, 0.2)' : 'rgba(0, 0, 0, 0.2)', 'rgba(200, 160, 90, 0.45)', 2);
    // the plaque's screws
    c.fillStyle = 'rgba(60, 40, 16, 0.8)';
    for (const sx of [x + 9, x + w - 9]) {
      c.beginPath();
      c.arc(sx, y + h / 2, 3.5, 0, Math.PI * 2);
      c.fill();
    }
    word(c, label, x, y, w, h, serif(700, px), st === 'done' ? L.good : st === 'off' ? 'rgba(236, 222, 196, 0.45)' : '#2a1a08');
  },
  frame: { kind: 'wood', wood: 'mahogany', w: 0.07, d: 0.05 },
};

/** THE JEWELLER: black velvet, gold leaf, a gilt frame */
const velvet: Look = {
  face(c, w, h, seed) {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#24142e');
    g.addColorStop(1, '#130a1a');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    grain(c, w, h, seed, 5000, 'rgba(255, 220, 255, 0.035)', 'rgba(0, 0, 0, 0.12)');
    // a double gilt line round it
    for (const [inset, lw] of [[16, 3], [26, 1.5]] as const) {
      c.strokeStyle = '#d8b460';
      c.lineWidth = lw;
      c.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
    }
    lamp(c, w, h, 0.4);
  },
  titleFont: (px) => serif(600, px),
  hand: false,
  gilt: true,
  textFont: serifText,
  title: '#f0d27a',
  ink: '#efe2f4',
  dim: 'rgba(230, 214, 238, 0.66)',
  accent: '#f0cf78',
  good: '#b8e8c0',
  bad: '#ff9aa8',
  shadow: 'rgba(0, 0, 0, 0.7)',
  button(c, x, y, w, h, label, st, px, L) {
    if (st === 'hover' || st === 'go') {
      plate(c, x, y, w, h, 4, st === 'hover' ? '#3a2448' : '#1c0f24', '#e8c46a', 3);
      c.strokeStyle = 'rgba(232, 196, 106, 0.5)';
      c.lineWidth = 1;
      c.strokeRect(x + 6, y + 6, w - 12, h - 12);
    } else plate(c, x, y, w, h, 4, 'rgba(255, 255, 255, 0.04)', 'rgba(216, 180, 96, 0.3)', 1.5);
    word(c, label, x, y, w, h, serif(600, px), st === 'done' ? L.good : st === 'off' ? 'rgba(230, 214, 238, 0.4)' : '#f0d27a');
  },
  frame: { kind: 'metal', colour: '#e0b84e', w: 0.06, d: 0.05 },
};

/** THE BOUTIQUE: cream linen, a teal hand, slim brass */
const linen: Look = {
  light: true,
  face(c, w, h) {
    c.fillStyle = '#efe6d2';
    c.fillRect(0, 0, w, h);
    weave(c, w, h, 4, 0.03);
    for (const [inset, lw] of [[18, 2.5], [26, 1]] as const) {
      c.strokeStyle = '#2f7a7a';
      c.lineWidth = lw;
      c.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
    }
    lamp(c, w, h, 0.2);
  },
  titleFont: (px) => `italic ${serif(600, px)}`,
  hand: false,
  textFont: serifText,
  title: '#246868',
  ink: '#3a322a',
  dim: 'rgba(70, 60, 50, 0.72)',
  accent: '#2f7a7a',
  good: '#3a7a3a',
  bad: '#b0402a',
  shadow: null,
  button(c, x, y, w, h, label, st, px, L) {
    // a ribbon: notched at both ends
    const fill = st === 'hover' ? '#3f9a9a' : st === 'go' ? '#2f7a7a' : st === 'done' ? 'rgba(58, 122, 58, 0.18)' : 'rgba(47, 122, 122, 0.15)';
    const n = 14;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + w, y);
    c.lineTo(x + w - n, y + h / 2);
    c.lineTo(x + w, y + h);
    c.lineTo(x, y + h);
    c.lineTo(x + n, y + h / 2);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    word(c, label, x, y, w, h, `italic ${serif(600, px)}`, st === 'done' ? L.good : st === 'off' ? 'rgba(47, 122, 122, 0.5)' : '#fbf6ea');
  },
  frame: { kind: 'metal', colour: '#c8a050', w: 0.03, d: 0.03 },
};

/** a painted rope, round a board */
function ropeBorder(c: Ctx, w: number, h: number, inset: number): void {
  const step = 10;
  const edge = (x0: number, y0: number, x1: number, y1: number): void => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.floor(len / step);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      c.save();
      c.translate(x, y);
      c.rotate(Math.atan2(y1 - y0, x1 - x0) + 0.9);
      c.fillStyle = i % 2 ? '#d8c08a' : '#b89a62';
      c.beginPath();
      c.ellipse(0, 0, 8, 4.2, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(60, 40, 16, 0.5)';
      c.lineWidth = 1;
      c.stroke();
      c.restore();
    }
  };
  edge(inset, inset, w - inset, inset);
  edge(w - inset, inset, w - inset, h - inset);
  edge(w - inset, h - inset, inset, h - inset);
  edge(inset, h - inset, inset, inset);
}

/** THE TACKLE SHOP: navy boards, a painted rope round them, life-ring red and white */
const tackle: Look = {
  face(c, w, h, seed) {
    plankBoard(c, 0, 0, w, h, '#1f3652', seed, 5);
    weather(c, w, h, seed, 0.35);
    ropeBorder(c, w, h, 18);
    lamp(c, w, h, 0.3);
  },
  titleFont: (px) => serif(700, px),
  hand: true,
  textFont: sans,
  title: '#f6f2e6',
  ink: '#f2eee4',
  dim: 'rgba(230, 236, 240, 0.7)',
  accent: '#ffcf5a',
  good: '#9fe8a8',
  bad: '#ff8a7a',
  shadow: '#a82a20',
  button(c, x, y, w, h, label, st, px, L) {
    const live = st === 'go' || st === 'hover';
    if (live) {
      plate(c, x, y, w, h, 12, st === 'hover' ? '#e0483a' : '#c23b2e', '#f6f2e6', 4);
      // the white bands of a ring buoy
      c.save();
      rr(c, x, y, w, h, 12);
      c.clip();
      c.fillStyle = 'rgba(246, 242, 230, 0.9)';
      c.fillRect(x + 14, y, 14, h);
      c.fillRect(x + w - 28, y, 14, h);
      c.restore();
    } else plate(c, x, y, w, h, 12, st === 'done' ? 'rgba(159, 232, 168, 0.18)' : 'rgba(255, 255, 255, 0.08)', 'rgba(246, 242, 230, 0.35)', 2);
    word(c, label, x + 20, y, w - 40, h, sans(700, px), st === 'done' ? L.good : live ? '#fffaf0' : 'rgba(230, 236, 240, 0.45)');
  },
  frame: { kind: 'paint', colour: '#18283c', w: 0.06, d: 0.05, corners: '#c89a48' },
};

/** chalk: the stroke drawn a few times, each a hair off, none quite solid */
function chalkText(c: Ctx, text: string, x: number, y: number, fnt: string, fill: string, align: CanvasTextAlign, max: number | undefined, seed: number): void {
  const r = rngOf(seed);
  c.font = fnt;
  c.textAlign = align;
  c.fillStyle = fill;
  for (let i = 0; i < 3; i++) {
    c.globalAlpha = i === 0 ? 0.85 : 0.35;
    c.fillText(text, x + (r() - 0.5) * 1.6, y + (r() - 0.5) * 1.6, max);
  }
  c.globalAlpha = 1;
}

/** A slate: smudged, the ghosts of rubbed-out chalk on it. */
function slate(c: Ctx, w: number, h: number, seed: number): void {
  c.fillStyle = '#28302c';
  c.fillRect(0, 0, w, h);
  const r = rngOf(seed);
  for (let i = 0; i < 14; i++) {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 60 + r() * 120);
    g.addColorStop(0, 'rgba(220, 226, 218, 0.07)');
    g.addColorStop(1, 'rgba(220, 226, 218, 0)');
    c.save();
    c.translate(r() * w, r() * h);
    c.scale(1.8, 0.7);
    c.fillStyle = g;
    c.fillRect(-200, -200, 400, 400);
    c.restore();
  }
  grain(c, w, h, seed + 1, 2500, 'rgba(255, 255, 255, 0.05)', 'rgba(0, 0, 0, 0.1)');
}

/** THE BAIT SHOP: a chalkboard of today's bait */
const chalk: Look = {
  face(c, w, h, seed) {
    slate(c, w, h, seed);
    lamp(c, w, h, 0.25);
  },
  titleFont: (px) => serif(700, px),
  hand: true,
  textFont: sans,
  title: 'rgba(246, 246, 236, 0.95)',
  ink: 'rgba(240, 242, 232, 0.92)',
  dim: 'rgba(226, 230, 220, 0.62)',
  accent: '#f4e27a',
  good: '#b8f0a0',
  bad: '#ffa090',
  shadow: null,
  button(c, x, y, w, h, label, st, px, L) {
    // a box chalked round the word; under your pointer, chalk scribbled in
    const live = st === 'go' || st === 'hover';
    if (st === 'hover') {
      rr(c, x, y, w, h, 14);
      c.fillStyle = 'rgba(244, 226, 122, 0.22)';
      c.fill();
    }
    const r = rngOf(Math.round(x * 3 + y));
    c.strokeStyle = live ? 'rgba(244, 226, 122, 0.9)' : st === 'done' ? 'rgba(184, 240, 160, 0.7)' : 'rgba(226, 230, 220, 0.3)';
    c.lineWidth = 3.5;
    for (let k = 0; k < 2; k++) {
      c.beginPath();
      rr(c, x + (r() - 0.5) * 3, y + (r() - 0.5) * 3, w, h, 14);
      c.stroke();
    }
    c.textBaseline = 'middle';
    chalkText(c, label, x + w / 2, y + h / 2 + 2, sans(700, px), st === 'done' ? L.good : live ? '#f4e27a' : 'rgba(226, 230, 220, 0.45)', 'center', w - 18, Math.round(x + y));
    c.textBaseline = 'alphabetic';
  },
  frame: { kind: 'wood', wood: 'oak', w: 0.05, d: 0.04 },
};

/** THE FISH MARKET: Joe's chalkboard on the stall, in a blue-painted frame */
const market: Look = { ...chalk, frame: { kind: 'paint', colour: '#2f6fa8', w: 0.05, d: 0.04 }, glow: 0.2 };

/** a star, `n` points */
function starAt(c: Ctx, x: number, y: number, r: number, fill: string, n = 5): void {
  c.fillStyle = fill;
  c.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const k = i % 2 ? r * 0.42 : r;
    c.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
  }
  c.closePath();
  c.fill();
}

/** THE FORTUNE TELLER: midnight cloth, stars and a moon, cards to turn */
const mystic: Look = {
  face(c, w, h, seed) {
    const g = c.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, '#3a2260');
    g.addColorStop(1, '#170c28');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    grain(c, w, h, seed, 3000, 'rgba(255, 230, 255, 0.04)', 'rgba(0, 0, 0, 0.1)');
    const r = rngOf(seed + 5);
    for (let i = 0; i < 70; i++) starAt(c, r() * w, r() * h, 1.5 + r() * r() * 5, `rgba(255, 230, 160, ${(0.25 + r() * 0.5).toFixed(2)})`, r() < 0.3 ? 4 : 5);
    // a crescent moon in the top corner
    c.fillStyle = 'rgba(255, 226, 150, 0.85)';
    c.beginPath();
    c.arc(w - 70, 62, 30, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.arc(w - 58, 54, 27, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#231440';
    c.beginPath();
    c.arc(w - 58, 54, 27, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(232, 196, 106, 0.8)';
    c.lineWidth = 3;
    c.strokeRect(14, 14, w - 28, h - 28);
    lamp(c, w, h, 0.3);
  },
  titleFont: (px) => `italic ${serif(700, px)}`,
  hand: true,
  textFont: serifText,
  title: '#f2d27a',
  ink: '#efe0ff',
  dim: 'rgba(226, 210, 246, 0.68)',
  accent: '#ffd76a',
  good: '#b8f0c8',
  bad: '#ff9ab0',
  shadow: 'rgba(0, 0, 0, 0.6)',
  button(c, x, y, w, h, label, st, px, L) {
    // a tarot card, laid on its side
    const live = st === 'go' || st === 'hover';
    plate(c, x, y, w, h, 8, st === 'hover' ? '#5a3a8a' : live ? '#2c1a4a' : 'rgba(255, 255, 255, 0.05)', live ? '#e8c46a' : 'rgba(232, 196, 106, 0.3)', 3);
    if (live) {
      c.strokeStyle = 'rgba(232, 196, 106, 0.55)';
      c.lineWidth = 1;
      c.strokeRect(x + 6, y + 6, w - 12, h - 12);
      starAt(c, x + 18, y + h / 2, 6, '#e8c46a');
      starAt(c, x + w - 18, y + h / 2, 6, '#e8c46a');
    }
    word(c, label, x + 16, y, w - 32, h, `italic ${serif(700, px)}`, st === 'done' ? L.good : live ? '#f2d27a' : 'rgba(226, 210, 246, 0.45)');
  },
  frame: { kind: 'wood', wood: 'ebony', w: 0.06, d: 0.05, corners: '#e0b84e' },
};

/** Gold tooling round a leather board: two rules and a flourish in each corner. */
function tooling(c: Ctx, w: number, h: number, colour: string): void {
  c.strokeStyle = colour;
  c.lineWidth = 4;
  c.strokeRect(16, 16, w - 32, h - 32);
  c.lineWidth = 1.5;
  c.strokeRect(26, 26, w - 52, h - 52);
  for (const [x, y] of [[26, 26], [w - 26, 26], [26, h - 26], [w - 26, h - 26]]) {
    c.fillStyle = colour;
    c.beginPath();
    c.moveTo(x, y - 11);
    c.lineTo(x + 11, y);
    c.lineTo(x, y + 11);
    c.lineTo(x - 11, y);
    c.closePath();
    c.fill();
  }
}

/** THE ISLAND BANK: green leather tooled in gold, brass plates */
const bank: Look = {
  face(c, w, h, seed) {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#16382a');
    g.addColorStop(1, '#0b2016');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    grain(c, w, h, seed, 6000, 'rgba(255, 255, 255, 0.025)', 'rgba(0, 0, 0, 0.1)');
    tooling(c, w, h, '#c8a050');
    lamp(c, w, h, 0.35);
  },
  titleFont: (px) => serif(700, px),
  hand: false,
  gilt: true,
  textFont: sans,
  title: '#e8c470',
  ink: '#f2ead6',
  dim: 'rgba(232, 226, 206, 0.66)',
  accent: '#f0c860',
  good: '#9fe8a8',
  bad: '#ff8a7a',
  shadow: 'rgba(0, 0, 0, 0.6)',
  button(c, x, y, w, h, label, st, px, L) {
    if (st === 'go' || st === 'hover') metalPlate(c, x, y, w, h, st === 'hover' ? BRASS_HOT : BRASS, 10);
    else plate(c, x, y, w, h, 10, st === 'alt' ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.05)', st === 'alt' ? '#c8a050' : 'rgba(200, 160, 80, 0.35)', 2.5);
    word(c, label, x, y, w, h, sans(700, px), st === 'go' || st === 'hover' ? '#2a1a06' : st === 'alt' ? '#e8c470' : st === 'done' ? L.good : 'rgba(232, 226, 206, 0.45)');
  },
  frame: { kind: 'metal', colour: '#c89a48', w: 0.05, d: 0.05 },
};

/** Art-deco fans of gold leaf in the corners, a pink enamel stripe round. */
function deco(c: Ctx, w: number, h: number): void {
  c.strokeStyle = '#ff5fc0';
  c.lineWidth = 3;
  c.strokeRect(22, 22, w - 44, h - 44);
  for (const [x, y, a] of [[14, 14, 0], [w - 14, 14, Math.PI / 2], [w - 14, h - 14, Math.PI], [14, h - 14, -Math.PI / 2]] as const) {
    c.save();
    c.translate(x, y);
    c.rotate(a);
    for (let i = 0; i < 5; i++) {
      c.strokeStyle = i % 2 ? '#b88a2a' : '#f0d27a';
      c.lineWidth = 2.5;
      c.beginPath();
      c.arc(0, 0, 14 + i * 9, 0, Math.PI / 2);
      c.stroke();
    }
    for (let k = 0; k <= 4; k++) {
      const t = (k / 4) * (Math.PI / 2);
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos(t) * 50, Math.sin(t) * 50);
      c.stroke();
    }
    c.restore();
  }
}

/** THE LUCKY LURE (roulette): black lacquer, gold-leaf deco, pink enamel */
const lure: Look = {
  face(c, w, h, seed) {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1e1016');
    g.addColorStop(0.5, '#0e070a');
    g.addColorStop(1, '#180c12');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // the lacquer's sheen
    const s = c.createLinearGradient(0, 0, w, h);
    s.addColorStop(0.3, 'rgba(255, 255, 255, 0)');
    s.addColorStop(0.5, 'rgba(255, 220, 240, 0.05)');
    s.addColorStop(0.7, 'rgba(255, 255, 255, 0)');
    c.fillStyle = s;
    c.fillRect(0, 0, w, h);
    grain(c, w, h, seed, 1200, 'rgba(255, 255, 255, 0.02)', 'rgba(0, 0, 0, 0.1)');
    deco(c, w, h);
  },
  titleFont: (px) => serif(700, px),
  hand: false,
  gilt: true,
  textFont: sans,
  title: '#f0d27a',
  ink: '#f6ecf2',
  dim: 'rgba(240, 222, 232, 0.66)',
  accent: '#ff8fd4',
  good: '#9fe8a8',
  bad: '#ff8a8a',
  shadow: 'rgba(0, 0, 0, 0.7)',
  button(c, x, y, w, h, label, st, px, _L) {
    if (st === 'go' || st === 'hover') {
      const g = c.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, st === 'hover' ? '#ff9ad8' : '#ff5fc0');
      g.addColorStop(1, st === 'hover' ? '#e84aa8' : '#b8307e');
      plate(c, x, y, w, h, 10, g, '#f0d27a', 4);
    } else plate(c, x, y, w, h, 10, st === 'alt' ? 'rgba(240, 210, 122, 0.12)' : 'rgba(255, 255, 255, 0.05)', st === 'alt' ? '#f0d27a' : 'rgba(240, 210, 122, 0.3)', 3);
    word(c, label, x, y, w, h, sans(700, px), st === 'go' || st === 'hover' ? '#1a0610' : st === 'alt' ? '#f0d27a' : 'rgba(240, 222, 232, 0.4)');
  },
  frame: { kind: 'metal', colour: '#e0b84e', w: 0.045, d: 0.045 },
};

/** THE CARD SHARK (blackjack): green baize, gold rules, ivory plaques, mahogany */
const baize: Look = {
  face(c, w, h, seed) {
    const g = c.createRadialGradient(w / 2, h * 0.4, 30, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, '#1f5a38');
    g.addColorStop(1, '#0f3420');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    grain(c, w, h, seed, 7000, 'rgba(255, 255, 255, 0.03)', 'rgba(0, 0, 0, 0.1)');
    c.strokeStyle = '#d8b460';
    c.lineWidth = 3;
    c.strokeRect(16, 16, w - 32, h - 32);
    c.lineWidth = 1;
    c.strokeRect(23, 23, w - 46, h - 46);
    lamp(c, w, h, 0.3);
  },
  titleFont: (px) => serif(700, px),
  hand: false,
  gilt: true,
  textFont: sans,
  title: '#f0d27a',
  ink: '#f4efe0',
  dim: 'rgba(236, 232, 214, 0.68)',
  accent: '#ffd76a',
  good: '#c8f4b0',
  bad: '#ff9a8a',
  shadow: 'rgba(0, 0, 0, 0.6)',
  button(c, x, y, w, h, label, st, px, _L) {
    if (st === 'go' || st === 'hover') {
      const g = c.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, st === 'hover' ? '#ffffff' : '#f6f0de');
      g.addColorStop(1, st === 'hover' ? '#f0e6c8' : '#d8ceb0');
      plate(c, x, y, w, h, 10, g, '#b8923a', 3);
    } else plate(c, x, y, w, h, 10, st === 'alt' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.05)', st === 'alt' ? '#d8b460' : 'rgba(216, 180, 96, 0.3)', 2.5);
    word(c, label, x, y, w, h, sans(700, px), st === 'go' || st === 'hover' ? '#123a22' : st === 'alt' ? '#f0d27a' : 'rgba(236, 232, 214, 0.4)');
  },
  frame: { kind: 'wood', wood: 'mahogany', w: 0.06, d: 0.05, corners: '#c89a48' },
};

/** CORAL'S VILLA: a sampler, cross-stitched on linen */
const sampler: Look = {
  light: true,
  face(c, w, h) {
    c.fillStyle = '#f2ead8';
    c.fillRect(0, 0, w, h);
    weave(c, w, h, 5, 0.035);
    // a cross-stitch border: pink crosses, a teal row inside
    const cross = (x: number, y: number, s: number, colour: string): void => {
      c.strokeStyle = colour;
      c.lineWidth = 2.2;
      c.beginPath();
      c.moveTo(x - s, y - s);
      c.lineTo(x + s, y + s);
      c.moveTo(x + s, y - s);
      c.lineTo(x - s, y + s);
      c.stroke();
    };
    for (let x = 18; x < w - 10; x += 12) {
      cross(x, 16, 4, '#e8506a');
      cross(x, h - 16, 4, '#e8506a');
    }
    for (let y = 28; y < h - 20; y += 12) {
      cross(16, y, 4, '#e8506a');
      cross(w - 16, y, 4, '#e8506a');
    }
    for (let x = 34; x < w - 30; x += 12) {
      cross(x, 32, 3, '#3fa8a0');
      cross(x, h - 32, 3, '#3fa8a0');
    }
    lamp(c, w, h, 0.18);
  },
  titleFont: (px) => serif(700, px),
  hand: true,
  textFont: serifText,
  title: '#b8304a',
  ink: '#4a2a30',
  dim: 'rgba(90, 60, 64, 0.72)',
  accent: '#e8506a',
  good: '#3a8a6a',
  bad: '#b0302a',
  shadow: null,
  button(c, x, y, w, h, label, _st, px, L) {
    word(c, label, x, y, w, h, serif(700, px), L.accent);
  },
  frame: { kind: 'wood', wood: 'walnut', w: 0.05, d: 0.04 },
};

/** a band of tapa pattern: triangles and a zigzag */
function tapaBand(c: Ctx, x0: number, y: number, x1: number, hgt: number, ink: string): void {
  c.fillStyle = ink;
  for (let x = x0; x < x1 - hgt; x += hgt) {
    c.beginPath();
    c.moveTo(x, y + hgt);
    c.lineTo(x + hgt / 2, y);
    c.lineTo(x + hgt, y + hgt);
    c.closePath();
    c.fill();
  }
  c.strokeStyle = ink;
  c.lineWidth = 2.5;
  c.beginPath();
  for (let x = x0; x <= x1; x += hgt / 2) c.lineTo(x, y + hgt + 6 + ((x - x0) / (hgt / 2)) % 2 * 6);
  c.stroke();
}

/** THE DANCERS' CHEST: bark cloth printed with tapa bands, carved tags, a bamboo frame */
const tapa: Look = {
  light: true,
  face(c, w, h, seed) {
    c.fillStyle = '#d8bf94';
    c.fillRect(0, 0, w, h);
    weave(c, w, h, 3, 0.03);
    grain(c, w, h, seed, 1800, 'rgba(255, 244, 220, 0.08)', 'rgba(90, 60, 30, 0.08)');
    const band = Math.max(10, Math.min(18, h * 0.07));
    tapaBand(c, 8, 8, w - 8, band, '#5a2e18');
    tapaBand(c, 8, h - band * 2 - 14, w - 8, band, '#8a3a1a');
    lamp(c, w, h, 0.15);
  },
  titleFont: (px) => serif(700, px),
  hand: true,
  textFont: serifText,
  title: '#4a2410',
  ink: '#3a2212',
  dim: 'rgba(70, 44, 22, 0.8)',
  accent: '#8a2a12',
  good: '#2f6a2a',
  bad: '#a82a12',
  shadow: 'rgba(120, 70, 30, 0.25)',
  button(c, x, y, w, h, label, st, px, _L) {
    // a carved wooden tag
    const live = st === 'go' || st === 'hover';
    plankBoard(c, x, y, w, h, st === 'hover' ? '#8a5a32' : live ? '#6a4226' : '#5a4636', 5 + Math.round(y), 1);
    rr(c, x, y, w, h, 16);
    c.lineWidth = 4;
    c.strokeStyle = live ? '#e8c890' : 'rgba(232, 200, 144, 0.3)';
    c.stroke();
    word(c, label, x, y, w, h, serif(700, px), st === 'done' ? '#c8f0a0' : live ? '#fbeed6' : 'rgba(251, 238, 214, 0.45)', 'rgba(0, 0, 0, 0.4)');
  },
  frame: { kind: 'bamboo', w: 0.04, d: 0.04 },
  glow: 0.2,
};

export const LOOKS = { timber, pine, garden, pawn, lodge, velvet, linen, tackle, chalk, market, mystic, bank, lure, baize, sampler, tapa };
export type LookId = keyof typeof LOOKS;

/** Each building's look (by its name in the layout: village/roles.ts). */
const BY_BUILDING: Record<string, LookId> = {
  F: 'pine',
  D: 'garden',
  J: 'pawn',
  K: 'lodge',
  A: 'velvet',
  E: 'linen',
  S3: 'tackle',
  S2: 'chalk',
  N: 'mystic',
  stall: 'market',
  H: 'bank',
  C: 'lure',
  G: 'baize',
  L: 'sampler',
};

export function lookFor(building: string): Look {
  return LOOKS[BY_BUILDING[building] ?? 'timber'];
}

/* ── the painter ──────────────────────────────────────────────────────── */

export type InkName = 'title' | 'ink' | 'dim' | 'accent' | 'good' | 'bad';

/** Paints a board in its look: the face, titles, lines of text, buttons. */
export class Lettering {
  private buttons: Button[] = [];
  readonly c: Ctx;
  readonly w: number;
  readonly h: number;

  constructor(
    readonly panel: Panel,
    readonly look: Look,
    private readonly seed = 7,
  ) {
    this.c = panel.ctx;
    this.w = panel.canvas.width;
    this.h = panel.canvas.height;
  }

  /** Start a repaint: the face, fresh (`face` false: nothing under the buttons, cut out round them). */
  begin(face = true): Ctx {
    this.panel.clear();
    this.buttons = [];
    if (face) this.look.face(this.c, this.w, this.h, this.seed);
    this.c.textBaseline = 'alphabetic';
    return this.c;
  }

  private colour(ink: InkName | string): string {
    return ink in this.look ? (this.look[ink as InkName] as string) : ink;
  }

  /** The board's name, in its lettering (y: the baseline). */
  title(text: string, x: number, y: number, px: number, align: CanvasTextAlign = 'left', max = this.w - 80, ink: InkName | string = 'title'): void {
    const c = this.c;
    const L = this.look;
    const fnt = L.titleFont(px);
    c.font = fnt;
    const tw = Math.min(max, c.measureText(text).width);
    const cx = align === 'center' ? x : align === 'right' ? x - tw / 2 : x + tw / 2;
    if (L.gilt) {
      c.textAlign = 'center';
      goldLeaf(c, y - px, y, (fill, dx, dy) => {
        c.fillStyle = fill;
        c.fillText(text, cx + dx, y + dy, max);
      });
      return;
    }
    if (L.hand) {
      handLetter(c, text, cx, y - px * 0.34, max, fnt, this.colour(ink), L.shadow, this.seed + text.length);
      c.textBaseline = 'alphabetic';
      return;
    }
    c.textAlign = 'center';
    if (L.shadow) {
      c.fillStyle = L.shadow;
      c.fillText(text, cx + 2, y + 2, max);
    }
    c.fillStyle = this.colour(ink);
    c.fillText(text, cx, y, max);
  }

  /** A line of text in one of the look's inks (or a colour). */
  text(text: string, x: number, y: number, px: number, ink: InkName | string = 'ink', align: CanvasTextAlign = 'left', weight: Weight = 600, max?: number): void {
    const c = this.c;
    const fnt = this.look.textFont(weight, px);
    if (this.look === chalk || this.look === market) {
      chalkText(c, text, x, y, fnt, this.colour(ink), align, max, this.seed + Math.round(x + y));
      return;
    }
    c.font = fnt;
    c.textAlign = align;
    c.fillStyle = this.colour(ink);
    c.fillText(text, x, y, max);
  }

  /** A button: `st` 'go' becomes 'hover' under the pointer. Only live ones are clickable. */
  button(id: string, label: string, x: number, y: number, w: number, h: number, st: BtnState, px = 36): void {
    const hover = (this.panel as InteractivePanel).hover === id;
    const live = st === 'go' || st === 'alt';
    if (live) this.buttons.push({ id, x, y, w, h });
    this.look.button(this.c, x, y, w, h, label, live && hover ? 'hover' : st, px, this.look);
  }

  /** A clickable area the board has drawn itself (a card, a chip). */
  area(id: string, x: number, y: number, w: number, h: number, on = true): void {
    if (on) this.buttons.push({ id, x, y, w, h });
  }

  /** A picture of a thing for sale, on a mat that suits the board. */
  thumb(pic: HTMLCanvasElement | undefined, x: number, y: number, size: number, dim = false): void {
    const c = this.c;
    c.save();
    rr(c, x, y, size, size, 10);
    c.fillStyle = this.look.light ? 'rgba(70, 44, 22, 0.14)' : 'rgba(255, 244, 220, 0.09)';
    c.fill();
    c.strokeStyle = this.look.light ? 'rgba(70, 44, 22, 0.3)' : 'rgba(255, 244, 220, 0.2)';
    c.lineWidth = 2;
    c.stroke();
    if (pic) {
      if (dim) c.globalAlpha = 0.45;
      c.drawImage(pic, x + 4, y + 4, size - 8, size - 8);
    }
    c.restore();
  }

  /** Finish: the buttons to the pointer, the texture to the GPU. */
  end(): void {
    const p = this.panel as InteractivePanel;
    if ('buttons' in p) p.buttons = this.buttons;
    this.panel.commit();
  }
}

/* ── the board in the world ───────────────────────────────────────────── */

/** Two posts from under the board to the floor, each on a foot. */
function standFor(f: Frame, w: number, h: number, stand: number, renderer?: WebGLRenderer): Group {
  const g = new Group();
  const top = -h / 2 - f.w;
  const len = stand + top;
  const metal = f.kind === 'metal' ? f.colour ?? '#c89a48' : f.corners ?? '#c89a48';
  const z = -f.d / 2;
  if (renderer) {
    const b = new Batch();
    const post = f.kind === 'wood' ? M.wood(renderer, f.wood ?? 'walnut', 0.4) : M.metal(renderer, metal, 0.3);
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - 0.12);
      b.at(post, rounded(0.035, len, 0.035, 0.01), x, top - len / 2, z);
      b.at(M.metal(renderer, metal, 0.35), rounded(0.09, 0.03, 0.34, 0.01), x, -stand + 0.015, z);
    }
    g.add(b.group());
    return g;
  }
  const m = new MeshLambertMaterial({ color: f.kind === 'wood' ? WOOD_HEX[f.wood ?? 'walnut'] : metal });
  for (const sx of [-1, 1]) {
    const p = new Mesh(new BoxGeometry(0.035, len, 0.035), m);
    p.position.set(sx * (w / 2 - 0.12), top - len / 2, z);
    g.add(p);
  }
  return g;
}

const WOOD_HEX: Record<Wood, number> = { teak: 0x8a5e36, walnut: 0x4e3422, drift: 0x9a8a72, mahogany: 0x5e2618, bamboo: 0xb89858, oak: 0x9a7a4a, ebony: 0x1e1814 };

/**
 * Make a panel the board: opaque and set in the world (no longer drawn over it), and framed.
 * `renderer`: indoors, the frame is made of the shops' own wood and brass (village/craft.ts);
 * `outdoor`: lit by the sun and moon (the frame too), so it goes dim at night.
 */
export function mount(panel: Panel, look: Look, opts: { renderer?: WebGLRenderer; outdoor?: boolean; frame?: boolean; stand?: number } = {}): void {
  const old = panel.mesh.material as Material;
  panel.mesh.material = opts.outdoor
    ? new MeshLambertMaterial({ map: panel.texture, alphaTest: 0.5, emissive: 0xffffff, emissiveMap: panel.texture, emissiveIntensity: look.glow ?? 0.16 })
    : new MeshBasicMaterial({ map: panel.texture, alphaTest: 0.5 });
  old.dispose();
  panel.mesh.renderOrder = 0;
  if (opts.frame === false || look.frame.kind === 'none') return;
  const p = (panel.mesh.geometry as PlaneGeometry).parameters;
  panel.mesh.add(frameFor(look.frame, p.width, p.height, opts.outdoor ? undefined : opts.renderer, opts.stand));
}

/**
 * The frame round a w × h board, in the board's own frame (its face at z = 0). `stand`: the
 * board's centre is this far off the floor, and stands on two posts with feet (a board in the
 * middle of a room, not on a wall).
 */
export function frameFor(f: Frame, w: number, h: number, renderer?: WebGLRenderer, stand?: number): Group {
  const g = new Group();
  if (stand) g.add(standFor(f, w, h, stand, renderer));
  const fw = f.w;
  const fd = f.d;
  const z = -fd / 2 + 0.012;
  const rails: [number, number, number, number][] = [
    [0, h / 2 + fw / 2, w + fw * 2, fw],
    [0, -h / 2 - fw / 2, w + fw * 2, fw],
    [-w / 2 - fw / 2, 0, fw, h],
    [w / 2 + fw / 2, 0, fw, h],
  ];
  if (f.kind === 'bamboo') {
    // four canes, lashed at the corners
    const cane = new MeshLambertMaterial({ color: 0xc8a860 });
    const lash = new MeshLambertMaterial({ color: 0x6a4a2a });
    const r = fw / 2;
    for (const [x, y, lw, lh] of rails) {
      const len = Math.max(lw, lh) + fw * 1.6;
      const m = new Mesh(new CylinderGeometry(r, r * 1.05, len, 10), cane);
      if (lw > lh) m.rotation.z = Math.PI / 2;
      m.position.set(x, y, z);
      g.add(m);
      // the nodes along the cane
      for (let t = -0.4; t <= 0.41; t += 0.2) {
        const n = new Mesh(new CylinderGeometry(r * 1.12, r * 1.12, 0.008, 10), cane);
        if (lw > lh) n.rotation.z = Math.PI / 2;
        n.position.set(x + (lw > lh ? t * len : 0), y + (lw > lh ? 0 : t * len), z);
        g.add(n);
      }
    }
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        const m = new Mesh(new CylinderGeometry(r * 1.35, r * 1.35, fw * 1.2, 8), lash);
        m.rotation.x = Math.PI / 2;
        m.position.set(sx * (w / 2 + fw / 2), sy * (h / 2 + fw / 2), z);
        g.add(m);
      }
    return g;
  }
  const back = (m: Material): void => {
    const b = new Mesh(new BoxGeometry(w + fw, h + fw, 0.01), m);
    b.position.z = -fd + 0.012;
    g.add(b);
  };
  if (renderer) {
    // indoors: the shops' own wood, gilt and brass
    const b = new Batch();
    const mat = f.kind === 'wood' ? M.wood(renderer, f.wood ?? 'walnut', 0.4) : f.kind === 'metal' ? M.metal(renderer, f.colour ?? '#c89a48', 0.3) : M.satin(renderer, f.colour ?? '#e8e4dc');
    for (const [x, y, lw, lh] of rails) b.at(mat, rounded(lw, lh, fd, Math.min(fw, fd) * 0.3), x, y, z);
    if (f.corners) for (const sx of [-1, 1]) for (const sy of [-1, 1]) b.at(M.metal(renderer, f.corners, 0.6), rounded(fw * 1.2, fw * 1.2, 0.008, 0.004), sx * (w / 2 + fw / 2), sy * (h / 2 + fw / 2), z + fd / 2 + 0.002);
    b.at(M.wood(renderer, 'walnut', 0.6), rounded(w + fw, h + fw, 0.01, 0.003), 0, 0, -fd + 0.012);
    g.add(b.group());
    return g;
  }
  // outdoors: lit, dimming at dusk with everything else
  const hex = f.kind === 'wood' ? WOOD_HEX[f.wood ?? 'walnut'] : f.colour ?? '#8a7a62';
  const m = new MeshLambertMaterial({ color: hex });
  for (const [x, y, lw, lh] of rails) {
    const r = new Mesh(new BoxGeometry(lw, lh, fd), m);
    r.position.set(x, y, z);
    g.add(r);
  }
  if (f.corners) {
    const cm = new MeshLambertMaterial({ color: f.corners });
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        const cap = new Mesh(new BoxGeometry(fw * 1.2, fw * 1.2, 0.008), cm);
        cap.position.set(sx * (w / 2 + fw / 2), sy * (h / 2 + fw / 2), z + fd / 2 + 0.002);
        g.add(cap);
      }
  }
  back(m);
  return g;
}

