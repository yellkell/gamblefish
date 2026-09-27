/**
 * THE WALKS: boardwalks you build off the pier head with wood (the layout is woodworks/gates.ts).
 *
 * Each has a build crate by its gateway, and behind it a notice board on two posts (woodworks/
 * buildSign.ts): how many logs it still needs, how many you're carrying, and a tag hung under it,
 * PUT IN WOOD. Point and click: your logs fly out of your backpack into the crate one after
 * another (a thunk each), and the walk lays itself out, a bay at a time: its piles, cap beam and
 * stringers, then the planks dropping on, then the rails, a clap and two hammer taps per step.
 * Until the walk is finished a rope with a sign hangs across the gateway and the way is shut;
 * with the last plank down it's unhooked, drops away, and the walk is open. Whatever of the
 * pier's own gear stood in the gateway (the deep walk's: a life ring and two rods on the rail) is
 * moved along the rail out of the way as it drops.
 * Only the reef walk is on offer at first: the deep walk's gateway is still closed by the pier's
 * own rail, and its crate and rope aren't there, until the reef walk is finished.
 *
 * Built like Tidewater's pier: weathered boards in slightly different tones laid end to end the
 * whole way out, round piles driven into the sea floor, a top and mid rail on posts. At the end,
 * a platform on a regular grid of piles, railed down its sides and open at the far edge to fish
 * off, with a lantern at each corner, and a bucket and a coil of rope made fast to a cleat.
 *
 * All of a walk is one draw: every piece carries the step it belongs to, and the vertex stage
 * hides the steps not built yet and drops the newest one into place. Each step's deck and rails
 * go into the teleport's floors and walls (world/surfaces.ts) as it's laid.
 */

import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  TorusGeometry,
  Euler,
  Vector3,
  type Camera,
  type Object3D,
  type WebGLRenderer,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { logThunk, plankLay, uiDeny } from '../audio/sfx.ts';
import type { GameState } from '../fishing/tidewater.ts';
import { font, onFontsReady } from '../ui/fonts.ts';
import type { BoxCollider } from '../world/data.ts';
import { buildLamps } from '../world/lamps.ts';
import { bucketAndRope } from './bucket.ts';
import { BuildSign, type SignText } from './buildSign.ts';
import { CRATES, DECK, HEAD_STEPS, logsFor, stepsOf, WALK_W, WALKS, type WalkDef, type WalkId } from './gates.ts';

/** seconds a step takes to lay, and between logs flying into the crate */
const STEP_S = 0.42;
const LOG_S = 0.1;
/** seconds the gear in a gateway takes to move out of the way, and how far it's lifted doing it */
const GEAR_S = 1.6;
const GEAR_LIFT = 0.06;
/** deck boards: one every PLANK m, the whole way out */
const PLANK = 0.23;

const _m = new Matrix4();
const _q = new Quaternion();
const _v = new Vector3();

function rand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** Everything a walk is made of, in its own frame (z along the walk from the gateway, x across, y up from sea level). */
class Pieces {
  private readonly parts: BufferGeometry[] = [];
  constructor(private readonly place: Matrix4) {}

  private add(g: BufferGeometry, m: Matrix4, colour: Color, step: number): void {
    const geo = g.index ? g.toNonIndexed() : g;
    geo.applyMatrix4(m);
    geo.applyMatrix4(this.place);
    const n = geo.getAttribute('position').count;
    const c = new Float32Array(n * 3);
    const st = new Float32Array(n).fill(step);
    for (let i = 0; i < n; i++) c.set([colour.r, colour.g, colour.b], i * 3);
    geo.setAttribute('color', new Float32BufferAttribute(c, 3));
    geo.setAttribute('step', new Float32BufferAttribute(st, 1));
    geo.deleteAttribute('uv');
    this.parts.push(geo);
  }

  box(step: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, colour: Color, ry = 0): void {
    this.add(new BoxGeometry(sx, sy, sz), _m.compose(_v.set(x, y, z), _q.setFromEuler(new Euler(0, ry, 0)), new Vector3(1, 1, 1)), colour, step);
  }

  cyl(step: number, x: number, y0: number, y1: number, z: number, r: number, colour: Color): void {
    this.add(new CylinderGeometry(r * 0.92, r, y1 - y0, 9), _m.makeTranslation(x, (y0 + y1) / 2, z), colour, step);
  }

  /** a square timber from (y0, z0) to (y1, z1) in the plane x, `t` thick */
  brace(step: number, x: number, y0: number, z0: number, y1: number, z1: number, t: number, colour: Color): void {
    const len = Math.hypot(y1 - y0, z1 - z0);
    const m = new Matrix4().compose(new Vector3(x, (y0 + y1) / 2, (z0 + z1) / 2), new Quaternion().setFromEuler(new Euler(Math.atan2(z1 - z0, y1 - y0), 0, 0)), new Vector3(1, 1, 1));
    this.add(new BoxGeometry(t, len, t), m, colour, step);
  }

