/**
 * THE GOLDEN STATUE: the island's thanks, once you've had everything it has to give
 * (statue/journey.ts: every fish in the book, every dance group, every gem, everything in the
 * shops and a full descent of the helter skelter).
 *
 *  THE STATUE    the sailfish off the logo, big as life and then some (4.4 m, bill to tail),
 *                leaping sail up out of a golden splash, all of it cast in polished gold: the
 *                fish is the game's own model (the props' sailfish), bent once into the leap, its
 *                markings kept as a shading in the gold. Little stars glint over it by day and
 *                night, and after dark it keeps a warm glow of its own.
 *  THE PLINTH    pale coral stone on two steps, a gold band round it, and on its face an engraved
 *                bronze plaque: 100% COMPLETE! THANKS FOR PLAYING! and the credits. On its back a
 *                second: where the island comes from.
 *  THE UNVEILING the moment the last leg's done (not while you're up the helter skelter or have a
 *                fish on), it rises out of the sand where you come down onto the beach
 *                (statue/site.ts), to a fanfare, a modest 100%! banner over it and a word wherever you are; then it's on the
 *                field guide's chart. Once up it's saved (GameState.journey.unveiled) and stands
 *                there every visit.
 *  THE CLOCK     the game clock runs while you're in the headset (not through the intro, nor while
 *                the page is asleep), and the moment the last leg's done its reading is kept
 *                (GameState.journey.time) for the field guide's title page.
 *
 * Built only once it's earned: the gold (one draw, fish, splash and trim together), the stone,
 * the bronze and the plaque's face, and one draw of twinkles.
 */

import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Matrix4,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type Camera,
  type Object3D,
  type Points,
} from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { winFanfare } from '../audio/sfx.ts';
import { casinoEnv } from '../casino/look.ts';
import { Celebration } from '../casino/celebrate.ts';
import { introActive } from '../experience/introGate.ts';
import { Toast } from '../fishing/hud.ts';
import type { GameState } from '../fishing/tidewater.ts';
import { twinklesAt } from '../mining/gemMesh.ts';
import { INK } from '../ui/panel.ts';
import { Batch, rng, rounded, stalk, turned, type Kit } from '../village/craft.ts';
import type { BoxCollider } from '../world/data.ts';
import { journeyDone } from './journey.ts';
import { STATUE } from './site.ts';

export interface StatueDeps {
  state: GameState;
  kit: Kit;
  ground: (x: number, z: number) => number;
  addBox: (b: BoxCollider) => void;
  removeBox: (b: BoxCollider) => void;
  /** 0 by day .. 1 after dark (world/sky.ts) */
  night: { value: number };
  /** the shops' catalogue (village/homeGoods.ts GOODS ids) */
  goods: readonly string[];
  /** not now: up the helter skelter, or a fish on the line (it waits till you're free) */
  hold: () => boolean;
  /** is the game being played (in the headset)? the clock runs only then */
  playing: () => boolean;
}

/** the gold: warm, polished, a little deeper in the shadows of the fish's markings */
const GOLD = '#ffc53d';
/** the plaque's frame: bronze, darker than the gold */
const BRONZE = '#a8743a';
/** a frame longer than this (s) is the page asleep, not play: the clock skips it */
const CLOCK_GAP = 0.5;
/** how often the clock goes into the save, if nothing else has saved it (s) */
const CLOCK_SAVE = 60;
/** how long it takes to rise out of the sand (s) */
const RISE_S = 6;
/** the fish, bill to tail, as modelled (m: STATUE.scale stands it up bigger) */
const FISH_LEN = 4.4;

/** the plinth, in the statue's frame (y up from the highest sand under it, +z the plaque's face) */
const STEP1 = STATUE.step;
const STEP2: [number, number] = [3.0, 2.4];
const BODY: [number, number, number] = [2.2, 1.5, 1.6];
const TOP_Y = STATUE.top; // = the steps (0.5) + BODY's height + the cornice (0.18)
/** how far below the sand it starts its rise (world m) */
const SUNK = (TOP_Y + FISH_LEN + 1) * STATUE.scale;

