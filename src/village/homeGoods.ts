/**
 * YOUR SHACK, AND THE SHOPS THAT FURNISH IT.
 *
 * The hut on the beach with HOME over the door (S1) is yours. Four of the village's shops sell
 * things for it — the BUILDER furniture, the FLORIST plants, the TAXIDERMIST trophy fish on
 * plaques, the PAWN SHOP curios. Each shop has its goods on a counter and a board behind it:
 * point at BUY and it's paid for out of your wallet and delivered — it's standing in its own
 * spot in your shack straight away, and every time you come back (the save's `home` list,
 * local and in the cloud save).
 *
 * Every thing is built here from a few primitives in the room's frame (x across the facade, +z
 * out of the front, y = 0 on the floor), in the casino's materials (casino/look.ts: lit by a
 * small studio environment, so they read under the room's lamp at any hour). Its spot in the
 * shack keeps the doorway and the middle of the floor clear; the big pieces are furniture you
 * can't teleport into.
 */

import {
  BoxGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  type Material,
  type Object3D,
  type WebGLRenderer,
} from 'three';
import { uiDeny, winFanfare } from '../audio/sfx.ts';
import { look } from '../casino/look.ts';
import type { Props } from '../fishing/props.ts';
import type { GameState } from '../fishing/tidewater.ts';
import { font } from '../ui/fonts.ts';
import { INK, roundRect } from '../ui/panel.ts';
import { InteractivePanel, register } from '../ui/pointer.ts';
import type { BoxCollider } from '../world/data.ts';
import { ROLES } from './roles.ts';
import { shopCounter, type HomeShop, type Interior } from './interiors.ts';

export { HOME, HOME_SHOPS } from './interiors.ts';

interface Kit {
  renderer: WebGLRenderer;
  props: Props;
}

interface HomeItem {
  id: string;
  shop: HomeShop;
  name: string;
  blurb: string;
  price: number;
  /** where it stands in the shack: room frame x, y, z and its turn about y */
  at: [number, number, number, number];
  /** a piece you can't stand in: its footprint (half-width, half-depth, before the turn) and height */
  solid?: [number, number, number];
  build(k: Kit): Object3D;
}

/* ── making things ─────────────────────────────────────────────────────── */

const mats = new Map<string, Material>();
function mat(k: Kit, kind: 'satin' | 'gloss' | 'gold', colour: string): Material {
  const key = `${kind}:${colour}`;
  let m = mats.get(key);
  if (!m) mats.set(key, (m = kind === 'gold' ? look.gold(k.renderer) : look[kind](k.renderer, colour)));
  return m;
}

function box(k: Kit, colour: string, w: number, h: number, d: number, x = 0, y = 0, z = 0, kind: 'satin' | 'gloss' = 'satin'): Mesh {
  const m = new Mesh(new BoxGeometry(w, h, d), mat(k, kind, colour));
  m.position.set(x, y, z);
  return m;
}

function cyl(k: Kit, colour: string, r0: number, r1: number, h: number, x = 0, y = 0, z = 0, seg = 14): Mesh {
  const m = new Mesh(new CylinderGeometry(r0, r1, h, seg), mat(k, 'satin', colour));
  m.position.set(x, y, z);
  return m;
}

function ball(k: Kit, colour: string, r: number, x: number, y: number, z: number, kind: 'satin' | 'gloss' = 'satin'): Mesh {
  const m = new Mesh(new SphereGeometry(r, 12, 8), mat(k, kind, colour));
  m.position.set(x, y, z);
  return m;
}

function painted(w: number, h: number, paint: (g: CanvasRenderingContext2D, w: number, h: number) => void): MeshStandardMaterial {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!, w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return new MeshStandardMaterial({ map: t, roughness: 0.8, metalness: 0 });
}

