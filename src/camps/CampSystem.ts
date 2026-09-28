/**
 * THE FIRE DANCERS' CAMPS: FIRE FIGHT 2's beach party, hidden in eight little groups out in the
 * wilds of the island (camps/sites.ts), each dancing round its fire with a chest beside it.
 *
 *  FINDING ONE   None is on the chart and none can be seen from the start (tools/camps-check.mjs
 *                proves it). Go and look: over the ridges, down the hollows. The drums carry
 *                further than the firelight (camps/sound.ts). Walk into a camp and its dancers are
 *                pleased to see you: they throw their hands in the air, and gift you everything
 *                in their chest (no pop-up: the chest's readout keeps the count, "2 of 8 camps found").
 *  THE BEACH     Find all eight and a ninth group comes down to the main beach, west of the timber
 *                yard, and lights a fire there. Their chest fills with a couple of nice fish and a
 *                stack of logs every day.
 *  THE CHEST     Walk up to it and it swings open by itself: THE CHEST PACK rises out of it, a tray like your backpack's with the dancers' fish lying in its slots
 *                and their logs stacked beside it.
 *                  - reach in and CLICK a fish (trigger): it goes into your backpack, wherever
 *                    there's room;
 *                  - GRIP a fish instead and it's in your hand, to put in your backpack yourself
 *                    (press A), just like one off the line;
 *                  - point at the LOGS and click: they all go on your stack for the walks;
 *                  - TAKE ALL packs everything that fits.
 *                Walk away (or CLOSE) and the lid comes down. Shut with CLOSE, it stays shut till
 *                you've stepped away and come back (or grip its lid). A hidden camp's gift is given
 *                once; the beach party's chest fills again tomorrow (camps/stock.ts).
 *
 * Everything the camps draw shares a handful of draws: every fire's layers (camps/fire.ts), every
 * dancer and every glowstick (camps/dancers.ts); only the chests are their own meshes. All of it
 * is hidden while you're nowhere near a camp.
 */

import { createSystem, InputComponent } from '@iwsdk/core';
import { CylinderGeometry, Group, Matrix4, Mesh, MeshLambertMaterial, Vector3, type MeshStandardMaterial, type Object3D, type Sprite, type SpriteMaterial } from 'three';
import { logThunk, uiClick, uiDeny } from '../audio/sfx.ts';
import { MIX, shot } from '../audio/samples.ts';
import { backpackView, label, TIER_CSS, TIER_GLOW, TIER_HEX } from '../backpack/BackpackSystem.ts';
import { bounds, cellsOf, findSpot, GRID_SIZES, TIERS, type Piece } from '../backpack/logic.ts';
import { Tray } from '../backpack/tray.ts';
import { introActive } from '../experience/introGate.ts';
import { Toast } from '../fishing/hud.ts';
import type { FishUniforms, Props } from '../fishing/props.ts';
import { FISH, type GameState } from '../fishing/tidewater.ts';
import { pulseHand } from '../input/haptics.ts';
import { INK, Panel } from '../ui/panel.ts';
import { InteractivePanel, pointerView, register } from '../ui/pointer.ts';
import { Lettering, LOOKS, mount } from '../ui/boards.ts';
import type { BoxCollider } from '../world/data.ts';
import { Chest, CHEST_H } from './chest.ts';
import { buildCrowd, type Crowd } from './dancers.ts';
import { buildBonfires, type Bonfires, type FireSpot } from './fire.ts';
import { CampSound } from './sound.ts';
import { BEACH_CAMP, CAMPS, chestSpot, type CampSite } from './sites.ts';
import { CHEST_GRID, dayNumber, stockFor, toCaught, type CampSave, type ChestFish } from './stock.ts';

type Hand = 'left' | 'right';

/** What the camps need from the game; set by main before registration. */
export const campDeps: {
  state: GameState | null;
  props: Props | null;
  ground: ((x: number, z: number) => number) | null;
  addBox: ((b: BoxCollider) => void) | null;
  /** the island's hour, for the fish's save entries */
  hour: (() => number) | null;
} = { state: null, props: null, ground: null, addBox: null, hour: null };

/** Anyone can ask: is a chest open (the rod goes over your shoulder while it is)? */
export const campView: {
  busy: boolean;
  /** dev: which camp you're nearest, and how far */
  nearest?: () => { id: string; dist: number };
  /** dev: open the nearest chest */
  open?: () => void;
  system?: CampSystem;
} = { busy: false };

