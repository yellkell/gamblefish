/**
 * THE WALKS: boardwalks you build off the pier head with wood (the layout is woodworks/gates.ts).
 *
 * Each has a build crate by its gateway, with a board on it: how many logs it still needs, how
 * many you're carrying, and PUT IN WOOD. Point and click: your logs fly out of your backpack into
 * the crate one after another (a thunk each), and the walk lays itself out, a bay at a time: its
 * piles, cap beam and stringers, then the planks dropping on, then the rails, a clap and two
 * hammer taps per step. Until its first bay is down a rope with a sign hangs across the gateway.
 * The deep walk's crate stays shut until the reef walk is finished.
 *
 * Built like Tidewater's pier: weathered boards in slightly different tones, round piles driven
 * into the sea floor, a top and mid rail on posts, a platform at the end with lanterns.
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
  Euler,
  Vector3,
  type Camera,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { logThunk, plankLay, uiDeny } from '../audio/sfx.ts';
import type { GameState } from '../fishing/tidewater.ts';
import { font, onFontsReady } from '../ui/fonts.ts';
import { INK, roundRect } from '../ui/panel.ts';
import { InteractivePanel, register } from '../ui/pointer.ts';
import type { BoxCollider } from '../world/data.ts';
import { CRATES, DECK, HEAD_STEPS, logsFor, stepsOf, WALK_W, WALKS, type WalkDef, type WalkId } from './gates.ts';

/** seconds a step takes to lay, and between logs flying into the crate */
const STEP_S = 0.42;
const LOG_S = 0.1;

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
  board: InteractivePanel;
  rope: Group;
  crate: Group;
  lanterns: Mesh[];
}