/** four legs under a top of w × d at height h */
function legs(k: Kit, g: Group, colour: string, w: number, d: number, h: number, t = 0.05): void {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(k, colour, t, h, t, sx * (w / 2 - t), h / 2, sz * (d / 2 - t)));
}

/** a leaf blade: a flattened cone laid out from the origin along `az`, drooping */
function leaf(k: Kit, colour: string, len: number, w: number, az: number, rise: number): Mesh {
  const m = new Mesh(new ConeGeometry(w, len, 4).translate(0, len / 2, 0).scale(1, 1, 0.18), mat(k, 'satin', colour));
  m.rotation.set(0, az, 0, 'YXZ');
  m.rotateX(Math.PI / 2 - rise);
  return m;
}

/** a trophy: the fish itself (Tidewater's model) on a shield-shaped plaque, flank out of the wall */
function mount(k: Kit, species: string, len: number): Group {
  const g = new Group();
  const plaque = new Mesh(new CylinderGeometry(len * 0.36, len * 0.36, 0.035, 24).rotateX(Math.PI / 2).scale(1.35, 0.75, 1), mat(k, 'gloss', '#5a3a22'));
  plaque.position.z = 0.018;
  const rim = new Mesh(new TorusGeometry(len * 0.36, 0.012, 6, 32).scale(1.35, 0.75, 1), mat(k, 'gold', ''));
  rim.position.z = 0.036;
  const { mesh, uniforms } = k.props.makeFish(species);
  uniforms.uSwim.value = 0; // stuffed, not swimming
  // fish-local: x its flank, y its back, z its snout (unit length): flank out of the wall, back up
  const N = new Vector3(0, 0, 1);
  const UP = new Vector3(0, 1, 0);
  const S = new Vector3().crossVectors(N, UP);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(new Matrix4().makeBasis(N, UP, S).scale(new Vector3(len, len, len)).setPosition(0, 0, 0.09));
  g.add(plaque, rim, mesh);
  return g;
}

/* ── the catalogue ─────────────────────────────────────────────────────── */

const WOOD = '#8a5a34';
const DARK = '#4a2e1a';

