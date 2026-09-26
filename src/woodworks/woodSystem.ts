/**
 * THE WOODWORKS: an axe, a woodlot, a timber yard, and the walks you build with the wood.
 *
 *  TIMBER YARD   an open stall on the beach west of the pier foot: logs stacked either side, a
 *                chopping block with an axe standing in it, a board on the counter. It sells the
 *                AXE, and wood by the bundle (10) or the cart (50) for when you'd rather not chop.
 *  WOODLOT       six tropical almond trees on the sand behind it. Own the axe and walk up to them:
 *                the rod goes over your shoulder and the axe is in your hand. Swing it into a
 *                trunk: a deep knock, a spray of chips, a jolt in your hand, the crown shivering.
 *                Four good blows and it creaks, leans and crashes down away from you; its logs fly
 *                into your backpack (+4). A sapling comes up from the stump a minute later and
 *                grows back.
 *  THE WALKS     your logs go into the build crates on the pier head (woodworks/walks.ts): the reef
 *                walk, then the deep walk.
 *
 * Wood, the axe and the walks ride in the save (GameState.woodworks).
 */

import { createSystem } from '@iwsdk/core';
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  MeshBasicMaterial,
  SRGBColorSpace,
  Vector3,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { chopThunk, logThunk, treeCrash, treeCreak, uiDeny, winFanfare } from '../audio/sfx.ts';
import { Celebration } from '../casino/celebrate.ts';
import { Toast } from '../fishing/hud.ts';
import type { GameState } from '../fishing/tidewater.ts';
import { introActive } from '../experience/introGate.ts';
import { pulseHand } from '../input/haptics.ts';
import { font, onFontsReady } from '../ui/fonts.ts';
import { INK, roundRect } from '../ui/panel.ts';
import { InteractivePanel, register } from '../ui/pointer.ts';
import type { BoxCollider } from '../world/data.ts';
import { Walks } from './walks.ts';

/** what the timber yard charges */
export const PRICES = { axe: 120, bundle: 40, cart: 180 };
/** logs a felled tree gives, blows to fell one, seconds before its sapling comes up */
const LOGS_PER_TREE = 4;
const BLOWS = 4;
const REGROW_S = 60;

/** the timber yard (its counter's front faces +x) and the woodlot's trees (x, z) */
export const YARD: [number, number] = [26, -61];
const TREES: [number, number][] = [
  [4, -61],
  [9.5, -57],
  [14, -63],
  [6, -67],
  [12, -69],
  [18, -56.5],
];

export const woodView: {
  /** the axe is in your hand (the rod goes away while it is) */
  axeOut: boolean;
  /** dev: fell the nearest tree */
  fell?: () => void;
  /** how far each walk is built (0..1): the field guide's chart */
  walks?: () => Record<string, number>;
  /** dev */
  system?: WoodSystem;
} = { axeOut: false };

export const woodDeps: {
  state: GameState | null;
  ground: ((x: number, z: number) => number) | null;
  addBox: ((b: BoxCollider) => void) | null;
  env: Texture | null;
  /** are you indoors, or is the backpack open (the axe stays away) */
  busy: (() => boolean) | null;
} = { state: null, ground: null, addBox: null, env: null, busy: null };

const _v = new Vector3();
const _w = new Vector3();
const UP = new Vector3(0, 1, 0);

function rand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** A piece in one flat colour, faceted (the island's low-poly look). */
function coloured(g: BufferGeometry, colour: Color, jitter = 0, r: () => number = Math.random): BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const n = geo.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    const k = 1 + (r() - 0.5) * jitter;
    for (let j = 0; j < 3 && i + j < n; j++) c.set([colour.r * k, colour.g * k, colour.b * k], (i + j) * 3);
  }
  geo.setAttribute('color', new Float32BufferAttribute(c, 3));
  geo.deleteAttribute('uv');
  geo.computeVertexNormals();
  return geo;
}