export interface WalkDeps {
  state: GameState;
  /** the sea floor under (x, z) */
  ground: (x: number, z: number) => number;
  /** a floor or a wall for the teleport (world/surfaces.ts addBox) */
  addBox: (b: BoxCollider) => void;
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
      this.paintBoard(w);
    }
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
    // the piles, cap beam, stringers and planks of a stretch [z0, z1] of deck `w` wide
    const deck = (step: number, z0: number, z1: number, w: number, piles: number[]): void => {
      for (const pz of piles) {
        for (const px of [-w / 2 + 0.12, w / 2 - 0.12]) P.cyl(step, px, seabed(px, pz), DECK - 0.36, pz, 0.14, pile);
        P.box(step, 0, DECK - 0.44, pz, w + 0.2, 0.18, 0.2, beam);
      }
      for (const sx of [-w / 2 + 0.3, 0, w / 2 - 0.3]) P.box(step, sx, DECK - 0.16, (z0 + z1) / 2, 0.1, 0.18, z1 - z0, beam);
      for (let pz = z0 + 0.11; pz < z1; pz += 0.23) P.box(step, (r() - 0.5) * 0.02, DECK - 0.025, Math.min(pz, z1 - 0.1), w + (r() - 0.5) * 0.04, 0.05, 0.2, timber(r), (r() - 0.5) * 0.012);
    };
    // a rail along one side of a stretch: posts at its ends, a top and a mid rail
    const railRun = (step: number, x: number, z0: number, z1: number, posts: number[]): void => {
      for (const pz of posts) P.box(step, x, DECK + 0.5, pz, 0.11, 1.0, 0.11, post);
      P.box(step, x, DECK + 0.99, (z0 + z1) / 2, 0.16, 0.05, z1 - z0 + 0.06, rail);
      P.box(step, x, DECK + 0.5, (z0 + z1) / 2, 0.05, 0.12, z1 - z0, rail);
      wall(step, x, (z0 + z1) / 2, 0.08, (z1 - z0) / 2);
    };

    // the bays
    for (let i = 0; i < def.bays; i++) {
      colliders.push([]);
      const z0 = i * def.bay;
      const z1 = z0 + def.bay;
      deck(i, z0, z1, WALK_W, i === 0 ? [0.2, z1] : [z1]);
      for (const x of [-half + 0.05, half - 0.05]) railRun(i, x, z0, z1, i === 0 ? [z0, z1] : [z1]);
      floor(i, 0, (z0 + z1) / 2, half, def.bay / 2 + 0.05);
    }
    // the platform at the end, in four
    const [hw, hd] = def.head;
    const L0 = def.bays * def.bay;
    const q = hd / HEAD_STEPS;
    const lanterns: Mesh[] = [];
    for (let k = 0; k < HEAD_STEPS; k++) {
      const s = def.bays + k;
      colliders.push([]);
      const z0 = L0 + k * q;
      const z1 = z0 + q;
      deck(s, z0, z1, hw, k === HEAD_STEPS - 1 ? [z0, z1 - 0.2] : [z0 + q / 2]);
      for (const x of [-hw / 2 + 0.05, hw / 2 - 0.05]) railRun(s, x, z0, z1, [z1]);
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
      if (k === HEAD_STEPS - 1) {
        // the far rail, and a lantern on a post at each corner
        P.box(s, 0, DECK + 0.99, z1, hw, 0.05, 0.16, rail);
        P.box(s, 0, DECK + 0.5, z1, hw, 0.12, 0.05, rail);
        for (const x of [-hw / 4, 0, hw / 4]) P.box(s, x, DECK + 0.5, z1, 0.11, 1.0, 0.11, post);
        wall(s, 0, z1, hw / 2, 0.08);
        for (const side of [-1, 1]) {
          P.box(s, side * (hw / 2 - 0.05), DECK + 1.3, z1, 0.13, 2.6, 0.13, post);
          P.box(s, side * (hw / 2 - 0.05), DECK + 2.62, z1, 0.3, 0.05, 0.3, post);
          const lamp = new Mesh(new BoxGeometry(0.2, 0.28, 0.2), new MeshBasicMaterial({ color: 0xffd28a, toneMapped: false }));
          const [wx, wz] = toWorld(side * (hw / 2 - 0.05), z1);
          lamp.position.set(wx, DECK + 2.45, wz);
          lamp.visible = false;
          this.group.add(lamp);
          lanterns.push(lamp);
        }
      }
    }

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

    // the rope across the gateway, with its sign, until the first bay is down
    const rope = new Group();
    {
      const g = def.gate;
      const span = g.to - g.from;
      const ropeMesh = new Mesh(new CylinderGeometry(0.018, 0.018, span, 6).rotateZ(Math.PI / 2), new MeshLambertMaterial({ color: 0xc8b48a }));
      const sign = new Mesh(new PlaneGeometry(0.62, 0.3), new MeshBasicMaterial({ map: signTexture(def.id === 'reef' ? 'TO THE REEF' : 'TO THE DEEP'), toneMapped: false }));
      sign.position.set(0, -0.2, 0);
      const back = sign.clone();
      back.rotation.y = Math.PI;
      rope.add(ropeMesh, sign, back);
      if (g.alongX) rope.position.set((g.from + g.to) / 2, DECK + 0.78, g.line);
      else {
        rope.position.set(g.line, DECK + 0.78, (g.from + g.to) / 2);
        rope.rotation.y = Math.PI / 2;
      }
      this.group.add(rope);
    }

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
    const board = new InteractivePanel([640, 520], [0.5, 0.406]);
    board.mesh.position.set(0, 0.62 + 0.26, 0);
    // faces the middle of the pier head
    crate.rotation.y = Math.atan2(55 - cx, 36.5 - cz);
    board.mesh.rotation.x = -0.35;
    crate.add(board.mesh);
    register(board);
    this.group.add(crate);
    this.deps.addBox({ tag: 'buildCrate', walkable: false, solid: true, cx, cz, hx: 0.4, hz: 0.4, rotY: 0, top: DECK + 0.62, bottom: DECK });

    const built: Built = { def, mesh, uniforms, shown: 0, dropT: 1, colliders, flying: [], queued: 0, queueT: 0, board, rope, crate, lanterns };
    board.paint = () => this.paintBoard(built);
    board.onClick = (id) => id === 'deposit' && this.deposit(built);
    board.repaintOnFonts(() => this.paintBoard(built));
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
      w.rope.visible = w.shown === 0;
      const fill = w.crate.getObjectByName('fill')!;
      const left = this.logsIn(w.def) - w.shown * w.def.cost;
      fill.position.y = 0.06 + Math.min(0.5, left * 0.05);
      fill.visible = left > 0;
      for (const l of w.lanterns) l.visible = w.shown >= stepsOf(w.def);
    }
  }

  /** A step has come down: nail it, make it walkable, and see if the walk's done. */
  private landed(w: Built): void {
    const i = w.shown - 1;
    plankLay();
    for (const b of w.colliders[i] ?? []) this.deps.addBox(b);
    this.paintBoard(w);
    if (w.shown === stepsOf(w.def)) {
      const [ax, az] = w.def.dir;
      const L = w.def.bays * w.def.bay + w.def.head[1] / 2;
      this.deps.onFinished?.(w.def, new Vector3(w.def.gate.x + ax * L, DECK + 1.2, w.def.gate.z + az * L));
      for (const o of this.walks) this.paintBoard(o);
    }
  }

  /* ── the board on the crate ────────────────────────────────────────── */

  private paintBoard(w: Built): void {
    const b = w.board;
    const c = b.ctx;
    const [W, H] = b.px;
    b.clear();
    roundRect(c, 6, 6, W - 12, H - 12, 26);
    c.fillStyle = 'rgba(38, 26, 16, 0.94)';
    c.fill();
    c.lineWidth = 6;
    c.strokeStyle = '#c8a26a';
    c.stroke();
    c.textBaseline = 'alphabetic';
    c.textAlign = 'center';
    c.font = font(700, 50);
    c.fillStyle = '#ffd89a';
    c.fillText(w.def.title, W / 2, 74, W - 60);
    const total = logsFor(w.def);
    const inCrate = Math.min(total, this.logsIn(w.def));
    const done = w.shown >= stepsOf(w.def) && inCrate >= total;
    const open = this.open(w.def);
    c.font = font(500, 26);
    c.fillStyle = INK.dim;
    c.fillText(w.def.id === 'reef' ? 'a boardwalk out over the reef' : 'a boardwalk out past the drop-off', W / 2, 114, W - 60);
    // progress
    const bx = 50;
    const bw = W - 100;
    c.fillStyle = 'rgba(255, 255, 255, 0.12)';
    roundRect(c, bx, 150, bw, 34, 17);
    c.fill();
    c.fillStyle = done ? '#7dff5a' : '#e0a050';
    roundRect(c, bx, 150, Math.max(34, (bw * inCrate) / total), 34, 17);
    c.fill();
    c.font = font(700, 40);
    c.fillStyle = INK.hot;
    c.fillText(done ? 'FINISHED' : `${inCrate} / ${total} logs`, W / 2, 244);
    const ww = this.deps.state.woodworks;
    c.font = font(600, 28);
    c.fillStyle = INK.dim;
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
    c.fillText(note, W / 2, 294, W - 60);
    const can = open && !done && ww.wood > 0;
    b.buttons = can ? [{ id: 'deposit', x: 70, y: 340, w: W - 140, h: 120 }] : [];
    roundRect(c, 70, 340, W - 140, 120, 22);
    c.fillStyle = !can ? 'rgba(255,255,255,0.06)' : b.hover === 'deposit' ? '#ffffff' : '#ffc070';
    c.fill();
    c.font = font(700, 46);
    c.fillStyle = can ? '#2a1808' : INK.dim;
    c.fillText(done ? '✓' : 'PUT IN WOOD', W / 2, 418);
    b.commit();
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
