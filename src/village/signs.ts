/**
 * Signs on the village's businesses (village/roles.ts), in the island's own hand. Each says
 * what the place is and what's inside, with a picture of its trade, in a style that suits it:
 *
 *   shops    planks painted in the trade's colour, the name in cream, the emblem at the left: a
 *            rod for the tackle shop, a baited hook, a stack of coins, a saw and hammer, the
 *            pawnbroker's three balls, a mounted fish
 *   market   the fish market's board is cut in the shape of a fish
 *   fine     the jeweller's, the boutique's and the florist's: lacquer, gilt border, gilt letters
 *   mystic   the fortune teller's: midnight purple, stars, a moon, a crystal ball
 *   casinos  "island shack casino": dark timber, neon letters with a halo, a neon emblem either
 *            side (a wheel, cherries, a spade), a bulb border, and marquee bulbs along the front
 *            eaves chasing round
 *
 * Your shack, Coral's villa and the boatyard have no sign: everyone knows whose they are.
 *
 * All the signs share one painted atlas: two draw calls for every sign in the village (lit
 * boards, and self-lit neon), one for the bulbs.
 */

import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { font, onFontsReady } from '../ui/fonts.ts';
import { ROLES, type BuildingRole } from './roles.ts';

export interface BuildingFrame {
  name: string;
  kind: string;
  x: number;
  z: number;
  yaw: number;
  w: number;
  d: number;
  stories: number;
  doorX: number;
  porch: number;
  floorY: number;
  roofTop: number;
  /** houses only (tools/bake-world.mjs roofLines): the top of the walls */
  eaves?: number;
  /** the main roof's lowest edge over the front wall: y = eave − |x| · pitch, out at local z */
  roof?: { eave: number; pitch: number; z: number };
  /** the porch roof's front edge (or a stoop door's hood): top, underside, local z, centre x, width */
  awning?: { y: number; bottom: number; z: number; x: number; w: number };
}

const ATLAS = 2048;
const SW = 512; // sign tile
const SH = 160;
const COLS = ATLAS / SW;
/** Tidewater's storey height (walls from the floor to the eaves). */
const STOREY = 2.75;

/** Tidewater Buildings.js frame: local x across the facade, +z out of the front. */
function toWorld(b: BuildingFrame, lx: number, ly: number, lz: number, out: Vector3): Vector3 {
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  return out.set(b.x + lx * c + lz * s, ly, b.z - lx * s + lz * c);
}

function plankBoard(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tint: string, seed: number): void {
  const planks = 4;
  for (let i = 0; i < planks; i++) {
    const py = y + (i * h) / planks;
    const k = 0.85 + ((Math.sin(seed * 12.9 + i * 78.2) * 43758.5) % 1) * 0.15;
    c.fillStyle = tint;
    c.fillRect(x, py, w, h / planks - 3);
    c.fillStyle = `rgba(0,0,0,${(0.25 - k * 0.15).toFixed(3)})`;
    c.fillRect(x, py, w, h / planks - 3);
    // grain
    c.strokeStyle = 'rgba(0,0,0,0.12)';
    c.lineWidth = 1;
    for (let g = 0; g < 5; g++) {
      c.beginPath();
      const gy = py + 4 + g * ((h / planks - 8) / 5);
      c.moveTo(x, gy);
      c.bezierCurveTo(x + w * 0.3, gy + 2, x + w * 0.7, gy - 2, x + w, gy + 1);
      c.stroke();
    }
  }
  // weathered edge
  c.strokeStyle = 'rgba(40,28,18,0.8)';
  c.lineWidth = 6;
  c.strokeRect(x + 3, y + 3, w - 6, h - 6);
}

/* ── the emblems: a picture of the trade, painted beside the name ────────── */

type Emblem = 'rod' | 'hook' | 'ring' | 'flower' | 'mirror' | 'coin' | 'saw' | 'balls' | 'mount' | 'ball' | 'wheel' | 'cherries' | 'spade';