  merged(): BufferGeometry {
    return mergeGeometries(this.parts, false)!;
  }
}

/** Old pier timber, one board a touch lighter or darker than the next. */
function timber(r: () => number, base = 0x7b6652): Color {
  const c = new Color(base);
  let k = 0.84 + r() * 0.26;
  const x = r();
  if (x < 0.1) k *= 0.75;
  else if (x > 0.94) k *= 1.15;
  return c.multiplyScalar(k);
}

interface Built {
  def: WalkDef;
  mesh: Mesh;
  uniforms: { uBuilt: { value: number }; uDrop: { value: number } };
  /** steps shown (it catches up with the logs in the crate, a step at a time) */
  shown: number;
  dropT: number;
  /** deck and rail colliders, per step */
  colliders: BoxCollider[][];
  /** logs flying from you to the crate */
  flying: { mesh: Mesh; t: number; from: Vector3 }[];
  queued: number;
  queueT: number;
  sign: BuildSign;
  /** the rope across the gateway (and the pivot it drops from), its collider, how far it's fallen */
  rope: Group;
  ropeSwing: Group;
  ropeBox: BoxCollider;
  ropeIn: boolean;
  ropeDrop: number;
  crate: Group;
  /** the crate's collider, once it's there */
  crateBox: BoxCollider;
  crateIn: boolean;
  lanterns: Object3D[];
  /** the glow round the lanterns after dark (world/lamps.ts) */
  halo: Object3D;
  /** the bucket and the rope at the end, and whether they're in the way yet */
  corner: Group | null;
  cornerBox: BoxCollider;
  cornerIn: boolean;
  /** the pier's rail across a gateway not open yet, and its collider */
  gateRail: Mesh | null;
  gateBox: BoxCollider | null;
  gateIn: boolean;
  /** Tidewater's gear in the gateway (baked in the world's frame), and how far it's moved: 0..1 */
  gear: Mesh | null;
  gearT: number;
}

export interface WalkDeps {
  state: GameState;
  /** the sea floor under (x, z) */
  ground: (x: number, z: number) => number;
  /** a floor or a wall for the teleport (world/surfaces.ts addBox), and taking one out again */
  addBox: (b: BoxCollider) => void;
  removeBox: (b: BoxCollider) => void;
  /** for the bucket and rope (village/craft.ts materials) */
  renderer: WebGLRenderer | null;
  /** Tidewater's baked timber (world/village.ts `village_wood`): the pier's rails, to match */
  pierWood: Mesh | null;
  /** the gear standing in a walk's gateway (world/village.ts `village_<id>Gear`), if any */
  gear?: (id: WalkId) => Mesh | null;
  /** 0 by day .. 1 after dark (world/sky.ts): the lanterns light up */
  night: { value: number };
  /** a walk has just been finished */
  onFinished?: (w: WalkDef, at: Vector3) => void;
}

export class Walks {
  readonly group = new Group();
  private readonly walks: Built[] = [];
  private readonly logGeo = new CylinderGeometry(0.07, 0.08, 0.55, 8).rotateZ(Math.PI / 2);
  private readonly logMat = new MeshLambertMaterial({ color: 0x8a6440 });

  constructor(private readonly deps: WalkDeps) {
    for (const def of WALKS) this.walks.push(this.build(def));
    // what's already in the crates is already built
    for (const w of this.walks) {
      const steps = this.stepsIn(w.def);
      w.shown = steps;
      w.uniforms.uBuilt.value = steps;
      w.uniforms.uDrop.value = 1;
      for (let i = 0; i < steps; i++) for (const b of w.colliders[i]) deps.addBox(b);
      if (steps >= stepsOf(w.def)) {
        w.ropeDrop = 1;
        w.gearT = 1;
        this.placeGear(w);
      }
      this.paintBoard(w);
    }
    this.sync();
    deps.state.onChange(() => this.walks.forEach((w) => this.paintBoard(w)));
  }

  /** logs in a walk's crate */
  private logsIn(def: WalkDef): number {
    return this.deps.state.woodworks.built[def.id] ?? 0;
  }
  private stepsIn(def: WalkDef): number {
    return Math.min(stepsOf(def), Math.floor(this.logsIn(def) / def.cost));
  }
  private finished(id: WalkId): boolean {
    const def = WALKS.find((w) => w.id === id)!;
    return this.stepsIn(def) >= stepsOf(def);
  }
  private open(def: WalkDef): boolean {
    return !def.after || this.finished(def.after);
  }

  /** How far each walk is laid (0..1), for the chart. */
  progress(): Record<WalkId, number> {
    const out = {} as Record<WalkId, number>;
    for (const w of this.walks) out[w.def.id] = w.shown / stepsOf(w.def);
    return out;
  }