/** the size of each fire (1 = ff2's big beach bonfire) */
const FIRE_SIZE = 0.85;
/** within this of a camp's fire it counts as found */
const FOUND_R = 20;
/** a chest opens as you come within OPEN_R (the lid's up by the time you're there to reach in),
 *  shuts once you're past CLOSE_R, and one you shut yourself opens again only once you've been
 *  past REARM_R (m, from the chest) */
const OPEN_R = 3;
const CLOSE_R = 6;
const REARM_R = 4.5;
/** how far the beach party's drums carry (the hidden camps' carry further: camps/sound.ts) */
const BEACH_EARSHOT = 40;
/** the camps are drawn only within this of the nearest one */
const DRAW_R = 240;
/** the chest pack's lining: the chest's red velvet, warm in the firelight at any hour */
const CHEST_TRAY = { lining: 0x74182a, glow: 0.6 };
/** the chest pack's tray, tipped toward you like the backpack's */
const TILT = (35 * Math.PI) / 180;

interface Camp {
  site: CampSite;
  /** its dancers (the hidden camps share one crowd, the beach party has its own), and which of them */
  crowd: Crowd;
  party: number;
  /** how pleased they are to see you, 0..1 */
  cheer: number;
  fire: FireSpot;
  chest: Chest;
  /** the chest's world position and which way its front faces (unit, xz) */
  at: Vector3;
  front: Vector3;
}

interface FishModel {
  mesh: Mesh;
  u: FishUniforms;
  mat: MeshStandardMaterial;
}

interface Flight {
  obj: Object3D;
  from: Vector3;
  t: number;
  dur: number;
  scale: number;
  done?: () => void;
}

/** the tiers' inks on bark cloth (the backpack's are for dark glass) */
const TIER_INK = ['#6a5a4a', '#3f6284', '#a86a00', '#a8307e'];

const _v = new Vector3();
const _w = new Vector3();
const UP = new Vector3(0, 1, 0);
/** a log flying off the stack to you (the woodworks' colours) */
const LOG_GEO = new CylinderGeometry(0.06, 0.06, 0.36, 8).rotateZ(Math.PI / 2);
const LOG_MAT = new MeshLambertMaterial({ color: 0x8a6440 });

export class CampSystem extends createSystem({}) {
  private readonly root = new Group();
  private camps: Camp[] = [];
  private fires!: Bonfires;
  /** the beach party's fire and dancers, and the camp itself: all hidden until the eight are found */
  private readonly beachGroup = new Group();
  private beach!: Camp;
  private beachFires!: Bonfires;
  private beachUp = false;
  private readonly sound = new CampSound();
  private toast!: Toast;

  /** the chest pack: the tray, its fish, the readout behind it and the buttons either side */
  private tray!: Tray;
  private info!: Panel;
  private infoLetters!: Lettering;
  private buttonLetters!: Lettering;
  private logLetters!: Lettering;
  private buttons!: InteractivePanel;
  private logs!: InteractivePanel;
  private readonly models = new Map<ChestFish, FishModel>();
  private openCamp: Camp | null = null;
  /** the fish your hand is over in the tray */
  private hover: ChestFish | null = null;
  private infoKey = '';
  private readonly trig: Record<Hand, boolean> = { left: false, right: false };
  private readonly grip: Record<Hand, boolean> = { left: false, right: false };
  private flights: Flight[] = [];
  private tags: { s: Sprite; t: number }[] = [];
  private wasShut = new Set<Chest>();
  /** the chest you shut with CLOSE: it stays shut till you've stepped away from it */
  private dismissed: Camp | null = null;
  /** where you stood when the chest pack was last stood up for you */
  private readonly placedFrom = new Vector3();