/** Each emblem drawn in a box of side `s` centred on (x, y). */
const EMBLEMS: Record<Emblem, (c: CanvasRenderingContext2D, x: number, y: number, s: number, ink: string, hi: string) => void> = {
  // a rod bending under a fish's weight, the reel at its butt, the line down to a hook
  rod: (c, x, y, s, ink, hi) => {
    c.lineCap = 'round';
    c.strokeStyle = ink;
    c.lineWidth = s * 0.06;
    c.beginPath();
    c.moveTo(x - s * 0.4, y + s * 0.42);
    c.quadraticCurveTo(x - s * 0.05, y - s * 0.1, x + s * 0.38, y - s * 0.36);
    c.stroke();
    c.fillStyle = hi;
    c.beginPath();
    c.arc(x - s * 0.26, y + s * 0.26, s * 0.1, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = s * 0.02;
    c.beginPath();
    c.moveTo(x + s * 0.38, y - s * 0.36);
    c.lineTo(x + s * 0.34, y + s * 0.12);
    c.stroke();
    c.lineWidth = s * 0.04;
    c.beginPath();
    c.arc(x + s * 0.28, y + s * 0.18, s * 0.07, 0, Math.PI);
    c.stroke();
  },
  // a J hook with its eye and barb, and a little baitfish hooked through the lip
  hook: (c, x, y, s, ink, hi) => {
    c.lineCap = 'round';
    c.strokeStyle = ink;
    c.lineWidth = s * 0.02;
    c.beginPath();
    c.moveTo(x + s * 0.12, y - s * 0.5);
    c.lineTo(x + s * 0.12, y - s * 0.4);
    c.stroke();
    c.lineWidth = s * 0.07;
    c.beginPath();
    c.arc(x + s * 0.12, y - s * 0.34, s * 0.06, 0, Math.PI * 2);
    c.moveTo(x + s * 0.12, y - s * 0.28);
    c.lineTo(x + s * 0.12, y + s * 0.1);
    c.arc(x - s * 0.06, y + s * 0.1, s * 0.18, 0, Math.PI);
    c.lineTo(x - s * 0.24, y - s * 0.06);
    c.lineTo(x - s * 0.14, y + s * 0.02);
    c.stroke();
    // the pilchard, nose on the point, hanging down the shank
    fishShape(c, x - s * 0.26, y + s * 0.02, s * 0.46, Math.PI / 2 + 0.25, hi);
    c.fillStyle = ink;
    c.beginPath();
    c.arc(x - s * 0.24, y + s * 0.2, s * 0.025, 0, Math.PI * 2);
    c.fill();
  },
  // a gold band with a cut stone on it
  ring: (c, x, y, s, ink, hi) => {
    c.strokeStyle = ink;
    c.lineWidth = s * 0.09;
    c.beginPath();
    c.ellipse(x, y + s * 0.12, s * 0.28, s * 0.25, 0, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = hi;
    c.beginPath();
    c.moveTo(x - s * 0.18, y - s * 0.2);
    c.lineTo(x - s * 0.1, y - s * 0.34);
    c.lineTo(x + s * 0.1, y - s * 0.34);
    c.lineTo(x + s * 0.18, y - s * 0.2);
    c.lineTo(x, y - s * 0.02);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.lineWidth = s * 0.015;
    c.beginPath();
    c.moveTo(x - s * 0.18, y - s * 0.2);
    c.lineTo(x + s * 0.18, y - s * 0.2);
    c.moveTo(x - s * 0.06, y - s * 0.34);
    c.lineTo(x, y - s * 0.02);
    c.lineTo(x + s * 0.06, y - s * 0.34);
    c.stroke();
  },
  // a hibiscus over two leaves, in a terracotta pot
  flower: (c, x, y, s, ink, hi) => {
    c.fillStyle = '#b8643a';
    c.beginPath();
    c.moveTo(x - s * 0.22, y + s * 0.12);
    c.lineTo(x + s * 0.22, y + s * 0.12);
    c.lineTo(x + s * 0.16, y + s * 0.44);
    c.lineTo(x - s * 0.16, y + s * 0.44);
    c.closePath();
    c.fill();
    c.fillStyle = '#3f7a34';
    for (const sd of [-1, 1]) {
      c.beginPath();
      c.ellipse(x + sd * s * 0.17, y + s * 0.0, s * 0.16, s * 0.06, sd * 0.6, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = '#3f7a34';
    c.lineWidth = s * 0.04;
    c.beginPath();
    c.moveTo(x, y + s * 0.12);
    c.lineTo(x, y - s * 0.12);
    c.stroke();
    c.fillStyle = hi;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      c.beginPath();
      c.ellipse(x + Math.cos(a) * s * 0.13, y - s * 0.24 + Math.sin(a) * s * 0.13, s * 0.12, s * 0.08, a, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = ink;
    c.beginPath();
    c.arc(x, y - s * 0.24, s * 0.05, 0, Math.PI * 2);
    c.fill();
  },
  // a cheval mirror: an oval glass in a gilt frame, swung between two posts
  mirror: (c, x, y, s, ink, hi) => {
    c.strokeStyle = ink;
    c.lineWidth = s * 0.05;
    c.beginPath();
    c.moveTo(x - s * 0.28, y - s * 0.1);
    c.lineTo(x - s * 0.28, y + s * 0.44);
    c.moveTo(x + s * 0.28, y - s * 0.1);
    c.lineTo(x + s * 0.28, y + s * 0.44);
    c.moveTo(x - s * 0.36, y + s * 0.44);
    c.lineTo(x - s * 0.2, y + s * 0.44);
    c.moveTo(x + s * 0.2, y + s * 0.44);
    c.lineTo(x + s * 0.36, y + s * 0.44);
    c.stroke();
    c.fillStyle = hi;
    c.beginPath();
    c.ellipse(x, y - s * 0.02, s * 0.2, s * 0.36, 0, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = s * 0.06;
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.7)';
    c.lineWidth = s * 0.03;
    c.beginPath();
    c.moveTo(x - s * 0.08, y - s * 0.22);
    c.lineTo(x + s * 0.06, y - s * 0.02);
    c.stroke();
  },
  // a stack of coins and one standing on its edge, stamped with a shell
  coin: (c, x, y, s, ink, hi) => {
    for (let i = 0; i < 4; i++) {
      const cy = y + s * 0.36 - i * s * 0.08;
      c.fillStyle = ink;
      c.beginPath();
      c.ellipse(x - s * 0.14, cy + s * 0.03, s * 0.2, s * 0.07, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = hi;
      c.beginPath();
      c.ellipse(x - s * 0.14, cy, s * 0.2, s * 0.07, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = hi;
    c.strokeStyle = ink;
    c.lineWidth = s * 0.04;
    c.beginPath();
    c.arc(x + s * 0.16, y - s * 0.08, s * 0.24, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = Math.PI + (i / 4) * Math.PI;
      c.moveTo(x + s * 0.16, y + s * 0.02);
      c.lineTo(x + s * 0.16 + Math.cos(a) * s * 0.14, y + s * 0.02 + Math.sin(a) * s * 0.16);
    }
    c.stroke();
  },
  // a hand saw, teeth down, with its open handle, and a claw hammer across it
  saw: (c, x, y, s, ink, hi) => {
    c.save();
    c.translate(x, y);
    c.rotate(-0.45);
    // the blade: broad at the handle, narrowing to the toe
    c.fillStyle = hi;
    c.beginPath();
    c.moveTo(-s * 0.46, -s * 0.02);
    c.lineTo(s * 0.14, -s * 0.16);
    c.lineTo(s * 0.14, s * 0.1);
    c.lineTo(-s * 0.46, s * 0.06);
    c.closePath();
    c.fill();
    c.fillStyle = ink;
    for (let i = 0; i < 11; i++) {
      const tx = -s * 0.46 + i * s * 0.055;
      c.beginPath();
      c.moveTo(tx, s * 0.06 + i * 0.0036 * s);
      c.lineTo(tx + s * 0.027, s * 0.12);
      c.lineTo(tx + s * 0.055, s * 0.06 + (i + 1) * 0.0036 * s);
      c.fill();
    }
    // the handle: a wooden grip with a hole through it
    c.fillStyle = '#7a4a24';
    c.beginPath();
    c.moveTo(s * 0.12, -s * 0.2);
    c.quadraticCurveTo(s * 0.42, -s * 0.24, s * 0.4, s * 0.02);
    c.quadraticCurveTo(s * 0.38, s * 0.16, s * 0.12, s * 0.14);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.beginPath();
    c.ellipse(s * 0.26, -s * 0.03, s * 0.07, s * 0.045, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.save();
    c.translate(x + s * 0.06, y + s * 0.02);
    c.rotate(0.75);
    c.fillStyle = '#8a5a2a';
    c.fillRect(-s * 0.035, -s * 0.16, s * 0.07, s * 0.58);
    c.fillStyle = ink;
    c.fillRect(-s * 0.2, -s * 0.28, s * 0.26, s * 0.12);
    // the claw
    c.beginPath();
    c.moveTo(s * 0.06, -s * 0.28);
    c.quadraticCurveTo(s * 0.2, -s * 0.3, s * 0.24, -s * 0.2);
    c.lineTo(s * 0.18, -s * 0.18);
    c.quadraticCurveTo(s * 0.14, -s * 0.22, s * 0.06, -s * 0.16);
    c.closePath();
    c.fill();
    c.restore();
  },
  // the pawnbroker's three golden balls, hanging from a bracket
  balls: (c, x, y, s, ink, hi) => {
    c.strokeStyle = ink;
    c.lineWidth = s * 0.05;
    c.beginPath();
    c.moveTo(x - s * 0.36, y - s * 0.4);
    c.lineTo(x + s * 0.36, y - s * 0.4);
    c.moveTo(x, y - s * 0.4);
    c.lineTo(x, y - s * 0.24);
    c.moveTo(x - s * 0.24, y - s * 0.24);
    c.lineTo(x + s * 0.24, y - s * 0.24);
    c.moveTo(x - s * 0.2, y - s * 0.24);
    c.lineTo(x - s * 0.2, y - s * 0.08);
    c.moveTo(x + s * 0.2, y - s * 0.24);
    c.lineTo(x + s * 0.2, y - s * 0.08);
    c.moveTo(x, y - s * 0.24);
    c.lineTo(x, y + s * 0.1);
    c.stroke();
    for (const [bx, by] of [
      [-0.2, 0.04],
      [0.2, 0.04],
      [0, 0.26],
    ]) {
      const g = c.createRadialGradient(x + bx * s - s * 0.04, y + by * s - s * 0.05, s * 0.02, x + bx * s, y + by * s, s * 0.14);
      g.addColorStop(0, '#fff6c8');
      g.addColorStop(0.5, hi);
      g.addColorStop(1, '#8a6414');
      c.fillStyle = g;
      c.beginPath();
      c.arc(x + bx * s, y + by * s, s * 0.14, 0, Math.PI * 2);
      c.fill();
    }
  },
  // a leaping fish on a shield-shaped plaque
  mount: (c, x, y, s, ink, hi) => {
    c.fillStyle = ink;
    c.beginPath();
    c.moveTo(x - s * 0.36, y - s * 0.36);
    c.lineTo(x + s * 0.36, y - s * 0.36);
    c.lineTo(x + s * 0.36, y + s * 0.08);
    c.quadraticCurveTo(x + s * 0.3, y + s * 0.34, x, y + s * 0.44);
    c.quadraticCurveTo(x - s * 0.3, y + s * 0.34, x - s * 0.36, y + s * 0.08);
    c.closePath();
    c.fill();
    fishShape(c, x, y, s * 0.5, -0.5, hi);
  },
  // a crystal ball on its stand, a star in it
  ball: (c, x, y, s, ink, hi) => {
    c.fillStyle = ink;
    c.beginPath();
    c.moveTo(x - s * 0.26, y + s * 0.44);
    c.lineTo(x + s * 0.26, y + s * 0.44);
    c.lineTo(x + s * 0.14, y + s * 0.24);
    c.lineTo(x - s * 0.14, y + s * 0.24);
    c.closePath();
    c.fill();
    const g = c.createRadialGradient(x - s * 0.1, y - s * 0.12, s * 0.02, x, y - s * 0.02, s * 0.3);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, hi);
    g.addColorStop(1, '#3a1a6a');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y - s * 0.02, s * 0.3, 0, Math.PI * 2);
    c.fill();
    star(c, x + s * 0.06, y + s * 0.02, s * 0.08, '#fff6c8');
  },
  // neon: a roulette wheel
  wheel: (c, x, y, s, ink) => {
    c.strokeStyle = ink;
    c.lineWidth = s * 0.07;
    c.beginPath();
    c.arc(x, y, s * 0.38, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = s * 0.04;
    c.beginPath();
    c.arc(x, y, s * 0.2, 0, Math.PI * 2);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      c.moveTo(x + Math.cos(a) * s * 0.2, y + Math.sin(a) * s * 0.2);
      c.lineTo(x + Math.cos(a) * s * 0.38, y + Math.sin(a) * s * 0.38);
    }
    c.stroke();
  },
  // neon: a pair of cherries
  cherries: (c, x, y, s, ink, hi) => {
    c.strokeStyle = hi;
    c.lineWidth = s * 0.05;
    c.beginPath();
    c.moveTo(x - s * 0.18, y + s * 0.12);
    c.quadraticCurveTo(x - s * 0.1, y - s * 0.2, x + s * 0.12, y - s * 0.38);
    c.moveTo(x + s * 0.2, y + s * 0.16);
    c.quadraticCurveTo(x + s * 0.18, y - s * 0.12, x + s * 0.12, y - s * 0.38);
    c.stroke();
    c.strokeStyle = ink;
    c.lineWidth = s * 0.07;
    for (const [cx, cy] of [
      [-0.18, 0.24],
      [0.2, 0.28],
    ]) {
      c.beginPath();
      c.arc(x + cx * s, y + cy * s, s * 0.15, 0, Math.PI * 2);
      c.stroke();
    }
  },
  // neon: a spade
  spade: (c, x, y, s, ink) => {
    c.strokeStyle = ink;
    c.lineWidth = s * 0.07;
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(x, y - s * 0.38);
    c.bezierCurveTo(x + s * 0.1, y - s * 0.2, x + s * 0.4, y - s * 0.06, x + s * 0.3, y + s * 0.14);
    c.bezierCurveTo(x + s * 0.22, y + s * 0.28, x + s * 0.06, y + s * 0.22, x, y + s * 0.1);
    c.bezierCurveTo(x - s * 0.06, y + s * 0.22, x - s * 0.22, y + s * 0.28, x - s * 0.3, y + s * 0.14);
    c.bezierCurveTo(x - s * 0.4, y - s * 0.06, x - s * 0.1, y - s * 0.2, x, y - s * 0.38);
    c.moveTo(x, y + s * 0.1);
    c.lineTo(x - s * 0.1, y + s * 0.38);
    c.lineTo(x + s * 0.1, y + s * 0.38);
    c.closePath();
    c.stroke();
  },
};

/** a fish in profile, `len` long, nose toward +x, tipped by `tilt` */
function fishShape(c: CanvasRenderingContext2D, x: number, y: number, len: number, tilt: number, fill: string): void {
  c.save();
  c.translate(x, y);
  c.rotate(tilt);
  c.fillStyle = fill;
  c.beginPath();
  c.moveTo(len * 0.5, 0);
  c.bezierCurveTo(len * 0.3, -len * 0.3, -len * 0.2, -len * 0.28, -len * 0.3, 0);
  c.bezierCurveTo(-len * 0.2, len * 0.28, len * 0.3, len * 0.3, len * 0.5, 0);
  c.fill();
  c.beginPath();
  c.moveTo(-len * 0.28, 0);
  c.lineTo(-len * 0.52, -len * 0.2);
  c.lineTo(-len * 0.46, 0);
  c.lineTo(-len * 0.52, len * 0.2);
  c.closePath();
  c.fill();
  c.restore();
}

function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  c.fillStyle = fill;
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.42 : r;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
}

/* ── the boards ─────────────────────────────────────────────────────────── */

/**
 * How each business shows itself:
 *   painted  planks painted in the trade's colour, the name in cream, the emblem at the left
 *   fish     the fish market's board cut in the shape of a fish
 *   fine     the jeweller's, the boutique's and the florist's: a lacquered board, gilt border,
 *            gilt lettering (the florist's cream, with the lettering in green)
 *   mystic   the fortune teller's: midnight purple, stars and a moon, gilt lettering
 *   neon     the casinos: dark timber, a bulb border, neon letters with a neon emblem either side
 */
type Style = 'painted' | 'fish' | 'fine' | 'mystic' | 'neon';
interface Look {
  style: Style;
  emblem?: Emblem;
  /** the board's paint, the lettering, the emblem's ink and its highlight */
  board: string;
  text: string;
  ink: string;
  hi: string;
}

/** the sign under the pier's entrance arch: not a building's, the pier's own */
const PIER: BuildingRole = { role: 'shop', title: 'FISHING PIER', sub: 'cast from the head', colour: '#2f8f8c', does: 'the way out to the fishing' };

const LOOKS: Record<string, Look> = {
  pier: { style: 'fish', board: '#2f7f7c', text: '#f6ecd4', ink: '#f6ecd4', hi: '#f6ecd4' },
  S3: { style: 'painted', emblem: 'rod', board: '#2e5872', text: '#f6ecd4', ink: '#f6ecd4', hi: '#e8b040' },
  S2: { style: 'painted', emblem: 'hook', board: '#35603c', text: '#f6ecd4', ink: '#e8e4d8', hi: '#e0826a' },
  stall: { style: 'fish', board: '#2f6fa8', text: '#f6ecd4', ink: '#f6ecd4', hi: '#f6ecd4' },
  A: { style: 'fine', emblem: 'ring', board: '#2a1834', text: '#f0cf7a', ink: '#e8c060', hi: '#bfe8ff' },
  D: { style: 'fine', emblem: 'flower', board: '#f2e8d4', text: '#2f6a34', ink: '#f0d040', hi: '#e8506a' },
  E: { style: 'fine', emblem: 'mirror', board: '#16383a', text: '#f0cf7a', ink: '#e8c060', hi: '#bcd8e0' },
  H: { style: 'painted', emblem: 'coin', board: '#4e3e24', text: '#f6e2a4', ink: '#6a4a14', hi: '#f0c850' },
  F: { style: 'painted', emblem: 'saw', board: '#a07a4a', text: '#fff4dc', ink: '#3a2a1a', hi: '#d8dce0' },
  J: { style: 'painted', emblem: 'balls', board: '#2e3040', text: '#f6ecd4', ink: '#c8b890', hi: '#e8b830' },
  K: { style: 'painted', emblem: 'mount', board: '#5a3a24', text: '#f6ecd4', ink: '#8a6040', hi: '#c8d4dc' },
  N: { style: 'mystic', emblem: 'ball', board: '#24163e', text: '#f0cf7a', ink: '#c8a050', hi: '#a88af0' },
  C: { style: 'neon', emblem: 'wheel', board: '#2a2019', text: '#ff3fb4', ink: '#ff3fb4', hi: '#ffe08a' },
  B: { style: 'neon', emblem: 'cherries', board: '#2a2019', text: '#3fd6ff', ink: '#ff4a4a', hi: '#7dff5a' },
  G: { style: 'neon', emblem: 'spade', board: '#2a2019', text: '#7dff5a', ink: '#7dff5a', hi: '#7dff5a' },
};

/** a board for a role without a look of its own: plain painted planks in its colour */
const lookOf = (name: string, r: BuildingRole): Look => LOOKS[name] ?? { style: r.role === 'casino' ? 'neon' : 'painted', board: r.colour, text: '#f6ecd4', ink: '#f6ecd4', hi: '#f6ecd4' };

function roundRectPath(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** the name and the line under it, centred in [x0, x1], outlined so they read against any board */
function lettering(c: CanvasRenderingContext2D, r: BuildingRole, look: Look, x0: number, x1: number, h: number, outline: string | null, size = 64): void {
  const cx = (x0 + x1) / 2;
  const w = x1 - x0;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = font(700, r.title.length > 11 ? size - 8 : size);
  const ty = r.sub ? h * 0.4 : h * 0.52;
  if (outline) {
    c.lineWidth = 9;
    c.strokeStyle = outline;
    c.lineJoin = 'round';
    c.strokeText(r.title, cx, ty, w);
  }
  c.fillStyle = look.text;
  c.fillText(r.title, cx, ty, w);
  if (r.sub) {
    c.font = font(600, 28);
    if (outline) {
      c.lineWidth = 6;
      c.strokeText(r.sub, cx, h * 0.77, w - 10);
    }
    c.fillText(r.sub, cx, h * 0.77, w - 10);
  }
}

function paintSign(c: CanvasRenderingContext2D, ox: number, oy: number, name: string, r: BuildingRole, seed: number): void {
  const w = SW;
  const h = SH;
  const look = lookOf(name, r);
  c.save();
  c.translate(ox, oy);
  c.clearRect(0, 0, w, h);
  const emblem = look.emblem ? EMBLEMS[look.emblem] : null;
  switch (look.style) {
    case 'neon': {
      // dark timber, a bulb border, neon letters with a halo, a neon emblem either side
      c.fillStyle = '#1a1512';
      c.fillRect(0, 0, w, h);
      plankBoard(c, 0, 0, w, h, look.board, seed);
      for (let i = 0; i < 26; i++) {
        const bx = 10 + (i / 25) * (w - 20);
        for (const by of [10, h - 10]) {
          c.fillStyle = '#fff1c4';
          c.beginPath();
          c.arc(bx, by, 4, 0, Math.PI * 2);
          c.fill();
        }
      }
      c.shadowBlur = 16;
      if (emblem)
        for (const ex of [62, w - 62]) {
          c.shadowColor = look.ink;
          emblem(c, ex, h / 2, 92, look.ink, look.hi);
        }
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = font(700, r.title.length > 12 ? 50 : 58);
      c.shadowColor = look.text;
      c.shadowBlur = 22;
      c.fillStyle = look.text;
      c.fillText(r.title, w / 2, h * 0.42, w - 250);
      c.shadowBlur = 8;
      c.fillStyle = '#ffffff';
      c.globalAlpha = 0.55;
      c.fillText(r.title, w / 2, h * 0.42, w - 250);
      c.globalAlpha = 1;
      if (r.sub) {
        c.font = font(700, 30);
        c.shadowBlur = 14;
        c.shadowColor = '#fff1c4';
        c.fillStyle = '#fff1c4';
        c.fillText(r.sub, w / 2, h * 0.78, w - 260);
      }
      c.shadowBlur = 0;
      break;
    }
    case 'fish': {
      // the board cut as a plump fish, nose to the right: its back and belly run straight along
      // the middle so the lettering sits wholly on the board; planks inside, an eye and a gill
      const fish = (): void => {
        c.beginPath();
        c.moveTo(w - 6, h * 0.52);
        c.bezierCurveTo(w - 14, h * 0.18, w - 60, 8, w - 118, 8);
        c.lineTo(160, 8);
        c.bezierCurveTo(118, 8, 96, h * 0.3, 84, h * 0.5);
        c.lineTo(10, 8);
        c.lineTo(34, h * 0.5);
        c.lineTo(10, h - 8);
        c.lineTo(84, h * 0.5);
        c.bezierCurveTo(96, h * 0.7, 118, h - 8, 160, h - 8);
        c.lineTo(w - 118, h - 8);
        c.bezierCurveTo(w - 60, h - 8, w - 14, h * 0.82, w - 6, h * 0.52);
        c.closePath();
      };
      c.save();
      fish();
      c.clip();
      c.fillStyle = '#10202e';
      c.fillRect(0, 0, w, h);
      plankBoard(c, 0, 0, w, h, look.board, seed);
      c.restore();
      fish();
      c.lineJoin = 'round';
      c.lineWidth = 6;
      c.strokeStyle = '#0c1a28';
      c.stroke();
      c.strokeStyle = '#f6ecd4';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(w - 46, h * 0.4, 9, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = '#10202e';
      c.beginPath();
      c.arc(w - 46, h * 0.4, 5, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.moveTo(w - 84, h * 0.16);
      c.quadraticCurveTo(w - 70, h * 0.5, w - 84, h * 0.84);
      c.stroke();
      lettering(c, r, look, 128, w - 104, h, 'rgba(10,24,40,0.85)', 56);
      break;
    }
    case 'fine': {
      // lacquer, a double gilt border, the emblem in a gilt roundel at the left
      roundRectPath(c, 4, 4, w - 8, h - 8, 26);
      c.fillStyle = look.board;
      c.fill();
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,255,255,0.12)');
      g.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.12)');
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = '#d8b050';
      c.lineWidth = 6;
      c.stroke();
      roundRectPath(c, 16, 16, w - 32, h - 32, 18);
      c.lineWidth = 2;
      c.stroke();
      c.beginPath();
      c.arc(86, h / 2, 56, 0, Math.PI * 2);
      c.lineWidth = 3;
      c.stroke();
      if (emblem) emblem(c, 86, h / 2, 96, look.ink, look.hi);
      lettering(c, r, look, 150, w - 30, h, null, 60);
      break;
    }
    case 'mystic': {
      roundRectPath(c, 4, 4, w - 8, h - 8, 26);
      const g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#3a1e5e');
      g.addColorStop(1, look.board);
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = '#c8a050';
      c.lineWidth = 5;
      c.stroke();
      // a sprinkle of stars and a crescent moon
      for (let i = 0; i < 26; i++) {
        const sx = 150 + ((Math.sin(i * 91.7 + seed) * 43758.5) % 1 + 1) % 1 * (w - 180);
        const sy = 14 + ((Math.sin(i * 17.3 + seed * 3) * 12345.6) % 1 + 1) % 1 * (h - 28);
        star(c, sx, sy, 2 + (i % 3), 'rgba(255, 240, 200, 0.55)');
      }
      c.fillStyle = '#f0dca0';
      c.beginPath();
      c.arc(w - 40, 36, 16, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = look.board;
      c.beginPath();
      c.arc(w - 33, 31, 14, 0, Math.PI * 2);
      c.fill();
      if (emblem) emblem(c, 82, h / 2, 110, look.ink, look.hi);
      lettering(c, r, look, 150, w - 40, h, 'rgba(20,8,40,0.7)', 58);
      break;
    }
    default: {
      // planks painted in the trade's colour, the emblem at the left
      c.fillStyle = '#2a1e14';
      c.fillRect(0, 0, w, h);
      plankBoard(c, 0, 0, w, h, look.board, seed);
      if (emblem) emblem(c, 84, h / 2, 118, look.ink, look.hi);
      lettering(c, r, look, emblem ? 150 : 30, w - 26, h, 'rgba(24,16,10,0.8)', 64);
    }
  }
  c.restore();
}

interface Placed {
  frame: BuildingFrame;
  role: BuildingRole;
  tile: number;
}

export class VillageSigns {
  readonly group = new Group();
  private bulbs: InstancedMesh | null = null;
  private readonly bulbPhase: number[] = [];
  private tick = 0;

  /**
   * @param pierSign where the pier's sign hangs under its entrance arch (the tops of its chains:
   *   world.json `pierSign`), if there is one
   */
  constructor(buildings: BuildingFrame[], pierSign: [number, number, number] | null = null) {
    this.group.name = 'village-signs';
    const cv = document.createElement('canvas');
    cv.width = ATLAS;
    cv.height = ATLAS;
    const ctx = cv.getContext('2d')!;
    const placed: Placed[] = [];
    buildings.forEach((b) => {
      const role = ROLES[b.name];
      // (home, and Coral's, and the boatyard everyone knows, go without)
      if (role && role.sign !== false) placed.push({ frame: b, role, tile: placed.length });
    });
    const pierTile = pierSign ? placed.length : -1;
    const paint = (): void => {
      placed.forEach((p, i) => paintSign(ctx, (p.tile % COLS) * SW, Math.floor(p.tile / COLS) * SH, p.frame.name, p.role, i + 1));
      if (pierTile >= 0) paintSign(ctx, (pierTile % COLS) * SW, Math.floor(pierTile / COLS) * SH, 'pier', PIER, pierTile + 1);
    };
    paint();
    const tex = new CanvasTexture(cv);
    tex.colorSpace = SRGBColorSpace;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.anisotropy = 8;
    onFontsReady(() => {
      paint();
      tex.needsUpdate = true;
    });

    const boards = { pos: [] as number[], nrm: [] as number[], uv: [] as number[] };
    const neon = { pos: [] as number[], nrm: [] as number[], uv: [] as number[] };
    const bulbs: Vector3[] = [];
    const v = new Vector3();
    const n = new Vector3();

    for (const p of placed) {
      const b = p.frame;
      const r = p.role;
      // size and spot, in front of every roof edge that could hide it from the path
      let sw: number;
      let lx = b.doorX;
      let ly: number;
      let lz = b.d / 2 + 0.09;
      /** the casino board, where it's on the facade: its box, to keep the marquee bulbs off it */
      let face: { x: number; y0: number; y1: number } | null = null;
      const roof = b.roof;
      const awning = b.awning;
      if (b.kind === 'stall') {
        // standing on the stall's roof ridge, facing the path
        sw = 2.6;
        lx = 0;
        ly = b.floorY + 3.55;
        lz = 0.9;
      } else if (b.kind === 'boathouse') {
        sw = 4.2;
        lx = 0;
        ly = b.floorY + 4.3;
        lz = b.d / 2 + 0.2;
      } else if (b.kind === 'shed') {
        sw = 1.3;
        lx = 0;
        ly = b.floorY + 1.95;
        lz = 1.05;
      } else if (r.role === 'casino' && roof && (b.stories > 1 || roof.pitch > 0)) {
        // a big board across the facade, under the roof's edge (a gable end's rake comes down
        // toward the corners, so there the board is as wide as fits under it) and clear of the
        // porch roof or door hood below
        const bottom = b.floorY + (b.stories > 1 ? STOREY + 0.3 : 2.6);
        const under = roof.eave - 0.06;
        sw = Math.min(b.w * 0.92, 5.8, (under - bottom) / (SH / SW + roof.pitch / 2));
        lx = 0;
        ly = under - (sw / 2) * roof.pitch - ((sw * SH) / SW) / 2;
        lz = b.d / 2 + 0.32; // clear of the open shutters (they swing ~0.25 m off the wall)
        face = { x: sw / 2 + 0.06, y0: ly - ((sw * SH) / SW) / 2 - 0.06, y1: ly + ((sw * SH) / SW) / 2 + 0.06 };
      } else if (r.role === 'casino') {
        // a one-storey shack's eaves would hide it: a billboard standing up on the roof
        sw = Math.min(b.w * 0.92, 5.8);
        lx = 0;
        ly = b.floorY + STOREY + ((sw * SH) / SW) / 2 + 0.45;
        lz = b.d / 2 - 0.3;
      } else if (awning) {
        // standing on the front edge of the porch roof (or the door's hood), its foot on the
        // fascia: out in front of the roofs, where you see it from the path
        // big enough to read from the path in the headset (a porch's is ~2.8 m; a door hood's
        // board overhangs the hood a little)
        sw = b.porch > 0 ? Math.min(b.w * 0.55, 2.8, awning.w + 0.1) : Math.min(b.w * 0.5, 2.4);
        lx = awning.x;
        ly = awning.bottom + ((sw * SH) / SW) / 2;
        lz = awning.z + 0.03;
      } else {
        // over the door
        sw = Math.min(b.w * 0.5, 2.4);
        ly = b.floorY + 3.0;
      }
      const sh = (sw * SH) / SW;
      const u0 = ((p.tile % COLS) * SW) / ATLAS;
      const v1 = 1 - (Math.floor(p.tile / COLS) * SH) / ATLAS;
      const u1 = u0 + SW / ATLAS;
      const v0 = v1 - SH / ATLAS;
      const target = r.role === 'casino' ? neon : boards;
      const corners: [number, number, number, number][] = [
        [-sw / 2, -sh / 2, u0, v0],
        [sw / 2, -sh / 2, u1, v0],
        [sw / 2, sh / 2, u1, v1],
        [-sw / 2, sh / 2, u0, v1],
      ];
      toWorld(b, 0, 0, 1, n).sub(toWorld(b, 0, 0, 0, v)).normalize();
      for (const q of [0, 1, 2, 0, 2, 3]) {
        const [cx, cy, u, vv] = corners[q];
        toWorld(b, lx + cx, ly + cy, lz, v);
        target.pos.push(v.x, v.y, v.z);
        target.nrm.push(n.x, n.y, n.z);
        target.uv.push(u, vv);
      }
      // marquee bulbs along the casino's front eaves (and down the corners of the facade), strung
      // under the roof's front edge where there is one, and never behind the board
      if (r.role === 'casino') {
        const flat = roof && roof.pitch === 0;
        const eave = flat ? roof.eave - 0.05 : (b.eaves ?? b.floorY + STOREY * b.stories) + 0.05;
        const bz = flat ? roof.z + 0.03 : b.d / 2 + 0.16;
        const free = (x: number, y: number): boolean => !face || Math.abs(x) > face.x || y < face.y0 || y > face.y1;
        const count = Math.round(b.w / 0.32);
        for (let i = 0; i <= count; i++) {
          const x = -b.w / 2 + (i / count) * b.w;
          if (free(x, eave)) bulbs.push(toWorld(b, x, eave, bz, new Vector3()));
        }
        const top = flat ? Math.min(eave, (b.eaves ?? eave) - 0.1) : eave;
        const down = Math.round((top - b.floorY) / 0.4);
        for (const side of [-1, 1]) for (let i = 1; i < down; i++) bulbs.push(toWorld(b, side * (b.w / 2 + 0.05), top - i * 0.4, b.d / 2 + 0.16, new Vector3()));
      }
    }

    // the pier's sign: a board hanging on two chains under the entrance arch, facing the village
    // and (its back, lettered the right way round) the sea
    let chains: BufferGeometry | null = null;
    if (pierSign && pierTile >= 0) {
      const [px, py, pz] = pierSign;
      const sw = 1.9;
      const sh = (sw * SH) / SW;
      const cy = py - 0.42;
      const u0 = ((pierTile % COLS) * SW) / ATLAS;
      const v1 = 1 - (Math.floor(pierTile / COLS) * SH) / ATLAS;
      const u1 = u0 + SW / ATLAS;
      const v0 = v1 - SH / ATLAS;
      for (const side of [-1, 1]) {
        // side −1 faces the village (−z), +1 the sea; seen from either, the nose points right
        const zf = pz + side * 0.012;
        const corners: [number, number, number, number][] = [
          [-sw / 2, -sh / 2, side < 0 ? u1 : u0, v0],
          [sw / 2, -sh / 2, side < 0 ? u0 : u1, v0],
          [sw / 2, sh / 2, side < 0 ? u0 : u1, v1],
          [-sw / 2, sh / 2, side < 0 ? u1 : u0, v1],
        ];
        const order = side < 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
        for (const q of order) {
          const [cx, cyy, u, vv] = corners[q];
          boards.pos.push(px + cx, cy + cyy, zf);
          boards.nrm.push(0, 0, side);
          boards.uv.push(u, vv);
        }
      }
      // its two chains, up to the beam
      const links: BufferGeometry[] = [];
      for (const s of [-0.42, 0.42]) {
        const top = py;
        const bottom = cy + sh / 2 - 0.02;
        const g = new CylinderGeometry(0.009, 0.009, top - bottom, 5);
        g.translate(px + s, (top + bottom) / 2, pz);
        links.push(g);
      }
      chains = mergeGeometries(links, false);
    }

    const mk = (a: { pos: number[]; nrm: number[]; uv: number[] }): BufferGeometry => {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(a.pos), 3));
      g.setAttribute('normal', new BufferAttribute(new Float32Array(a.nrm), 3));
      g.setAttribute('uv', new BufferAttribute(new Float32Array(a.uv), 2));
      g.computeBoundingSphere();
      return g;
    };
    // painted boards take the light, but glow a little of their own so one facing away from the
    // sun still reads (in shade the plain lit board went dark brown on the headset)
    this.group.add(new Mesh(mk(boards), new MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.45, transparent: true, alphaTest: 0.1, side: DoubleSide })));
    if (chains) this.group.add(new Mesh(chains, new MeshLambertMaterial({ color: 0x2a2826 })));
    const neonMesh = new Mesh(mk(neon), new MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.1, side: DoubleSide, toneMapped: false, fog: true }));
    this.group.add(neonMesh);

    if (bulbs.length) {
      const m = new InstancedMesh(new SphereGeometry(0.045, 8, 6), new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), bulbs.length);
      const mat = new Matrix4();
      bulbs.forEach((p, i) => {
        m.setMatrixAt(i, mat.makeTranslation(p.x, p.y, p.z));
        m.setColorAt(i, new Color(1, 0.9, 0.6));
        this.bulbPhase.push(i);
      });
      m.frustumCulled = false;
      this.group.add(m);
      this.bulbs = m;
    }
  }

  /** Marquee chase: every third bulb bright, stepping round ~8 times a second. */
  update(dt: number): void {
    const m = this.bulbs;
    if (!m) return;
    this.tick += dt * 8;
    const step = Math.floor(this.tick);
    const c = new Color();
    for (let i = 0; i < m.count; i++) {
      const on = (i + step) % 3 === 0;
      m.setColorAt(i, on ? c.setRGB(1.4, 1.2, 0.8) : c.setRGB(0.55, 0.42, 0.25));
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
}
