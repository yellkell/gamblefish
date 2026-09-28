/**
 * THE GEM ROCKS: a pickaxe from the Jeweller, big rocks out in the wilds, and the stones inside.
 *
 *  THE PICKAXE   bought at the Jeweller's first window (village/gemWindows.ts). Once it's yours,
 *                walk up to a gem rock and it's in your hand (the rod goes over your shoulder), as
 *                the axe is among the trees.
 *  THE ROCKS     thirty-two, eight on each kind of ground (mining/sites.ts), veined with lines of
 *                light in the colour of what's inside. Swing the pick's point into one: steel rings on
 *                stone, chips and sparks fly, a jolt in your hand, and the veins open wider and
 *                blaze. Six good blows and it bursts apart.
 *  THE TRAY      out of the rubble rises a tray like the dancers' chest pack, lined in black
 *                velvet, with the rock's stones lying in its slots, turning in the light: what's in
 *                it depends on the ground (mining/gems.ts);
 *                its board doesn't say where you are or what they're worth: the sparkle blinds your
 *                eyes, and the Jeweller might want to look at them. Reach in and click one (trigger or grip)
 *                and it's in your pouch; TAKE ALL; CLOSE. Walk away and it sinks back; come back
 *                and it rises again, until you've taken everything.
 *  ONCE ONLY     like a dancers' chest, a rock is a find: once it's broken it stays broken (rubble
 *                where it stood, and nothing in the way of a hop), and never grows back. Stones
 *                you leave in its tray wait there for you.
 *
 * Every stone you take goes into your pouch and into the field guide's gem pages. The Jeweller's
 * second window buys them (village/gemWindows.ts). Your pouch, the pickaxe, the book, and which
 * rocks you've broken (with what's still in each) ride in the save (GameState.gems).
 */

import { createSystem, InputComponent } from '@iwsdk/core';
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  DodecahedronGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Quaternion,
  Vector3,
  type Points,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { gemChime, pickClink, rockBreak, uiDeny } from '../audio/sfx.ts';
import { backpackView } from '../backpack/BackpackSystem.ts';
import { Tray } from '../backpack/tray.ts';
import { introActive } from '../experience/introGate.ts';
import { Toast } from '../fishing/hud.ts';
import type { GameState } from '../fishing/tidewater.ts';
import { pulseHand } from '../input/haptics.ts';
import { Lettering, LOOKS, mount } from '../ui/boards.ts';
import { INK, Panel } from '../ui/panel.ts';
import { InteractivePanel, pointerView, register } from '../ui/pointer.ts';
import type { BoxCollider } from '../world/data.ts';
import { dropTwinkles, gemMesh, tickGems, twinkles } from './gemMesh.ts';
import { GEMS, pocket, ROCK_GRID, rockStock, type RockGem } from './gems.ts';
import { buildPickaxe, buildRock, PICK_TIP, ROCK_TIME, stoneColour, type RockModel } from './rock.ts';
import { ROCK_H, ROCK_R, ROCK_SITES, type RockSite } from './sites.ts';

type Hand = 'left' | 'right';

/** What the mining needs from the game; set by main before registration. */
export const mineDeps: {
  state: GameState | null;
  ground: ((x: number, z: number) => number) | null;
  addBox: ((b: BoxCollider) => void) | null;
  removeBox: ((b: BoxCollider) => void) | null;
  env: Texture | null;
  /** indoors, the backpack open, up the helter skelter, the axe out (the pick stays away) */
  busy: (() => boolean) | null;
} = { state: null, ground: null, addBox: null, removeBox: null, env: null, busy: null };

/** Anyone can ask: is the pick in your hand, is a rock's tray open (the rod goes away for either)? */
export const mineView: {
  pickOut: boolean;
  busy: boolean;
  /** dev: the nearest rock, and how far */
  nearest?: () => { id: string; dist: number; state: string };
  /** dev: break the nearest rock */
  smash?: () => void;
  system?: MiningSystem;
} = { pickOut: false, busy: false };

/** blows it takes to break a rock */
const BLOWS = 6;
/** how fast the point has to be going to bite (m/s) */
const SWING = 2.0;
/** the pick comes out within this of a whole rock (m) */
const PICK_R = 6;
/** the tray rises within OPEN_R of a broken rock, sinks past CLOSE_R; shut with CLOSE, it stays
 *  down till you've been past REARM_R */
