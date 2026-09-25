/**
 * Signs on every building (village/roles.ts), in the island's own hand:
 *
 *   shops    a hand-painted board over the door: planks, the name in cream with a dark outline,
 *            a line underneath saying what they sell
 *   casinos  "island shack casino" — the same timber, but the lettering is neon with a halo and a
 *            bulb border, and a string of marquee bulbs along the front eaves chases round
 *   home     a driftwood plank
 *   love     a painted name sign with a heart
 *
 * All the signs share one painted atlas: two draw calls for every sign in the village (lit
 * boards, and self-lit neon), one for the bulbs.
 */

import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
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

function paintSign(c: CanvasRenderingContext2D, ox: number, oy: number, r: BuildingRole, seed: number): void {
  const w = SW;
  const h = SH;
  c.save();
  c.translate(ox, oy);
  c.clearRect(0, 0, w, h);
  const neon = r.role === 'casino';
  if (neon) {
    // dark painted board, bulb border, neon letters with a halo
    c.fillStyle = '#1a1512';
    c.fillRect(0, 0, w, h);
    plankBoard(c, 0, 0, w, h, '#2a2019', seed);
    for (let i = 0; i < 26; i++) {
      const t = i / 26;
      const bx = 10 + t * (w - 20);
      for (const by of [10, h - 10]) {
        c.fillStyle = '#fff1c4';
        c.beginPath();
        c.arc(bx, by, 4, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = font(700, r.title.length > 13 ? 58 : 68);
    c.shadowColor = r.colour;
    c.shadowBlur = 22;
    c.fillStyle = r.colour;
    c.fillText(r.title, w / 2, h * 0.42, w - 40);
    c.shadowBlur = 8;
    c.fillStyle = '#ffffff';
    c.globalAlpha = 0.55;
    c.fillText(r.title, w / 2, h * 0.42, w - 40);
    c.globalAlpha = 1;
    if (r.sub) {
      c.font = font(700, 28);
      c.shadowBlur = 14;
      c.fillStyle = '#fff1c4';
      c.fillText(r.sub, w / 2, h * 0.78, w - 60);
    }
    c.shadowBlur = 0;
  } else {
    const board = r.role === 'home' ? '#9a8a70' : r.role === 'outbuilding' ? '#7a6a58' : '#b89a72';
    // the batten behind the planks, so the seams read dark, not see-through
    c.fillStyle = '#2a1e14';
    c.fillRect(0, 0, w, h);
    plankBoard(c, 0, 0, w, h, board, seed);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = font(700, r.role === 'outbuilding' ? 60 : 64);
    c.lineWidth = 10;
    c.strokeStyle = 'rgba(30,20,12,0.85)';
    const ty = r.sub ? h * 0.42 : h * 0.52;
    const title = r.role === 'love' ? `♥ ${r.title} ♥` : r.title;
    c.strokeText(title, w / 2, ty, w - 40);
    c.fillStyle = r.role === 'love' ? '#ffd8de' : '#f6ecd4';
    c.fillText(title, w / 2, ty, w - 40);
    // a painted colour band under the name (the shop's colour)
    c.fillStyle = r.colour;
    c.globalAlpha = 0.85;
    c.fillRect(40, h * 0.66, w - 80, 6);
    c.globalAlpha = 1;
    if (r.sub) {
      c.font = font(600, 28);
      c.lineWidth = 6;
      c.strokeText(r.sub, w / 2, h * 0.82, w - 60);
      c.fillStyle = '#f6ecd4';
      c.fillText(r.sub, w / 2, h * 0.82, w - 60);
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

  constructor(buildings: BuildingFrame[]) {
    this.group.name = 'village-signs';
    const cv = document.createElement('canvas');
    cv.width = ATLAS;
    cv.height = ATLAS;
    const ctx = cv.getContext('2d')!;
    const placed: Placed[] = [];
    buildings.forEach((b) => {
      const role = ROLES[b.name];
      if (role) placed.push({ frame: b, role, tile: placed.length });
    });
    const paint = (): void => {
      placed.forEach((p, i) => paintSign(ctx, (p.tile % COLS) * SW, Math.floor(p.tile / COLS) * SH, p.role, i + 1));
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
        sw = Math.min(b.w * 0.45, 2.3, awning.w + 0.1);
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

    const mk = (a: { pos: number[]; nrm: number[]; uv: number[] }): BufferGeometry => {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(a.pos), 3));
      g.setAttribute('normal', new BufferAttribute(new Float32Array(a.nrm), 3));
      g.setAttribute('uv', new BufferAttribute(new Float32Array(a.uv), 2));
      g.computeBoundingSphere();
      return g;
    };
    this.group.add(new Mesh(mk(boards), new MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.1, side: DoubleSide })));
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