export const GOODS: HomeItem[] = [
  // ── the builder: furniture ──
  {
    id: 'bed',
    shop: 'F',
    name: 'Driftwood bed',
    blurb: 'a proper night’s sleep',
    price: 400,
    at: [-1.28, 0, -0.9, 0],
    solid: [0.5, 1.0, 0.6],
    build(k) {
      const g = new Group();
      g.add(box(k, WOOD, 0.95, 0.28, 1.95, 0, 0.2, 0));
      g.add(box(k, '#efe8da', 0.88, 0.16, 1.85, 0, 0.42, 0));
      g.add(box(k, '#2f6fa8', 0.92, 0.06, 1.15, 0, 0.52, 0.38));
      g.add(box(k, '#ffffff', 0.6, 0.1, 0.34, 0, 0.55, -0.7));
      g.add(box(k, DARK, 0.95, 0.85, 0.07, 0, 0.42, -0.96));
      legs(k, g, DARK, 0.95, 1.95, 0.08, 0.07);
      return g;
    },
  },
  {
    id: 'table',
    shop: 'F',
    name: 'Table & two chairs',
    blurb: 'for when Coral comes round',
    price: 260,
    at: [1.12, 0, -0.55, 0],
    solid: [0.55, 0.75, 0.75],
    build(k) {
      const g = new Group();
      g.add(box(k, WOOD, 0.9, 0.05, 0.7, 0, 0.74, 0));
      legs(k, g, WOOD, 0.9, 0.7, 0.72);
      for (const sz of [-1, 1]) {
        const c = new Group();
        c.add(box(k, DARK, 0.42, 0.04, 0.42, 0, 0.45, 0));
        legs(k, c, DARK, 0.42, 0.42, 0.44, 0.035);
        c.add(box(k, DARK, 0.42, 0.45, 0.04, 0, 0.68, -0.19));
        c.position.set(0, 0, sz * 0.62);
        c.rotation.y = sz > 0 ? Math.PI : 0;
        g.add(c);
      }
      return g;
    },
  },
  {
    id: 'rug',
    shop: 'F',
    name: 'Woven rug',
    blurb: 'sand stays outside',
    price: 90,
    at: [-0.05, 0.016, 0.1, 0],
    build() {
      const m = new Mesh(
        new PlaneGeometry(1.5, 1.05).rotateX(-Math.PI / 2),
        painted(512, 360, (g, w, h) => {
          const bands = ['#c23b2e', '#e8c170', '#2f6fa8', '#f4ead6', '#3f7f55'];
          for (let i = 0; i < 18; i++) {
            g.fillStyle = bands[i % bands.length];
            g.fillRect(0, (i * h) / 18, w, h / 18 + 1);
          }
          g.strokeStyle = '#3a2618';
          g.lineWidth = 16;
          g.strokeRect(8, 8, w - 16, h - 16);
        }),
      );
      return m;
    },
  },
  {
    id: 'shelf',
    shop: 'F',
    name: 'Bookshelf',
    blurb: 'tide tables and paperbacks',
    price: 220,
    at: [0.22, 0, -1.73, 0],
    solid: [0.46, 0.16, 1.7],
    build(k) {
      const g = new Group();
      g.add(box(k, WOOD, 0.9, 1.7, 0.04, 0, 0.85, -0.13));
      for (const sx of [-1, 1]) g.add(box(k, WOOD, 0.04, 1.7, 0.3, sx * 0.43, 0.85, 0));
      const colours = ['#c23b2e', '#2f6fa8', '#e8c170', '#3f7f55', '#8a5ac2', '#f4ead6', '#d8508a'];
      let n = 0;
      for (let s = 0; s < 4; s++) {
        const y = 0.06 + s * 0.42;
        g.add(box(k, WOOD, 0.86, 0.03, 0.28, 0, y, 0));
        let x = -0.4;
        while (x < 0.36) {
          const w = 0.035 + ((n * 37) % 5) * 0.008;
          const h = 0.24 + ((n * 53) % 4) * 0.03;
          g.add(box(k, colours[n % colours.length], w, h, 0.2, x + w / 2, y + 0.015 + h / 2, 0.02));
          x += w + 0.006;
          n++;
        }
      }
      return g;
    },
  },

  // ── the florist: plants ──
  {
    id: 'palm',
    shop: 'D',
    name: 'Potted palm',
    blurb: 'a bit of the island indoors',
    price: 60,
    at: [1.5, 0, 1.45, 0],
    build(k) {
      const g = new Group();
      g.add(cyl(k, '#b8643a', 0.2, 0.15, 0.36, 0, 0.18, 0));
      g.add(cyl(k, '#6a4a2a', 0.035, 0.05, 1.0, 0, 0.8, 0, 7));
      const crown = new Group();
      crown.position.y = 1.28;
      for (let i = 0; i < 9; i++) crown.add(leaf(k, i % 2 ? '#3f8a3a' : '#2f7a30', 0.7, 0.09, (i / 9) * Math.PI * 2, 0.35));
      g.add(crown);
      return g;
    },
  },
  {
    id: 'flowers',
    shop: 'D',
    name: 'Hibiscus on a stand',
    blurb: 'fresh every morning',
    price: 45,
    at: [-1.48, 0, 1.48, 0],
    build(k) {
      const g = new Group();
      g.add(cyl(k, DARK, 0.2, 0.2, 0.04, 0, 0.7, 0));
      g.add(cyl(k, DARK, 0.03, 0.05, 0.7, 0, 0.35, 0, 8));
      g.add(cyl(k, '#2f6fa8', 0.09, 0.07, 0.24, 0, 0.84, 0));
      const blooms = ['#e8506a', '#ff8a3a', '#ffd84a', '#d8508a'];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const r = 0.08 + (i % 2) * 0.05;
        g.add(ball(k, blooms[i % blooms.length], 0.05, Math.cos(a) * r, 1.06 + (i % 3) * 0.05, Math.sin(a) * r, 'gloss'));
        g.add(leaf(k, '#2f7a30', 0.18, 0.04, a, 0.9).translateY(0.95));
      }
      return g;
    },
  },
  {
    id: 'fern',
    shop: 'D',
    name: 'Hanging fern',
    blurb: 'loves the sea air',
    price: 55,
    at: [-0.95, 1.95, 1.25, 0],
    build(k) {
      const g = new Group();
      g.add(cyl(k, '#c8a878', 0.01, 0.01, 0.6, 0, 0.35, 0, 4)); // the cord
      const basket = new Mesh(new SphereGeometry(0.17, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(k, 'satin', '#8a6a3a'));
      g.add(basket);
      for (let i = 0; i < 12; i++) g.add(leaf(k, i % 2 ? '#4a9a3a' : '#3a8a34', 0.42, 0.05, (i / 12) * Math.PI * 2, -0.5));
      return g;
    },
  },
  {
    id: 'orchid',
    shop: 'D',
    name: 'Orchid',
    blurb: 'Coral’s favourite',
    price: 75,
    at: [1.58, 0, 0.55, 0],
    build(k) {
      const g = new Group();
      g.add(cyl(k, '#f4ead6', 0.1, 0.08, 0.2, 0, 0.1, 0));
      g.add(cyl(k, '#3f7f55', 0.006, 0.006, 0.6, 0, 0.5, 0, 4));
      for (let i = 0; i < 6; i++) g.add(ball(k, '#e87ab8', 0.035, 0.03 + i * 0.03, 0.62 + i * 0.045, 0, 'gloss'));
      for (const a of [0.4, 2.2, 4.1]) g.add(leaf(k, '#2f6a30', 0.2, 0.05, a, 1.2).translateY(0.2));
      return g;
    },
  },

  // ── the taxidermist: trophies ──
  {
    id: 'tarpon',
    shop: 'K',
    name: 'Tarpon on a plaque',
    blurb: 'the silver king, over the bed',
    price: 600,
    at: [-0.55, 1.75, -1.9, 0],
    build: (k) => mount(k, 'tarpon', 1.25),
  },
  {
    id: 'mahi',
    shop: 'K',
    name: 'Mahi-mahi on a plaque',
    blurb: 'all the colours of the sea',
    price: 320,
    at: [1.81, 1.7, 0.45, -Math.PI / 2],
    build: (k) => mount(k, 'mahi', 0.85),
  },
  {
    id: 'snapper',
    shop: 'K',
    name: 'Red snapper on a plaque',
    blurb: 'your first good one',
    price: 150,
    at: [-1.81, 1.7, 0.65, Math.PI / 2],
    build: (k) => mount(k, 'redSnapper', 0.6),
  },

  // ── the pawn shop: curios ──
  {
    id: 'bottle',
    shop: 'J',
    name: 'Ship in a bottle',
    blurb: 'on an old rum barrel',
    price: 140,
    at: [-1.52, 0, 0.42, 0],
    solid: [0.24, 0.24, 0.6],
    build(k) {
      const g = new Group();
      g.add(cyl(k, '#7a5030', 0.22, 0.2, 0.6, 0, 0.3, 0));
      for (const y of [0.1, 0.5]) g.add(new Mesh(new TorusGeometry(0.215, 0.012, 6, 20).rotateX(Math.PI / 2), mat(k, 'satin', '#3a3a3a')).translateY(y));
      const glass = new Mesh(new CylinderGeometry(0.07, 0.07, 0.34, 16).rotateZ(Math.PI / 2), new MeshStandardMaterial({ color: 0xbfe8e0, transparent: true, opacity: 0.35, roughness: 0.05 }));
      glass.position.y = 0.68;
      g.add(glass);
      g.add(cyl(k, '#6a4a2a', 0.025, 0.025, 0.06, 0.2, 0.68, 0).rotateZ(Math.PI / 2));
      g.add(box(k, DARK, 0.18, 0.03, 0.05, 0, 0.64, 0));
      g.add(box(k, '#f4ead6', 0.08, 0.08, 0.004, 0.01, 0.7, 0));
      g.add(cyl(k, DARK, 0.004, 0.004, 0.11, 0, 0.7, 0, 4));
      return g;
    },
  },
  {
    id: 'globe',
    shop: 'J',
    name: 'Old globe',
    blurb: 'the island isn’t on it',
    price: 180,
    at: [0.85, 0, 0.95, 0.4],
    solid: [0.2, 0.2, 1.1],
    build(k) {
      const g = new Group();
      g.add(cyl(k, DARK, 0.18, 0.2, 0.04, 0, 0.02, 0));
      g.add(cyl(k, DARK, 0.025, 0.03, 0.75, 0, 0.4, 0, 8));
      const sphere = new Mesh(
        new SphereGeometry(0.2, 24, 16),
        painted(512, 256, (c, w, h) => {
          c.fillStyle = '#c8b27a';
          c.fillRect(0, 0, w, h);
          c.fillStyle = '#7a8a4a';
          let s = 7;
          const r = (): number => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
          for (let i = 0; i < 14; i++) {
            c.beginPath();
            c.ellipse(r() * w, h * 0.2 + r() * h * 0.6, 20 + r() * 50, 12 + r() * 30, r() * 3, 0, Math.PI * 2);
            c.fill();
          }
          c.strokeStyle = 'rgba(60,40,20,0.35)';
          for (let i = 1; i < 8; i++) c.strokeRect(-1, (i * h) / 8, w + 2, 0);
        }),
      );
      sphere.position.y = 0.98;
      sphere.rotation.z = 0.41;
      const ring = new Mesh(new TorusGeometry(0.23, 0.01, 6, 32), mat(k, 'gold', ''));
      ring.position.y = 0.98;
      ring.rotation.z = 0.41;
      g.add(sphere, ring);
      return g;
    },
  },
  {
    id: 'painting',
    shop: 'J',
    name: 'Painting of the bay',
    blurb: 'signed, illegibly',
    price: 210,
    at: [1.81, 1.55, -1.25, -Math.PI / 2],
    build(k) {
      const g = new Group();
      g.add(box(k, '#c8a040', 0.86, 0.62, 0.04, 0, 0, 0.02, 'gloss'));
      const canvas = new Mesh(
        new PlaneGeometry(0.76, 0.52),
        painted(512, 350, (c, w, h) => {
          const sky = c.createLinearGradient(0, 0, 0, h * 0.55);
          sky.addColorStop(0, '#f28a5a');
          sky.addColorStop(1, '#ffd08a');
          c.fillStyle = sky;
          c.fillRect(0, 0, w, h * 0.55);
          c.fillStyle = '#ffe8a0';
          c.beginPath();
          c.arc(w * 0.62, h * 0.5, 34, 0, Math.PI * 2);
          c.fill();
          const sea = c.createLinearGradient(0, h * 0.55, 0, h);
          sea.addColorStop(0, '#2f7aa8');
          sea.addColorStop(1, '#154060');
          c.fillStyle = sea;
          c.fillRect(0, h * 0.55, w, h * 0.45);
          c.fillStyle = '#3a2a1a';
          c.fillRect(w * 0.08, h * 0.62, w * 0.36, 8); // the pier
          for (let i = 0; i < 6; i++) c.fillRect(w * 0.1 + i * w * 0.06, h * 0.62, 4, 26);
          c.strokeStyle = 'rgba(255,230,180,0.6)';
          c.lineWidth = 3;
          for (let i = 0; i < 9; i++) c.strokeRect(w * 0.55 + (i % 3) * 18, h * 0.6 + i * 12, 30, 0);
        }),
      );
      canvas.position.z = 0.045;
      g.add(canvas);
      return g;
    },
  },
];