const OPEN_R = 3.4;
const CLOSE_R = 6.5;
const REARM_R = 4.5;
/** the rocks are drawn within this */
const DRAW_R = 260;
/** the tray: black velvet, lit from within */
const GEM_TRAY = { lining: 0x160a1e, glow: 0.55 };
const TILT = (35 * Math.PI) / 180;
/** what the tray says as it rises, the sparkle in your eyes (one each time) */
const DAZZLED = ['The sparkle blinds your eyes!', 'The glimmer blinds your eyes!', 'Their shine blinds your eyes!'];
/** a stone in the tray, across its girdle (m) */
const STONE = 0.072;

const _v = new Vector3();
const _w = new Vector3();
const _q = new Quaternion();
const UP = new Vector3(0, 1, 0);

interface Rock {
  site: RockSite;
  base: Vector3;
  group: Group;
  model: RockModel;
  box: BoxCollider;
  state: 'whole' | 'breaking' | 'broken' | 'growing';
  /** seconds in its state */
  t: number;
  blows: number;
  shake: number;
  cooldown: number;
  stock: RockGem[];
  chunks: Group | null;
  flying: { mesh: Mesh; v: Vector3; axis: Vector3; spin: number; rest: boolean }[];
  rubble: Mesh | null;
}

interface Stone {
  gem: RockGem;
  holder: Group;
  sparkle: Points;
}

interface Flight {
  obj: Object3D;
  from: Vector3;
  t: number;
  dur: number;
  scale: number;
  done?: () => void;
}

export class MiningSystem extends createSystem({}) {
  private rocks: Rock[] = [];
  private pick!: Group;
  private readonly tip = new Vector3();
  private readonly lastTip = new Vector3();
  private tipSpeed = 0;
  private toast!: Toast;
  /** the gems the pop-up's counting, and when it last counted one */
  private gotten = 0;
  private gottenAt = 0;
  private chips!: InstancedMesh;
  private chipList: { p: Vector3; v: Vector3; age: number; c: Color; s: number }[] = [];
  private sparks!: InstancedMesh;
  private sparkList: { p: Vector3; v: Vector3; age: number }[] = [];
  private bursts: { p: Points; t: number }[] = [];
  private ready = false;

  /* the tray */
  private tray!: Tray;
  private info!: Panel;
  private infoLetters!: Lettering;
  private buttons!: InteractivePanel;
  private buttonLetters!: Lettering;
  private stones = new Map<RockGem, Stone>();
  private openRock: Rock | null = null;
  private dismissed: Rock | null = null;
  private hover: RockGem | null = null;
  private infoKey = '';
  private dazzle = DAZZLED[0];
  private readonly placedFrom = new Vector3();
  private readonly trig: Record<Hand, boolean> = { left: false, right: false };
  private readonly grip: Record<Hand, boolean> = { left: false, right: false };
  private flights: Flight[] = [];