  /* ── building one walk ─────────────────────────────────────────────── */

  private build(def: WalkDef): Built {
    const [ax, az] = def.dir;
    const yaw = Math.atan2(ax, az);
    const place = new Matrix4().compose(new Vector3(def.gate.x, 0, def.gate.z), new Quaternion().setFromEuler(new Euler(0, yaw, 0)), new Vector3(1, 1, 1));
    const toWorld = (x: number, z: number): [number, number] => [def.gate.x + x * az + z * ax, def.gate.z - x * ax + z * az];
    const P = new Pieces(place);
    const r = rand(def.id.length * 977 + 13);
    const colliders: BoxCollider[][] = [];
    const half = WALK_W / 2;
    const post = new Color(0x4e443a);
    const pile = new Color(0x3e3a36);
    const beam = new Color(0x5e5044);
    const rail = new Color(0x8a7862);
    const floor = (step: number, cx: number, cz: number, hx: number, hz: number): void => {
      const [wx, wz] = toWorld(cx, cz);
      colliders[step].push({ tag: 'walkDeck', walkable: true, solid: true, cx: wx, cz: wz, hx, hz, rotY: yaw, top: DECK, bottom: DECK - 0.3 });
    };
    const wall = (step: number, cx: number, cz: number, hx: number, hz: number): void => {
      const [wx, wz] = toWorld(cx, cz);
      colliders[step].push({ tag: 'walkRail', walkable: false, solid: true, cx: wx, cz: wz, hx, hz, rotY: yaw, top: DECK + 1.0, bottom: DECK });
    };
    const seabed = (x: number, z: number): number => {
      const [wx, wz] = toWorld(x, z);
      return Math.min(-0.5, this.deps.ground(wx, wz)) - 0.6;
    };
    const L0 = def.bays * def.bay;
    const [hw, hd] = def.head;
    const q = hd / HEAD_STEPS;
    /** the step a point `z` along the walk is laid in: a bay, or a quarter of the platform */
    const stepAt = (z: number): number => (z < L0 ? Math.min(def.bays - 1, Math.floor(z / def.bay)) : def.bays + Math.min(HEAD_STEPS - 1, Math.floor((z - L0) / q)));
    // The timber stacks, each piece bearing on the one below: boards (the top 5 cm), on joists
    // (JOIST deep), on the cap beams, on the piles.
    const BOARD = 0.05;
    const JOIST = 0.25;
    const CAP = 0.18;
    const joistY = DECK - BOARD - JOIST / 2;
    const capY = DECK - BOARD - JOIST - CAP / 2;
    // the deck boards: a whole number of them along the walk and along the platform, evenly
    // spaced, so each stretch starts and ends on a board's edge
    const boards = (z0: number, z1: number, w: number): void => {
      const n = Math.max(1, Math.round((z1 - z0) / PLANK));
      const pitch = (z1 - z0) / n;
      for (let i = 0; i < n; i++) {
        const pz = z0 + (i + 0.5) * pitch;
        // (a wide board wanders as far at its ends as a narrow one)
        P.box(stepAt(pz), (r() - 0.5) * 0.02, DECK - BOARD / 2, pz, w + (r() - 0.5) * 0.02, BOARD, pitch - 0.03, timber(r), ((r() - 0.5) * 0.02) / w);
      }
    };
    boards(0, L0, WALK_W);
    boards(L0, L0 + hd, hw);
    // a row of piles across the deck at `pz`, and the cap beam they carry, flush with the deck's sides
    const bent = (step: number, pz: number, w: number, xs: number[]): void => {
      for (const px of xs) P.cyl(step, px, seabed(px, pz), capY, pz, 0.14, pile);
      P.box(step, 0, capY, pz, w, CAP, 0.2, beam);
    };
    // the joists under a stretch [z0, z1], on the cap beams, under the boards (the outer ones are
    // the deck's edge boards)
    const stringers = (step: number, z0: number, z1: number, xs: number[]): void => {
      for (const sx of xs) P.box(step, sx, joistY, (z0 + z1) / 2, 0.1, JOIST, z1 - z0, beam);
    };
    // an edge board across the deck's end at `pz`
    const header = (step: number, pz: number, w: number): void => P.box(step, 0, joistY, pz, w, JOIST, 0.1, beam);
    // a rail along one side of a stretch: posts at its ends, a top and a mid rail
    const railRun = (step: number, x: number, z0: number, z1: number, posts: number[]): void => {
      for (const pz of posts) P.box(step, x, DECK + 0.5, pz, 0.11, 1.0, 0.11, post);
      P.box(step, x, DECK + 0.99, (z0 + z1) / 2, 0.16, 0.05, z1 - z0 + 0.06, rail);
      P.box(step, x, DECK + 0.5, (z0 + z1) / 2, 0.05, 0.12, z1 - z0, rail);
      wall(step, x, (z0 + z1) / 2, 0.08, (z1 - z0) / 2);
    };

    // the bays (the last one rests on the platform's first row of piles)
    const walkPiles = [-half + 0.12, half - 0.12];
    for (let i = 0; i < def.bays; i++) {
      colliders.push([]);
      const z0 = i * def.bay;
      const z1 = z0 + def.bay;
      if (i === 0) bent(i, 0.2, WALK_W, walkPiles);
      if (i < def.bays - 1) bent(i, z1, WALK_W, walkPiles);
      stringers(i, z0, z1, [-half + 0.05, 0, half - 0.05]);
      for (const x of [-half + 0.05, half - 0.05]) railRun(i, x, z0, z1, i === 0 ? [z0, z1] : [z1]);
      floor(i, 0, (z0 + z1) / 2, half, def.bay / 2 + 0.05);
    }
    // the platform at the end, laid in four: three rows of three piles, evenly across and along
    const rows = [L0 + 0.1, L0 + hd / 2, L0 + hd - 0.1];
    const platPiles = [-hw / 2 + 0.12, 0, hw / 2 - 0.12];
    const lanterns: Object3D[] = [];
    const halos: [number, number, number, string][] = [];
    const last = def.bays + HEAD_STEPS - 1;
    for (let k = 0; k < HEAD_STEPS; k++) {
      const s = def.bays + k;
      colliders.push([]);
      const z0 = L0 + k * q;
      const z1 = z0 + q;
      for (const pz of rows) if (stepAt(pz) === s) bent(s, pz, hw, platPiles);
      stringers(s, z0, z1, [-hw / 2 + 0.05, -hw / 4, 0, hw / 4, hw / 2 - 0.05]);
      // the platform's front edge, either side of where the walk comes in
      if (k === 0) header(s, z0 + 0.05, hw);
      // railed down both sides (the lantern posts stand at the far corners)
      for (const x of [-hw / 2 + 0.05, hw / 2 - 0.05]) railRun(s, x, z0, z1, s === last ? [] : [z1]);
      floor(s, 0, (z0 + z1) / 2, hw / 2, q / 2 + 0.05);
      if (k === 0) {
        // the platform's shoulders, back to the walk's rails
        for (const side of [-1, 1]) {
          const a = half - 0.05;
          const b = hw / 2 - 0.05;
          P.box(s, side * ((a + b) / 2), DECK + 0.99, z0, b - a, 0.05, 0.16, rail);
          P.box(s, side * ((a + b) / 2), DECK + 0.5, z0, b - a, 0.12, 0.05, rail);
          P.box(s, side * b, DECK + 0.5, z0, 0.11, 1.0, 0.11, post);
          wall(s, side * ((a + b) / 2), z0, (b - a) / 2, 0.08);
        }
      }
      if (s === last) {
        // the far edge is open to fish off: an edge board under the boards' ends, and a lantern
        // on a tall post at each corner
        header(s, z1 - 0.05, hw);
        for (const side of [-1, 1]) {
          const lx = side * (hw / 2 - 0.05);
          const lz = z1 - 0.06;
          // the post, capped; an arm out over the open edge on a brace; the lantern hangs off it
          P.box(s, lx, DECK + 1.3, lz, 0.13, 2.6, 0.13, post);
          P.box(s, lx, DECK + 2.62, lz, 0.19, 0.04, 0.19, post);
          P.box(s, lx, DECK + 2.48, lz + 0.26, 0.07, 0.07, 0.52, post);
          P.brace(s, lx, DECK + 2.12, lz + 0.07, DECK + 2.45, lz + 0.3, 0.05, post);
          const [wx, wz] = toWorld(lx, lz + 0.46);
          const lamp = lantern(lanternGlass);
          lamp.position.set(wx, DECK + 2.445, wz);
          lamp.rotation.y = yaw;
          lamp.visible = false;
          this.group.add(lamp);
          lanterns.push(lamp);
          halos.push([wx, DECK + 2.445 - LANTERN_GLASS_Y, wz, 'lantern']);
        }
      }
    }

    const halo = buildLamps(halos, this.deps.night);
    this.group.add(halo);

    const uniforms = { uBuilt: { value: 0 }, uDrop: { value: 1 } };
    const mat = new MeshLambertMaterial({ vertexColors: true });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float step;\nuniform float uBuilt;\nuniform float uDrop;')
        .replace(
          '#include <begin_vertex>',
          // steps not laid yet collapse to nothing; the newest drops into place from above
          '#include <begin_vertex>\nif (step > uBuilt - 0.5) transformed = vec3(0.0);\nelse if (step > uBuilt - 1.5) transformed.y += (1.0 - uDrop) * (1.0 - uDrop) * 1.8;',
        );
    };
    mat.customProgramCacheKey = () => 'woodworks-walk';
    const mesh = new Mesh(P.merged(), mat);
    mesh.frustumCulled = false;
    this.group.add(mesh);

