/**
 * The slot symbols, drawn in canvas in one style: a thick dark outline, a gradient fill, a
 * glossy highlight. Each one sits in a 100 × 100 box centred on the origin (y down) and is
 * scaled to whatever size it's drawn at. Symmetric things (the shell, the anchor) are built
 * from mirrored halves so they can't come out lopsided.
 */

import type { Symbol } from './slots.ts';

const TAU = Math.PI * 2;
const OUTLINE = '#2a1410';

/** Stroke a path fat and dark, then again thinner in `fill` — a cartoon outline on a line. */
function outlinedStroke(g: CanvasRenderingContext2D, path: () => void, width: number, fill: string | CanvasGradient, outline = 6): void {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  path();
  g.strokeStyle = OUTLINE;
  g.lineWidth = width + outline * 2;
  g.stroke();
  path();
  g.strokeStyle = fill;
  g.lineWidth = width;
  g.stroke();
}

/** Fill a closed path with a dark outline round it. */
function outlinedFill(g: CanvasRenderingContext2D, path: () => void, fill: string | CanvasGradient, outline = 5): void {
  g.lineJoin = 'round';
  path();
  g.strokeStyle = OUTLINE;
  g.lineWidth = outline * 2;
  g.stroke();
  path();
  g.fillStyle = fill;
  g.fill();
}

function glint(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.save();
  g.translate(x, y);
  g.fillStyle = 'rgba(255, 255, 255, 0.95)';
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const rr = i % 2 ? r * 0.28 : r;
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
  g.restore();
}

function worm(g: CanvasRenderingContext2D): void {
  const path = (): void => {
    g.beginPath();
    g.moveTo(-38, 22);
    g.bezierCurveTo(-44, -6, -14, -10, -8, 6);
    g.bezierCurveTo(-2, 24, 26, 22, 26, -2);
    g.bezierCurveTo(26, -18, 34, -26, 40, -28);
  };
  const grad = g.createLinearGradient(0, -30, 0, 30);
  grad.addColorStop(0, '#ffb3c0');
  grad.addColorStop(1, '#d94a66');
  outlinedStroke(g, path, 20, grad);
  // the band (clitellum) and segment creases
  g.save();
  path();
  g.strokeStyle = 'rgba(160, 40, 70, 0.5)';
  g.lineWidth = 20;
  g.setLineDash([2.5, 7]);
  g.stroke();
  g.restore();
  // highlight along the top
  g.save();
  g.translate(-2, -5);
  path();
  g.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  g.lineWidth = 4;
  g.setLineDash([14, 10]);
  g.stroke();
  g.restore();
  // a face
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(38, -30, 5.5, 0, TAU);
  g.fill();
  g.fillStyle = OUTLINE;
  g.beginPath();
  g.arc(39.5, -30, 2.8, 0, TAU);
  g.fill();
}

function shell(g: CanvasRenderingContext2D): void {
  // a scallop: a fan from the hinge at (0, 30), seven ribs, a scalloped rim — mirrored exactly
  const O = { x: 0, y: 30 };
  const R = 56;
  const N = 7;
  const spread = (140 / 180) * Math.PI;
  const angle = (i: number): number => -Math.PI / 2 + (i / N - 0.5) * spread; // boundaries, 0..N
  const at = (a: number, r: number): [number, number] => [O.x + Math.cos(a) * r, O.y + Math.sin(a) * r];
  const fan = (): void => {
    g.beginPath();
    g.moveTo(O.x, O.y);
    g.lineTo(...at(angle(0), R));
    for (let i = 0; i < N; i++) {
      const mid = (angle(i) + angle(i + 1)) / 2;
      g.quadraticCurveTo(...at(mid, R + 13), ...at(angle(i + 1), R));
    }
    g.closePath();
  };
  const grad = g.createRadialGradient(O.x, O.y, 6, O.x, O.y, R + 12);
  grad.addColorStop(0, '#fff0d8');
  grad.addColorStop(0.55, '#ffb07a');
  grad.addColorStop(1, '#ea6a44');
  outlinedFill(g, fan, grad);
  // ribs: a darker groove and a light ridge beside it
  for (let i = 1; i < N; i++) {
    const a = angle(i);
    g.strokeStyle = 'rgba(150, 50, 20, 0.55)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(...at(a, 10));
    g.lineTo(...at(a, R + 1));
    g.stroke();
  }
  for (let i = 0; i < N; i++) {
    const mid = (angle(i) + angle(i + 1)) / 2;
    g.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(...at(mid, 14));
    g.lineTo(...at(mid, R + 4));
    g.stroke();
  }
  // the hinge's two ears, mirrored
  const ear = (s: number): void => {
    g.beginPath();
    g.moveTo(0, 26);
    g.lineTo(s * 22, 28);
    g.lineTo(s * 18, 42);
    g.lineTo(0, 42);
    g.closePath();
  };
  for (const s of [-1, 1]) outlinedFill(g, () => ear(s), '#e0764a', 4);
}

