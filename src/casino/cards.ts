/**
 * Playing cards: one canvas atlas with the 52 faces and a back, and card meshes that pick their
 * face out of it. Cards are drawn a little oversized (1.4× a real poker card) so the corner
 * indices read at arm's length in a headset.
 */

import { BufferAttribute, CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { font } from '../ui/fonts.ts';
import { roundRect } from '../ui/panel.ts';
import { RANKS, type Card } from './blackjack.ts';

export const CARD_W = 0.063 * 1.4;
export const CARD_H = 0.088 * 1.4;
const CW = 200;
const CH = 280;
const COLS = 13;
const ROWS = 5; // four suits, then the back

let atlas: CanvasTexture | null = null;
let faceMat: MeshBasicMaterial | null = null;

function suitPath(g: CanvasRenderingContext2D, suit: number, x: number, y: number, s: number): void {
  g.save();
  g.translate(x, y);
  g.scale(s / 100, s / 100);
  g.beginPath();
  switch (suit) {
    case 0: // spade
      g.moveTo(0, -48);
      g.bezierCurveTo(30, -18, 50, -2, 44, 18);
      g.bezierCurveTo(38, 36, 14, 36, 6, 22);
      g.lineTo(14, 48);
      g.lineTo(-14, 48);
      g.lineTo(-6, 22);
      g.bezierCurveTo(-14, 36, -38, 36, -44, 18);
      g.bezierCurveTo(-50, -2, -30, -18, 0, -48);
      break;
    case 1: // heart
      g.moveTo(0, 44);
      g.bezierCurveTo(-30, 18, -50, 0, -48, -20);
      g.bezierCurveTo(-46, -44, -12, -48, 0, -24);
      g.bezierCurveTo(12, -48, 46, -44, 48, -20);
      g.bezierCurveTo(50, 0, 30, 18, 0, 44);
      break;
    case 2: // diamond
      g.moveTo(0, -48);
      g.quadraticCurveTo(18, -18, 36, 0);
      g.quadraticCurveTo(18, 18, 0, 48);
      g.quadraticCurveTo(-18, 18, -36, 0);
      g.quadraticCurveTo(-18, -18, 0, -48);
      break;
    case 3: // club
      g.arc(0, -24, 22, 0, Math.PI * 2);
      g.moveTo(24 + 22, 8);
      g.arc(24, 8, 22, 0, Math.PI * 2);
      g.moveTo(-24 + 22, 8);
      g.arc(-24, 8, 22, 0, Math.PI * 2);
      g.moveTo(8, 10);
      g.lineTo(16, 48);
      g.lineTo(-16, 48);
      g.lineTo(-8, 10);
      break;
  }
  g.closePath();
  g.fill();
  g.restore();
}

/** Where the pips go on a number card (in a 100 × 160 box centred on the card). */
const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[0, -60], [0, 60]],
  3: [[0, -60], [0, 0], [0, 60]],
  4: [[-30, -60], [30, -60], [-30, 60], [30, 60]],
  5: [[-30, -60], [30, -60], [0, 0], [-30, 60], [30, 60]],
  6: [[-30, -60], [30, -60], [-30, 0], [30, 0], [-30, 60], [30, 60]],
  7: [[-30, -60], [30, -60], [0, -30], [-30, 0], [30, 0], [-30, 60], [30, 60]],
  8: [[-30, -60], [30, -60], [0, -30], [-30, 0], [30, 0], [0, 30], [-30, 60], [30, 60]],
  9: [[-30, -60], [30, -60], [-30, -20], [30, -20], [0, 0], [-30, 20], [30, 20], [-30, 60], [30, 60]],
  10: [[-30, -60], [30, -60], [0, -40], [-30, -20], [30, -20], [-30, 20], [30, 20], [0, 40], [-30, 60], [30, 60]],
};