    // the rope across the gateway, with its sign, until the walk is finished: then it's unhooked
    // at one end and drops away (it swings down from the other, about `swing`)
    const rope = new Group();
    const ropeSwing = new Group();
    const g = def.gate;
    const span = g.to - g.from;
    {
      const ropeMesh = new Mesh(new CylinderGeometry(0.018, 0.018, span, 6).rotateZ(Math.PI / 2), new MeshLambertMaterial({ color: 0xc8b48a }));
      const sign = new Mesh(new PlaneGeometry(0.62, 0.3), new MeshBasicMaterial({ map: signTexture(def.id === 'reef' ? 'TO THE REEF' : 'TO THE DEEP'), toneMapped: false }));
      sign.position.set(0, -0.2, 0);
      const back = sign.clone();
      back.rotation.y = Math.PI;
      const hung = new Group();
      hung.position.x = span / 2;
      hung.add(ropeMesh, sign, back);
      ropeSwing.position.x = -span / 2;
      ropeSwing.add(hung);
      rope.add(ropeSwing);
      if (g.alongX) rope.position.set((g.from + g.to) / 2, DECK + 0.78, g.line);
      else {
        rope.position.set(g.line, DECK + 0.78, (g.from + g.to) / 2);
        rope.rotation.y = Math.PI / 2;
      }
      this.group.add(rope);
    }
    // while it's up the way is shut (the rail's own height: no hopping it)
    const ropeBox: BoxCollider = { tag: 'pierRail', walkable: false, solid: true, cx: g.alongX ? (g.from + g.to) / 2 : g.line, cz: g.alongX ? g.line : (g.from + g.to) / 2, hx: g.alongX ? span / 2 : 0.08, hz: g.alongX ? 0.08 : span / 2, rotY: 0, top: DECK + 1.0, bottom: DECK };