/** A tropical almond: a leaning grey-brown trunk, two limbs, a broad flat crown of leaf clumps. */
function treeGeometry(seed: number): { tree: BufferGeometry; stump: BufferGeometry } {
  const r = rand(seed);
  const bark = new Color(0x6e5a48);
  const parts: BufferGeometry[] = [];
  // the trunk, from the cut (0.35 m) up, bending a little
  const trunk = new CylinderGeometry(0.13, 0.19, 3.0, 9, 6);
  const lean = 0.25 + r() * 0.2;
  const pos = trunk.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + 1.5;
    pos.setX(i, pos.getX(i) + lean * (y / 3) ** 2);
  }
  trunk.translate(0, 1.5, 0);
  parts.push(coloured(trunk, bark, 0.18, r));
  // the limbs
  for (const [a, h] of [
    [0.6 + r() * 0.5, 2.0],
    [-0.5 - r() * 0.5, 2.3],
  ]) {
    const limb = new CylinderGeometry(0.06, 0.1, 1.5, 7);
    limb.translate(0, 0.75, 0);
    limb.applyMatrix4(new Matrix4().makeRotationZ(a));
    limb.translate(lean * 0.4, h, 0);
    parts.push(coloured(limb, bark, 0.18, r));
  }
  // the crown: flattened clumps in the almond's greens, a few leaves turning red
  const greens = [0x3f7a34, 0x4f8f3a, 0x2f6a2c, 0x5a9a3e];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r();
    const d = i === 0 ? 0 : 0.9 + r() * 0.8;
    const blob = new IcosahedronGeometry(0.75 + r() * 0.45, 1);
    const bp = blob.getAttribute('position');
    // one lump per corner (the faces share corners as copies: key the lump on where it is)
    const lumps = new Map<string, number>();
    for (let k = 0; k < bp.count; k++) {
      const key = `${bp.getX(k).toFixed(3)},${bp.getY(k).toFixed(3)},${bp.getZ(k).toFixed(3)}`;
      let s = lumps.get(key);
      if (s === undefined) lumps.set(key, (s = 0.84 + r() * 0.3));
      bp.setXYZ(k, bp.getX(k) * s, bp.getY(k) * s * 0.55, bp.getZ(k) * s);
    }
    blob.translate(lean + Math.cos(a) * d, 3.1 + r() * 0.5 - d * 0.15, Math.sin(a) * d);
    const col = new Color(r() < 0.12 ? 0xa84a2a : greens[Math.floor(r() * greens.length)]);
    parts.push(coloured(blob, col, 0.22, r));
  }
  const tree = mergeGeometries(parts, false)!;
  // the stump, left standing: bark round the side, the pale cut on top
  const side = new CylinderGeometry(0.2, 0.23, 0.36, 9, 1, true);
  side.translate(0, 0.18, 0);
  const cut = new CylinderGeometry(0.2, 0.2, 0.02, 9);
  cut.translate(0, 0.35, 0);
  const stump = mergeGeometries([coloured(side, bark, 0.15, r), coloured(cut, new Color(0xd8b88a), 0.05, r)], false)!;
  return { tree, stump };
}

interface Tree {
  base: Vector3;
  pivot: Group;
  tree: Mesh;
  blows: number;
  /** falling: seconds since the last blow, and which way it goes */
  fall: number;
  axis: Vector3;
  shiver: number;
  /** down: seconds until the sapling; growing: 0..1 */
  down: number;
  grow: number;
  cooldown: number;
}

export class WoodSystem extends createSystem({}) {
  private trees: Tree[] = [];
  private walks!: Walks;
  private axe!: Group;
  private readonly blade = new Vector3();
  private readonly lastBlade = new Vector3();
  private bladeSpeed = 0;
  private toast!: Toast;
  private party!: Celebration;
  private chips!: InstancedMesh;
  private chipList: { p: Vector3; v: Vector3; age: number }[] = [];
  private flying: { mesh: Mesh; t: number; from: Vector3 }[] = [];
  private readonly logGeo = new CylinderGeometry(0.08, 0.09, 0.6, 8).rotateZ(Math.PI / 2);
  private readonly logMat = new MeshLambertMaterial({ color: 0x8a6440 });
  private board!: InteractivePanel;
  private yardAxe!: Object3D;
  private ready = false;