export class Statue {
  readonly group = new Group();
  private readonly d: StatueDeps;
  private built = false;
  private rise = -1;
  private poll = 0;
  /** the clock's last tick (performance.now, ms; 0: stopped), and play since it last saved (s) */
  private lastTick = 0;
  private unsaved = 0;
  private base = 0;
  private box: BoxCollider | null = null;
  private gold!: MeshStandardMaterial;
  private plaque!: MeshStandardMaterial;
  private backPlaque!: MeshStandardMaterial;
  private sparkle: Points | null = null;
  /** where the bill is, in the statue's frame (the unveiling's burst goes off there) */
  private readonly bill = new Vector3();
  private readonly toast = new Toast();
  private readonly party: Celebration;

  constructor(parent: Object3D, deps: StatueDeps) {
    this.d = deps;
    this.group.visible = false;
    this.group.position.set(STATUE.x, 0, STATUE.z);
    this.group.rotation.y = STATUE.yaw;
    this.group.scale.setScalar(STATUE.scale);
    parent.add(this.group);
    this.toast.panel.mesh.visible = false;
    parent.add(this.toast.panel.mesh);
    this.party = new Celebration(this.group, () => TOP_Y, () => deps.kit.renderer.xr.getSession());
    deps.state.onChange(() => (this.poll = 0), { fish: true });
  }

  /** is it up (or on its way up)? */
  get standing(): boolean {
    return this.built && this.group.visible;
  }

  update(dt: number, camera: Camera): void {
    this.tick();
    this.toast.update(dt, camera);
    if (this.built) this.party.update(dt, camera);
    if ((this.poll -= dt) <= 0) {
      this.poll = 1;
      this.reconcile();
    }
    if (this.rise >= 0) {
      this.rise = Math.min(1, this.rise + dt / RISE_S);
      // up out of the sand, slowing as it comes to rest
      const k = 1 - Math.pow(1 - this.rise, 3);
      this.group.position.y = this.base - SUNK * (1 - k);
      if (this.rise >= 1) {
        this.rise = -1;
        // a good win's burst, not the casino's jackpot: a plain banner, no rays, nothing in your face
        this.party.win({ at: this.bill.clone(), tier: 2, banner: '100%!', scale: 3.5, coins: false });
      }
    }
    // gold shines in the sun; after dark its studio light goes and a warm glow of its own comes up
    if (this.built) {
      const n = this.d.night.value;
      this.gold.envMapIntensity = 1.3 * (1 - 0.85 * n);
      this.gold.emissiveIntensity = 0.06 + 0.3 * n;
      this.plaque.envMapIntensity = this.backPlaque.envMapIntensity = 1.1 * (1 - 0.85 * n);
    }
  }

  /**
   * The game clock: wall time while you play (dt's clamped for the physics; a speedrun's clock
   * isn't), a long gap skipped as the page asleep. Into the save with everything else, and once a
   * minute on its own.
   */
  private tick(): void {
    const now = performance.now();
    if (!this.d.playing() || introActive()) {
      this.lastTick = 0;
      return;
    }
    const s = this.lastTick ? (now - this.lastTick) / 1000 : 0;
    this.lastTick = now;
    if (s <= 0 || s > CLOCK_GAP) return;
    this.d.state.journey.played += s;
    if ((this.unsaved += s) >= CLOCK_SAVE) {
      this.unsaved = 0;
      this.d.state.save();
    }
  }