    // the build crate and its board
    const crate = new Group();
    const [cx, cz] = CRATES[def.id];
    crate.position.set(cx, DECK, cz);
    const slat = new MeshLambertMaterial({ color: 0x9a7a52 });
    const dark = new MeshLambertMaterial({ color: 0x5a4432 });
    crate.add(mesh3(new BoxGeometry(0.78, 0.62, 0.78), dark, 0, 0.31, 0));
    for (const y of [0.1, 0.31, 0.52]) for (const [x, z, rot] of [[0, 0.395, 0], [0, -0.395, 0], [0.395, 0, 1], [-0.395, 0, 1]] as const) crate.add(mesh3(new BoxGeometry(0.8, 0.14, 0.03), slat, x, y, z, rot * Math.PI / 2));
    // the logs in it, rising as it fills
    const fill = mesh3(new BoxGeometry(0.72, 0.1, 0.72), new MeshLambertMaterial({ color: 0x7a5636 }), 0, 0.1, 0);
    fill.name = 'fill';
    crate.add(fill);
    // faces the middle of the pier head; its notice board is on two stakes driven into its back
    crate.rotation.y = Math.atan2(55 - cx, 36.5 - cz);
    let built!: Built;
    const sign = new BuildSign(def.id === 'reef' ? 31 : 47, () => this.signText(built));
    sign.group.position.set(0, 0, -0.3);
    sign.group.rotation.x = -0.05;
    crate.add(sign.group);
    this.group.add(crate);
    const crateBox: BoxCollider = { tag: 'buildCrate', walkable: false, solid: true, cx, cz, hx: 0.4, hz: 0.4, rotY: 0, top: DECK + 0.62, bottom: DECK };

    // the bucket and the rope, on the platform by the open edge (once it's finished)
    let corner: Group | null = null;
    const cornerAt = toWorld(hw / 2 - 0.95, L0 + hd - 0.85);
    if (this.deps.renderer) {
      corner = bucketAndRope(this.deps.renderer, 0.85);
      corner.position.set(cornerAt[0], DECK, cornerAt[1]);
      corner.rotation.y = yaw;
      corner.visible = false;
      this.group.add(corner);
    }
    const cornerBox: BoxCollider = { tag: 'bucket', walkable: false, solid: true, cx: cornerAt[0], cz: cornerAt[1], hx: 0.2, hz: 0.2, rotY: yaw, top: DECK + 0.32, bottom: DECK };

    // a walk that waits on another: the pier's own rail across its gateway until it opens
    const gate = def.after ? gateRail(def, this.deps.pierWood) : null;
    if (gate) this.group.add(gate.mesh);