function drawFace(g: CanvasRenderingContext2D, rank: number, suit: number): void {
  const red = suit === 1 || suit === 2;
  const ink = red ? '#c8202c' : '#16161c';
  g.fillStyle = '#fbf8f0';
  roundRect(g, 3, 3, CW - 6, CH - 6, 16);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = ink;
  // corner indices, big (they're what you read at the table)
  const corner = (): void => {
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.font = font(700, RANKS[rank - 1] === '10' ? 46 : 54);
    g.fillText(RANKS[rank - 1], 34, 58);
    suitPath(g, suit, 34, 84, 34);
  };
  corner();
  g.save();
  g.translate(CW, CH);
  g.rotate(Math.PI);
  corner();
  g.restore();
  const cx = CW / 2;
  const cy = CH / 2;
  if (rank <= 10) {
    const pips = PIPS[rank];
    const size = rank === 1 ? 90 : 34;
    for (const [x, y] of pips) {
      g.save();
      g.translate(cx + x * 0.9, cy + y * 0.95);
      if (y > 0 && rank !== 1) g.rotate(Math.PI);
      suitPath(g, suit, 0, 0, size);
      g.restore();
    }
  } else {
    // court cards: a framed panel with the letter and the suit, in the suit's colour
    g.strokeStyle = ink;
    g.lineWidth = 4;
    roundRect(g, 52, 52, CW - 104, CH - 104, 10);
    g.stroke();
    g.fillStyle = red ? 'rgba(200, 32, 44, 0.1)' : 'rgba(22, 22, 28, 0.08)';
    g.fill();
    g.fillStyle = ink;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = font(700, 86);
    g.fillText(RANKS[rank - 1], cx, cy - 18);
    suitPath(g, suit, cx, cy + 46, 36);
    g.fillStyle = '#d8a830';
    g.fillRect(62, 62, CW - 124, 6);
    g.fillRect(62, CH - 68, CW - 124, 6);
  }
}

function drawBack(g: CanvasRenderingContext2D): void {
  g.fillStyle = '#fbf8f0';
  roundRect(g, 3, 3, CW - 6, CH - 6, 16);
  g.fill();
  g.fillStyle = '#1f5a8a';
  roundRect(g, 14, 14, CW - 28, CH - 28, 10);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 2;
  for (let i = -CH; i < CW + CH; i += 14) {
    g.beginPath();
    g.moveTo(i, 14);
    g.lineTo(i + CH, CH - 14);
    g.moveTo(i + CH, 14);
    g.lineTo(i, CH - 14);
    g.stroke();
  }
  g.fillStyle = '#1f5a8a';
  g.beginPath();
  g.ellipse(CW / 2, CH / 2, 48, 30, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffd24a';
  g.font = font(700, 24);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('CARD SHARK', CW / 2, CH / 2 + 2);
}

function getAtlas(): CanvasTexture {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = CW * COLS;
  c.height = CH * ROWS;
  const g = c.getContext('2d')!;
  for (let s = 0; s < 4; s++)
    for (let r = 1; r <= 13; r++) {
      g.save();
      g.translate((r - 1) * CW, s * CH);
      drawFace(g, r, s);
      g.restore();
    }
  g.save();
  g.translate(0, 4 * CH);
  drawBack(g);
  g.restore();
  atlas = new CanvasTexture(c);
  atlas.colorSpace = SRGBColorSpace;
  atlas.anisotropy = 8;
  return atlas;
}

/** A plane that shows atlas cell (col, row), lying flat, facing up (+y) or down. */
function cellPlane(col: number, row: number, up: boolean): PlaneGeometry {
  const geo = new PlaneGeometry(CARD_W, CARD_H);
  const uv = geo.getAttribute('uv') as BufferAttribute;
  const u0 = col / COLS;
  const u1 = (col + 1) / COLS;
  const v1 = 1 - row / ROWS;
  const v0 = 1 - (row + 1) / ROWS;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
  // lie flat: the card's top edge points away from the player (−z)
  geo.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
  if (!up) geo.rotateY(Math.PI);
  return geo;
}

/**
 * A card: face on top, back underneath. Turning it over is a rotation about its long axis
 * (`flip` from 0, face up, to 1, face down).
 */
export class CardMesh {
  readonly group = new Group();
  private readonly inner = new Group();

  constructor(readonly card: Card) {
    faceMat ??= new MeshBasicMaterial({ map: getAtlas(), alphaTest: 0.5 });
    const face = new Mesh(cellPlane(card.rank - 1, card.suit, true), faceMat);
    const back = new Mesh(cellPlane(0, 4, false), faceMat);
    back.position.y = -0.0004;
    this.inner.add(face, back);
    this.group.add(this.inner);
  }

  set flip(k: number) {
    this.inner.rotation.z = k * Math.PI;
  }
}
