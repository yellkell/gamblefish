/**
 * The FISH & CHIPS mark, painted on a canvas so the 2-D splash and the headset's intro card
 * are the same picture: FISH in sea-glass, CHIPS in gold, and between them a casino chip with
 * the ampersand on it. A fish leaps over the chip, trailing a spray of drops, above a line of
 * surf. A small tagline runs beneath.
 *
 * The leaping fish is the game's own mahi-mahi, skin and all, photographed once its model has
 * loaded (setLogoFish); until then the mark is drawn without it, and the page fades it in.
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

let photo: CanvasImageSource | null = null;

/** The photographed fish for the mark (a transparent picture of the model, snout to the right). */
export function setLogoFish(img: CanvasImageSource): void {
  photo = img;
}

export function hasLogoFish(): boolean {
  return photo !== null;
}

/** Into the mark's own frame (1280 × 640, centred), and where the chip sits in it. */
function frame(g: CanvasRenderingContext2D, w: number, h: number): number {
  const k = Math.min(w / 1280, h / 640);
  g.translate(w / 2, h / 2);
  g.scale(k, k);
  g.translate(0, -18);
  g.lineJoin = 'round';
  // the row laid out from its measured widths so it's centred whatever the face
  g.font = font(700, SIZE);
  const wf = g.measureText('FISH').width;
  const wc = g.measureText('CHIPS').width;
  return -(wf + wc + 2 * R + 2 * GAP) / 2 + wf + GAP + R;
}

const R = 112;
const GAP = 30;

/**
 * The mark. `fish`: draw the leaping fish too (the photograph, once there is one); leave it out
 * to lay the fish over the mark separately (the page fades it in).
 */
export function drawLogo(g: CanvasRenderingContext2D, w: number, h: number, tagline = true, fish = true): void {
  g.save();
  const cx = frame(g, w, h);
  g.font = font(700, SIZE);
  const x0 = cx - R - GAP - g.measureText('FISH').width;
  surf(g);
  word(g, 'FISH', x0, ['#e9fffb', '#7ff0e2', '#1fa99c'], 'rgba(63, 214, 198, 0.8)');
  word(g, 'CHIPS', cx + R + GAP, ['#fff8c8', '#ffc93a', '#e0700f'], 'rgba(255, 176, 0, 0.8)');
  chip(g, cx, 18, R);
  spray(g, cx);
  if (fish && photo) leaper(g, cx);

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

/** Just the leaping fish, in the mark's frame, on its own canvas (the page fades it in). */
export function drawLogoFish(g: CanvasRenderingContext2D, w: number, h: number): void {
  if (!photo) return;
  g.save();
  const cx = frame(g, w, h);
  leaper(g, cx);
  g.restore();
}

/** The drops along the arc the fish came up on, left of the chip. */
function spray(g: CanvasRenderingContext2D, cx: number): void {
  g.save();
  g.translate(cx, 0);
  g.fillStyle = 'rgba(200, 250, 245, 0.85)';
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.98 - i * 0.045);
    const rr = 190 + ((i * 37) % 23);
    g.beginPath();
    g.arc(Math.cos(a) * rr - 20, -Math.sin(a) * rr * 0.72 - 40, 5 + (i % 3) * 2.5, 0, TAU);
    g.fill();
  }
  g.restore();
}

/** The photographed fish, leaping over the chip, arcing down to the right, in a sea-glass glow. */
function leaper(g: CanvasRenderingContext2D, cx: number): void {
  if (!photo) return;
  const img = photo as HTMLCanvasElement;
  const w = 440;
  const h = (w * img.height) / img.width;
  g.save();
  g.translate(cx + 56, -200);
  g.rotate(0.24);
  g.shadowColor = 'rgba(63, 214, 198, 0.8)';
  g.shadowBlur = 34;
  g.drawImage(img, -w / 2, -h / 2, w, h);
  g.shadowBlur = 0;
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