    built = {
      def,
      mesh,
      uniforms,
      shown: 0,
      dropT: 1,
      colliders,
      flying: [],
      queued: 0,
      queueT: 0,
      sign,
      rope,
      ropeSwing,
      ropeBox,
      ropeIn: false,
      ropeDrop: 0,
      crate,
      crateBox,
      crateIn: false,
      lanterns,
      halo,
      corner,
      cornerBox,
      cornerIn: false,
      gateRail: gate?.mesh ?? null,
      gateBox: gate?.box ?? null,
      gateIn: false,
      gear: def.gear ? (this.deps.gear?.(def.id) ?? null) : null,
      gearT: 0,
    };
    sign.board.onClick = (id) => id === 'deposit' && this.deposit(built);
    return built;
  }

  /* ── putting wood in ───────────────────────────────────────────────── */

  private deposit(w: Built): void {
    const ww = this.deps.state.woodworks;
    const need = logsFor(w.def) - this.logsIn(w.def);
    const n = Math.min(ww.wood, need);
    if (!this.open(w.def) || n <= 0) return uiDeny();
    ww.wood -= n;
    ww.built[w.def.id] = this.logsIn(w.def) + n;
    this.deps.state.save();
    this.deps.state.emit();
    // they fly from you to the crate, a few at a time (the rest thunk in unseen)
    w.queued += Math.min(n, 14);
  }

  update(dt: number, camera: Camera): void {
    // the lanterns' glass: lit from dusk
    lanternGlass.emissiveIntensity = this.deps.night.value * 1.8;
    const e = camera.matrixWorld.elements;
    const eye = _v.set(e[12], e[13] - 0.35, e[14]);
    for (const w of this.walks) {
      // logs leaving your backpack
      w.queueT -= dt;
      if (w.queued > 0 && w.queueT <= 0) {
        w.queueT = LOG_S;
        w.queued--;
        const m = new Mesh(this.logGeo, this.logMat);
        m.position.copy(eye);
        this.group.add(m);
        w.flying.push({ mesh: m, t: 0, from: eye.clone() });
      }
      const to = w.crate.position;
      w.flying = w.flying.filter((f) => {
        f.t += dt / 0.55;
        const k = Math.min(1, f.t);
        f.mesh.position.lerpVectors(f.from, to, k);
        f.mesh.position.y += Math.sin(k * Math.PI) * 0.8 + (1 - k) * 0 + k * 0.5;
        f.mesh.rotation.set(k * 5, k * 3, 0);
        if (k >= 1) {
          this.group.remove(f.mesh);
          logThunk();
          return false;
        }
        return true;
      });
      // the walk catches up with the logs in its crate, a step at a time
      const target = this.stepsIn(w.def);
      if (w.dropT < 1) {
        w.dropT = Math.min(1, w.dropT + dt / STEP_S);
        w.uniforms.uDrop.value = w.dropT;
        if (w.dropT >= 1) this.landed(w);
      } else if (w.shown < target && w.flying.length === 0 && w.queued === 0) {
        w.shown++;
        w.uniforms.uBuilt.value = w.shown;
        w.dropT = 0;
        w.uniforms.uDrop.value = 0;
      }
      // the rope comes down once the last plank's on: unhooked, it swings down and it's gone
      if (w.ropeDrop > 0 && w.ropeDrop < 1) {
        w.ropeDrop = Math.min(1, w.ropeDrop + dt / 1.1);
        const k = Math.min(1, w.ropeDrop / 0.6);
        w.ropeSwing.rotation.z = -(Math.PI / 2) * (1 - Math.cos(k * Math.PI)) * 0.5 - Math.sin(Math.min(1, w.ropeDrop * 2) * Math.PI * 3) * 0.08 * (1 - k);
        w.ropeSwing.scale.setScalar(w.ropeDrop < 0.75 ? 1 : Math.max(0.001, 1 - (w.ropeDrop - 0.75) / 0.25));
      }
      w.rope.visible = this.open(w.def) && w.ropeDrop < 1;
      // and the gear that stood in the gateway goes along the rail, out of the way
      if (w.gear && w.ropeDrop > 0 && w.gearT < 1) {
        w.gearT = Math.min(1, w.gearT + dt / GEAR_S);
        this.placeGear(w);
      }
      const fill = w.crate.getObjectByName('fill')!;
      const left = this.logsIn(w.def) - w.shown * w.def.cost;
      fill.position.y = 0.06 + Math.min(0.5, left * 0.05);
      fill.visible = left > 0;
      const lit = w.shown >= stepsOf(w.def);
      for (const l of w.lanterns) l.visible = lit;
      w.halo.visible = lit && this.deps.night.value > 0.01;
    }
    this.sync();
  }

  /**
   * What's there depends on how far along you are: a walk's crate and rope only once it's open
   * to build (until then its gateway keeps the pier's rail), its bucket and rope once it's done.
   */
  private sync(): void {
    const d = this.deps;
    for (const w of this.walks) {
      const open = this.open(w.def);
      w.crate.visible = open;
      if (open !== w.crateIn) {
        (open ? d.addBox : d.removeBox)(w.crateBox);
        w.crateIn = open;
      }
      const shut = open && w.ropeDrop === 0;
      if (shut !== w.ropeIn) {
        (shut ? d.addBox : d.removeBox)(w.ropeBox);
        w.ropeIn = shut;
      }
      if (w.gateRail) w.gateRail.visible = !open;
      if (w.gateBox && !open !== w.gateIn) {
        (!open ? d.addBox : d.removeBox)(w.gateBox);
        w.gateIn = !open;
      }
      const done = w.shown >= stepsOf(w.def);
      if (w.corner) w.corner.visible = done;
      if (done !== w.cornerIn) {
        (done ? d.addBox : d.removeBox)(w.cornerBox);
        w.cornerIn = done;
      }
    }
  }

  /** The gateway's gear, `gearT` of the way along to where it's moved: lifted off, along, set down. */
  private placeGear(w: Built): void {
    const g = w.gear;
    const [dx, dz] = w.def.gear ?? [0, 0];
    if (!g) return;
    const k = w.gearT;
    const e = k * k * (3 - 2 * k);
    g.position.set(dx * e, GEAR_LIFT * Math.sin(k * Math.PI), dz * e);
    g.updateMatrix();
  }

  /** A step has come down: nail it, make it walkable, and see if the walk's done. */
  private landed(w: Built): void {
    const i = w.shown - 1;
    plankLay();
    for (const b of w.colliders[i] ?? []) this.deps.addBox(b);
    this.paintBoard(w);
    if (w.shown === stepsOf(w.def)) {
      // the rope across the gateway comes down: the way's open
      w.ropeDrop = 0.001;
      const [ax, az] = w.def.dir;
      const L = w.def.bays * w.def.bay + w.def.head[1] / 2;
      // the chart in the field guide draws the walk now it's finished
      this.deps.state.emit();
      this.deps.onFinished?.(w.def, new Vector3(w.def.gate.x + ax * L, DECK + 1.2, w.def.gate.z + az * L));
      for (const o of this.walks) this.paintBoard(o);
    }
  }

  /* ── the notice board behind the crate ─────────────────────────────── */

  private paintBoard(w: Built): void {
    w.sign.draw();
  }

  /** what the board says: what's wanted, how far along, and what to do next */
  private signText(w: Built): SignText {
    const total = logsFor(w.def);
    const inCrate = Math.min(total, this.logsIn(w.def));
    const done = w.shown >= stepsOf(w.def) && inCrate >= total;
    const open = this.open(w.def);
    const ww = this.deps.state.woodworks;
    const note = done
      ? w.def.id === 'reef'
        ? 'Walk out to the end and fish the reef.'
        : 'Walk out to the end: 14 m of water under you.'
      : !open
        ? 'Finish the reef walk first.'
        : ww.wood > 0
          ? `You're carrying ${ww.wood} log${ww.wood === 1 ? '' : 's'}.`
          : ww.axe
            ? 'Chop wood in the woodlot, or buy it at the timber yard.'
            : 'Buy an axe, or wood, at the timber yard on the beach.';
    const can = open && !done && ww.wood > 0;
    return {
      title: w.def.id === 'reef' ? 'The Reef Walk' : 'The Deep Walk',
      sub: w.def.id === 'reef' ? 'a boardwalk out over the reef' : 'a boardwalk out past the drop-off',
      progress: inCrate / total,
      count: done ? 'Finished' : `${inCrate} of ${total} logs`,
      note,
      tag: done ? 'Open' : can ? 'Put in wood' : 'Needs wood',
      can,
      done,
    };
  }
}