  init(): void {
    const ground = campDeps.ground!;
    this.root.name = 'camps';
    this.root.visible = false;
    this.scene.add(this.root);
    const kit = { renderer: this.renderer, props: campDeps.props! };
    const make = (site: CampSite, party: number, crowd: () => Crowd, into: Group): Camp => {
      const fire: FireSpot = { x: site.x, y: ground(site.x, site.z), z: site.z, size: FIRE_SIZE };
      const [cx, cz] = chestSpot(site);
      const chest = new Chest(kit);
      const at = new Vector3(cx, ground(cx, cz), cz);
      // its front to the outside of the ring, the fire behind it as you open it
      const front = new Vector3(Math.cos(site.chestAt), 0, Math.sin(site.chestAt));
      chest.group.position.copy(at);
      chest.group.rotation.y = Math.atan2(front.x, front.z);
      into.add(chest.group);
      this.wasShut.add(chest);
      return { site, fire, chest, at, front, cheer: 0, party, get crowd() { return crowd(); } };
    };
    let hidden: Crowd | null = null;
    let beach: Crowd | null = null;
    this.camps = CAMPS.map((site, i) => make(site, i, () => hidden!, this.root));
    for (const c of this.camps) this.colliders(c);
    this.fires = buildBonfires(this.camps.map((c) => c.fire));
    hidden = buildCrowd(
      this.camps.map((c) => ({ fire: c.fire, dancers: c.site.dancers, gap: c.site.chestAt })),
      ground,
    );
    this.root.add(...this.fires.meshes, ...hidden.meshes);
    // the ninth, on the beach
    this.beachGroup.visible = false;
    this.root.add(this.beachGroup);
    this.beach = make(BEACH_CAMP, 0, () => beach!, this.beachGroup);
    this.beachFires = buildBonfires([this.beach.fire]);
    beach = buildCrowd([{ fire: this.beach.fire, dancers: BEACH_CAMP.dancers, gap: BEACH_CAMP.chestAt }], ground);
    this.beachGroup.add(...this.beachFires.meshes, ...beach.meshes);
    this.checkBeach();

    this.toast = new Toast();
    this.toast.panel.mesh.visible = false;
    this.scene.add(this.toast.panel.mesh);

    // the chest pack
    // lined in the chest's own red velvet, and lit by the fire and the glow coming up out of the
    // chest, not the sky (under the moon, the backpack's green felt went black behind the fish)
    this.tray = new Tray(CHEST_TRAY);
    this.tray.build(...CHEST_GRID);
    this.scene.add(this.tray.group);
    this.info = new Panel([640, 220], [0.44, 0.15125]);
    this.infoLetters = new Lettering(this.info, LOOKS.tapa, 13);
    mount(this.info, LOOKS.tapa, { outdoor: true });
    this.tray.group.add(this.info.mesh);
    this.buttons = new InteractivePanel([320, 272], [0.17, 0.1445]);
    this.buttons.mesh.rotation.x = -Math.PI / 2;
    this.buttonLetters = new Lettering(this.buttons, LOOKS.tapa, 5);
    mount(this.buttons, LOOKS.tapa, { outdoor: true, frame: false });
    this.buttons.paint = () => this.paintButtons();
    this.buttons.onClick = (id) => {
      if (id === 'all') return this.takeAll();
      this.dismissed = this.openCamp;
      this.closeChest();
    };
    this.buttons.repaintOnFonts(() => this.paintButtons());
    this.tray.group.add(this.buttons.mesh);
    register(this.buttons);
    this.logs = new InteractivePanel([320, 272], [0.17, 0.1445]);
    this.logs.mesh.rotation.x = -Math.PI / 2;
    this.logLetters = new Lettering(this.logs, LOOKS.tapa, 7);
    mount(this.logs, LOOKS.tapa, { outdoor: true, frame: false });
    this.logs.paint = () => this.paintLogs();
    this.logs.onClick = () => this.takeLogs();
    this.logs.repaintOnFonts(() => this.paintLogs());
    this.tray.group.add(this.logs.mesh);
    register(this.logs);
    const w = this.tray.width;
    const h = this.tray.height;
    this.info.mesh.position.set(0, 0.075, -h / 2 - 0.1);
    this.buttons.mesh.position.set(-w / 2 - 0.13, 0.012, -h / 2 + 0.078);
    this.logs.mesh.position.set(w / 2 + 0.13, 0.012, -h / 2 + 0.078);

    campView.nearest = () => {
      const n = this.nearest();
      return { id: n.camp.site.id, dist: n.dist };
    };
    campView.open = () => this.openChest(this.nearest().camp);
    campView.system = this;
  }

  private get state(): GameState {
    return campDeps.state!;
  }

  /** No landing in a camp's fire or on its chest. */
  private colliders(c: Camp): void {
    const [cx, cz] = chestSpot(c.site);
    campDeps.addBox?.({ tag: 'campfire', walkable: false, solid: true, cx: c.fire.x, cz: c.fire.z, hx: 1.1, hz: 1.1, rotY: 0, top: c.fire.y + 1.2, bottom: c.fire.y - 1 });
    campDeps.addBox?.({ tag: 'chest', walkable: false, solid: true, cx, cz, hx: 0.55, hz: 0.55, rotY: 0, top: c.at.y + CHEST_H, bottom: c.at.y - 1 });
  }

  /** How many of the eight hidden camps you've found. */
  private foundCount(): number {
    return CAMPS.filter((s) => this.state.camps[s.id]?.found).length;
  }