/* ── the shack ─────────────────────────────────────────────────────────── */

export class Shack {
  private readonly placed = new Set<string>();

  constructor(
    private readonly room: Interior,
    private readonly state: GameState,
    private readonly kit: Kit,
    private readonly addCollider: (b: BoxCollider) => void,
  ) {
    this.sync();
    state.onChange(() => this.sync());
  }

  /** Everything you own is in its spot (and the big pieces can't be stood in). */
  sync(): void {
    for (const id of this.state.home) {
      if (this.placed.has(id)) continue;
      const item = GOODS.find((g) => g.id === id);
      if (!item) continue;
      this.placed.add(id);
      const o = item.build(this.kit);
      const [x, y, z, ry] = item.at;
      o.position.set(x, y, z);
      o.rotation.y = ry;
      this.room.contents.add(o);
      if (item.solid) {
        const [hx, hz, top] = item.solid;
        const p = this.room.toWorld(x, 0, z);
        const f = this.room.frame;
        this.addCollider({ tag: 'furniture', walkable: false, solid: true, cx: p.x, cz: p.z, hx, hz, rotY: f.yaw + ry, top: f.floorY + top, bottom: f.floorY - 0.2 });
      }
    }
  }
}

/* ── the shops ─────────────────────────────────────────────────────────── */