  init(): void {
    const d = woodDeps;
    if (!d.state || !d.ground || !d.addBox) return;
    this.ready = true;
    const ground = d.ground;
    const mat = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    TREES.forEach(([x, z], i) => {
      const { tree, stump } = treeGeometry(i * 131 + 7);
      const base = new Vector3(x, ground(x, z), z);
      const s = new Mesh(stump, mat);
      s.position.copy(base);
      this.scene.add(s);
      const pivot = new Group();
      pivot.position.copy(base).y += 0.35;
      pivot.rotation.y = i * 1.7;
      const t = new Mesh(tree, mat);
      t.position.y = -0.35;
      pivot.add(t);
      this.scene.add(pivot);
      this.trees.push({ base, pivot, tree: t, blows: 0, fall: -1, axis: new Vector3(1, 0, 0), shiver: 0, down: 0, grow: 1, cooldown: 0 });
      d.addBox!({ tag: 'tree', walkable: false, solid: true, cx: x, cz: z, hx: 0.2, hz: 0.2, rotY: 0, top: base.y + 0.4, bottom: base.y - 1 });
    });
    this.buildYard(ground, d.addBox);
    this.axe = this.buildAxe(d.env);
    this.axe.visible = false;
    this.scene.add(this.axe);
    this.toast = new Toast();
    this.toast.panel.mesh.visible = false;
    this.scene.add(this.toast.panel.mesh);
    this.party = new Celebration(this.scene, (x, z) => Math.max(0, ground(x, z)), () => this.renderer.xr.getSession());
    this.chips = new InstancedMesh(new BoxGeometry(0.03, 0.012, 0.02), new MeshLambertMaterial({ color: 0xd8b88a }), 60);
    this.chips.count = 0;
    this.chips.frustumCulled = false;
    this.scene.add(this.chips);
    this.walks = new Walks({
      state: d.state,
      ground,
      addBox: d.addBox,
      onFinished: (w, at) => {
        winFanfare(30);
        this.party.win({ at, tier: 3, banner: w.id === 'reef' ? 'REEF WALK OPEN!' : 'DEEP WALK OPEN!', bannerAt: at.clone().add(new Vector3(0, 1.6, 0)), scale: 2.5 });
        this.toast.show(w.id === 'reef' ? 'The reef walk is finished! Fish the reef from its end.' : 'The deep walk is finished! 14 m of water off its end.', 5, INK.good);
      },
    });
    this.scene.add(this.walks.group);
    woodView.walks = () => this.walks.progress();
    woodView.system = this;
    woodView.fell = () => {
      const t = this.nearestTree(this.player.head.getWorldPosition(_v));
      if (t) for (let i = 0; i < BLOWS; i++) this.blow(t.t, t.t.base.clone().setY(t.t.base.y + 1.2), 'right', true);
    };
    d.state.onChange(() => this.paintBoard());
  }

  private nearestTree(p: Vector3): { t: Tree; d: number } | null {
    let best: { t: Tree; d: number } | null = null;
    for (const t of this.trees) {
      const d = Math.hypot(t.base.x - p.x, t.base.z - p.z);
      if (!best || d < best.d) best = { t, d };
    }
    return best;
  }

  /* ── the axe ───────────────────────────────────────────────────────── */