function mesh3(g: BufferGeometry, m: MeshLambertMaterial, x: number, y: number, z: number, ry = 0): Object3D {
  const o = new Mesh(g, m);
  o.position.set(x, y, z);
  o.rotation.y = ry;
  return o;
}

function signTexture(text: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 124;
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  const paint = (): void => paintSign(c.getContext('2d')!, text);
  paint();
  onFontsReady(() => {
    paint();
    t.needsUpdate = true;
  });
  return t;
}

function paintSign(g: CanvasRenderingContext2D, text: string): void {
  g.fillStyle = '#e8d8b0';
  g.fillRect(0, 0, 256, 124);
  g.strokeStyle = '#5a3a1a';
  g.lineWidth = 8;
  g.strokeRect(4, 4, 248, 116);
  g.fillStyle = '#5a2a14';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = font(700, 30);
  g.fillText(text, 128, 44, 230);
  g.font = font(600, 22);
  g.fillText('bring wood to build', 128, 86, 230);
}

/**
 * The pier head's rail across a gateway that isn't open yet: a top and a mid rail the size of the
 * pier's own (tools/bake-world.mjs RAIL), in its own colours, read off the baked rail either side
 * of the gap (a face looking up and a face looking out are shaded apart, as Tidewater bakes them).
 */