  init(): void {
    const d = mineDeps;
    if (!d.state || !d.ground || !d.addBox) return;
    this.ready = true;
    const ground = d.ground;
    ROCK_SITES.forEach((site, i) => {
      const model = buildRock(site.ground, i * 37 + 11);
      const group = new Group();
      group.name = `gem-rock-${site.id}`;
      // sunk a little into the slope: its lowest side into the ground, no gap under the high one
      let lo = Infinity;
      for (let a = 0; a < 8; a++) lo = Math.min(lo, ground(site.x + Math.cos(a) * ROCK_R * site.size * 0.8, site.z + Math.sin(a) * ROCK_R * site.size * 0.8));
      const base = new Vector3(site.x, Math.min(lo, ground(site.x, site.z)) - 0.12, site.z);
      group.position.copy(base);
      group.rotation.y = site.yaw;
      group.scale.setScalar(site.size);
      group.add(model.stone);
      this.scene.add(group);
      const box: BoxCollider = { tag: 'gemRock', walkable: false, solid: true, cx: site.x, cz: site.z, hx: ROCK_R * site.size * 0.85, hz: ROCK_R * site.size * 0.85, rotY: 0, top: base.y + ROCK_H * site.size * 0.8, bottom: base.y - 1 };
      d.addBox!(box);
      this.rocks.push({ site, base, group, model, box, state: 'whole', t: 0, blows: 0, shake: 0, cooldown: 0, stock: [], chunks: null, flying: [], rubble: null });
    });
    this.reconcile();
    this.pick = buildPickaxe(d.env);
    this.pick.visible = false;
    this.pick.matrixAutoUpdate = false;
    this.scene.add(this.pick);
    this.toast = new Toast();
    this.toast.panel.mesh.visible = false;
    this.scene.add(this.toast.panel.mesh);
    this.chips = new InstancedMesh(new BoxGeometry(0.035, 0.022, 0.028), new MeshLambertMaterial({ color: 0xffffff }), 80);
    this.chips.count = 0;
    this.chips.frustumCulled = false;
    this.scene.add(this.chips);
    this.sparks = new InstancedMesh(new BoxGeometry(0.006, 0.006, 0.05), new MeshBasicMaterial({ color: 0xffc070, blending: AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }), 40);
    this.sparks.count = 0;
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);
    this.buildTray();
    mineView.system = this;
    mineView.nearest = () => {
      const n = this.nearest(this.camera.getWorldPosition(_v));
      return { id: n.rock.site.id, dist: n.dist, state: n.rock.state };
    };
    mineView.smash = () => {
      const n = this.nearest(this.camera.getWorldPosition(_v));
      if (n.rock.state !== 'whole') return;
      for (let i = 0; i < BLOWS; i++) this.blow(n.rock, n.rock.base.clone().setY(n.rock.base.y + 0.8), 'right', true);
    };
  }

  private get state(): GameState {
    return mineDeps.state!;
  }

  private nearest(p: Vector3, filter?: (r: Rock) => boolean): { rock: Rock; dist: number } {
    let best = this.rocks[0];
    let bd = Infinity;
    for (const r of this.rocks) {
      if (filter && !filter(r)) continue;
      const d = Math.hypot(r.base.x - p.x, r.base.z - p.z);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return { rock: best, dist: bd };
  }

  /* ── the frame ─────────────────────────────────────────────────────── */

  update(delta: number, time: number): void {
    if (!this.ready || introActive()) return;
    const dt = Math.min(delta, 0.05);
    tickGems(time);
    ROCK_TIME.value = time;
    const eye = this.camera.getWorldPosition(_v).clone();
    this.reconcile();
    for (const r of this.rocks) {
      r.group.visible = Math.hypot(r.base.x - eye.x, r.base.z - eye.z) < DRAW_R;
      this.updateRock(r, dt);
    }
    // the pick comes out by a whole rock (if it's yours), and the rod goes away (fishingDeps.indoors)
    const near = this.nearest(eye, (r) => r.state === 'whole');
    const out = this.state.gems.pick && near.dist < PICK_R && !this.openRock && !(mineDeps.busy?.() ?? false);
    mineView.pickOut = out;
    this.pick.visible = out;
    if (out) this.swing(dt);
    else this.lastTip.copy(eye);

    this.updateTray(dt, time, eye);
    this.updateChips(dt);
    this.updateSparks(dt);
    this.bursts = this.bursts.filter((b) => {
      b.t += dt;
      if (b.t < 3) return true;
      this.scene.remove(b.p);
      dropTwinkles(b.p);
      return false;
    });
    this.animateFlights(dt);
    this.toast.update(dt, this.camera);
  }

  /** The pick in your right hand; its point biting into a rock. */
  private swing(dt: number): void {
    const grip = this.player.gripSpaces.right;
    grip.updateWorldMatrix(true, false);
    this.pick.matrix.copy(grip.matrixWorld);
    this.pick.matrixWorldNeedsUpdate = true;
    this.tip.copy(PICK_TIP).applyMatrix4(grip.matrixWorld);
    const sp = this.tip.distanceTo(this.lastTip) / Math.max(dt, 1e-3);
    this.tipSpeed += (sp - this.tipSpeed) * 0.6;
    for (const r of this.rocks) {
      r.cooldown -= dt;
      if (r.state !== 'whole' || r.cooldown > 0 || r.t < 0.5 || Math.max(sp, this.tipSpeed) < SWING) continue;
      // along the point's path since the last frame, so a fast swing can't pass clean through
      for (const k of [0.34, 0.67, 1]) {
        _w.lerpVectors(this.lastTip, this.tip, k);
        if (!this.inside(r, _w, 1.06)) continue;
        this.blow(r, _w.clone(), 'right');
        break;
      }
    }
    this.lastTip.copy(this.tip);
  }

  /** Is `p` inside the rock (its hull as an ellipsoid, grown by `grow`)? */
  private inside(r: Rock, p: Vector3, grow: number): boolean {
    const s = r.site.size * grow;
    const dx = (p.x - r.base.x) / (ROCK_R * 1.02 * s);
    const dy = (p.y - (r.base.y + ROCK_H * 0.33 * r.site.size)) / (ROCK_H * 0.42 * s);
    const dz = (p.z - r.base.z) / (ROCK_R * 1.02 * s);
    return dx * dx + dy * dy + dz * dz < 1;
  }

  private blow(r: Rock, at: Vector3, hand: Hand, quiet = false): void {
    if (r.state !== 'whole') return;
    r.blows++;
    r.shake = 1;
    r.cooldown = 0.3;
    const k = r.blows / BLOWS;
    r.model.crack.value = k;
    if (!quiet) {
      pickClink(k);
      pulseHand(this.renderer.xr.getSession() ?? undefined, hand, 0.9, 60);
    }
    // stone chips off the face, sparks off the steel
    const stone = stoneColour(r.site.ground);
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      this.chipList.push({ p: at.clone(), v: new Vector3(Math.cos(a) * 1.3, 1 + Math.random() * 1.6, Math.sin(a) * 1.3), age: 0, c: stone, s: 0.6 + Math.random() * 0.6 });
    }
    for (let i = 0; i < 10; i++) {
      const v = new Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 3);
      this.sparkList.push({ p: at.clone(), v, age: 0 });
    }
    if (this.chipList.length > 80) this.chipList.splice(0, this.chipList.length - 80);
    if (this.sparkList.length > 40) this.sparkList.splice(0, this.sparkList.length - 40);
    if (r.blows >= BLOWS) this.breakRock(r, quiet);
  }

  /**
   * The world as the save has it: a rock the save says you've broken lies in rubble with what's
   * left of its stones (it may have been broken before this session, or the save arrived after the
   * world was built), and one it doesn't know (a fresh save) stands whole again.
   */
  private reconcile(): void {
    const mined = this.state.gems.mined;
    for (const r of this.rocks) {
      const left = mined[r.site.id];
      if (left) {
        if (r.state === 'whole' || r.state === 'growing') this.lieBroken(r);
        if (r.stock !== left) r.stock = left;
      } else if (r.state === 'broken') {
        if (this.openRock === r) this.closeTray();
        this.regrow(r);
      }
    }
  }

  /** Straight to rubble, no show: a rock broken on another day. */
  private lieBroken(r: Rock): void {
    r.state = 'broken';
    r.t = 0;
    r.blows = BLOWS;
    r.model.crack.value = 1;
    r.model.stone.visible = false;
    r.model.stone.scale.setScalar(1);
    mineDeps.removeBox?.(r.box);
    if (!r.rubble) {
      r.rubble = this.rubble(r);
      r.group.add(r.rubble);
    }
  }

  /** Whole again, up out of the ground (only when the save forgets it: a new game). */
  private regrow(r: Rock): void {
    r.state = 'growing';
    r.t = 0;
    r.stock = [];
    r.blows = 0;
    r.model.crack.value = 0;
    if (r.rubble) r.group.remove(r.rubble);
    r.rubble = null;
    r.model.stone.visible = true;
    mineDeps.addBox?.(r.box);
  }

  /** It goes: the chunks fly apart, and the stones inside are yours. */
  private breakRock(r: Rock, quiet: boolean): void {
    r.state = 'breaking';
    r.t = 0;
    r.stock = rockStock(r.site.ground, Math.random);
    // broken for good: the save remembers it, and what's in it
    this.state.gems.mined[r.site.id] = r.stock;
    this.state.save();
    this.state.emit();
    r.model.stone.visible = false;
    mineDeps.removeBox?.(r.box);
    const g = new Group();
    g.position.copy(r.group.position);
    g.quaternion.copy(r.group.quaternion);
    g.scale.copy(r.group.scale);
    const mid = new Vector3(0, ROCK_H * 0.3, 0);
    r.flying = r.model.chunks.map((c) => {
      const mesh = new Mesh(c.mesh.geometry, c.mesh.material);
      mesh.position.copy(c.home);
      g.add(mesh);
      const out = c.home.clone().sub(mid).setY(0).normalize();
      const v = out.multiplyScalar(1.2 + Math.random() * 1.4).add(new Vector3(0, 2 + Math.random() * 1.5, 0));
      return { mesh, v, axis: new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), spin: 3 + Math.random() * 5, rest: false };
    });
    this.scene.add(g);
    r.chunks = g;
    // the stones' light bursting out
    const centre = r.base.clone().setY(r.base.y + ROCK_H * 0.4 * r.site.size);
    const burst = twinkles(28, 0.7, GEMS[r.stock[0]?.id ?? 'peridot'].colour, Math.floor(Math.random() * 999), 2.2);
    burst.position.copy(centre);
    this.scene.add(burst);
    this.bursts.push({ p: burst, t: 0 });
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      this.chipList.push({ p: centre.clone().add(new Vector3(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4)), v: new Vector3(Math.cos(a) * 2.2, 1.5 + Math.random() * 2.5, Math.sin(a) * 2.2), age: 0, c: stoneColour(r.site.ground), s: 1 + Math.random() });
    }
    if (!quiet) {
      rockBreak();
      const s = this.renderer.xr.getSession() ?? undefined;
      pulseHand(s, 'right', 1, 160);
      pulseHand(s, 'left', 0.7, 140);
    }
  }

  private updateRock(r: Rock, dt: number): void {
    r.t += dt;
    const m = r.model;
    if (r.state === 'whole') {
      r.shake = Math.max(0, r.shake - dt * 5);
      const sh = r.shake * 0.02 * Math.sin(performance.now() * 0.09);
      m.stone.position.set(sh, 0, sh * 0.6);
      return;
    }
    if (r.state === 'breaking') {
      const g = r.chunks!;
      for (const f of r.flying) {
        if (!f.rest) {
          f.v.y -= 9.8 * dt;
          f.mesh.position.addScaledVector(f.v, dt / r.site.size);
          f.mesh.rotateOnAxis(f.axis, f.spin * dt);
          if (f.mesh.position.y < 0.12) {
            f.mesh.position.y = 0.12;
            f.v.multiplyScalar(0.35);
            f.v.y = Math.abs(f.v.y) * 0.4;
            f.spin *= 0.5;
            if (f.v.length() < 0.4) f.rest = true;
          }
        }
        // then they sink away into the rubble
        if (r.t > 3) {
          f.mesh.position.y -= dt * 0.35;
          f.mesh.scale.setScalar(Math.max(0.01, 1 - (r.t - 3) / 2));
        }
      }
      if (r.t > 1.2 && !r.rubble) {
        r.rubble = this.rubble(r);
        r.group.add(r.rubble);
      }
      if (r.t > 5) {
        this.scene.remove(g);
        r.chunks = null;
        r.flying = [];
        r.state = 'broken';
        r.t = 0;
      }
      return;
    }
    // broken stays broken (reconcile only brings one back for a new game)
    if (r.state === 'broken') return;
    // growing: up out of the ground
    const k = Math.min(1, r.t / 3);
    const e = k * k * (3 - 2 * k);
    m.stone.scale.set(1, Math.max(0.02, e), 1);
    m.stone.position.set(0, 0, 0);
    if (k >= 1) {
      r.state = 'whole';
      r.t = 0;
      m.stone.scale.setScalar(1);
    }
  }

  /** What's left: a scatter of broken stone round the hollow it stood in. */
  private rubble(r: Rock): Mesh {
    const parts = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.random() * 0.4;
      const d = 0.35 + Math.random() * 0.75;
      const s = 0.06 + Math.random() * 0.12;
      const g = new DodecahedronGeometry(s, 0);
      g.scale(1, 0.6, 1);
      g.rotateY(Math.random() * 3);
      g.translate(Math.cos(a) * d, s * 0.3 + 0.1, Math.sin(a) * d);
      parts.push(g);
    }
    const colour = stoneColour(r.site.ground);
    const mesh = new Mesh(mergeGeometries(parts, false)!, new MeshLambertMaterial({ color: colour, flatShading: true }));
    mesh.name = 'rubble';
    return mesh;
  }

  /* ── the tray ──────────────────────────────────────────────────────── */

  private buildTray(): void {
    this.tray = new Tray(GEM_TRAY);
    this.tray.build(...ROCK_GRID);
    this.scene.add(this.tray.group);
    this.info = new Panel([640, 220], [0.44, 0.15125]);
    this.infoLetters = new Lettering(this.info, LOOKS.velvet, 29);
    // lit by the tray's own glow (a jeweller's board in gilt), not the sky: it reads at any hour
    mount(this.info, LOOKS.velvet, { renderer: this.renderer });
    this.tray.group.add(this.info.mesh);
    this.buttons = new InteractivePanel([320, 272], [0.17, 0.1445]);
    this.buttons.mesh.rotation.x = -Math.PI / 2;
    this.buttonLetters = new Lettering(this.buttons, LOOKS.velvet, 31);
    mount(this.buttons, LOOKS.velvet, { renderer: this.renderer, frame: false });
    this.buttons.paint = () => this.paintButtons();
    this.buttons.onClick = (id) => {
      if (id === 'all') return this.takeAll();
      this.dismissed = this.openRock;
      this.closeTray();
    };
    this.buttons.repaintOnFonts(() => this.paintButtons());
    this.tray.group.add(this.buttons.mesh);
    register(this.buttons);
    const w = this.tray.width;
    const h = this.tray.height;
    this.info.mesh.position.set(0, 0.075, -h / 2 - 0.1);
    this.buttons.mesh.position.set(-w / 2 - 0.13, 0.012, -h / 2 + 0.078);
  }

  private updateTray(dt: number, time: number, eye: Vector3): void {
    const dz = this.dismissed;
    if (dz && Math.hypot(eye.x - dz.base.x, eye.z - dz.base.z) > REARM_R) this.dismissed = null;
    // walking up to a broken rock with stones still in it raises its tray
    if (!this.openRock && !backpackView.open) {
      for (const r of this.rocks) {
        const open = r.state === 'broken' || (r.state === 'breaking' && r.t > 0.9);
        if (open && r.stock.length && r !== this.dismissed && Math.hypot(eye.x - r.base.x, eye.z - r.base.z) < OPEN_R + (r.state === 'breaking' ? 1.5 : 0)) this.openTray(r);
      }
    }
    const o = this.openRock;
    mineView.busy = !!o;
    if (!o) return;
    if (Math.hypot(eye.x - o.base.x, eye.z - o.base.z) > CLOSE_R) {
      this.closeTray();
      return;
    }
    if (Math.hypot(eye.x - this.placedFrom.x, eye.z - this.placedFrom.z) > 0.75) this.placeTray(o);
    const show = !backpackView.open;
    this.tray.group.visible = show;
    if (!show) {
      this.hover = null;
      return;
    }
    // rising out of the rubble
    const rise = Math.min(1, (this.tray.group.userData.rise = (this.tray.group.userData.rise ?? 0) + dt * 2.2));
    this.tray.group.scale.setScalar(0.6 + 0.4 * (1 - Math.pow(1 - rise, 3)));
    this.handleInput();
    this.paintTray(time);
    this.paintInfo();
  }

  private openTray(r: Rock): void {
    if (this.openRock === r) return;
    if (this.openRock) this.closeTray();
    this.openRock = r;
    this.dazzle = DAZZLED[Math.floor(Math.random() * DAZZLED.length)];
    this.tray.group.userData.rise = 0;
    this.placeTray(r);
    this.syncStones();
    this.infoKey = '';
    this.paintButtons();
    for (const h of ['left', 'right'] as const) {
      this.trig[h] = (this.input.xr.gamepads[h]?.getButtonValue(InputComponent.Trigger) ?? 0) > 0.3;
      this.grip[h] = (this.input.xr.gamepads[h]?.getButtonValue(InputComponent.Squeeze) ?? 0) > 0.3;
    }
  }

  private closeTray(): void {
    if (!this.openRock) return;
    this.openRock = null;
    mineView.busy = false;
    this.tray.group.visible = false;
    this.hover = null;
    for (const s of this.stones.values()) this.dropStone(s);
    this.stones.clear();
  }

  /** Stand the tray up over the rubble, at your waist, tipped toward you. */
  private placeTray(r: Rock): void {
    const head = this.camera.getWorldPosition(new Vector3());
    this.placedFrom.copy(head);
    const d = new Vector3(r.base.x - head.x, 0, r.base.z - head.z);
    if (d.lengthSq() < 1e-4) d.set(0, 0, -1);
    d.normalize();
    const X = new Vector3().crossVectors(d, UP).normalize();
    const Y = UP.clone().multiplyScalar(Math.cos(TILT)).addScaledVector(d, -Math.sin(TILT));
    const Z = new Vector3().crossVectors(X, Y);
    // between you and the rubble, at your waist
    const dist = Math.hypot(r.base.x - head.x, r.base.z - head.z);
    const pos = head.clone().addScaledVector(d, Math.min(0.55, Math.max(0.4, dist - 0.8)));
    pos.y = head.y - 0.55;
    this.tray.group.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(X, Y, Z));
    this.tray.group.position.copy(pos);
    this.tray.group.updateMatrixWorld(true);
    this.info.mesh.lookAt(head);
  }

  /** The rock's stones lying in the tray (and none that have gone). */
  private syncStones(): void {
    const stock = this.openRock?.stock ?? [];
    for (const g of stock) {
      if (this.stones.has(g)) continue;
      const holder = new Group();
      const mesh = gemMesh(g.id, STONE * (0.85 + Math.min(1, g.ct / GEMS[g.id].ct[1]) * 0.35));
      holder.add(mesh);
      const sparkle = twinkles(3, STONE * 0.45, GEMS[g.id].colour, g.c * 7 + g.r * 13 + 1, 0.8);
      holder.add(sparkle);
      this.tray.cellCentre(g.c, g.r, holder.position, 0.03);
      this.tray.group.add(holder);
      this.stones.set(g, { gem: g, holder, sparkle });
    }
    for (const [g, s] of this.stones) {
      if (stock.includes(g)) continue;
      this.dropStone(s);
      this.stones.delete(g);
    }
  }

  private dropStone(s: Stone): void {
    s.holder.removeFromParent();
    dropTwinkles(s.sparkle);
  }

  private handleInput(): void {
    const stock = this.openRock!.stock;
    this.hover = null;
    for (const hand of ['left', 'right'] as const) {
      const pad = this.input.xr.gamepads[hand];
      const t = pad?.getButtonValue(InputComponent.Trigger) ?? 0;
      const g = pad?.getButtonValue(InputComponent.Squeeze) ?? 0;
      const tDown = !this.trig[hand] && t > 0.6;
      const gDown = !this.grip[hand] && g > 0.6;
      if (t > 0.6) this.trig[hand] = true;
      else if (t < 0.3) this.trig[hand] = false;
      if (g > 0.6) this.grip[hand] = true;
      else if (g < 0.3) this.grip[hand] = false;
      this.player.gripSpaces[hand].getWorldPosition(_v);
      this.tray.group.worldToLocal(_v);
      if (_v.y > 0.22 || _v.y < -0.08) continue;
      const at = this.tray.cellAt(_v);
      const cx = Math.floor(at.c);
      const cy = Math.floor(at.r);
      const gem = stock.find((k) => k.c === cx && k.r === cy);
      if (!gem) continue;
      this.hover = gem;
      if ((tDown && !pointerView.claimed[hand]) || gDown) this.take(gem, hand);
    }
  }

  /** A stone out of the tray and into your pouch (and the book). */
  private take(gem: RockGem, hand: Hand, quiet = false): void {
    const r = this.openRock;
    if (!r) return;
    const s = this.state;
    r.stock = r.stock.filter((k) => k !== gem);
    s.gems.mined[r.site.id] = r.stock;
    pocket(s.gems, gem);
    s.save();
    s.emit();
    const rare = GEMS[gem.id].rarity < 0.5;
    const stone = this.stones.get(gem);
    if (stone) {
      this.stones.delete(gem);
      stone.holder.updateMatrixWorld();
      const wm = stone.holder.matrixWorld.clone();
      stone.holder.removeFromParent();
      this.scene.add(stone.holder);
      wm.decompose(stone.holder.position, stone.holder.quaternion, stone.holder.scale);
      this.flights.push({ obj: stone.holder, from: stone.holder.position.clone(), t: 0, dur: 0.45, scale: stone.holder.scale.x, done: () => dropTwinkles(stone.sparkle) });
    }
    if (!quiet) {
      gemChime(rare);
      pulseHand(this.renderer.xr.getSession() ?? undefined, hand, 0.45, 45);
      this.gotGems(1);
    }
    this.infoKey = '';
    this.paintButtons();
  }

  private takeAll(): void {
    const r = this.openRock;
    if (!r || !r.stock.length) {
      uiDeny();
      return;
    }
    const all = [...r.stock];
    all.forEach((g) => this.take(g, 'right', true));
    gemChime(all.some((g) => GEMS[g.id].rarity < 0.5));
    this.gotGems(all.length);
  }

  /** The pop-up, as the logs have it: just how many (stones taken one after another add up). */
  private gotGems(n: number): void {
    const now = performance.now();
    this.gotten = now - this.gottenAt < 2400 ? this.gotten + n : n;
    this.gottenAt = now;
    this.toast.show(`+${this.gotten} gem${this.gotten === 1 ? '' : 's'}`, 2.4, INK.good);
  }

  private animateFlights(dt: number): void {
    const hip = this.camera.getWorldPosition(_w).add(_v.set(0, -0.55, 0));
    this.flights = this.flights.filter((f) => {
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      f.obj.position.lerpVectors(f.from, hip, k * k);
      f.obj.position.y += Math.sin(k * Math.PI) * 0.22;
      f.obj.scale.setScalar(f.scale * (1 - k * 0.7));
      f.obj.rotateY(dt * 12);
      if (k >= 1) {
        this.scene.remove(f.obj);
        f.done?.();
        return false;
      }
      return true;
    });
  }

  /** The stones turning slowly in their slots, catching the light; the one under your hand lifts. */
  private paintTray(time: number): void {
    const stock = this.openRock!.stock;
    this.syncStones();
    const tiles: [number, number, number, number][] = [];
    for (const [g, s] of this.stones) {
      const over = g === this.hover;
      const col = new Color(GEMS[g.id].colour);
      const ph = g.c * 1.7 + g.r * 2.9;
      tiles.push([g.c, g.r, col.getHex(), over ? 0.34 + 0.1 * Math.sin(time * 8) : 0.07 + 0.03 * Math.sin(time * 1.7 + ph)]);
      s.holder.position.y = over ? 0.06 + 0.008 * Math.sin(time * 5) : 0.03 + 0.004 * Math.sin(time * 1.3 + ph);
      s.holder.rotation.set(0.28 * Math.sin(time * 0.7 + ph), time * 0.45 + ph, 0.2 * Math.cos(time * 0.55 + ph));
      s.holder.scale.setScalar(over ? 1.18 : 1);
    }
    if (!stock.length) tiles.length = 0;
    this.tray.paintTiles(tiles);
  }

  private paintInfo(): void {
    const r = this.openRock!;
    const h = this.hover;
    const key = `${r.site.id}|${r.stock.length}|${h ? `${h.c},${h.r}` : '-'}`;
    if (key === this.infoKey) return;
    this.infoKey = key;
    const L = this.infoLetters;
    L.begin();
    // no name for where you are, and no prices: just what the sparkle does to your eyes
    L.title(this.dazzle, 28, 66, 34, 'left', 584);
    if (h) {
      const g = GEMS[h.id];
      L.text(g.name, 28, 120, 34, 'ink', 'left', 700, 420);
      L.text(g.mineral, 28, 152, 19, 'dim', 'left', 500, 420);
      L.text(`${h.ct.toFixed(2)} carats`, 612, 124, 28, 'accent', 'right', 700);
      if (!this.state.gems.log[h.id]) L.text('new to your book!', 28, 188, 20, 'good', 'left', 700);
    } else if (r.stock.length) {
      L.text(`${r.stock.length} stone${r.stock.length === 1 ? '' : 's'} in the rock`, 28, 118, 26, 'ink', 'left', 600, 584);
      L.text('Reach in and take one, or TAKE ALL', 28, 154, 22, 'dim', 'left', 500, 584);
      L.text('The Jeweller might want to look at these.', 28, 188, 19, 'accent', 'left', 500, 584);
    } else {
      L.text('Nothing left but rubble.', 28, 120, 26, 'ink', 'left', 600, 584);
      L.text('It won’t grow back: there are other rocks out there.', 28, 156, 21, 'dim', 'left', 500, 584);
      L.text('Take them to the Jeweller.', 28, 188, 19, 'accent', 'left', 600, 584);
    }
    L.end();
  }

  private paintButtons(): void {
    const L = this.buttonLetters;
    const [W, H] = this.buttons.px;
    const any = !!this.openRock?.stock.length;
    L.begin(false);
    L.button('all', 'TAKE ALL', 8, 8, W - 16, H / 2 - 16, any ? 'go' : 'off', 50);
    L.button('close', 'CLOSE', 8, H / 2 + 8, W - 16, H / 2 - 16, 'go', 50);
    L.end();
  }

  /* ── bits flying ───────────────────────────────────────────────────── */

  private updateChips(dt: number): void {
    const o = new Object3D();
    let n = 0;
    this.chipList = this.chipList.filter((c) => (c.age += dt) < 1.6);
    for (const c of this.chipList) {
      c.v.y -= 9.8 * dt;
      c.p.addScaledVector(c.v, dt);
      const floor = (mineDeps.ground?.(c.p.x, c.p.z) ?? 0) + 0.015;
      if (c.p.y < floor) {
        c.p.y = floor;
        c.v.set(0, 0, 0);
      }
      o.position.copy(c.p);
      o.rotation.set(c.age * 9, c.age * 7, 0);
      o.scale.setScalar(c.s * Math.max(0.01, Math.min(1, (1.6 - c.age) * 3)));
      o.updateMatrix();
      this.chips.setMatrixAt(n, o.matrix);
      this.chips.setColorAt(n, c.c);
      n++;
    }
    this.chips.count = n;
    this.chips.instanceMatrix.needsUpdate = true;
    if (this.chips.instanceColor) this.chips.instanceColor.needsUpdate = true;
  }

  private updateSparks(dt: number): void {
    let n = 0;
    const m = new Matrix4();
    this.sparkList = this.sparkList.filter((s) => (s.age += dt) < 0.35);
    for (const s of this.sparkList) {
      s.v.y -= 9.8 * dt;
      s.p.addScaledVector(s.v, dt);
      _q.setFromUnitVectors(new Vector3(0, 0, 1), _w.copy(s.v).normalize());
      const k = 1 - s.age / 0.35;
      m.compose(s.p, _q, new Vector3(k, k, k * (0.5 + s.v.length() * 0.3)));
      this.sparks.setMatrixAt(n++, m);
    }
    this.sparks.count = n;
    this.sparks.instanceMatrix.needsUpdate = true;
  }
}
