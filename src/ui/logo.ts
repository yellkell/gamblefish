/**
 * The FISH & CHIPS mark, painted on a canvas so the 2-D splash and the headset's intro card
 * are the same picture: FISH in sea-glass, CHIPS in gold, and between them a casino chip with
 * the ampersand on it. A fish leaps over the chip, trailing a spray of drops, above a line of
 * surf. A small tagline runs beneath.
 *
 * Drawn to fit any w × h at a 2 : 1 aspect (the art is laid out on 1280 × 640 and scaled).
 * The glow is left to whoever shows it (a CSS pool behind the canvas, live planes in VR),
 * so the canvas carries only the lettering and art, on transparent.
 */

import { font } from './fonts.ts';

const TAU = Math.PI * 2;
export const SEA = '#3fd6c6';
export const GOLD = '#ffc93a';
const CHIP_RED = '#c8243a';

export function drawLogo(g: CanvasRenderingContext2D, w: number, h: number, tagline = true): void {
  g.save();
  const k = Math.min(w / 1280, h / 640);
  g.translate(w / 2, h / 2);
  g.scale(k, k);
  g.translate(0, -18);
  g.lineJoin = 'round';

  // lay the row out from its measured widths so it's centred whatever the face
  g.font = font(700, SIZE);
  const wf = g.measureText('FISH').width;
  const wc = g.measureText('CHIPS').width;
  const R = 112;
  const GAP = 30;
  const x0 = -(wf + wc + 2 * R + 2 * GAP) / 2;
  const cx = x0 + wf + GAP + R;
  surf(g);
  word(g, 'FISH', x0, ['#e9fffb', '#7ff0e2', '#1fa99c'], 'rgba(63, 214, 198, 0.8)');
  word(g, 'CHIPS', cx + R + GAP, ['#fff8c8', '#ffc93a', '#e0700f'], 'rgba(255, 176, 0, 0.8)');
  chip(g, cx, 18, R);
  leaper(g, cx);

  if (tagline) {
    g.font = font(600, 34);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(234, 244, 248, 0.78)';
    spaced(g, 'CATCH FISH  ·  CASH IN CHIPS', 0, 236, 7);
  }
  g.restore();
}

const SIZE = 180;

/** Big lettering from x, with a dark keyline and a coloured glow. */
function word(g: CanvasRenderingContext2D, text: string, x: number, stops: string[], glow: string): void {
  g.font = font(700, SIZE);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  const y = 26;
  const grad = g.createLinearGradient(0, y - 72, 0, y + 72);
  stops.forEach((c, i) => grad.addColorStop(i / (stops.length - 1), c));
  g.lineWidth = 22;
  g.strokeStyle = '#061820';
  g.strokeText(text, x, y);
  g.shadowColor = glow;
  g.shadowBlur = 34;
  g.fillStyle = grad;
  g.fillText(text, x, y);
  g.shadowBlur = 0;
}

/** A clay casino chip, face on: red with white edge spots, a dashed inner ring, the "&". */
function chip(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.save();
  g.translate(x, y);
  // its edge, seen a little from below: a darker rim offset down
  g.fillStyle = '#5e0b18';
  g.beginPath();
  g.arc(0, 10, r, 0, TAU);
  g.fill();
  g.shadowColor = 'rgba(255, 70, 90, 0.7)';
  g.shadowBlur = 28;
  g.fillStyle = CHIP_RED;
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fill();
  g.shadowBlur = 0;
  // the edge spots
  g.fillStyle = '#fbf4e4';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + TAU / 16;
    g.beginPath();
    g.arc(0, 0, r - 2, a - 0.13, a + 0.13);
    g.arc(0, 0, r - 26, a + 0.15, a - 0.15, true);
    g.closePath();
    g.fill();
  }
  // the inlay
  g.strokeStyle = 'rgba(251, 244, 228, 0.9)';
  g.lineWidth = 5;
  g.setLineDash([14, 10]);
  g.beginPath();
  g.arc(0, 0, r - 38, 0, TAU);
  g.stroke();
  g.setLineDash([]);
  const face = g.createRadialGradient(-20, -24, 6, 0, 0, r - 44);
  face.addColorStop(0, '#fffaf0');
  face.addColorStop(1, '#eadfc6');
  g.fillStyle = face;
  g.beginPath();
  g.arc(0, 0, r - 46, 0, TAU);
  g.fill();
  g.font = font(700, 128);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = CHIP_RED;
  g.fillText('&', 0, 8);
  // a sheen across the top
  const sheen = g.createLinearGradient(0, -r, 0, 0);
  sheen.addColorStop(0, 'rgba(255,255,255,0.28)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sheen;
  g.beginPath();
  g.arc(0, 0, r, Math.PI, TAU);
  g.fill();
  g.restore();
}

