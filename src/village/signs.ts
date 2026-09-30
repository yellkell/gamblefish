/**
 * Signs on the village's businesses (village/roles.ts), in the island's own hand. Each says
 * what the place is and what's inside, with a picture of its trade, in a style that suits it:
 *
 *   shops    planks painted in the trade's colour, the name in cream, the emblem at the left: a
 *            rod for the tackle shop, a baited hook, a stack of coins, a saw and hammer, the
 *            pawnbroker's three balls, a mounted fish, the engineer's cog and spanner
 *   market   the fish market's board is cut in the shape of a fish
 *   fine     the jeweller's, the boutique's and the florist's: lacquer, gilt border, gilt letters
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
import { font, onFontsReady } from '../ui/fonts.ts';
import { PierSign } from './pierSign.ts';
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

/* ── the emblems: a picture of the trade, painted beside the name ────────── */

type Emblem = 'fish' | 'rod' | 'hook' | 'ring' | 'flower' | 'mirror' | 'coin' | 'saw' | 'balls' | 'mount' | 'cog' | 'wheel' | 'cherries' | 'spade';

/** Each emblem drawn in a box of side `s` centred on (x, y). */
const EMBLEMS: Record<Emblem, (c: CanvasRenderingContext2D, x: number, y: number, s: number, ink: string, hi: string) => void> = {
  // a fish, nose up a little, its eye and gill
  fish: (c, x, y, s, ink, hi) => {
    fishShape(c, x, y, s * 0.95, -0.2, ink);
    c.fillStyle = hi;
    c.globalAlpha = 0.35;
    c.save();
    c.translate(x, y);
    c.rotate(-0.2);
    c.beginPath();
    c.ellipse(s * 0.02, s * 0.06, s * 0.28, s * 0.06, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.globalAlpha = 1;
    c.fillStyle = '#1a2a38';
    c.beginPath();
    c.arc(x + s * 0.3, y - s * 0.1, s * 0.035, 0, Math.PI * 2);
    c.fill();
  },
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
  // a cog with a spanner laid across it
  cog: (c, x, y, s, ink, hi) => {
    c.fillStyle = ink;
    c.beginPath();
    const n = 10;
    for (let i = 0; i < n * 4; i++) {
      const a = (i / (n * 4)) * Math.PI * 2;
      const k = i % 4 < 2 ? s * 0.4 : s * 0.32;
      c.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
    }
    c.closePath();
    c.moveTo(x + s * 0.13, y);
    c.arc(x, y, s * 0.13, 0, Math.PI * 2, true);
    c.fill('evenodd');
    // the spanner: a handle, an open jaw at each end
    c.save();
    c.translate(x, y);
    c.rotate(-Math.PI / 4);
    c.fillStyle = hi;
    c.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    c.lineWidth = s * 0.015;
    c.beginPath();
    c.rect(-s * 0.36, -s * 0.045, s * 0.72, s * 0.09);
    for (const e of [-1, 1]) {
      c.moveTo(e * s * 0.36 + s * 0.1, 0);
      c.arc(e * s * 0.36, 0, s * 0.1, 0, Math.PI * 2);
    }
    c.fill();
    c.stroke();
    // the jaws' mouths, cut out in the cog's ink
    c.fillStyle = ink;
    for (const e of [-1, 1]) c.fillRect(e * s * 0.36 + (e > 0 ? 0 : -s * 0.11), -s * 0.035, s * 0.11, s * 0.07);
    c.restore();
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

/* ── the boards ─────────────────────────────────────────────────────────── */

/**
 * How each business shows itself. Every board is painted timber, lettered by hand, and has seen
 * a few seasons of sun and salt:
 *   painted  planks painted in the trade's colour, a pinstripe border, the name in a sign-writer's
 *            serif with a painted shadow, the emblem at the left
 *   fine     the jeweller's, the boutique's and the florist's: oiled dark hardwood with a routed
 *            border, the lettering and emblem in gold leaf
 *   neon     the casinos: stained timber with the name in glass tubes, the line under it painted
 */
type Style = 'painted' | 'fine' | 'neon';
interface Look {
  style: Style;
  emblem?: Emblem;
  /** the board's paint (or stain), the lettering, the emblem's ink and its highlight */
  board: string;
  text: string;
  ink: string;
  hi: string;
}

const LOOKS: Record<string, Look> = {
  S3: { style: 'painted', emblem: 'rod', board: '#2e5872', text: '#f2e6c8', ink: '#f2e6c8', hi: '#d8a040' },
  S2: { style: 'painted', emblem: 'hook', board: '#34603a', text: '#f2e6c8', ink: '#e8e0cc', hi: '#d0806a' },
  stall: { style: 'painted', emblem: 'fish', board: '#2c6690', text: '#f2e6c8', ink: '#f2e6c8', hi: '#c8dce4' },
  A: { style: 'fine', emblem: 'ring', board: '#3a2a22', text: '#d8b058', ink: '#d8b058', hi: '#cfe8f4' },
  D: { style: 'painted', emblem: 'flower', board: '#e8dcc0', text: '#2f5e30', ink: '#e0c040', hi: '#d84a62' },
  E: { style: 'fine', emblem: 'mirror', board: '#2e2420', text: '#d8b058', ink: '#d8b058', hi: '#b8d0d8' },
  H: { style: 'fine', emblem: 'coin', board: '#3a2c20', text: '#d8b058', ink: '#6a4a14', hi: '#e0b848' },
  F: { style: 'painted', emblem: 'saw', board: '#9a7448', text: '#fbf0d8', ink: '#3a2a1a', hi: '#c8ccd0' },
  J: { style: 'painted', emblem: 'balls', board: '#2e3040', text: '#f2e6c8', ink: '#b8a880', hi: '#d8a830' },
  K: { style: 'painted', emblem: 'mount', board: '#5a3a24', text: '#f2e6c8', ink: '#7a5236', hi: '#c0ccd4' },
  N: { style: 'painted', emblem: 'cog', board: '#2c3a44', text: '#f2e6c8', ink: '#e8b830', hi: '#d0d4d8' },
  C: { style: 'neon', emblem: 'wheel', board: '#2a2019', text: '#ff3fb4', ink: '#ff3fb4', hi: '#ffe08a' },
  B: { style: 'neon', emblem: 'cherries', board: '#2a2019', text: '#3fd6ff', ink: '#ff4a4a', hi: '#7dff5a' },
  G: { style: 'neon', emblem: 'spade', board: '#2a2019', text: '#7dff5a', ink: '#7dff5a', hi: '#7dff5a' },
};

/** a board for a role without a look of its own: plain painted planks in its colour */
const lookOf = (name: string, r: BuildingRole): Look => LOOKS[name] ?? { style: r.role === 'casino' ? 'neon' : 'painted', board: r.colour, text: '#f2e6c8', ink: '#f2e6c8', hi: '#f2e6c8' };

/** a sign-writer's serif (Noto Serif on the headset) */
export const serif = (weight: number, px: number): string => `${weight} ${px}px 'Noto Serif', Georgia, 'DejaVu Serif', 'Liberation Serif', serif`;

export function rngOf(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Lettering by hand: each letter a hair off the line and off square, a painted shadow down and
 * to the right, squeezed to fit `maxW` if it must be (the way a sign-writer narrows his letters).
 */
export function handLetter(c: CanvasRenderingContext2D, text: string, cx: number, cy: number, maxW: number, fnt: string, fill: string, shadow: string | null, seed: number): void {
  const r = rngOf(seed);
  c.font = fnt;
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  const ws = [...text].map((ch) => c.measureText(ch).width);
  const total = ws.reduce((a, b) => a + b, 0);
  const k = Math.min(1, maxW / total);
  c.save();
  c.translate(cx, cy);
  c.scale(k, 1);
  let x = -total / 2;
  [...text].forEach((ch, i) => {
    const jy = (r() - 0.5) * 2.2;
    const jr = (r() - 0.5) * 0.035;
    c.save();
    c.translate(x + ws[i] / 2, jy);
    c.rotate(jr);
    if (shadow) {
      c.fillStyle = shadow;
      c.fillText(ch, -ws[i] / 2 + 3, 3);
    }
    c.fillStyle = fill;
    c.fillText(ch, -ws[i] / 2, 0);
    c.restore();
    x += ws[i];
  });
  c.restore();
}

/** Planks, their grain, the dark seams between them. */
export function plankBoard(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tint: string, seed: number, planks = 3): void {
  const r = rngOf(seed + 7);
  for (let i = 0; i < planks; i++) {
    const py = y + (i * h) / planks;
    const ph = h / planks;
    c.fillStyle = tint;
    c.fillRect(x, py, w, ph);
    c.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,240,210'},${(0.04 + r() * 0.06).toFixed(3)})`;
    c.fillRect(x, py, w, ph);
    // grain: long wavering lines, a knot now and then
    for (let g = 0; g < 9; g++) {
      c.strokeStyle = `rgba(0,0,0,${(0.05 + r() * 0.08).toFixed(3)})`;
      c.lineWidth = 0.8 + r() * 1.4;
      c.beginPath();
      const gy = py + 3 + r() * (ph - 6);
      c.moveTo(x, gy);
      c.bezierCurveTo(x + w * 0.3, gy + (r() - 0.5) * 6, x + w * 0.7, gy + (r() - 0.5) * 6, x + w, gy + (r() - 0.5) * 4);
      c.stroke();
    }
    if (r() < 0.6) {
      const kx = x + r() * w;
      const ky = py + ph * (0.3 + r() * 0.4);
      c.strokeStyle = 'rgba(40,24,12,0.25)';
      c.lineWidth = 1.2;
      for (let k = 1; k <= 3; k++) {
        c.beginPath();
        c.ellipse(kx, ky, 3 + k * 4, 2 + k * 1.6, 0, 0, Math.PI * 2);
        c.stroke();
      }
    }
    // the seam
    c.fillStyle = 'rgba(20,12,6,0.75)';
    c.fillRect(x, py + ph - 2, w, 2);
  }
}

/**
 * Sun, salt and years: paint chipped off at the edges and along the seams down to grey wood,
 * flecks of paint gone everywhere, rust-and-rain streaks from the top, grime along the bottom,
 * and the whole board a little bleached.
 */
export function weather(c: CanvasRenderingContext2D, w: number, h: number, seed: number, amount = 1): void {
  const r = rngOf(seed * 31 + 5);
  const bare = (a: number): string => `rgba(${138 + Math.floor(r() * 20)}, ${122 + Math.floor(r() * 16)}, ${100 + Math.floor(r() * 14)}, ${a.toFixed(2)})`;
  // chips: mostly at the edges and the seams
  const chips = Math.round(46 * amount);
  for (let i = 0; i < chips; i++) {
    let x: number;
    let y: number;
    const where = r();
    if (where < 0.3) {
      x = r() * w;
      y = r() < 0.5 ? r() * 10 : h - r() * 10;
    } else if (where < 0.5) {
      x = r() < 0.5 ? r() * 12 : w - r() * 12;
      y = r() * h;
    } else if (where < 0.75) {
      x = r() * w;
      y = (Math.floor(r() * 3) + 1) * (h / 3) - 2 + (r() - 0.5) * 6;
    } else {
      x = r() * w;
      y = r() * h;
    }
    const sz = 1.5 + r() * r() * 7;
    c.fillStyle = bare(0.55 + r() * 0.35);
    c.beginPath();
    const n = 5 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const rr = sz * (0.5 + r() * 0.8);
      c.lineTo(x + Math.cos(a) * rr * 1.4, y + Math.sin(a) * rr);
    }
    c.closePath();
    c.fill();
  }
  // flecks
  for (let i = 0; i < 300 * amount; i++) {
    c.fillStyle = bare(0.18 + r() * 0.25);
    c.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5);
  }
  // streaks from the top (rain off the fixings)
  for (let i = 0; i < 5 * amount; i++) {
    const x = 20 + r() * (w - 40);
    const sw = 3 + r() * 10;
    const len = h * (0.3 + r() * 0.6);
    const g = c.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, `rgba(70, 44, 22, ${(0.1 + r() * 0.12).toFixed(2)})`);
    g.addColorStop(1, 'rgba(70, 44, 22, 0)');
    c.fillStyle = g;
    c.fillRect(x, 0, sw, len);
  }
  // grime at the foot, and the sun
  const gb = c.createLinearGradient(0, h, 0, h * 0.55);
  gb.addColorStop(0, `rgba(40, 30, 18, ${(0.28 * amount).toFixed(2)})`);
  gb.addColorStop(1, 'rgba(40, 30, 18, 0)');
  c.fillStyle = gb;
  c.fillRect(0, 0, w, h);
  c.fillStyle = `rgba(255, 246, 226, ${(0.07 * amount).toFixed(2)})`;
  c.fillRect(0, 0, w, h);
}

/** a painted line, not quite straight, round a board */
function pinstripe(c: CanvasRenderingContext2D, inset: number, w: number, h: number, colour: string, width: number, seed: number): void {
  const r = rngOf(seed + 3);
  c.strokeStyle = colour;
  c.lineWidth = width;
  c.lineJoin = 'round';
  c.beginPath();
  const pts: [number, number][] = [
    [inset, inset],
    [w - inset, inset],
    [w - inset, h - inset],
    [inset, h - inset],
  ];
  pts.forEach(([x, y], i) => {
    const jx = x + (r() - 0.5) * 1.5;
    const jy = y + (r() - 0.5) * 1.5;
    if (i === 0) c.moveTo(jx, jy);
    else c.lineTo(jx, jy);
  });
  c.closePath();
  c.stroke();
}

/** the name and the line under it, lettered by hand, centred in [x0, x1] */
function lettering(c: CanvasRenderingContext2D, r: BuildingRole, fill: string, shadow: string | null, x0: number, x1: number, h: number, seed: number, size = 66): void {
  const cx = (x0 + x1) / 2;
  const w = x1 - x0;
  const ty = r.sub ? h * 0.4 : h * 0.52;
  handLetter(c, r.title, cx, ty, w, serif(700, r.title.length > 11 ? size - 6 : size), fill, shadow, seed);
  if (r.sub) handLetter(c, r.sub, cx, h * 0.77, w - 10, `italic ${serif(600, 27)}`, fill, shadow, seed + 11);
}

/** Gold leaf: a darker edge under it, a bright one along the top. */
function gilt(draw: (fill: string, dx: number, dy: number) => void): void {
  draw('rgba(40, 24, 8, 0.8)', 2, 2.5);
  draw('#f6e2a0', -0.8, -1);
  draw('#c9a048', 0, 0);
}

function paintSign(c: CanvasRenderingContext2D, ox: number, oy: number, name: string, r: BuildingRole, seed: number): void {
  const w = SW;
  const h = SH;
  const look = lookOf(name, r);
  c.save();
  c.translate(ox, oy);
  c.beginPath();
  c.rect(0, 0, w, h);
  c.clip();
  const emblem = look.emblem ? EMBLEMS[look.emblem] : null;
  switch (look.style) {
    case 'neon': {
      // stained timber; the name in glass tubes: a coloured glow round a pale core
      plankBoard(c, 0, 0, w, h, look.board, seed);
      weather(c, w, h, seed, 0.5);
      for (let i = 0; i < 26; i++) {
        const bx = 10 + (i / 25) * (w - 20);
        for (const by of [10, h - 10]) {
          c.fillStyle = '#2a2420';
          c.beginPath();
          c.arc(bx, by, 5, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#fff1c4';
          c.beginPath();
          c.arc(bx, by, 3.5, 0, Math.PI * 2);
          c.fill();
        }
      }
      c.shadowBlur = 12;
      if (emblem)
        for (const ex of [62, w - 62]) {
          c.shadowColor = look.ink;
          emblem(c, ex, h / 2, 88, look.ink, look.hi);
        }
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = font(700, r.title.length > 12 ? 50 : 58);
      c.lineJoin = 'round';
      c.shadowColor = look.text;
      c.shadowBlur = 16;
      c.strokeStyle = look.text;
      c.lineWidth = 7;
      c.strokeText(r.title, w / 2, h * 0.42, w - 250);
      c.shadowBlur = 4;
      c.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      c.lineWidth = 2.2;
      c.strokeText(r.title, w / 2, h * 0.42, w - 250);
      c.shadowBlur = 0;
      if (r.sub) handLetter(c, r.sub, w / 2, h * 0.78, w - 270, serif(700, 26), '#e8dcc0', 'rgba(0,0,0,0.6)', seed + 5);
      break;
    }
    case 'fine': {
      // oiled dark hardwood, a routed border, gold leaf
      plankBoard(c, 0, 0, w, h, look.board, seed, 2);
      weather(c, w, h, seed, 0.35);
      pinstripe(c, 14, w, h, 'rgba(10, 6, 2, 0.75)', 5, seed);
      pinstripe(c, 16.5, w, h, 'rgba(255, 230, 190, 0.18)', 1.5, seed);
      if (emblem) gilt((fill, dx, dy) => emblem(c, 86 + dx, h / 2 + dy, 104, fill === '#c9a048' ? look.ink : fill, fill === '#c9a048' ? look.hi : fill));
      gilt((fill, dx, dy) => lettering(c, r, fill, null, 150 + dx, w - 28 + dx, h + dy * 2, seed));
      break;
    }
    default: {
      // planks painted in the trade's colour, a pinstripe, the emblem, the name by hand
      plankBoard(c, 0, 0, w, h, look.board, seed);
      pinstripe(c, 13, w, h, look.text, 3, seed);
      if (emblem) emblem(c, 84, h / 2, 112, look.ink, look.hi);
      lettering(c, r, look.text, 'rgba(20, 12, 6, 0.55)', emblem ? 152 : 30, w - 30, h, seed);
      weather(c, w, h, seed);
    }
  }
  c.restore();
}

/** the timber the boards are cut from: their edges and backs */
function paintEdge(c: CanvasRenderingContext2D, ox: number, oy: number): void {
  c.save();
  c.translate(ox, oy);
  plankBoard(c, 0, 0, SW, SH, '#6a5846', 911, 4);
  weather(c, SW, SH, 911, 0.6);
  c.restore();
}

/** how thick the boards are (m) */
const BOARD_T = 0.05;

/** a tile's rectangle in the atlas: [u0, v0, u1, v1] */
function tileUV(tile: number): [number, number, number, number] {
  const u0 = ((tile % COLS) * SW) / ATLAS;
  const v1 = 1 - (Math.floor(tile / COLS) * SH) / ATLAS;
  return [u0, v1 - SH / ATLAS, u0 + SW / ATLAS, v1];
}

const _p = new Vector3();
const _o = new Vector3();
/**
 * A box in a building's frame (centre lx, ly, lz; sizes across, up, out): its front face (+z,
 * toward the path) takes `front`, the other five `edge`.
 */
function slab(a: { pos: number[]; nrm: number[]; uv: number[] }, b: BuildingFrame, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, front: [number, number, number, number], edge: [number, number, number, number]): void {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  // each face: its normal in the frame, and its corners (counter-clockwise from outside)
  const faces: [[number, number, number], [number, number, number][]][] = [
    [[0, 0, 1], [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]]],
    [[0, 0, -1], [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]]],
    [[1, 0, 0], [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]]],
    [[-1, 0, 0], [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]]],
    [[0, 1, 0], [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]]],
    [[0, -1, 0], [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]]],
  ];
  toWorld(b, 0, 0, 0, _o);
  faces.forEach(([nl, corners], f) => {
    const [u0, v0, u1, v1] = f === 0 ? front : edge;
    const uvs: [number, number][] = [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
    ];
    toWorld(b, nl[0], nl[1], nl[2], _p).sub(_o).normalize();
    const nx = _p.x;
    const ny = _p.y;
    const nz = _p.z;
    for (const q of [0, 1, 2, 0, 2, 3]) {
      const [cx, cy, cz] = corners[q];
      toWorld(b, lx + cx, ly + cy, lz + cz, _p);
      a.pos.push(_p.x, _p.y, _p.z);
      a.nrm.push(nx, ny, nz);
      a.uv.push(uvs[q][0], uvs[q][1]);
    }
  });
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
  private pier: PierSign | null = null;

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
    // the last tile: bare timber, for the boards' edges and backs and the posts
    const edgeTile = placed.length;
    const paint = (): void => {
      placed.forEach((p, i) => paintSign(ctx, (p.tile % COLS) * SW, Math.floor(p.tile / COLS) * SH, p.frame.name, p.role, i + 1));
      paintEdge(ctx, (edgeTile % COLS) * SW, Math.floor(edgeTile / COLS) * SH);
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
      const target = r.role === 'casino' ? neon : boards;
      // the board: a 5 cm slab, its painted face out front, bare timber round its edges and back
      slab(target, b, lx, ly, lz - BOARD_T / 2, sw, sh, BOARD_T, tileUV(p.tile), tileUV(edgeTile));
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

    // the pier's sign: a carved fish hanging under the entrance arch (village/pierSign.ts)
    if (pierSign) {
      this.pier = new PierSign(pierSign);
      this.group.add(this.pier.group);
    }

    const mk = (a: { pos: number[]; nrm: number[]; uv: number[] }): BufferGeometry => {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(a.pos), 3));
      g.setAttribute('normal', new BufferAttribute(new Float32Array(a.nrm), 3));
      g.setAttribute('uv', new BufferAttribute(new Float32Array(a.uv), 2));
      g.computeBoundingSphere();
      return g;
    };
    // painted timber in the scene's light (a touch of its own, so a board in shade still reads)
    this.group.add(new Mesh(mk(boards), new MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12 })));
    const neonMesh = new Mesh(mk(neon), new MeshBasicMaterial({ map: tex, toneMapped: false, fog: true }));
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
    this.pier?.update(dt);
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