const BW = 1200;
const BH = 700;

export class HomeShopCounter {
  private readonly board: InteractivePanel;
  private readonly goods: HomeItem[];
  private note = '';
  private noteColour: string = INK.dim;

  constructor(
    room: Interior,
    private readonly state: GameState,
    kit: Kit,
  ) {
    const shop = room.name as HomeShop;
    this.goods = GOODS.filter((g) => g.shop === shop);
    const [cx, cz, hx, hz, top] = shopCounter(room.d);

    // the counter, and the goods standing on it (the big ones as a maker's model)
    const counter = new Group();
    counter.add(box(kit, '#6a4428', hx * 2, top, hz * 2, 0, top / 2, 0));
    counter.add(box(kit, '#4a2e1a', hx * 2 + 0.08, 0.05, hz * 2 + 0.08, 0, top + 0.025, 0, 'gloss'));
    counter.position.set(cx, 0, cz);
    room.contents.add(counter);
    const n = this.goods.length;
    this.goods.forEach((g, i) => {
      const o = g.build(kit);
      // fit it in a 0.5 m cube, standing on the counter (wall pieces lean back on a little easel)
      const wall = g.at[1] > 1;
      const s = wall ? 0.42 : scaleToFit(o, 0.5);
      o.scale.setScalar(s);
      const x = cx - hx + ((i + 0.5) * hx * 2) / n;
      o.position.set(x, top + 0.05 + (wall ? 0.28 : 0), cz + (wall ? -0.1 : 0));
      if (wall) o.rotation.x = -0.2;
      room.contents.add(o);
    });

    // the board behind: what they sell, what it costs, BUY
    this.board = new InteractivePanel([BW, BH], [1.6, (1.6 * BH) / BW]);
    this.board.mesh.position.set(cx, top + 1.05, -room.d / 2 + 0.02);
    room.contents.add(this.board.mesh);
    this.board.paint = () => this.paint();
    this.board.onClick = (id) => this.click(id);
    this.board.repaintOnFonts(() => this.paint());
    register(this.board);
    state.onChange(() => this.paint());
    this.paint();
  }