  /** Once all eight are found, the ninth sets up on the beach (the chests' readouts say so). */
  private checkBeach(): void {
    if (this.beachUp || !campDeps.state || this.foundCount() < CAMPS.length) return;
    this.beachUp = true;
    this.beachGroup.visible = true;
    this.colliders(this.beach);
  }

  /** the camps you can go to: the hidden eight, and the beach party once it's there */
  private get live(): Camp[] {
    return this.beachUp ? [...this.camps, this.beach] : this.camps;
  }

  /**
   * A camp's save entry. A hidden camp's chest is filled once, the day you first come (their gift,
   * never refilled); the beach party's fills afresh every day.
   */
  private save(c: Camp): CampSave {
    const s = this.state;
    const today = dayNumber();
    let e = s.camps[c.site.id];
    if (!e || (c.site.beach && e.day !== today)) {
      e = { ...stockFor(c.site, today), found: e?.found ?? false };
      s.camps[c.site.id] = e;
    }
    return e;
  }

  private nearest(): { camp: Camp; dist: number } {
    this.camera.getWorldPosition(_v);
    let best = this.camps[0];
    let bd = Infinity;
    for (const c of this.live) {
      const d = Math.hypot(_v.x - c.fire.x, _v.z - c.fire.z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return { camp: best, dist: bd };
  }

  /* ── frame ───────────────────────────────────────────────────────────── */

  update(delta: number, time: number): void {
    const dt = Math.min(delta, 0.05);
    if (!campDeps.state || introActive()) return;
    // (the cloud save can come in after we start: it may hold the eighth camp)
    this.checkBeach();
    const { camp, dist } = this.nearest();
    this.root.visible = dist < DRAW_R;
    // the beach party's drums stay on the beach, under the village's music
    this.sound.update(dt, camp.fire, dist, camp.site.beach ? BEACH_EARSHOT : undefined);
    this.toast.update(dt, this.camera);
    this.animate(dt);
    if (!this.root.visible) return;
    this.fires.update(time);
    this.beachFires.update(time);
    this.camera.getWorldPosition(_v);
    for (const c of this.live) {
      c.crowd.update(time);
      // they see you coming: the nearer you are, the more pleased
      const want = Math.hypot(_v.x - c.fire.x, _v.z - c.fire.z) < FOUND_R ? 1 : 0;
      c.cheer += (want - c.cheer) * (1 - Math.exp(-dt * 2.5));
      c.crowd.cheer(c.party, c.cheer);
      c.chest.update(dt, time);
      // what's lying in the bottom: its logs, while you can see in
      if (c.chest.amount > 0) c.chest.setLogs(this.save(c).logs);
      // the lid coming down: a clap of wood
      const shut = c.chest.amount < 0.02;
      if (shut && !this.wasShut.has(c.chest)) logThunk();
      if (shut) this.wasShut.add(c.chest);
      else this.wasShut.delete(c.chest);
    }

    // walking in for the first time
    if (dist < FOUND_R) {
      const e = this.save(camp);
      if (!e.found) {
        e.found = true;
        this.state.save();
        // no pop-up: the dancers cheering is the welcome, and the chest's readout keeps the count
        this.checkBeach();
      }
    }

    this.camera.getWorldPosition(_v);
    const eye = _v.clone();
    // walking up to a chest opens it (not one you've just shut, till you've stepped away)
    const d = this.dismissed;
    if (d && Math.hypot(eye.x - d.at.x, eye.z - d.at.z) > REARM_R) this.dismissed = null;
    if (!this.openCamp && !backpackView.open) {
      for (const c of this.live) if (c !== this.dismissed && Math.hypot(eye.x - c.at.x, eye.z - c.at.z) < OPEN_R) this.openChest(c);
    }
    // or grip its lid
    if (!this.openCamp && camp && !backpackView.open && !backpackView.holding) {
      for (const hand of ['left', 'right'] as const) {
        const g = this.input.xr.gamepads[hand]?.getButtonValue(InputComponent.Squeeze) ?? 0;
        const down = !this.grip[hand] && g > 0.6;
        if (g > 0.6) this.grip[hand] = true;
        else if (g < 0.3) this.grip[hand] = false;
        if (!down) continue;
        this.player.gripSpaces[hand].getWorldPosition(_w);
        if (_w.distanceTo(_v.copy(camp.at).addScaledVector(UP, CHEST_H * 0.85)) < 0.5) this.openChest(camp);
      }
    }

    const o = this.openCamp;
    campView.busy = !!o;
    if (!o) return;
    if (Math.hypot(eye.x - o.at.x, eye.z - o.at.z) > CLOSE_R) {
      this.closeChest();
      return;
    }
    // a hop round the chest: the tray turns to face you again
    if (Math.hypot(eye.x - this.placedFrom.x, eye.z - this.placedFrom.z) > 0.75) this.placeTray(o);
    // the tray rises once the lid is up, and steps aside while your backpack is out
    const show = o.chest.amount > 0.55 && !backpackView.open;
    this.tray.group.visible = show;
    if (!show) {
      this.hover = null;
      return;
    }
    this.handleInput();
    this.paintTray(time);
    this.paintInfo();
  }

  /* ── open / close ────────────────────────────────────────────────────── */

  private openChest(c: Camp): void {
    if (this.openCamp === c) return;
    if (this.openCamp) this.closeChest();
    this.openCamp = c;
    c.chest.open = true;
    this.save(c);
    this.placeTray(c);
    this.syncModels();
    this.infoKey = '';
    this.paintButtons();
    this.paintLogs();
    // triggers already down aren't clicks in here
    for (const h of ['left', 'right'] as const) {
      this.trig[h] = (this.input.xr.gamepads[h]?.getButtonValue(InputComponent.Trigger) ?? 0) > 0.3;
      this.grip[h] = (this.input.xr.gamepads[h]?.getButtonValue(InputComponent.Squeeze) ?? 0) > 0.3;
    }
    // the hasp, then the lid going up
    shot('bail_click', MIX.bail + 6, { rate: 0.5, at: c.at });
    shot('bail_click', MIX.bail + 2, { rate: 0.42, at: c.at, delay: 0.12 });
  }

  private closeChest(): void {
    const c = this.openCamp;
    if (!c) return;
    c.chest.open = false;
    this.openCamp = null;
    campView.busy = false;
    this.tray.group.visible = false;
    this.hover = null;
    for (const m of this.models.values()) {
      this.tray.group.remove(m.mesh);
      m.mat.dispose();
    }
    this.models.clear();
  }

  /** Stand the chest pack up over the open chest, at your waist, tipped toward you. */
  private placeTray(c: Camp): void {
    const head = this.camera.getWorldPosition(new Vector3());
    this.placedFrom.copy(head);
    // from you to the chest, level
    const d = new Vector3(c.at.x - head.x, 0, c.at.z - head.z);
    if (d.lengthSq() < 1e-4) d.copy(c.front).negate();
    d.normalize();
    const X = new Vector3().crossVectors(d, UP).normalize();
    const Y = UP.clone().multiplyScalar(Math.cos(TILT)).addScaledVector(d, -Math.sin(TILT));
    const Z = new Vector3().crossVectors(X, Y);
    const y = Math.min(c.at.y + 1.25, Math.max(c.at.y + 0.9, head.y - 0.55));
    const pos = new Vector3(c.at.x, y, c.at.z).addScaledVector(d, -0.2);
    this.tray.group.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(X, Y, Z));
    this.tray.group.position.copy(pos);
    this.tray.group.updateMatrixWorld(true);
    // the readout faces your eyes, level
    this.info.mesh.lookAt(head);
  }

  /* ── the chest's fish ────────────────────────────────────────────────── */

  private makeModel(f: ChestFish): FishModel {
    const { mesh, uniforms } = campDeps.props!.makeFish(f.species);
    const mat = mesh.material;
    mat.emissive.setHex(TIER_GLOW[f.tier] ?? 0);
    uniforms.uSwim.value = 0.012;
    uniforms.uFreq.value = 0.8;
    return { mesh, u: uniforms, mat };
  }

  /** The chest's fish lying in the tray (and none that have gone). */
  private syncModels(): void {
    const c = this.openCamp;
    const fish = c ? this.save(c).fish : [];
    for (const f of fish) {
      if (this.models.has(f)) continue;
      const m = this.makeModel(f);
      m.mesh.matrixAutoUpdate = false;
      this.tray.slotMatrix(f, m.mesh.matrix);
      this.tray.group.add(m.mesh);
      this.models.set(f, m);
    }
    for (const [f, m] of this.models) {
      if (fish.includes(f)) continue;
      this.tray.group.remove(m.mesh);
      m.mat.dispose();
      this.models.delete(f);
    }
  }

  private handleInput(): void {
    const fish = this.save(this.openCamp!).fish;
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
      // which fish is this hand in?
      this.player.gripSpaces[hand].getWorldPosition(_v);
      this.tray.group.worldToLocal(_v);
      if (_v.y > 0.22 || _v.y < -0.08) continue;
      const at = this.tray.cellAt(_v);
      const cx = Math.floor(at.c);
      const cy = Math.floor(at.r);
      const f = fish.find((k) => cellsOf(k).some(([x, y]) => x === cx && y === cy));
      if (!f) continue;
      this.hover = f;
      if (backpackView.holding) {
        if (tDown || gDown) this.deny(hand, 'Your hands are full: put that fish in your backpack first (A)');
        continue;
      }
      if (tDown && !pointerView.claimed[hand]) this.packFish(f, hand);
      else if (gDown) this.handFish(f, hand);
    }
  }