function gateRail(def: WalkDef, wood: Mesh | null): { mesh: Mesh; box: BoxCollider } {
  const g = def.gate;
  const L = g.to - g.from;
  const mid = (g.from + g.to) / 2;
  // [bottom, top, half-thickness across the line] of each rail over the deck, as the bake lays them
  const rails: [number, number, number][] = [
    [0.95, 0.995, 0.1],
    [0.41, 0.55, 0.025],
  ];
  const parts: BufferGeometry[] = [];
  for (const [y0, y1, t] of rails) {
    const up = new Color();
    const side = new Color();
    let nu = 0;
    let ns = 0;
    if (wood) {
      const P = wood.geometry.getAttribute('position');
      const N = wood.geometry.getAttribute('normal');
      const C = wood.geometry.getAttribute('color');
      for (let i = 0; i < P.count; i++) {
        const y = P.getY(i) - DECK;
        if (y < y0 - 0.006 || y > y1 + 0.006) continue;
        const [a, c] = g.alongX ? [P.getX(i), P.getZ(i)] : [P.getZ(i), P.getX(i)];
        if (Math.abs(c - g.line) > t + 0.006) continue;
        if (!((a > g.from - 0.6 && a < g.from + 0.01) || (a > g.to - 0.01 && a < g.to + 0.6))) continue;
        const k = Math.abs(N.getY(i)) > 0.7;
        (k ? up : side).r += C.getX(i);
        (k ? up : side).g += C.getY(i);
        (k ? up : side).b += C.getZ(i);
        if (k) nu++;
        else ns++;
      }
    }
    const fallback = new Color(0x3a3128);
    const cu = nu ? up.multiplyScalar(1 / nu) : fallback;
    const cs = ns ? side.multiplyScalar(1 / ns) : fallback;
    const box = new BoxGeometry(g.alongX ? L : t * 2, y1 - y0, g.alongX ? t * 2 : L).toNonIndexed();
    box.translate(g.alongX ? mid : g.line, DECK + (y0 + y1) / 2, g.alongX ? g.line : mid);
    const n = box.getAttribute('normal');
    const col = new Float32Array(n.count * 3);
    for (let i = 0; i < n.count; i++) {
      const c = Math.abs(n.getY(i)) > 0.7 ? cu : cs;
      col.set([c.r, c.g, c.b], i * 3);
    }
    box.setAttribute('color', new Float32BufferAttribute(col, 3));
    box.deleteAttribute('uv');
    parts.push(box);
  }
  const mesh = new Mesh(mergeGeometries(parts, false)!, new MeshLambertMaterial({ vertexColors: true }));
  const box: BoxCollider = { tag: 'pierRail', walkable: false, solid: true, cx: g.alongX ? mid : g.line, cz: g.alongX ? g.line : mid, hx: g.alongX ? L / 2 : 0.08, hz: g.alongX ? 0.08 : L / 2, rotY: 0, top: DECK + 1.0, bottom: DECK };
  return { mesh, box };
}

/** the lanterns' glass: amber by day, lit after dark (Walks.update) */
const lanternGlass = new MeshLambertMaterial({ color: 0x9a8a68, emissive: 0xffb45a, emissiveIntensity: 0 });
const lanternIron = new MeshLambertMaterial({ color: 0x2c2a28 });
/** how far below its hook the lantern's glass is centred */
const LANTERN_GLASS_Y = 0.24;

/**
 * A ship's lantern hanging from its hook (the origin): a ring, a hood, four corner bars round
 * the glass, a base and a drip below.
 */
function lantern(glass: MeshLambertMaterial): Group {
  const g = new Group();
  const iron = (geo: BufferGeometry, y: number, x = 0, z = 0): void => {
    const m = new Mesh(geo, lanternIron);
    m.position.set(x, y, z);
    g.add(m);
  };
  // the ring on the hook, and the hood (a four-sided roof)
  const ring = new Mesh(new TorusGeometry(0.03, 0.007, 5, 12), lanternIron);
  ring.position.y = -0.03;
  g.add(ring);
  const hood = new ConeGeometry(0.12, 0.09, 4, 1);
  hood.rotateY(Math.PI / 4);
  iron(hood, -0.1);
  iron(new BoxGeometry(0.17, 0.02, 0.17), -0.145);
  // the glass and the bars at its corners
  const pane = new Mesh(new BoxGeometry(0.13, 0.17, 0.13), glass);
  pane.position.y = -LANTERN_GLASS_Y;
  g.add(pane);
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ])
    iron(new BoxGeometry(0.018, 0.19, 0.018), -LANTERN_GLASS_Y, x * 0.068, z * 0.068);
  iron(new BoxGeometry(0.16, 0.025, 0.16), -0.335);
  iron(new ConeGeometry(0.03, 0.05, 6).rotateX(Math.PI), -0.37);
  return g;
}