  private buildAxe(env: Texture | null): Group {
    const g = new Group();
    const hickory = new MeshStandardMaterial({ color: 0xb08a58, roughness: 0.6, envMap: env, envMapIntensity: 0.6 });
    const wrap = new MeshStandardMaterial({ color: 0x3a2418, roughness: 0.9 });
    const steel = new MeshStandardMaterial({ color: 0x6a6e74, roughness: 0.35, metalness: 0.9, envMap: env, envMapIntensity: 1.2 });
    const edge = new MeshStandardMaterial({ color: 0xe8ecf0, roughness: 0.15, metalness: 1, envMap: env, envMapIntensity: 1.6 });
    // the handle runs forward from your fist (grip space: −z ahead, +y up), the head at its end
    const handle = new Mesh(new CylinderGeometry(0.016, 0.02, 0.66, 10).rotateX(Math.PI / 2), hickory);
    handle.position.z = -0.21;
    const grip = new Mesh(new CylinderGeometry(0.022, 0.022, 0.16, 10).rotateX(Math.PI / 2), wrap);
    grip.position.z = 0.03;
    // the head: a wedge of steel, the edge down, the poll up
    const shape = new BufferGeometry();
    const hw = 0.016; // half thickness at the eye
    const P = [
      // eye end (top), front/back faces taper to the edge (bottom)
      [-hw, 0.05, -0.04], [hw, 0.05, -0.04], [hw, 0.05, 0.04], [-hw, 0.05, 0.04],
      [-0.003, -0.11, -0.075], [0.003, -0.11, -0.075], [0.003, -0.11, 0.075], [-0.003, -0.11, 0.075],
    ];
    const F = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0];
    const pos: number[] = [];
    for (const i of F) pos.push(...P[i]);
    shape.setAttribute('position', new Float32BufferAttribute(pos, 3));
    shape.computeVertexNormals();
    const head = new Mesh(shape, steel);
    head.position.z = -0.5;
    const bevel = new Mesh(new BoxGeometry(0.008, 0.012, 0.15), edge);
    bevel.position.set(0, -0.107, -0.5);
    const poll = new Mesh(new BoxGeometry(0.036, 0.04, 0.07), steel);
    poll.position.set(0, 0.07, -0.5);
    g.add(handle, grip, head, bevel, poll);
    return g;
  }

  /** a blow landed on a tree at `at` */
  private blow(t: Tree, at: Vector3, hand: 'left' | 'right', quiet = false): void {
    if (t.fall >= 0 || t.down > 0 || t.grow < 1) return;
    t.blows++;
    t.shiver = 1;
    t.cooldown = 0.35;
    if (!quiet) {
      chopThunk(1);
      pulseHand(this.renderer.xr.getSession() ?? undefined, hand, 1, 70);
    }
    // chips fly off the cut
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      this.chipList.push({ p: at.clone(), v: new Vector3(Math.cos(a) * 1.4, 1 + Math.random() * 1.8, Math.sin(a) * 1.4), age: 0 });
    }
    if (this.chipList.length > 60) this.chipList.splice(0, this.chipList.length - 60);
    if (t.blows >= BLOWS) {
      // it goes: away from you, turning about the cut
      const head = this.player.head.getWorldPosition(_w);
      const away = _v.set(t.base.x - head.x, 0, t.base.z - head.z).normalize();
      t.axis.crossVectors(UP, away).normalize();
      t.fall = 0;
      treeCreak();
    }
  }

  /* ── the timber yard ───────────────────────────────────────────────── */

  private buildYard(ground: (x: number, z: number) => number, addBox: (b: BoxCollider) => void): void {
    const [x, z] = YARD;
    const g = new Group();
    g.position.set(x, ground(x, z), z);
    // the stall faces +x: the counter at its front, a roof on four posts
    g.rotation.y = Math.PI / 2;
    const plank = new MeshLambertMaterial({ color: 0x9a7a52 });
    const darkWood = new MeshLambertMaterial({ color: 0x5e4632 });
    const roofMat = new MeshLambertMaterial({ color: 0x7a5a3a });
    const box = (m: MeshLambertMaterial, sx: number, sy: number, sz: number, px: number, py: number, pz: number, rx = 0): Mesh => {
      const o = new Mesh(new BoxGeometry(sx, sy, sz), m);
      o.position.set(px, py, pz);
      o.rotation.x = rx;
      g.add(o);
      return o;
    };
    // (in the stall's frame: +z toward the customer, x across)
    for (const [px, pz] of [
      [-1.5, 0.9],
      [1.5, 0.9],
      [-1.5, -1.1],
      [1.5, -1.1],
    ])
      box(darkWood, 0.14, pz > 0 ? 2.6 : 2.9, 0.14, px, pz > 0 ? 1.3 : 1.45, pz);
    for (let i = 0; i < 9; i++) box(roofMat, 0.4, 0.05, 2.6, -1.6 + i * 0.4, 2.78, -0.1, -0.12);
    box(plank, 3.0, 0.95, 0.6, 0, 0.475, 0.6);
    box(darkWood, 3.1, 0.06, 0.7, 0, 0.98, 0.6);
    // the sign over the front
    const signTex = yardSign();
    const sign = new Mesh(new PlaneGeometry(2.4, 0.5), new MeshBasicMaterial({ map: signTex, toneMapped: false }));
    sign.position.set(0, 2.5, 0.99);
    sign.rotation.x = -0.1;
    g.add(sign);
    // log stacks either side, and a chopping block with the axe standing in it
    const log = new MeshLambertMaterial({ color: 0x8a6440 });
    const cut = new MeshLambertMaterial({ color: 0xd8b88a });
    const stack = (sx: number, sz: number): void => {
      let row = 0;
      for (const n of [4, 3, 2]) {
        for (let k = 0; k < n; k++) {
          const l = new Mesh(new CylinderGeometry(0.14, 0.14, 1.4, 9).rotateX(Math.PI / 2), [log, cut, cut]);
          l.position.set(sx + (k - (n - 1) / 2) * 0.29, 0.14 + row * 0.25, sz);
          g.add(l);
        }
        row++;
      }
    };
    stack(-2.4, -0.2);
    stack(2.4, -0.2);
    const block = new Mesh(new CylinderGeometry(0.3, 0.34, 0.55, 10), [log, cut, cut]);
    block.position.set(2.2, 0.275, 1.3);
    g.add(block);
    this.yardAxe = this.buildAxe(woodDeps.env);
    this.yardAxe.position.set(2.2, 0.62, 1.3);
    this.yardAxe.rotation.set(-Math.PI / 2 + 0.3, 0.4, 0);
    g.add(this.yardAxe);
    // the board on the counter
    this.board = new InteractivePanel([900, 640], [0.84, 0.597]);
    this.board.mesh.position.set(0, 1.32, 0.66);
    this.board.mesh.rotation.x = -0.25;
    g.add(this.board.mesh);
    register(this.board);
    this.board.paint = () => this.paintBoard();
    this.board.onClick = (id) => this.buy(id);
    this.board.repaintOnFonts(() => this.paintBoard());
    this.scene.add(g);
    // the counter and the stacks stop an arc
    addBox({ tag: 'yard', walkable: false, solid: true, cx: x + 0.6, cz: z, hx: 0.35, hz: 1.55, rotY: 0, top: g.position.y + 1.0, bottom: g.position.y - 1 });
    this.paintBoard();
  }

  private buy(id: string): void {
    const s = woodDeps.state!;
    const w = s.woodworks;
    const price = id === 'axe' ? PRICES.axe : id === 'bundle' ? PRICES.bundle : PRICES.cart;
    if ((id === 'axe' && w.axe) || !s.spend(price)) {
      uiDeny();
      this.toast.show(id === 'axe' && w.axe ? 'You have an axe' : `You need $${price - s.money} more`, 2, INK.danger);
      return;
    }
    if (id === 'axe') {
      w.axe = true;
      this.toast.show('An axe! Walk up to the trees behind the yard and swing it.', 4, INK.good);
    } else {
      const n = id === 'bundle' ? 10 : 50;
      w.wood += n;
      this.toast.show(`+${n} logs, into your backpack`, 2.4, INK.good);
      for (let i = 0; i < Math.min(8, n); i++) window.setTimeout(() => logThunk(), i * 80);
    }
    s.save();
    s.emit();
  }

  private paintBoard(): void {
    const b = this.board;
    if (!b) return;
    const c = b.ctx;
    const [W, H] = b.px;
    const s = woodDeps.state!;
    const w = s.woodworks;
    b.clear();
    roundRect(c, 6, 6, W - 12, H - 12, 28);
    c.fillStyle = 'rgba(38, 26, 16, 0.94)';
    c.fill();
    c.lineWidth = 6;
    c.strokeStyle = '#c8a26a';
    c.stroke();
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    c.font = font(700, 54);
    c.fillStyle = '#ffd89a';
    c.fillText('TIMBER YARD', 44, 82);
    c.textAlign = 'right';
    c.font = font(600, 30);
    c.fillStyle = INK.amber;
    c.fillText(`$${s.money.toLocaleString('en-US')}  ·  ${w.wood} logs`, W - 44, 80);
    const rows: [string, string, string, number, boolean][] = [
      ['axe', 'AXE', 'chop your own in the woodlot behind', PRICES.axe, !w.axe],
      ['bundle', 'BUNDLE OF 10 LOGS', 'straight into your backpack', PRICES.bundle, true],
      ['cart', 'CART OF 50 LOGS', 'for a whole walk and then some', PRICES.cart, true],
    ];
    const buttons: { id: string; x: number; y: number; w: number; h: number }[] = [];
    rows.forEach(([id, name, sub, price, can], i) => {
      const y = 130 + i * 160;
      roundRect(c, 36, y, W - 72, 138, 20);
      c.fillStyle = 'rgba(255, 255, 255, 0.05)';
      c.fill();
      c.textAlign = 'left';
      c.font = font(700, 44);
      c.fillStyle = INK.hot;
      c.fillText(name, 66, y + 60, 470);
      c.font = font(500, 26);
      c.fillStyle = INK.dim;
      c.fillText(sub, 66, y + 102, 470);
      const bx = W - 300;
      if (!can) {
        c.textAlign = 'center';
        c.font = font(700, 38);
        c.fillStyle = INK.good;
        c.fillText('✓ YOURS', bx + 125, y + 82);
        return;
      }
      buttons.push({ id, x: bx, y: y + 24, w: 250, h: 90 });
      roundRect(c, bx, y + 24, 250, 90, 18);
      c.fillStyle = b.hover === id ? '#ffffff' : s.money >= price ? '#ffc070' : 'rgba(255,255,255,0.1)';
      c.fill();
      c.textAlign = 'center';
      c.font = font(700, 40);
      c.fillStyle = s.money >= price ? '#2a1808' : INK.dim;
      c.fillText(`$${price}`, bx + 125, y + 82);
    });
    b.buttons = buttons;
    b.commit();
    if (this.yardAxe) this.yardAxe.visible = !w.axe;
  }

  /* ── the frame ─────────────────────────────────────────────────────── */

  update(delta: number): void {
    if (!this.ready || introActive()) return;
    const dt = Math.min(delta, 0.05);
    const s = woodDeps.state!;
    const head = this.player.head.getWorldPosition(_v).clone();
    const near = this.nearestTree(head);
    // the axe comes out among the trees (if it's yours), and the rod goes away (fishingDeps.indoors)
    const out = s.woodworks.axe && !!near && near.d < 7 && !(woodDeps.busy?.() ?? false);
    woodView.axeOut = out;
    this.axe.visible = out;
    if (out) {
      const grip = this.player.gripSpaces.right;
      grip.updateWorldMatrix(true, false);
      this.axe.matrixAutoUpdate = false;
      this.axe.matrix.copy(grip.matrixWorld);
      this.axe.matrixWorldNeedsUpdate = true;
      // the blade's edge, and how fast it's moving
      this.blade.set(0, -0.1, -0.5).applyMatrix4(grip.matrixWorld);
      const sp = this.blade.distanceTo(this.lastBlade) / Math.max(dt, 1e-3);
      this.bladeSpeed += (sp - this.bladeSpeed) * 0.6;
      this.lastBlade.copy(this.blade);
      for (const t of this.trees) {
        t.cooldown -= dt;
        if (t.cooldown > 0 || t.fall >= 0 || t.down > 0 || t.grow < 1) continue;
        const dy = this.blade.y - t.base.y;
        const dx = Math.hypot(this.blade.x - t.base.x, this.blade.z - t.base.z);
        if (dy > 0.35 && dy < 2.4 && dx < 0.28 && this.bladeSpeed > 2.2) this.blow(t, this.blade.clone(), 'right');
      }
    } else this.lastBlade.copy(head);

    for (const t of this.trees) this.updateTree(t, dt);
    this.updateChips(dt);
    this.updateFlying(dt, head);
    this.walks.update(dt, this.camera);
    this.party.update(dt, this.camera);
    this.toast.update(dt, this.camera);
  }

  private updateTree(t: Tree, dt: number): void {
    // a blow makes the crown shiver
    t.shiver = Math.max(0, t.shiver - dt * 3);
    if (t.fall >= 0) {
      t.fall += dt;
      // slow to start, then all at once; a bounce as it hits
      const k = Math.min(1, (t.fall / 1.5) ** 2.2);
      const bounce = t.fall > 1.5 ? Math.sin((t.fall - 1.5) * 18) * 0.05 * Math.exp(-(t.fall - 1.5) * 6) : 0;
      t.pivot.quaternion.setFromAxisAngle(t.axis, k * (Math.PI / 2 - 0.08) - bounce);
      if (t.fall >= 1.5 && t.fall - dt < 1.5) {
        treeCrash();
        pulseHand(this.renderer.xr.getSession() ?? undefined, 'right', 0.8, 150);
        pulseHand(this.renderer.xr.getSession() ?? undefined, 'left', 0.8, 150);
      }
      if (t.fall >= 2.3) {
        // into logs, and the logs into your backpack
        t.fall = -1;
        t.pivot.visible = false;
        t.down = REGROW_S;
        const along = new Vector3(0, 1, 0).applyQuaternion(t.pivot.quaternion);
        for (let i = 0; i < LOGS_PER_TREE; i++) {
          const m = new Mesh(this.logGeo, this.logMat);
          m.position.copy(t.pivot.position).addScaledVector(along, 0.6 + i * 0.7);
          this.scene.add(m);
          this.flying.push({ mesh: m, t: -i * 0.12, from: m.position.clone() });
        }
      }
    } else if (t.down > 0) {
      t.down -= dt;
      if (t.down <= 0) {
        // a sapling comes up out of the stump
        t.grow = 0.05;
        t.blows = 0;
        t.pivot.quaternion.identity();
        t.pivot.visible = true;
      }
    } else if (t.grow < 1) {
      t.grow = Math.min(1, t.grow + dt / 8);
    }
    const g = t.grow < 1 ? t.grow * t.grow * (3 - 2 * t.grow) : 1;
    t.pivot.scale.setScalar(Math.max(0.05, g));
    if (t.fall < 0 && t.down <= 0) {
      const sh = t.shiver * 0.035 * Math.sin(performance.now() * 0.04);
      t.tree.rotation.set(sh, 0, sh * 0.7);
    }
  }

  private updateChips(dt: number): void {
    const o = new Object3D();
    let n = 0;
    this.chipList = this.chipList.filter((c) => (c.age += dt) < 1.4);
    for (const c of this.chipList) {
      c.v.y -= 9.8 * dt;
      c.p.addScaledVector(c.v, dt);
      const floor = (woodDeps.ground?.(c.p.x, c.p.z) ?? 0) + 0.01;
      if (c.p.y < floor) {
        c.p.y = floor;
        c.v.set(0, 0, 0);
      }
      o.position.copy(c.p);
      o.rotation.set(c.age * 9, c.age * 7, 0);
      o.scale.setScalar(Math.max(0.01, Math.min(1, (1.4 - c.age) * 3)));
      o.updateMatrix();
      this.chips.setMatrixAt(n++, o.matrix);
    }
    this.chips.count = n;
    this.chips.instanceMatrix.needsUpdate = true;
  }

  /** logs from a felled tree, flying into your backpack */
  private updateFlying(dt: number, head: Vector3): void {
    const s = woodDeps.state!;
    const to = _w.copy(head);
    to.y -= 0.45;
    this.flying = this.flying.filter((f) => {
      f.t += dt / 0.7;
      if (f.t < 0) return true;
      const k = Math.min(1, f.t);
      f.mesh.position.lerpVectors(f.from, to, k * k);
      f.mesh.position.y += Math.sin(k * Math.PI) * 1.2;
      f.mesh.rotation.set(k * 6, k * 4, 0);
      f.mesh.scale.setScalar(1 - k * 0.6);
      if (k >= 1) {
        this.scene.remove(f.mesh);
        logThunk();
        s.woodworks.wood++;
        s.save();
        s.emit();
        if (!this.flying.some((g) => g !== f && g.t < 1)) this.toast.show(`+${LOGS_PER_TREE} logs, into your backpack (${s.woodworks.wood})`, 2.4, INK.good);
        return false;
      }
      return true;
    });
  }

  /** How far each walk is built (0..1), for the chart. */
  walkProgress(): Record<string, number> {
    return this.walks?.progress() ?? {};
  }
}

function yardSign(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 960;
  c.height = 200;
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  const paint = (): void => paintYardSign(c.getContext('2d')!);
  paint();
  onFontsReady(() => {
    paint();
    t.needsUpdate = true;
  });
  return t;
}

function paintYardSign(g: CanvasRenderingContext2D): void {
  g.fillStyle = '#6a4a2c';
  g.fillRect(0, 0, 960, 200);
  g.strokeStyle = '#3a2614';
  g.lineWidth = 14;
  g.strokeRect(7, 7, 946, 186);
  for (let y = 40; y < 200; y += 40) {
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(14, y);
    g.lineTo(946, y);
    g.stroke();
  }
  g.fillStyle = '#ffe2a8';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = font(700, 118);
  g.fillText('TIMBER YARD', 480, 108, 900);
}