function hook(g: CanvasRenderingContext2D): void {
  const metal = g.createLinearGradient(-30, -40, 30, 40);
  metal.addColorStop(0, '#ffffff');
  metal.addColorStop(0.45, '#aab8c8');
  metal.addColorStop(1, '#5a6878');
  const shank = (): void => {
    g.beginPath();
    g.moveTo(10, -30);
    g.lineTo(10, 14);
    g.arc(-8, 14, 18, 0, Math.PI, false);
    g.lineTo(-26, -2);
  };
  outlinedStroke(g, shank, 9, metal);
  // the barb, pointing back down the point
  outlinedFill(
    g,
    () => {
      g.beginPath();
      g.moveTo(-26, -12);
      g.lineTo(-17, 4);
      g.lineTo(-30, 0);
      g.closePath();
    },
    metal,
    4,
  );
  // the eye
  g.beginPath();
  g.arc(10, -38, 8, 0, TAU);
  g.strokeStyle = OUTLINE;
  g.lineWidth = 12;
  g.stroke();
  g.strokeStyle = '#c8d4e0';
  g.lineWidth = 5;
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.8)';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(12, -24);
  g.lineTo(12, 10);
  g.stroke();
}

function anchor(g: CanvasRenderingContext2D): void {
  const gold = g.createLinearGradient(0, -44, 0, 44);
  gold.addColorStop(0, '#fff2a8');
  gold.addColorStop(0.5, '#f0b030');
  gold.addColorStop(1, '#b86a10');
  const body = (): void => {
    g.beginPath();
    g.moveTo(0, -24); // shank
    g.lineTo(0, 38);
    g.moveTo(-18, -14); // stock
    g.lineTo(18, -14);
    g.moveTo(-34, 12); // arms, mirrored
    g.quadraticCurveTo(-30, 38, 0, 40);
    g.quadraticCurveTo(30, 38, 34, 12);
  };
  outlinedStroke(g, body, 9, gold);
  for (const s of [-1, 1])
    outlinedFill(
      g,
      () => {
        g.beginPath();
        g.moveTo(s * 34, 2);
        g.lineTo(s * 43, 18);
        g.lineTo(s * 25, 16);
        g.closePath();
      },
      gold,
      4,
    );
  // ring
  g.beginPath();
  g.arc(0, -33, 9, 0, TAU);
  g.strokeStyle = OUTLINE;
  g.lineWidth = 15;
  g.stroke();
  g.strokeStyle = gold;
  g.lineWidth = 7;
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(-2, -18);
  g.lineTo(-2, 30);
  g.stroke();
}