/** A fish leaping over the chip, arcing left to right, with a spray of drops behind it. */
function leaper(g: CanvasRenderingContext2D, cx: number): void {
  g.save();
  g.translate(cx, 0);
  // the drops along the arc it came up on
  g.fillStyle = 'rgba(200, 250, 245, 0.85)';
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.98 - i * 0.045);
    const rr = 190 + ((i * 37) % 23);
    g.beginPath();
    g.arc(Math.cos(a) * rr - 20, -Math.sin(a) * rr * 0.72 - 40, 5 + (i % 3) * 2.5, 0, TAU);
    g.fill();
  }
  g.save();
  g.translate(58, -196);
  g.rotate(0.3);
  const L = 150; // nose to tail fork
  const body = g.createLinearGradient(0, -34, 0, 34);
  body.addColorStop(0, '#0f6d78');
  body.addColorStop(0.45, '#3fd6c6');
  body.addColorStop(0.62, '#d9fff9');
  body.addColorStop(1, '#ffffff');
  g.lineWidth = 9;
  g.strokeStyle = '#061820';
  const outline = (): void => {
    g.beginPath();
    g.moveTo(L * 0.55, 0); // nose
    g.bezierCurveTo(L * 0.42, -38, L * 0.02, -40, -L * 0.3, -14);
    g.lineTo(-L * 0.46, -4);
    // the forked tail
    g.lineTo(-L * 0.66, -40);
    g.quadraticCurveTo(-L * 0.58, 0, -L * 0.66, 40);
    g.lineTo(-L * 0.46, 4);
    g.lineTo(-L * 0.3, 14);
    g.bezierCurveTo(L * 0.02, 36, L * 0.42, 32, L * 0.55, 0);
    g.closePath();
  };
  // dorsal fin
  g.beginPath();
  g.moveTo(L * 0.1, -34);
  g.quadraticCurveTo(-L * 0.02, -74, -L * 0.2, -62);
  g.lineTo(-L * 0.16, -24);
  g.closePath();
  g.fillStyle = '#1fa99c';
  g.stroke();
  g.fill();
  outline();
  g.stroke();
  g.shadowColor = 'rgba(63, 214, 198, 0.7)';
  g.shadowBlur = 24;
  g.fillStyle = body;
  g.fill();
  g.shadowBlur = 0;
  // gill line, pectoral fin, eye
  g.strokeStyle = 'rgba(6, 24, 32, 0.55)';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(L * 0.3, 0, 26, -1.0, 1.0);
  g.stroke();
  g.fillStyle = '#1fa99c';
  g.beginPath();
  g.moveTo(L * 0.2, 12);
  g.quadraticCurveTo(L * 0.05, 34, -L * 0.04, 30);
  g.quadraticCurveTo(L * 0.06, 18, L * 0.2, 12);
  g.fill();
  g.fillStyle = '#061820';
  g.beginPath();
  g.arc(L * 0.42, -7, 7.5, 0, TAU);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(L * 0.435, -9, 2.6, 0, TAU);
  g.fill();
  g.restore();
  g.restore();
}

/** The line of surf the words sit on: two soft waves, a scatter of bubbles. */
function surf(g: CanvasRenderingContext2D): void {
  const wave = (y: number, amp: number, colour: string, width: number, phase: number): void => {
    g.strokeStyle = colour;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.beginPath();
    for (let x = -560; x <= 560; x += 8) {
      const edge = Math.min(1, (560 - Math.abs(x)) / 160);
      const yy = y + Math.sin(x * 0.028 + phase) * amp * edge;
      if (x === -560) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    g.stroke();
  };
  wave(148, 9, 'rgba(63, 214, 198, 0.55)', 7, 0);
  wave(170, 6, 'rgba(63, 214, 198, 0.28)', 5, 1.9);
  g.fillStyle = 'rgba(160, 240, 230, 0.5)';
  for (const [x, y, r] of [
    [-470, 120, 6],
    [-430, 104, 4],
    [455, 118, 5],
    [492, 100, 3.5],
    [-300, 196, 4],
    [320, 192, 4.5],
  ] as const) {
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
}

/** Letter-spaced text, centred on x (canvas letterSpacing isn't everywhere yet). */
function spaced(g: CanvasRenderingContext2D, text: string, x: number, y: number, gap: number): void {
  const widths = [...text].map((c) => g.measureText(c).width + gap);
  const total = widths.reduce((a, b) => a + b, 0) - gap;
  let cx = x - total / 2;
  g.textAlign = 'left';
  [...text].forEach((c, i) => {
    g.fillText(c, cx, y);
    cx += widths[i];
  });
}