  /** Up if it's been earned (and unveiled), not if it hasn't (a save that's been reset). */
  private reconcile(): void {
    const j = this.d.state.journey;
    const done = !j.unveiled && journeyDone(this.d.state, this.d.goods);
    // the clock stops the moment the last leg's done, even if the statue waits for you to be free
    if (done && j.time === null) {
      j.time = j.played;
      this.d.state.save();
    }
    if (done && !this.d.hold() && !introActive()) {
      j.unveiled = true;
      this.d.state.save();
      this.d.state.emit();
      this.show(true);
      return;
    }
    if (j.unveiled && !this.group.visible) this.show(false);
    else if (!j.unveiled && this.group.visible) this.hide();
  }

  /** Put it up: straight there, or (`unveil`) rising out of the sand with its fanfare. */
  private show(unveil: boolean): void {
    if (!this.built) this.build();
    this.group.visible = true;
    this.group.position.y = this.base;
    if (!this.box) {
      this.box = { tag: 'statue', walkable: false, solid: true, cx: STATUE.x, cz: STATUE.z, hx: (STEP1[0] / 2) * STATUE.scale, hz: (STEP1[1] / 2) * STATUE.scale, rotY: STATUE.yaw, top: this.base + TOP_Y * STATUE.scale, bottom: this.base - 1 };
      this.d.addBox(this.box);
    }
    if (!unveil) return;
    this.rise = 0;
    this.group.position.y = this.base - SUNK;
    winFanfare(30);
    this.toast.show('100%! Something golden is rising on the beach by the pier…', 6, INK.amber);
  }

  private hide(): void {
    this.group.visible = false;
    this.rise = -1;
    if (this.box) this.d.removeBox(this.box);
    this.box = null;
  }

  /* ── the making of it ─────────────────────────────────────────────── */