  /** Click: the fish goes into your backpack, wherever there's room. */
  private packFish(f: ChestFish, hand: Hand, quiet = false): boolean {
    const s = this.state;
    const inv = s.inventory as unknown as Piece[];
    const lv = Math.max(0, Math.min(GRID_SIZES.length - 1, s.upgrades.hold | 0));
    const [C, R] = GRID_SIZES[lv];
    const box = s as unknown as { _nextId: number };
    const e = toCaught(f, box._nextId, campDeps.hour?.() ?? 12) as unknown as Piece;
    const b = bounds(e.shape);
    e.rot = b.w >= b.h ? 0 : 1;
    const spot = findSpot(e, inv, C, R);
    if (!spot) {
      if (!quiet) this.deny(hand, `No room in your backpack for the ${FISH[f.species].name.toLowerCase()}`);
      return false;
    }
    box._nextId++;
    Object.assign(e, spot, { placed: true });
    inv.push(e);
    this.fly(f, hand, `${f.tier ? `${TIERS[f.tier]} ` : ''}${FISH[f.species].name} · $${f.value}`, TIER_CSS[f.tier]);
    this.takeOut(f);
    this.buzz(hand, 0.5, 50);
    return true;
  }

  /** Grip: the fish is in your hand, to put in your backpack yourself. */
  private handFish(f: ChestFish, hand: Hand): void {
    const s = this.state;
    const box = s as unknown as { _nextId: number };
    const e = toCaught(f, box._nextId++, campDeps.hour?.() ?? 12);
    (s.inventory as unknown as Piece[]).push(e as unknown as Piece);
    this.takeOut(f);
    backpackView.takeInHand?.(e.id, hand);
    this.toast.show('Press A to open your backpack and put it in', 2.4, INK.dim);
  }