function marlin(g: CanvasRenderingContext2D): void {
  const body = (): void => {
    g.beginPath();
    g.moveTo(-50, 2); // bill tip
    g.lineTo(-24, -2);
    g.quadraticCurveTo(-4, -16, 22, -6);
    g.lineTo(36, -22); // tail, upper lobe
    g.quadraticCurveTo(32, -2, 34, 0);
    g.quadraticCurveTo(32, 2, 36, 22); // lower lobe
    g.lineTo(22, 6);
    g.quadraticCurveTo(-4, 16, -24, 5);
    g.closePath();
  };
  const sail = (): void => {
    g.beginPath();
    g.moveTo(-18, -8);
    g.quadraticCurveTo(-8, -46, 16, -40);
    g.quadraticCurveTo(12, -22, 16, -9);
    g.closePath();
  };
  const sailGrad = g.createLinearGradient(0, -44, 0, -8);
  sailGrad.addColorStop(0, '#5ab0ff');
  sailGrad.addColorStop(1, '#1a4a9a');
  outlinedFill(g, sail, sailGrad, 4);
  g.strokeStyle = 'rgba(10, 30, 80, 0.6)';
  g.lineWidth = 2;
  for (let k = 0; k < 5; k++) {
    g.beginPath();
    g.moveTo(-12 + k * 6, -10);
    g.lineTo(-8 + k * 5.5, -36 + k * 2);
    g.stroke();
  }
  const grad = g.createLinearGradient(0, -14, 0, 14);
  grad.addColorStop(0, '#1e5ab8');
  grad.addColorStop(0.5, '#3a8ae0');
  grad.addColorStop(0.62, '#d8ecfa');
  grad.addColorStop(1, '#a8c8e0');
  outlinedFill(g, body, grad, 4);
  // stripes and an eye
  g.strokeStyle = 'rgba(160, 220, 255, 0.7)';
  g.lineWidth = 2;
  for (let k = 0; k < 4; k++) {
    g.beginPath();
    g.moveTo(-8 + k * 7, -9);
    g.lineTo(-10 + k * 7, 2);
    g.stroke();
  }
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(-17, -2, 4, 0, TAU);
  g.fill();
  g.fillStyle = OUTLINE;
  g.beginPath();
  g.arc(-17.5, -2, 2, 0, TAU);
  g.fill();
  glint(g, 8, -9, 6);
}

function chest(g: CanvasRenderingContext2D): void {
  // a glow behind it: it's the jackpot
  const glow = g.createRadialGradient(0, -6, 4, 0, -6, 52);
  glow.addColorStop(0, 'rgba(255, 230, 120, 0.9)');
  glow.addColorStop(1, 'rgba(255, 200, 60, 0)');
  g.fillStyle = glow;
  g.fillRect(-52, -58, 104, 104);
  const wood = g.createLinearGradient(0, -30, 0, 38);
  wood.addColorStop(0, '#a8682e');
  wood.addColorStop(1, '#5a3014');
  const gold = g.createLinearGradient(0, -34, 0, 38);
  gold.addColorStop(0, '#fff2a8');
  gold.addColorStop(1, '#d08a18');
  // coins heaped over the lip
  for (const [x, y, r] of [
    [-20, -14, 9],
    [-4, -19, 10],
    [13, -15, 9],
    [26, -9, 7],
    [-30, -8, 7],
  ] as const)
    outlinedFill(g, () => (g.beginPath(), g.arc(x, y, r, 0, TAU)), gold, 3);
  const base = (): void => {
    g.beginPath();
    g.roundRect(-38, -6, 76, 42, 5);
  };
  outlinedFill(g, base, wood, 4);
  // the lid, tipped back
  const lid = (): void => {
    g.beginPath();
    g.moveTo(-40, -12);
    g.quadraticCurveTo(0, -44, 40, -12);
    g.lineTo(36, -24);
    g.quadraticCurveTo(0, -54, -36, -24);
    g.closePath();
  };
  outlinedFill(g, lid, wood, 4);
  g.fillStyle = gold;
  g.fillRect(-38, -6, 76, 7);
  g.fillRect(-27, -6, 7, 42);
  g.fillRect(20, -6, 7, 42);
  outlinedFill(g, () => (g.beginPath(), g.roundRect(-8, 2, 16, 18, 3)), gold, 3);
  g.fillStyle = OUTLINE;
  g.beginPath();
  g.arc(0, 9, 2.5, 0, TAU);
  g.fillRect(-1.2, 9, 2.4, 6);
  g.fill();
  glint(g, -4, -24, 9);
  glint(g, 22, -18, 5);
}

const ART: Record<Symbol, (g: CanvasRenderingContext2D) => void> = { worm, shell, hook, anchor, marlin, chest };

/** Draw a symbol centred on the origin, about `s` px across (upright: y down). */
export function drawSymbol(g: CanvasRenderingContext2D, sym: Symbol, s: number): void {
  g.save();
  g.scale(s / 100, s / 100);
  ART[sym](g);
  g.restore();
}