  private build(): void {
    this.built = true;
    const r = this.d.kit.renderer;
    // stand it on the highest sand under its first step (the step runs down into the rest)
    let hi = -Infinity;
    let lo = Infinity;
    const c = Math.cos(STATUE.yaw);
    const s = Math.sin(STATUE.yaw);
    for (let i = -2; i <= 2; i++)
      for (let j = -2; j <= 2; j++) {
        const lx = (i / 2) * (STEP1[0] / 2) * STATUE.scale;
        const lz = (j / 2) * (STEP1[1] / 2) * STATUE.scale;
        const h = this.d.ground(STATUE.x + lx * c + lz * s, STATUE.z - lx * s + lz * c);
        hi = Math.max(hi, h);
        lo = Math.min(lo, h);
      }
    this.base = hi;
    // (in the statue's own, unscaled frame)
    const sunk = (hi - lo) / STATUE.scale + 0.3;

    this.gold = new MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 0.26, envMap: casinoEnv(r), envMapIntensity: 1.3, side: DoubleSide, emissive: new Color(GOLD), emissiveIntensity: 0.06 });
    const stone = stoneMaterial(r);
    const b = new Batch();

    // the plinth: two steps, the body, a cornice, a gold band at its foot and under the cornice
    b.at(stone, rounded(STEP1[0], 0.25 + sunk, STEP1[1], 0.05, 2), 0, (0.25 - sunk) / 2, 0);
    b.at(stone, rounded(STEP2[0], 0.25, STEP2[1], 0.05, 2), 0, 0.375, 0);
    b.at(stone, rounded(BODY[0], BODY[1], BODY[2], 0.06, 2), 0, 0.5 + BODY[1] / 2, 0);
    b.at(stone, rounded(BODY[0] + 0.3, 0.18, BODY[2] + 0.3, 0.05, 2), 0, TOP_Y - 0.09, 0);
    const band = (y: number, h: number, grow: number): void => void b.add(this.gold, goldPiece(rounded(BODY[0] + grow, h, BODY[2] + grow, h * 0.45, 2)), new Matrix4().makeTranslation(0, y, 0));
    band(0.56, 0.07, 0.05);
    band(TOP_Y - 0.22, 0.05, 0.04);

    // the plaque: a bronze plate in a raised frame, on the plinth's face
    const face = BODY[2] / 2;
    const [pw, ph] = [1.78, 1.12];
    const py = 0.5 + BODY[1] / 2 + 0.02;
    b.add(this.gold, goldPiece(rounded(pw + 0.1, ph + 0.1, 0.05, 0.02, 2), BRONZE), new Matrix4().makeTranslation(0, py, face + 0.012));
    this.plaque = new MeshStandardMaterial({ map: plaqueTexture(), roughness: 0.42, metalness: 0.75, envMap: casinoEnv(r), envMapIntensity: 1.1 });
    b.at(this.plaque, rounded(pw, ph, 0.012, 0.004, 1), 0, py, face + 0.04);
    // and on the back, the same again, turned to face the sea: whose island this is
    b.add(this.gold, goldPiece(rounded(pw + 0.1, ph + 0.1, 0.05, 0.02, 2), BRONZE), new Matrix4().makeTranslation(0, py, -face - 0.012));
    this.backPlaque = this.plaque.clone();
    this.backPlaque.map = islandPlaqueTexture();
    b.at(this.backPlaque, rounded(pw, ph, 0.012, 0.004, 1), 0, py, -face - 0.04, 0, Math.PI);

    // the splash it leaps from: a crown of water on the plinth, a plume twisting up round its tail
    const top = TOP_Y;
    b.add(
      this.gold,
      goldPiece(
        turned([
          [0, 0],
          [0.72, 0],
          [0.8, 0.05],
          [0.74, 0.12],
          [0.5, 0.1],
          [0.25, 0.14],
          [0, 0.16],
        ], 32),
      ),
      new Matrix4().makeTranslation(0.25, top, 0),
    );
    const rr = rng(11);
    for (let i = 0; i < 11; i++) {
      // the crown's points, leaning out
      const a = (i / 11) * Math.PI * 2 + rr() * 0.3;
      const h = 0.18 + rr() * 0.22;
      const o = new Vector3(0.25 + Math.cos(a) * 0.68, top + 0.06, Math.sin(a) * 0.68);
      const tip = o.clone().add(new Vector3(Math.cos(a) * 0.12, h, Math.sin(a) * 0.12));
      b.add(this.gold, goldPiece(stalk([o, o.clone().lerp(tip, 0.55).add(new Vector3(0, 0.03, 0)), tip], 0.05, 0.012, 6, 8)));
      b.add(this.gold, goldPiece(new IcosahedronGeometry(0.035 + rr() * 0.02, 1)), new Matrix4().makeTranslation(tip.x + Math.cos(a) * 0.05, tip.y + 0.07, tip.z + Math.sin(a) * 0.05));
    }

    // the fish, baked into its leap and set in the statue's frame, its tail in the plume
    const fish = this.fishGeometry();
    fish.geo.computeBoundingBox();
    const tail = fish.tail;
    const place = new Matrix4().makeTranslation(0.4 - tail.x, top + 0.95 - tail.y, -tail.z);
    fish.geo.applyMatrix4(place);
    this.bill.copy(fish.bill).applyMatrix4(place);
    const tailAt = tail.clone().applyMatrix4(place);
    b.add(this.gold, fish.geo);
    // three strands of water twisting up round the tail, and one breaking over as a curl
    for (let k = 0; k < 3; k++) {
      const pts: Vector3[] = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const a = k * ((Math.PI * 2) / 3) + t * 2.6;
        const rad = 0.42 * (1 - t) + 0.1;
        pts.push(new Vector3(0.25 + (tailAt.x - 0.25) * t + Math.cos(a) * rad, top + 0.1 + (tailAt.y + 0.35 - top - 0.1) * t, Math.sin(a) * rad * 0.9));
      }
      b.add(this.gold, goldPiece(stalk(pts, 0.2, 0.05, 10, 40, true)));
    }
    const curl: Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const a = -0.6 + t * 3.4;
      curl.push(new Vector3(tailAt.x + 0.15 + Math.sin(a) * 0.45 * (1 - 0.4 * t), tailAt.y + 0.1 + (1 - Math.cos(a)) * 0.35 * (1 - 0.3 * t), 0.18 * Math.sin(t * 3)));
    }
    b.add(this.gold, goldPiece(stalk(curl, 0.12, 0.02, 10, 40, true)));
    // droplets flung off along the leap
    for (let i = 0; i < 16; i++) {
      const t = rr();
      const p = tailAt.clone().lerp(this.bill, t * 0.8).add(new Vector3((rr() - 0.5) * 0.9, -0.25 - rr() * 0.4, (rr() - 0.5) * 0.9));
      b.add(this.gold, goldPiece(new IcosahedronGeometry(0.03 + rr() * 0.045, 1)), new Matrix4().makeTranslation(p.x, p.y, p.z));
    }

    this.group.add(b.group());

    // twinkles over the fish (from its own surface) and the splash
    const pos = fish.geo.getAttribute('position');
    const pts: number[] = [];
    const tr = rng(29);
    for (let i = 0; i < 46; i++) {
      const v = Math.floor(tr() * pos.count);
      pts.push(pos.getX(v), pos.getY(v), pos.getZ(v));
    }
    for (let i = 0; i < 10; i++) {
      const a = tr() * Math.PI * 2;
      pts.push(0.25 + Math.cos(a) * 0.7, top + 0.2 + tr() * 0.8, Math.sin(a) * 0.7);
    }
    this.sparkle = twinklesAt(pts, '#ffe08a', 41, 3.2);
    this.group.add(this.sparkle);
    this.group.updateMatrixWorld(true);
  }

  /**
   * The sailfish's own model, gilded and bent into the leap: its back arched along its length,
   * a thrash of the tail across (Tidewater's swim wave, frozen, as on the taxidermist's plaques),
   * then stood up in the statue's frame: flank to the plaque's side, bill up and away.
   */
  private fishGeometry(): { geo: BufferGeometry; tail: Vector3; bill: Vector3 } {
    const { mesh } = this.d.kit.props.makeFish('sailfish');
    const src = mesh.geometry;
    mesh.material.dispose();
    const P = src.getAttribute('position');
    const N = src.getAttribute('normal');
    const C = src.getAttribute('color');
    const U = src.getAttribute('along');
    const FIN = src.getAttribute('fin');
    src.computeBoundingBox();
    const zc = (src.boundingBox!.min.z + src.boundingBox!.max.z) / 2;
    // the arch's radius (in the model's unit length) and the frozen thrash
    const R = 1.5;
    const amp = 0.06;
    const phase = 0.12;
    // the leap: bill up and toward the statue's −x, back toward +x, flank toward +z
    const lean = 0.95;
    const D = new Vector3(-Math.cos(lean), Math.sin(lean), 0);
    const B = new Vector3(Math.sin(lean), Math.cos(lean), 0);
    const F = new Vector3(0, 0, 1);
    const toStatue = new Matrix4().makeBasis(F, B, D).scale(new Vector3(FISH_LEN, FISH_LEN, FISH_LEN));
    const turn = new Matrix4().makeBasis(F, B, D);
    const n = P.count;
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const gold = new Color(GOLD);
    const p = new Vector3();
    const q = new Vector3();
    const bend = (x: number, y: number, z: number, u: number, out: Vector3): Vector3 => {
      const env = 0.12 + u * u;
      const ph = u * 5.2 - phase * Math.PI * 2;
      const side = amp * env * Math.sin(ph);
      const th = (z - zc) / R;
      return out.set(x + side, R * Math.cos(th) - R + y * Math.cos(th), R * Math.sin(th) + y * Math.sin(th) + zc);
    };
    for (let i = 0; i < n; i++) {
      const u = U ? U.getX(i) : 0.5 - (P.getZ(i) - zc);
      bend(P.getX(i), P.getY(i), P.getZ(i), u, p).applyMatrix4(toStatue);
      pos.set([p.x, p.y, p.z], i * 3);
      // the normal: the thrash's shear, then the arch's turn at that point along the body
      const env = 0.12 + u * u;
      const ph = u * 5.2 - phase * Math.PI * 2;
      const dside = amp * (2 * u * Math.sin(ph) + env * 5.2 * Math.cos(ph));
      q.set(N.getX(i), N.getY(i), N.getZ(i) + N.getX(i) * dside);
      // the fins cast with their rays standing out: a flat sheet of gold caught the sky all at once
      if (FIN && FIN.getX(i) > 0.5) q.z += 0.4 * Math.sin(P.getZ(i) * 140) * Math.sign(q.x || 1);
      q.normalize();
      const th = (P.getZ(i) - zc) / R;
      q.set(q.x, q.y * Math.cos(th) - q.z * Math.sin(th), q.y * Math.sin(th) + q.z * Math.cos(th)).applyMatrix4(turn).normalize();
      nor.set([q.x, q.y, q.z], i * 3);
      // its markings, kept as a deeper or brighter gold
      const l = C ? 0.3 * C.getX(i) + 0.55 * C.getY(i) + 0.15 * C.getZ(i) : 0.6;
      const k = 0.62 + 0.5 * Math.min(1, l);
      col.set([gold.r * k, gold.g * k, gold.b * k], i * 3);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('normal', new BufferAttribute(nor, 3));
    geo.setAttribute('color', new BufferAttribute(col, 3));
    geo.setAttribute('uv', new Float32BufferAttribute(new Float32Array(n * 2), 2));
    geo.setIndex(src.getIndex()!.clone());
    // the spine's two ends, in the statue's frame
    const bb = src.boundingBox!;
    const tail = bend(0, 0, bb.min.z + (bb.max.z - bb.min.z) * 0.06, 0.94, new Vector3()).applyMatrix4(toStatue);
    const bill = bend(0, 0, bb.max.z, 0, new Vector3()).applyMatrix4(toStatue);
    return { geo, tail, bill };
  }
}