  click(id: string): void {
    const item = this.goods.find((g) => `buy:${g.id}` === id);
    if (!item || this.state.home.includes(item.id)) return;
    if (this.state.money < item.price) {
      uiDeny();
      this.note = `You need $${Math.ceil(item.price - this.state.money)} more for the ${item.name.toLowerCase()}.`;
      this.noteColour = INK.danger;
      this.paint();
      return;
    }
    // home first: spend() saves and tells everyone (the shack, the wallet, this board)
    this.state.home.push(item.id);
    if (!this.state.spend(item.price)) {
      this.state.home.pop();
      return;
    }
    winFanfare(1);
    this.note = `Sold! The ${item.name.toLowerCase()} is on its way to your shack on the beach.`;
    this.noteColour = INK.good;
    this.paint();
  }

  private paint(): void {
    const b = this.board;
    const c = b.ctx;
    const role = ROLES[this.goods[0]?.shop ?? 'F'];
    b.clear();
    roundRect(c, 6, 6, BW - 12, BH - 12, 26);
    c.fillStyle = 'rgba(24, 18, 12, 0.94)';
    c.fill();
    c.lineWidth = 6;
    c.strokeStyle = role?.colour ?? '#b89a72';
    c.stroke();
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    c.font = font(700, 54);
    c.fillStyle = '#f6ecd4';
    c.fillText(role?.title ?? 'SHOP', 40, 76);
    c.font = font(600, 28);
    c.fillStyle = INK.dim;
    c.fillText('for your shack on the beach  ·  delivered straight away', 40, 116);
    c.textAlign = 'right';
    c.font = font(700, 36);
    c.fillStyle = INK.amber;
    c.fillText(`wallet $${Math.floor(this.state.money).toLocaleString('en-US')}`, BW - 40, 76);

    const buttons: { id: string; x: number; y: number; w: number; h: number; enabled?: boolean }[] = [];
    const rowH = 118;
    this.goods.forEach((g, i) => {
      const y = 146 + i * rowH;
      const owned = this.state.home.includes(g.id);
      c.textAlign = 'left';
      c.font = font(700, 40);
      c.fillStyle = owned ? INK.dim : INK.hot;
      c.fillText(g.name, 40, y + 44, 640);
      c.font = font(500, 26);
      c.fillStyle = INK.dim;
      c.fillText(g.blurb, 40, y + 82, 640);
      c.textAlign = 'right';
      c.font = font(700, 40);
      c.fillStyle = owned ? INK.dim : INK.amber;
      c.fillText(`$${g.price}`, 880, y + 62);
      const bx = 910;
      const bw = 250;
      const bh = 84;
      const id = `buy:${g.id}`;
      if (!owned) buttons.push({ id, x: bx, y: y + 12, w: bw, h: bh });
      roundRect(c, bx, y + 12, bw, bh, 16);
      const afford = this.state.money >= g.price;
      c.fillStyle = owned ? 'rgba(63, 214, 106, 0.18)' : b.hover === id ? '#ffc640' : afford ? INK.amber : 'rgba(255,255,255,0.1)';
      c.fill();
      c.textAlign = 'center';
      c.font = font(700, 36);
      c.fillStyle = owned ? INK.good : afford ? '#1a1206' : INK.dim;
      c.fillText(owned ? 'AT HOME ✓' : 'BUY', bx + bw / 2, y + 66);
    });
    b.buttons = buttons;
    if (this.note) {
      c.textAlign = 'left';
      c.font = font(600, 28);
      c.fillStyle = this.noteColour;
      c.fillText(this.note, 40, BH - 36, BW - 80);
    }
    b.commit();
  }
}

/** the scale that fits an object's bounds in a cube of side `size` (never enlarges) */
function scaleToFit(o: Object3D, size: number): number {
  o.updateMatrixWorld(true);
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  const v = new Vector3();
  o.traverse((m) => {
    const g = (m as Mesh).geometry;
    if (!g) return;
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
      v.set(x, y, z).applyMatrix4(m.matrixWorld);
      min.min(v);
      max.max(v);
    }
  });
  const ext = Math.max(max.x - min.x, max.y - min.y, max.z - min.z);
  return ext > size ? size / ext : 1;
}