  /** The fish has left the chest (the save first, then its model). */
  private takeOut(f: ChestFish): void {
    const e = this.save(this.openCamp!);
    e.fish = e.fish.filter((k) => k !== f);
    this.state.save();
    this.state.emit();
    const m = this.models.get(f);
    if (m) {
      this.models.delete(f);
      m.mat.dispose();
      this.tray.group.remove(m.mesh);
    }
    this.infoKey = '';
    this.paintButtons();
  }

  private takeLogs(): void {
    const c = this.openCamp;
    if (!c) return;
    const e = this.save(c);
    if (e.logs <= 0) {
      uiDeny();
      return;
    }
    const n = e.logs;
    const s = this.state;
    s.woodworks.wood += n;
    e.logs = 0;
    s.save();
    s.emit();
    // a few of them fly to you; the thunks land with them
    this.logs.mesh.getWorldPosition(_w);
    for (let i = 0; i < Math.min(n, 5); i++) {
      const log = new Mesh(LOG_GEO, LOG_MAT);
      log.position.copy(_w).add(_v.set((Math.random() - 0.5) * 0.1, 0.02 * i, (Math.random() - 0.5) * 0.1));
      this.scene.add(log);
      this.flights.push({ obj: log, from: log.position.clone(), t: -i * 0.07, dur: 0.45, scale: 1, done: () => logThunk() });
    }
    this.toast.show(`+${n} logs, into your backpack (${s.woodworks.wood})`, 2.4, INK.good);
    this.paintLogs();
    this.paintButtons();
    this.infoKey = '';
  }