/** a gold piece: the gold's colour in every vertex, welded for the batch */
function goldPiece(g: BufferGeometry, colour = GOLD): BufferGeometry {
  const out = g.index ? g : mergeVertices(g);
  const c = new Color(colour);
  const n = out.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  out.setAttribute('color', new Float32BufferAttribute(a, 3));
  return out;
}

/** pale coral stone, flecked and faintly veined, laid on from each side (craft.ts boxUV) */
function stoneMaterial(r: Kit['renderer']): MeshStandardMaterial {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e6dac2';
  g.fillRect(0, 0, 256, 256);
  const rr = rng(5);
  for (let i = 0; i < 2200; i++) {
    const v = rr();
    g.fillStyle = v < 0.45 ? 'rgba(150, 128, 100, 0.22)' : v < 0.8 ? 'rgba(255, 250, 238, 0.35)' : 'rgba(196, 150, 120, 0.25)';
    g.fillRect(rr() * 256, rr() * 256, 1 + rr() * 2.5, 1 + rr() * 2.5);
  }
  g.strokeStyle = 'rgba(160, 140, 112, 0.18)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    let x = rr() * 256;
    let y = 0;
    g.moveTo(x, y);
    while (y < 256) {
      x += (rr() - 0.5) * 30;
      y += 12 + rr() * 20;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const map = new CanvasTexture(c);
  map.colorSpace = SRGBColorSpace;
  map.wrapS = map.wrapT = RepeatWrapping;
  map.anisotropy = 4;
  const m = new MeshStandardMaterial({ map, roughness: 0.78, metalness: 0, envMap: casinoEnv(r), envMapIntensity: 0.25 });
  // one tile is 0.9 m of stone either way
  m.userData.tile = [0.9, 0.9];
  return m;
}

/** Engraved bronze to letter: the plate, brushed and ruled, and a chisel (`engrave`, `flourish`) for it. */
function bronze(): { c: HTMLCanvasElement; engrave: (text: string, y: number, size: number, style?: string, weight?: number, spacing?: number) => void; flourish: (y: number) => void; done: () => CanvasTexture } {
  const W = 1280;
  const H = 806;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  // the bronze, brushed across, darker at the edges
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#c9954c');
  grad.addColorStop(0.5, '#b07d38');
  grad.addColorStop(1, '#8f6128');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const rr = rng(17);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = rr() < 0.5 ? 'rgba(255, 226, 160, 0.06)' : 'rgba(60, 36, 10, 0.07)';
    g.fillRect(0, rr() * H, W, 1);
  }
  const vig = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.62);
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vig.addColorStop(1, 'rgba(40, 22, 4, 0.45)');
  g.fillStyle = vig;
  g.fillRect(0, 0, W, H);
  // a double rule round it, and a rope of beads inside
  const rule = (inset: number, w: number): void => {
    g.lineWidth = w;
    g.strokeStyle = 'rgba(255, 228, 170, 0.55)';
    g.strokeRect(inset + 1.5, inset + 1.5, W - inset * 2, H - inset * 2);
    g.strokeStyle = 'rgba(46, 26, 6, 0.85)';
    g.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
  };
  rule(22, 6);
  rule(40, 2.5);
  // engraved lettering: cut dark, a bright lip below where the light catches the cut's edge
  const engrave = (text: string, y: number, size: number, style = '', weight = 700, spacing = 0): void => {
    g.font = `${style} ${weight} ${size}px Georgia, 'Times New Roman', serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    (g as unknown as { letterSpacing: string }).letterSpacing = `${spacing}px`;
    g.fillStyle = 'rgba(255, 232, 180, 0.6)';
    g.fillText(text, W / 2 + 1.5, y + 2.5, W - 140);
    g.fillStyle = '#2a1706';
    g.fillText(text, W / 2, y, W - 140);
  };
  // a flourish: a rule with a diamond in the middle
  const flourish = (y: number): void => {
    g.strokeStyle = '#2a1706';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(W / 2 - 300, y);
    g.lineTo(W / 2 - 26, y);
    g.moveTo(W / 2 + 26, y);
    g.lineTo(W / 2 + 300, y);
    g.stroke();
    g.fillStyle = '#2a1706';
    g.beginPath();
    g.moveTo(W / 2, y - 16);
    g.lineTo(W / 2 + 16, y);
    g.lineTo(W / 2, y + 16);
    g.lineTo(W / 2 - 16, y);
    g.closePath();
    g.fill();
  };
  const done = (): CanvasTexture => {
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  return { c, engrave, flourish, done };
}

/** The plaque's face: engraved bronze, the letters cut in and filled dark, their edges catching the light. */
function plaqueTexture(): CanvasTexture {
  const { engrave, flourish, done } = bronze();
  engrave('100% COMPLETE!', 170, 104, '', 700, 6);
  engrave('Thanks for Playing!', 300, 76, 'italic', 400);
  flourish(392);
  engrave('Created by yellkell', 480, 66, '', 400, 1);
  engrave('Music by', 574, 46, 'italic', 400);
  engrave('IBWildcat1998, poopoodoodoo689,', 644, 58, '', 400);
  engrave('JakeThePro & Crystalzach', 714, 58, '', 400);
  return done();
}

/**
 * The back plaque: where the island comes from (vendor/tidewater; its MIT notice is in public/licenses.txt).
 */
function islandPlaqueTexture(): CanvasTexture {
  const { engrave, flourish, done } = bronze();
  engrave('THE ISLAND', 300, 96, '', 700, 6);
  flourish(403);
  engrave('is from Tidewater, by dgreenheck', 510, 70, 'italic', 400);
  return done();
}