  /** TAKE ALL: every fish that fits (the biggest first), and the logs. */
  private takeAll(): void {
    const c = this.openCamp;
    if (!c) return;
    const e = this.save(c);
    const hand: Hand = 'right';
    const order = [...e.fish].sort((a, b) => b.shape.length - a.shape.length);
    let packed = 0;
    let left = 0;
    for (const f of order) (this.packFish(f, hand, true) ? packed++ : left++);
    const logs = e.logs;
    if (logs > 0) this.takeLogs();
    if (!packed && !logs) {
      if (left) this.deny(hand, 'No room in your backpack');
      else uiDeny();
      return;
    }
    const parts = [packed ? `${packed} fish` : '', logs ? `${logs} logs` : ''].filter(Boolean).join(' and ');
    this.toast.show(`Took ${parts}${left ? `. ${left} fish won't fit: make room in your backpack` : ''}`, 3.2, left ? INK.warn : INK.good);
  }

  private deny(hand: Hand, why: string): void {
    uiDeny();
    this.buzz(hand, 0.6, 70);
    this.toast.show(why, 2.4, INK.danger);
  }

  /* ── the flights to your backpack ────────────────────────────────────── */

  /** A fish lifts out of its slot and flies to your hip, into your backpack. */
  private fly(f: ChestFish, hand: Hand, text: string, colour: string): void {
    const m = this.models.get(f);
    if (!m) return;
    // out of the tray, into the world where it lies
    m.mesh.updateMatrixWorld();
    const wm = m.mesh.matrixWorld.clone();
    this.models.delete(f);
    this.tray.group.remove(m.mesh);
    this.scene.add(m.mesh);
    m.mesh.matrixAutoUpdate = true;
    wm.decompose(m.mesh.position, m.mesh.quaternion, m.mesh.scale);
    m.u.uSwim.value = 0.08;
    m.u.uFreq.value = 2.4;
    this.flights.push({
      obj: m.mesh,
      from: m.mesh.position.clone(),
      t: 0,
      dur: 0.42,
      scale: m.mesh.scale.x,
      done: () => {
        m.mat.dispose();
        shot('fish_flop', MIX.fishFlop - 2, { rate: 1.1 + Math.random() * 0.1 });
        uiClick();
      },
    });
    // its name and worth rising off the slot
    const tag = label(text, colour, 40);
    tag.position.copy(m.mesh.position).y += 0.1;
    this.scene.add(tag);
    this.tags.push({ s: tag, t: 0 });
    this.buzz(hand, 0.4, 40);
  }

  private animate(dt: number): void {
    const hip = this.camera.getWorldPosition(_w).add(_v.set(0, -0.55, 0));
    this.flights = this.flights.filter((f) => {
      f.t += dt;
      if (f.t < 0) return true;
      const k = Math.min(1, f.t / f.dur);
      f.obj.position.lerpVectors(f.from, hip, k * k);
      f.obj.position.y += Math.sin(k * Math.PI) * 0.25;
      f.obj.scale.setScalar(f.scale * (1 - k * 0.7));
      if (k >= 1) {
        this.scene.remove(f.obj);
        f.done?.();
        return false;
      }
      return true;
    });
    this.tags = this.tags.filter((g) => {
      g.t += dt;
      g.s.position.y += dt * 0.12;
      (g.s.material as SpriteMaterial).opacity = 1 - (g.t / 1.6) ** 2;
      if (g.t < 1.6) return true;
      this.scene.remove(g.s);
      (g.s.material as SpriteMaterial).map?.dispose();
      (g.s.material as SpriteMaterial).dispose();
      return false;
    });
  }

  /* ── painting ────────────────────────────────────────────────────────── */

  /** Tier frames under the chest's fish; the one your hand is over lifts and glows. */
  private paintTray(time: number): void {
    const fish = this.save(this.openCamp!).fish;
    this.syncModels();
    const tiles: [number, number, number, number][] = [];
    for (const f of fish) {
      const over = f === this.hover;
      for (const [c, r] of cellsOf(f)) tiles.push([c, r, over ? 0x3fd66a : TIER_HEX[f.tier], over ? 0.35 + 0.1 * Math.sin(time * 8) : f.tier > 0 ? 0.22 : 0.08]);
      const m = this.models.get(f);
      if (!m) continue;
      m.u.uTime.value = time;
      this.tray.slotMatrix(f, m.mesh.matrix, over ? 0.035 + 0.01 * Math.sin(time * 5) : 0.012);
      m.mesh.matrixWorldNeedsUpdate = true;
      if (over) m.mat.emissive.setRGB(0.18 + 0.1 * Math.sin(time * 8), 0.14, 0.04);
      else if (f.tier === 3) m.mat.emissive.setHSL((time * 0.15) % 1, 0.8, 0.18);
      else m.mat.emissive.setHex(TIER_GLOW[f.tier]);
    }
    this.tray.paintTiles(tiles);
  }

  private paintInfo(): void {
    const c = this.openCamp!;
    const e = this.save(c);
    const [C, R] = CHEST_GRID;
    const used = e.fish.reduce((a, f) => a + f.shape.length, 0);
    const total = C * R;
    const worth = e.fish.reduce((a, f) => a + f.value, 0);
    const h = this.hover;
    const found = this.foundCount();
    const key = `${c.site.id}|${used}|${worth}|${e.logs}|${h ? e.fish.indexOf(h) : '-'}|${backpackView.holding}|${found}`;
    if (key === this.infoKey) return;
    this.infoKey = key;
    // bark cloth printed with tapa bands, in a bamboo frame (ui/boards.ts)
    const L = this.infoLetters;
    L.begin();
    // the dancers' welcome (and no camp's name: the chest doesn't give away where you are)
    L.title("We're happy to see you!", 28, 72, 32, 'left', 420);
    L.text(`worth $${worth}`, 612, 68, 24, 'accent', 'right', 700);
    if (h) {
      L.text(TIERS[h.tier].toUpperCase(), 28, 106, 19, TIER_INK[h.tier], 'left', 700);
      L.text(FISH[h.species].name, 28, 138, 30, 'ink', 'left', 700, 400);
      L.text(`${Math.round(h.cm)} cm · ${h.kg.toFixed(2)} kg`, 28, 170, 21, 'dim', 'left', 500);
      L.text(`$${h.value}`, 612, 138, 32, 'accent', 'right', 700);
      if (backpackView.holding) L.text('your hands are full', 612, 170, 19, 'bad', 'right', 600);
    } else {
      if (!e.fish.length && !e.logs) L.text(c.site.beach ? 'More fish and logs for you tomorrow!' : "You have all we had to give. Thanks for coming!", 28, 112, 24, 'ink', 'left', 500, 584);
      else {
        L.text('Glad you found us.', 28, 108, 24, 'ink', 'left', 500);
        L.text('Please take these as a gift!', 28, 138, 24, 'accent', 'left', 700);
      }
      // a hidden camp's chest keeps the count of the camps you've found, and once all eight are,
      // where the ninth is; the beach party's, its fill
      if (c.site.beach) L.text(`${used} / ${total} slots`, 28, 170, 18, 'dim', 'left', 600);
      else if (found >= CAMPS.length) L.text('All eight found! A fire is lit for you on the main beach, west of the timber yard.', 28, 170, 18, 'accent', 'left', 600, 584);
      else L.text(`${found} of ${CAMPS.length} camps found`, 28, 170, 18, 'dim', 'left', 600);
    }
    L.end();
  }

  /** TAKE ALL and CLOSE: two carved tags lying on the tray's rim. */
  private paintButtons(): void {
    const L = this.buttonLetters;
    const [W, H] = this.buttons.px;
    const e = this.openCamp ? this.save(this.openCamp) : null;
    const any = !!e && (e.fish.length > 0 || e.logs > 0);
    L.begin(false);
    L.button('all', 'TAKE ALL', 8, 8, W - 16, H / 2 - 16, any ? 'go' : 'off', 50);
    L.button('close', 'CLOSE', 8, H / 2 + 8, W - 16, H / 2 - 16, 'go', 50);
    L.end();
  }

  /** The logs: a carved tag with their ends on it. */
  private paintLogs(): void {
    const L = this.logLetters;
    const c = L.c;
    const [W, H] = this.logs.px;
    const n = this.openCamp ? this.save(this.openCamp).logs : 0;
    L.begin(false);
    L.button('logs', '', 8, 8, W - 16, H - 16, n > 0 ? 'go' : 'off', 40);
    for (const [x, y] of [
      [118, 118],
      [160, 118],
      [202, 118],
      [139, 82],
      [181, 82],
      [160, 46],
    ]) {
      c.globalAlpha = n > 0 ? 1 : 0.35;
      c.fillStyle = '#8a6440';
      c.beginPath();
      c.arc(x, y, 20, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#e0c090';
      c.beginPath();
      c.arc(x, y, 13, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#8a6440';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, y, 6, 0, Math.PI * 2);
      c.stroke();
    }
    c.globalAlpha = 1;
    L.text(n > 0 ? `TAKE ${n} LOG${n === 1 ? '' : 'S'}` : 'NO LOGS', W / 2, 214, 44, n > 0 ? '#fbeed6' : 'rgba(251, 238, 214, 0.5)', 'center', 700, W - 40);
    L.end();
  }

  private buzz(hand: Hand, k: number, ms: number): void {
    pulseHand(this.renderer.xr.getSession() ?? undefined, hand, k, ms);
  }
}

