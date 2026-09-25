/**
 * BackpackSystem — the backpack as a physical tackle-box tray, Tarkov's grid with Backpack
 * Battles' merges, played with your hands.
 *
 *  THE SEQUENCE
 *   1. Catch it: the fish hangs off your rod tip (FishingSystem).
 *   2. Take it: grip it with your free hand — it unhooks and flops in your hand, full size.
 *   3. Press A (or X): the tray comes up in front of you at waist height, tipped toward you, the
 *      fish you already carry lying in their slots.
 *   4. Bring the fish over the tray: it shrinks to slot size in your hand and a GHOST fish hovers
 *      in the slot it would drop into — green if it fits, red if it doesn't. Flick the stick to
 *      turn it a quarter.
 *   5. If it would touch a fish of the same kind and tier, MERGE badges hover over both and the
 *      partner glows: dropping it there fuses them into the next tier.
 *   6. Click (trigger) to place: it drops into the slot with a wet slap and a thunk. A merge pulls
 *      the partner in, flashes, and pops the new fish out in its tier's colours with the gain
 *      rising off it.
 *
 *  Also: grip a fish in the tray to lift it back into your hand; drop one in the RELEASE net at
 *  the tray's side to let it go. Close the tray (A) with a fish in hand and you keep holding it.
 *
 *  DROP TARGETS: other places in the world can take a fish from your hand — Joe's scale at the
 *  market, a shop counter, Coral's hands. Hold the fish over one (tray open or not) and a ghost
 *  settles on it with what it's worth there; click to hand it over.
 *
 * The rules (shapes, fitting, merging, value) are backpack/logic.ts; the pieces live on the
 * save's own fish entries, so layout and tiers persist and the market sells at tier value.
 */

import { createSystem, InputComponent } from '@iwsdk/core';
import {
  AdditiveBlending,
  CanvasTexture,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  Quaternion,
  RingGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Object3D,
} from 'three';
import { musicView } from '../audio/music.ts';
import { MIX, shot } from '../audio/samples.ts';
import { mergeChime, uiClick, uiDeny } from '../audio/sfx.ts';
import type { FishUniforms, Props } from '../fishing/props.ts';
import { FISH, type GameState } from '../fishing/tidewater.ts';
import { pulseHand } from '../input/haptics.ts';
import { InteractivePanel, pointerView, register } from '../ui/pointer.ts';
import { locomotion } from '../locomotion/TeleportSystem.ts';
import { font } from '../ui/fonts.ts';
import { INK, Panel, roundRect } from '../ui/panel.ts';
import { bounds, cellsOf, fill, findSpot, fits, GRID_SIZES, merge, MERGE_BONUS, mergePartners, rotate, shapeFor, TIERS, type Piece, type Rot } from './logic.ts';
import { CELL, Tray } from './tray.ts';

type Hand = 'left' | 'right';

const TIER_HEX = [0x9aa4ac, 0xdfeaf4, 0xffb000, 0xff5fd2];
const TIER_CSS = ['#9aa4ac', '#dfeaf4', '#ffb000', '#ff5fd2'];
/** how the fish itself wears its tier (Phong emissive) */
const TIER_GLOW = [0x000000, 0x1c2228, 0x3a2400, 0x2a0a22];

/** What the backpack needs from the game; set by main before registration. */
export const backpackDeps: { state: GameState | null; props: Props | null } = { state: null, props: null };

/** Somewhere in the world that takes a fish from your hand (Joe's scale, a counter...). */
export interface DropTarget {
  /** world-space centre, and how close the fish must come (m) */
  position: Vector3;
  radius: number;
  /** what the ghost's tag says for this fish, or null if this target won't take it */
  label(p: Piece): string | null;
  /** it's yours now: the target animates the fish (already in the scene) and does the deal */
  accept(p: Piece, fish: Mesh): void;
  colour: number;
}

/** Anyone can ask: is the tray open / is a fish in hand (fishing and teleport defer to it). */
export const backpackView: {
  open: boolean;
  holding: boolean;
  /** which hand has a fish in it (fishing keeps that hand off the reel) */
  hand: Hand | null;
  /** drop targets around the world (they add and remove themselves) */
  targets: Set<DropTarget>;
  /** a caught fish goes into `hand` (its save entry id) */
  takeInHand?: (id: number, hand: Hand) => void;
  toggle?: () => void;
  system?: BackpackSystem;
} = { open: false, holding: false, hand: null, targets: new Set() };

interface FishModel {
  mesh: Mesh;
  u: FishUniforms;
  mat: MeshPhongMaterial;
}

interface Anim {
  kind: 'drop' | 'fuse' | 'pop' | 'gain' | 'burst';
  t: number;
  dur: number;
  obj: Object3D;
  from?: Matrix4;
  to?: Matrix4;
  done?: () => void;
}

const _v = new Vector3();
const _w = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _m = new Matrix4();
const _loc = new Vector3();
const UP = new Vector3(0, 1, 0);
/** the fish in your palm: snout along where you point, lying on its side */
const IN_PALM = new Quaternion().setFromEuler(new Euler(0, Math.PI, Math.PI / 2));
const HEADS = [new Vector3(1, 0, 0), new Vector3(0, 0, 1), new Vector3(-1, 0, 0), new Vector3(0, 0, -1)];

/** The tag over a drop target ("SELL · $95"). */
function makeTag(text: string, colour: string): Sprite {
  return label(text, colour, 46, 512);
}

function label(text: string, colour: string, px = 44, w = 512): Sprite {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.font = font(700, px);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = 'rgba(0,0,0,0.75)';
  g.strokeText(text, w / 2, 64, w - 20);
  g.shadowColor = colour;
  g.shadowBlur = 18;
  g.fillStyle = colour;
  g.fillText(text, w / 2, 64, w - 20);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  const s = new Sprite(new SpriteMaterial({ map: t, transparent: true, depthTest: false, toneMapped: false }));
  s.scale.set(0.24 * (w / 512), 0.06, 1);
  s.renderOrder = 30;
  return s;
}

/** The merge badge: a ring with two arrows meeting, in the new tier's colour, and its name. */
function mergeBadge(tier: number): Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  const col = TIER_CSS[tier];
  g.shadowColor = col;
  g.shadowBlur = 20;
  g.strokeStyle = col;
  g.fillStyle = col;
  g.lineWidth = 12;
  g.beginPath();
  g.arc(128, 104, 62, 0, Math.PI * 2);
  g.stroke();
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(128 + s * 44, 104);
    g.lineTo(128 + s * 14, 104);
    g.stroke();
    g.beginPath();
    g.moveTo(128 + s * 6, 104);
    g.lineTo(128 + s * 24, 84);
    g.lineTo(128 + s * 24, 124);
    g.closePath();
    g.fill();
  }
  g.font = font(700, 40);
  g.textAlign = 'center';
  g.fillText(`→ ${TIERS[tier].toUpperCase()}`, 128, 218);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  const s = new Sprite(new SpriteMaterial({ map: t, transparent: true, depthTest: false, toneMapped: false }));
  s.scale.set(0.11, 0.11, 1);
  s.renderOrder = 31;
  return s;
}

export class BackpackSystem extends createSystem({}) {
  private tray!: Tray;
  private info!: Panel;
  private readonly models = new Map<number, FishModel>(); // the fish lying in the tray
  private ghost: Mesh | null = null;
  private ghostMat!: MeshBasicMaterial;
  private badges: Sprite[] = [];
  private readonly badgePool = new Map<number, Sprite[]>();
  private releaseNet!: Group;
  /** the MUSIC on / off switch, on the tray's left (the net is on its right) */
  private musicButton!: InteractivePanel;

  /** the fish in your hand */
  private held: { piece: Piece; model: FishModel; hand: Hand; from: { x: number; y: number; rot: Rot } | null } | null = null;
  private anims: Anim[] = [];
  private readonly trig: Record<Hand, boolean> = { left: false, right: false };
  private readonly grip: Record<Hand, boolean> = { left: false, right: false };
  private readonly stick: Record<Hand, boolean> = { left: true, right: true };
  private overTray = 0; // 0 in hand .. 1 over the tray (smoothed)
  private drop: { x: number; y: number; ok: boolean; partners: Piece[] } | null = null;
  private infoKey = '';
  /** the drop target the fish in hand is over, its ghost and its tag */
  private target: DropTarget | null = null;
  private targetGhost: Mesh | null = null;
  private targetTag: Sprite | null = null;
  private targetTagText = '';
  private targetTrig = false;

  init(): void {
    this.tray = new Tray();
    this.scene.add(this.tray.group);
    this.info = new Panel([640, 200], [0.44, 0.1375]);
    this.tray.group.add(this.info.mesh);
    this.ghostMat = new MeshBasicMaterial({ color: 0x3fd66a, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false });
    // the release net: a rope ring over dark water, off the tray's right side
    this.releaseNet = new Group();
    const ring = new Mesh(new RingGeometry(0.075, 0.09, 28).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0x3fd6c6, transparent: true, opacity: 0.8, toneMapped: false }));
    const bottom = new Mesh(new RingGeometry(0.0, 0.075, 28).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0x0a3d40, transparent: true, opacity: 0.6 }));
    bottom.position.y = -0.005;
    const tag = label('RELEASE', '#3fd6c6', 40, 384);
    tag.position.set(0, 0.06, 0.1);
    this.releaseNet.add(ring, bottom, tag);
    this.tray.group.add(this.releaseNet);
    // the music switch: a button lying on the tray's left rim, clicked with the pointer
    this.musicButton = new InteractivePanel([320, 128], [0.17, 0.068]);
    this.musicButton.mesh.rotation.x = -Math.PI / 2;
    this.musicButton.paint = () => this.paintMusicButton();
    this.musicButton.onClick = () => {
      musicView.toggle();
      this.paintMusicButton();
    };
    this.musicButton.repaintOnFonts(() => this.paintMusicButton());
    this.paintMusicButton();
    this.tray.group.add(this.musicButton.mesh);
    register(this.musicButton);
    backpackView.takeInHand = (id, hand) => this.takeInHand(id, hand);
    backpackView.toggle = () => (backpackView.open ? this.close() : this.open());
    backpackView.system = this;
    this.adoptOld();
  }

  /* ── the save's fish as pieces ───────────────────────────────────────── */

  private get state(): GameState {
    return backpackDeps.state!;
  }
  private get grid(): [number, number] {
    const lv = Math.max(0, Math.min(GRID_SIZES.length - 1, this.state.upgrades.hold | 0));
    return GRID_SIZES[lv];
  }
  private get pieces(): Piece[] {
    return this.state.inventory as unknown as Piece[];
  }

  /** Fish saved before the backpack existed (or left loose) get a shape and a spot. */
  private adoptOld(): void {
    const [C, R] = this.grid;
    let changed = false;
    for (const p of this.pieces) {
      if (!Array.isArray(p.shape)) {
        p.shape = shapeFor(p.species, p.cm, p.kg);
        p.tier = p.tier ?? 0;
        p.rot = 0;
        p.placed = false;
        changed = true;
      }
      if (!p.placed) {
        const s = findSpot(p, this.pieces, C, R);
        if (s) Object.assign(p, s, { placed: true });
        changed = true;
      }
    }
    if (changed) this.state.save();
  }

  /* ── fish models ─────────────────────────────────────────────────────── */

  private makeModel(p: Piece): FishModel {
    const { mesh, uniforms } = backpackDeps.props!.makeFish(p.species);
    const mat = mesh.material as MeshPhongMaterial;
    mat.emissive.setHex(TIER_GLOW[p.tier] ?? 0);
    uniforms.uSwim.value = 0.012;
    uniforms.uFreq.value = 0.8;
    return { mesh, u: uniforms, mat };
  }

  /** Where a piece's fish lies in the tray: on its side, along its length, head per rotation. */
  private slotMatrix(p: Pick<Piece, 'x' | 'y' | 'rot' | 'shape'>, out: Matrix4, lift = 0.012): Matrix4 {
    const cells = cellsOf(p);
    const minC = Math.min(...cells.map((k) => k[0]));
    const maxC = Math.max(...cells.map((k) => k[0]));
    const minR = Math.min(...cells.map((k) => k[1]));
    const maxR = Math.max(...cells.map((k) => k[1]));
    const centre = this.tray.cellCentre((minC + maxC) / 2, (minR + maxR) / 2, _w, lift);
    const b0 = bounds(rotate(p.shape, 0));
    const len = b0.w * CELL * 0.96;
    // a two-row piece: the fish drawn a little deeper, so it fills its footprint
    const deep = b0.h > 1 ? 1.4 : 1;
    // rot 0: head toward +X (the tail cell is column 0); each quarter turn swings it toward +Z
    const H = HEADS[p.rot];
    const Y = new Vector3().crossVectors(H, UP);
    // fish-local x (its side) faces up out of the tray, y (its back) across, z (its snout) along H
    out.makeBasis(UP, Y, H).scale(_s.set(len, len * deep, len)).setPosition(centre.x, centre.y + len * 0.05, centre.z);
    return out;
  }

  private syncModels(): void {
    const placed = new Set<number>();
    for (const p of this.pieces) {
      if (!p.placed) continue;
      placed.add(p.id);
      let m = this.models.get(p.id);
      if (!m) {
        m = this.makeModel(p);
        this.models.set(p.id, m);
        this.tray.group.add(m.mesh);
      }
      const mesh = m.mesh;
      if (!this.anims.some((a) => a.obj === mesh)) {
        mesh.matrixAutoUpdate = false;
        this.slotMatrix(p, mesh.matrix);
        mesh.matrixWorldNeedsUpdate = true;
      }
    }
    for (const [id, m] of this.models) {
      if (placed.has(id) || this.anims.some((a) => a.obj === m.mesh)) continue;
      this.tray.group.remove(m.mesh);
      m.mat.dispose();
      this.models.delete(id);
    }
  }

  /* ── in hand ─────────────────────────────────────────────────────────── */

  private takeInHand(id: number, hand: Hand): void {
    const p = this.pieces.find((f) => f.id === id);
    if (!p) return;
    p.shape = shapeFor(p.species, p.cm, p.kg);
    p.tier = p.tier ?? 0;
    const b = bounds(p.shape);
    p.rot = b.w >= b.h ? 0 : 1;
    p.placed = false;
    this.state.save();
    const model = this.makeModel(p);
    model.u.uSwim.value = 0.09;
    model.u.uFreq.value = 2.6;
    this.scene.add(model.mesh);
    this.held = { piece: p, model, hand, from: null };
    this.buzz(hand, 0.7, 90);
    shot('fish_flop', MIX.fishFlop, { rate: 0.95 + Math.random() * 0.1 });
  }

  /** Pose the held fish: full size across your palm, shrinking to slot size over the tray. */
  private poseHeld(time: number): void {
    const h = this.held;
    if (!h) return;
    this.player.gripSpaces[h.hand].getWorldPosition(_v);
    this.player.raySpaces[h.hand].getWorldQuaternion(_q);
    const k = this.overTray;
    // full size: its real length (capped); over the tray: its slot's length
    const real = Math.min(0.9, h.piece.cm / 100);
    const slot = bounds(rotate(h.piece.shape, 0)).w * CELL * 0.96;
    const len = real + (slot - real) * k;
    // in the palm: snout forward along where you point, lying on its side
    const qHand = _q.clone().multiply(IN_PALM);
    let q = qHand;
    if (this.drop && k > 0.01) {
      this.slotMatrix({ ...h.piece, x: this.drop.x, y: this.drop.y }, _m);
      const qTray = new Quaternion();
      _m.decompose(_w, qTray, _s);
      qTray.premultiply(this.tray.group.getWorldQuaternion(new Quaternion()));
      q = qHand.clone().slerp(qTray, k);
    }
    const mesh = h.model.mesh;
    mesh.matrixAutoUpdate = true;
    mesh.position.copy(_v);
    mesh.quaternion.copy(q);
    mesh.scale.setScalar(len);
    h.model.u.uTime.value = time;
    h.model.u.uSwim.value = 0.015 + 0.07 * (1 - k) * (0.6 + 0.4 * Math.sin(time * 1.3));
  }

  private paintMusicButton(): void {
    const b = this.musicButton;
    const c = b.ctx;
    const on = !musicView.muted;
    const [W, H] = b.px;
    b.clear();
    b.buttons = [{ id: 'music', x: 0, y: 0, w: W, h: H }];
    roundRect(c, 6, 6, W - 12, H - 12, 22);
    c.fillStyle = on ? (b.hover ? '#ffc640' : INK.amber) : b.hover ? 'rgba(40, 52, 60, 0.95)' : INK.glass;
    c.fill();
    c.lineWidth = 5;
    c.strokeStyle = on ? '#1a1206' : INK.rim;
    c.stroke();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = font(700, 50);
    c.fillStyle = on ? '#1a1206' : INK.dim;
    c.fillText(on ? '♪ MUSIC ON' : '♪ MUSIC OFF', W / 2, H / 2 + 2, W - 30);
    b.commit();
  }

  /* ── open / close ────────────────────────────────────────────────────── */

  private open(): void {
    if (backpackView.open) return;
    backpackView.open = true;
    const [C, R] = this.grid;
    this.tray.build(C, R);
    this.tray.present(this.camera);
    this.releaseNet.position.set(this.tray.width / 2 + 0.16, 0.01, this.tray.height / 2 - 0.08);
    this.info.mesh.position.set(0, 0.075, -this.tray.height / 2 - 0.1);
    this.musicButton.mesh.position.set(-this.tray.width / 2 - 0.13, 0.012, this.tray.height / 2 - 0.08);
    this.info.mesh.rotation.set(-0.25, 0, 0);
    this.tray.group.visible = true;
    this.tray.group.scale.setScalar(0.85);
    this.anims.push({ kind: 'pop', t: 0, dur: 0.22, obj: this.tray.group });
    // a trigger already down isn't a click in here
    for (const h of ['left', 'right'] as const) this.trig[h] = (this.input.xr.gamepads[h]?.getButtonValue(InputComponent.Trigger) ?? 0) > 0.3;
    this.infoKey = '';
    this.syncModels();
    // the box's lid: two latches
    shot('bail_click', MIX.bail + 8, { rate: 0.62 });
    shot('bail_click', MIX.bail + 4, { rate: 0.8, delay: 0.07 });
    this.buzz(this.held?.hand ?? 'right', 0.25, 40);
  }

  private close(): void {
    if (!backpackView.open) return;
    backpackView.open = false;
    this.tray.group.visible = false;
    this.clearGhost();
    this.overTray = 0;
    shot('bail_click', MIX.bail + 6, { rate: 0.7 });
  }

  /* ── frame ───────────────────────────────────────────────────────────── */

  update(delta: number, time: number): void {
    const dt = Math.min(delta, 0.05);
    if (!backpackDeps.state) return;
    for (const h of ['left', 'right'] as const) {
      const pad = this.input.xr.gamepads[h];
      if (pad?.getButtonDown(h === 'right' ? InputComponent.A_Button : InputComponent.X_Button)) {
        if (backpackView.open) this.close();
        else this.open();
      }
    }
    locomotion.enabled = locomotion.enabled && !backpackView.open;
    this.trackTargets(time);
    if (backpackView.open) {
      this.track(dt);
      this.handleInput();
      this.showGhost(time);
      this.paintInfo();
    }
    this.poseHeld(time);
    this.animate(dt, time);
    backpackView.holding = !!this.held;
    backpackView.hand = this.held?.hand ?? null;
  }

  /** Where's the fish hand relative to the tray: over it (and which slot), or away. */
  private track(dt: number): void {
    const h = this.held;
    let over = 0;
    this.drop = null;
    if (h && !this.target) {
      this.player.gripSpaces[h.hand].getWorldPosition(_v);
      this.tray.group.worldToLocal(_loc.copy(_v));
      const inX = Math.abs(_loc.x) < this.tray.width / 2 + 0.08;
      const inZ = Math.abs(_loc.z) < this.tray.height / 2 + 0.08;
      if (inX && inZ && _loc.y > -0.08 && _loc.y < 0.32) {
        over = 1;
        const [C, R] = this.grid;
        const at = this.tray.cellAt(_loc);
        const b = bounds(rotate(h.piece.shape, h.piece.rot));
        const x = Math.max(0, Math.min(C - b.w, Math.round(at.c - b.w / 2)));
        const y = Math.max(0, Math.min(R - b.h, Math.round(at.r - b.h / 2)));
        const cand = { ...h.piece, x, y, placed: true };
        const ok = fits(cand, this.pieces, C, R);
        this.drop = { x, y, ok, partners: ok ? mergePartners(cand, this.pieces) : [] };
      }
    }
    this.overTray += (over - this.overTray) * (1 - Math.exp(-dt * 12));
  }

  private overRelease(): boolean {
    const h = this.held;
    if (!h) return false;
    this.player.gripSpaces[h.hand].getWorldPosition(_v);
    this.tray.group.worldToLocal(_loc.copy(_v));
    return Math.hypot(_loc.x - this.releaseNet.position.x, _loc.z - this.releaseNet.position.z) < 0.12 && _loc.y > -0.08 && _loc.y < 0.3;
  }

  private handleInput(): void {
    for (const h of ['left', 'right'] as const) {
      const pad = this.input.xr.gamepads[h];
      const t = pad?.getButtonValue(InputComponent.Trigger) ?? 0;
      const g = pad?.getButtonValue(InputComponent.Squeeze) ?? 0;
      const tDown = !this.trig[h] && t > 0.6;
      const gDown = !this.grip[h] && g > 0.6;
      if (t > 0.6) this.trig[h] = true;
      else if (t < 0.3) this.trig[h] = false;
      if (g > 0.6) this.grip[h] = true;
      else if (g < 0.3) this.grip[h] = false;
      const ax = pad?.getAxesValues(InputComponent.Thumbstick);
      if (ax) {
        if (Math.abs(ax.x) < 0.3) this.stick[h] = true;
        else if (this.stick[h] && Math.abs(ax.x) > 0.7) {
          this.stick[h] = false;
          if (this.held) this.turn(ax.x > 0 ? 1 : 3);
        }
      }
      if (this.held && this.held.hand === h && tDown && !this.target) this.place();
      else if (!this.held && (gDown || tDown)) this.lift(h);
    }
  }

  private turn(q: 1 | 3): void {
    const p = this.held!.piece;
    p.rot = ((p.rot + q) % 4) as Rot;
    shot('bail_click', MIX.bail + 4, { rate: 1.35 });
    this.buzz(this.held!.hand, 0.18, 22);
  }

  /** Click: drop the fish in hand into its ghost's slot (or the release net). */
  private place(): void {
    const h = this.held!;
    if (this.overRelease()) {
      this.releaseHeld();
      return;
    }
    const d = this.drop;
    if (!d || !d.ok) {
      uiDeny();
      this.buzz(h.hand, 0.6, 70);
      return;
    }
    const p = h.piece;
    Object.assign(p, { x: d.x, y: d.y, placed: true });
    // the fish in your hand becomes the slot's fish: it drops from your hand into the slot
    const model = h.model;
    model.mesh.updateMatrixWorld();
    this.tray.group.updateMatrixWorld();
    const from = new Matrix4().copy(this.tray.group.matrixWorld).invert().multiply(model.mesh.matrixWorld);
    this.scene.remove(model.mesh);
    this.tray.group.add(model.mesh);
    model.mesh.matrixAutoUpdate = false;
    model.mesh.matrix.copy(from);
    model.u.uSwim.value = 0.012;
    model.u.uFreq.value = 0.8;
    model.mat.emissive.setHex(TIER_GLOW[p.tier]);
    this.models.set(p.id, model);
    const to = this.slotMatrix(p, new Matrix4());
    this.held = null;
    this.clearGhost();
    this.anims.push({
      kind: 'drop',
      t: 0,
      dur: 0.2,
      obj: model.mesh,
      from,
      to,
      done: () => {
        // landing: a wet slap on the felt, a thunk in the box
        shot('fish_flop', MIX.fishFlop + 2, { rate: 1.1 + Math.random() * 0.1, slice: 1 + Math.floor(Math.random() * 3) });
        uiClick();
        this.buzz(h.hand, 0.5, 45);
        this.burst(p, TIER_HEX[p.tier], 0.6);
        this.mergeFrom(p, h.hand);
      },
    });
    this.state.save();
  }

  /** The fish in hand over a drop target: a ghost settles on it with its tag; click hands it over. */
  private trackTargets(time: number): void {
    const h = this.held;
    let best: DropTarget | null = null;
    let label: string | null = null;
    if (h) {
      this.player.gripSpaces[h.hand].getWorldPosition(_v);
      let bd = Infinity;
      for (const t of backpackView.targets) {
        const d = t.position.distanceTo(_v);
        if (d < t.radius && d < bd) {
          const l = t.label(h.piece);
          if (l === null) continue;
          bd = d;
          best = t;
          label = l;
        }
      }
    }
    this.target = best;
    if (!h || !best) {
      if (this.targetGhost) this.targetGhost.visible = false;
      if (this.targetTag) this.targetTag.visible = false;
      this.targetTrig = false;
      return;
    }
    // the ghost lies on the target, turned the way the fish in your hand is
    if (!this.targetGhost || this.targetGhost.geometry !== h.model.mesh.geometry) {
      if (this.targetGhost) this.scene.remove(this.targetGhost);
      this.targetGhost = new Mesh(h.model.mesh.geometry, new MeshBasicMaterial({ color: best.colour, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false }));
      this.targetGhost.renderOrder = 4;
      this.scene.add(this.targetGhost);
    }
    const g = this.targetGhost;
    (g.material as MeshBasicMaterial).color.setHex(best.colour);
    (g.material as MeshBasicMaterial).opacity = 0.32 + 0.12 * Math.sin(time * 6);
    const len = Math.min(0.9, h.piece.cm / 100) * 0.8;
    g.position.copy(best.position).y += 0.04 + 0.01 * Math.sin(time * 5);
    h.model.mesh.getWorldQuaternion(g.quaternion);
    g.scale.setScalar(len);
    g.visible = true;
    if (label !== this.targetTagText || !this.targetTag) {
      if (this.targetTag) this.scene.remove(this.targetTag);
      this.targetTag = label ? makeTag(label, `#${best.colour.toString(16).padStart(6, '0')}`) : null;
      if (this.targetTag) this.scene.add(this.targetTag);
      this.targetTagText = label ?? '';
    }
    if (this.targetTag) {
      this.targetTag.position.copy(best.position).y += 0.22;
      this.targetTag.visible = true;
    }
    // click hands it over
    const t = this.input.xr.gamepads[h.hand]?.getButtonValue(InputComponent.Trigger) ?? 0;
    const down = !this.targetTrig && t > 0.6;
    if (t > 0.6) this.targetTrig = true;
    else if (t < 0.3) this.targetTrig = false;
    if (down && !pointerView.claimed[h.hand]) {
      const fish = h.model.mesh;
      this.held = null;
      g.visible = false;
      if (this.targetTag) this.targetTag.visible = false;
      this.target = null;
      this.buzz(h.hand, 0.5, 50);
      best.accept(h.piece, fish);
    }
  }

  /** Grip (or click) a fish in the tray to lift it back into your hand. */
  private lift(hand: Hand): void {
    this.player.gripSpaces[hand].getWorldPosition(_v);
    this.tray.group.worldToLocal(_loc.copy(_v));
    if (_loc.y > 0.2 || _loc.y < -0.08) return;
    const at = this.tray.cellAt(_loc);
    const c = Math.floor(at.c);
    const r = Math.floor(at.r);
    const p = this.pieces.find((f) => f.placed && cellsOf(f).some(([x, y]) => x === c && y === r));
    if (!p) return;
    const model = this.models.get(p.id);
    if (!model) return;
    this.models.delete(p.id);
    this.tray.group.remove(model.mesh);
    this.scene.add(model.mesh);
    this.held = { piece: p, model, hand, from: { x: p.x, y: p.y, rot: p.rot } };
    p.placed = false;
    shot('fish_flop', MIX.fishFlop - 4, { rate: 1.2, slice: 2 });
    this.buzz(hand, 0.35, 40);
  }

  private releaseHeld(): void {
    const h = this.held!;
    this.scene.remove(h.model.mesh);
    h.model.mat.dispose();
    this.state.release(h.piece.id);
    this.held = null;
    this.clearGhost();
    shot('splash', MIX.splash - 6, { rate: 1.25 });
    shot('emerge', MIX.emerge - 4, { rate: 1.3, delay: 0.15 });
    this.buzz(h.hand, 0.4, 60);
    const tag = label(`released the ${FISH[h.piece.species].name.toLowerCase()}`, '#3fd6c6', 36);
    tag.position.copy(this.releaseNet.position).add(_v.set(0, 0.1, 0));
    this.tray.group.add(tag);
    this.anims.push({ kind: 'gain', t: 0, dur: 1.4, obj: tag });
  }

  /** Merge the piece just placed with any match it touches — and chain. */
  private mergeFrom(start: Piece, hand: Hand): void {
    const [C, R] = this.grid;
    const partner = mergePartners(start, this.pieces)[0];
    if (!partner) return;
    const nextId = Math.max(0, ...this.pieces.map((f) => f.id)) + 1;
    const res = merge(start, partner, this.pieces, C, R, nextId);
    if (!res) return;
    const a = this.models.get(start.id);
    const b = this.models.get(partner.id);
    // swap the save: the two out, the fused fish in
    const inv = this.state.inventory as unknown as Piece[];
    for (const id of res.consumed) {
      const i = inv.findIndex((f) => f.id === id);
      if (i >= 0) inv.splice(i, 1);
      this.models.delete(id);
    }
    const merged = { ...res.piece, caughtAt: 12, record: false } as Piece & { caughtAt: number; record: boolean };
    (this.state as unknown as { _nextId: number })._nextId = nextId + 1;
    // the show: both fish slide together and flash; the fused one pops out in its tier's colours
    const meet = this.slotMatrix(merged, new Matrix4());
    for (const m of [a, b]) {
      if (!m) continue;
      m.mat.emissive.setHex(0xffffff);
      this.anims.push({
        kind: 'fuse',
        t: 0,
        dur: 0.28,
        obj: m.mesh,
        from: m.mesh.matrix.clone(),
        to: meet,
        done: () => {
          this.tray.group.remove(m.mesh);
          m.mat.dispose();
        },
      });
    }
    shot('fish_flop', MIX.fishFlop - 2, { rate: 1.35 });
    window.setTimeout(() => {
      inv.push(merged);
      this.state.save();
      const nm = this.makeModel(merged);
      this.models.set(merged.id, nm);
      this.tray.group.add(nm.mesh);
      nm.mesh.matrixAutoUpdate = false;
      nm.mesh.matrix.copy(meet);
      this.anims.push({ kind: 'pop', t: 0, dur: 0.35, obj: nm.mesh, to: meet.clone() });
      mergeChime(merged.tier, 1);
      this.buzz(hand, 0.9, 140);
      this.burst(merged, TIER_HEX[merged.tier], 1.4);
      const tag = label(`${TIERS[merged.tier].toUpperCase()}  +$${res.gained}`, TIER_CSS[merged.tier]);
      _v.setFromMatrixPosition(meet);
      tag.position.set(_v.x, 0.08, _v.z);
      this.tray.group.add(tag);
      this.anims.push({ kind: 'gain', t: 0, dur: 1.6, obj: tag });
      this.infoKey = '';
      // and on: does the new fish touch a match of ITS tier?
      window.setTimeout(() => this.mergeFrom(merged, hand), 380);
    }, 280);
  }

  /** A ring bursting out of the slot in the tier's colour. */
  private burst(p: Piece, hex: number, size: number): void {
    const ring = new Mesh(new RingGeometry(0.8, 1, 36).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: hex, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    _v.setFromMatrixPosition(this.slotMatrix(p, _m));
    ring.position.set(_v.x, 0.02, _v.z);
    ring.scale.setScalar(0.02);
    ring.userData.size = size * CELL * 1.6;
    this.tray.group.add(ring);
    this.anims.push({ kind: 'burst', t: 0, dur: 0.5, obj: ring });
  }

  /* ── the ghost ───────────────────────────────────────────────────────── */

  private clearGhost(): void {
    if (this.ghost) this.ghost.visible = false;
    for (const b of this.badges) b.visible = false;
    this.badges = [];
    this.tray.paintTiles(this.tierTiles());
  }

  private tierTiles(): [number, number, number, number][] {
    const out: [number, number, number, number][] = [];
    for (const p of this.pieces) if (p.placed) for (const [c, r] of cellsOf(p)) out.push([c, r, TIER_HEX[p.tier], p.tier > 0 ? 0.22 : 0.08]);
    return out;
  }

  private showGhost(time: number): void {
    this.syncModels();
    const h = this.held;
    const d = this.drop;
    const tiles = this.tierTiles();
    for (const b of this.badges) b.visible = false;
    this.badges = [];
    // fish lying in the tray wear their tier (partners of a pending merge pulse, below)
    for (const p of this.pieces) {
      const m = this.models.get(p.id);
      if (m && p.placed && p.tier < 3 && !this.anims.some((a) => a.obj === m.mesh)) m.mat.emissive.setHex(TIER_GLOW[p.tier]);
    }
    if (!h || !d) {
      if (this.ghost) this.ghost.visible = false;
      this.tray.paintTiles(tiles);
      return;
    }
    // the ghost fish hovering in its slot, and its footprint
    if (!this.ghost || this.ghost.geometry !== h.model.mesh.geometry) {
      if (this.ghost) this.tray.group.remove(this.ghost);
      this.ghost = new Mesh(h.model.mesh.geometry, this.ghostMat);
      this.ghost.matrixAutoUpdate = false;
      this.ghost.renderOrder = 4;
      this.tray.group.add(this.ghost);
    }
    const cand = { ...h.piece, x: d.x, y: d.y };
    this.slotMatrix(cand, this.ghost.matrix, 0.03 + 0.012 * Math.sin(time * 5));
    this.ghost.matrixWorldNeedsUpdate = true;
    this.ghost.visible = true;
    const merging = d.partners.length > 0;
    const hex = !d.ok ? 0xe8352a : merging ? TIER_HEX[h.piece.tier + 1] : 0x3fd66a;
    this.ghostMat.color.setHex(hex);
    this.ghostMat.opacity = 0.35 + 0.15 * Math.sin(time * 6);
    for (const [c, r] of cellsOf(cand)) tiles.push([c, r, hex, 0.38]);
    // merge badges over the ghost and over each partner, pulsing; the partners glow
    if (merging) {
      const nt = h.piece.tier + 1;
      let pool = this.badgePool.get(nt);
      if (!pool) this.badgePool.set(nt, (pool = []));
      const spots = [cand, ...d.partners];
      while (pool.length < spots.length) {
        const s = mergeBadge(nt);
        this.tray.group.add(s);
        pool.push(s);
      }
      spots.forEach((p, i) => {
        const s = pool![i];
        _v.setFromMatrixPosition(this.slotMatrix(p, _m));
        s.position.set(_v.x, 0.1 + 0.01 * Math.sin(time * 4 + i), _v.z);
        const k = 1 + 0.12 * Math.sin(time * 8);
        s.scale.set(0.11 * k, 0.11 * k, 1);
        s.visible = true;
        this.badges.push(s);
      });
      for (const p of d.partners) {
        const m = this.models.get(p.id);
        if (m) m.mat.emissive.setRGB(0.3 + 0.25 * Math.sin(time * 8), 0.24, 0.06);
        for (const [c, r] of cellsOf(p)) tiles.push([c, r, TIER_HEX[nt], 0.25 + 0.15 * Math.sin(time * 8)]);
      }
    }
    this.tray.paintTiles(tiles);
  }

  /* ── animation ───────────────────────────────────────────────────────── */

  private animate(dt: number, time: number): void {
    // tiers live on the fish: Legendary shimmers through the hues
    for (const p of this.pieces) {
      const m = this.models.get(p.id);
      if (!m) continue;
      m.u.uTime.value = time;
      if (p.tier === 3) m.mat.emissive.setHSL((time * 0.15) % 1, 0.8, 0.18);
    }
    const alive: Anim[] = [];
    for (const a of this.anims) {
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      const e = 1 - Math.pow(1 - k, 3);
      switch (a.kind) {
        case 'drop':
        case 'fuse': {
          const pa = new Vector3();
          const qa = new Quaternion();
          const sa = new Vector3();
          const pb = new Vector3();
          const qb = new Quaternion();
          const sb = new Vector3();
          a.from!.decompose(pa, qa, sa);
          a.to!.decompose(pb, qb, sb);
          pa.lerp(pb, e);
          if (a.kind === 'drop') pa.y += Math.sin(k * Math.PI) * 0.03; // a little hop into the slot
          qa.slerp(qb, e);
          sa.lerp(sb, e);
          if (a.kind === 'fuse') sa.multiplyScalar(1 + 0.2 * Math.sin(k * Math.PI));
          a.obj.matrix.compose(pa, qa, sa);
          a.obj.matrixWorldNeedsUpdate = true;
          break;
        }
        case 'pop': {
          const s = k < 0.6 ? (k / 0.6) * 1.18 : 1.18 - ((k - 0.6) / 0.4) * 0.18;
          if (a.to) {
            a.to.decompose(_w, _q, _s);
            a.obj.matrix.compose(_w, _q, _s.multiplyScalar(Math.max(0.01, s)));
            a.obj.matrixWorldNeedsUpdate = true;
          } else a.obj.scale.setScalar(0.85 + 0.15 * e);
          break;
        }
        case 'gain':
          a.obj.position.y += dt * 0.08;
          ((a.obj as Sprite).material as SpriteMaterial).opacity = 1 - k * k;
          break;
        case 'burst':
          a.obj.scale.setScalar(0.02 + e * ((a.obj.userData.size as number) ?? 0.2));
          ((a.obj as Mesh).material as MeshBasicMaterial).opacity = 1 - k;
          break;
      }
      if (k < 1) alive.push(a);
      else {
        if (a.kind === 'gain' || a.kind === 'burst') a.obj.parent?.remove(a.obj);
        a.done?.();
      }
    }
    this.anims = alive;
  }

  /* ── the info card behind the tray ───────────────────────────────────── */

  private paintInfo(): void {
    const [C, R] = this.grid;
    const placed = this.pieces.filter((f) => f.placed);
    const { used, total } = fill(placed, C, R);
    const worth = placed.reduce((a, f) => a + f.value, 0);
    const h = this.held;
    const d = this.drop;
    const rel = this.overRelease();
    const key = `${used}|${worth}|${h?.piece.id ?? '-'}|${h?.piece.rot ?? ''}|${d ? `${d.ok}${d.partners.length}` : '-'}|${rel}`;
    if (key === this.infoKey) return;
    this.infoKey = key;
    const c = this.info.ctx;
    this.info.clear();
    roundRect(c, 4, 4, 632, 192, 18);
    c.fillStyle = 'rgba(10, 16, 22, 0.88)';
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = INK.rim;
    c.stroke();
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    c.font = font(700, 30);
    c.fillStyle = INK.hot;
    c.fillText('BACKPACK', 22, 42);
    c.font = font(600, 22);
    c.fillStyle = INK.dim;
    c.fillText(`${used} / ${total}`, 180, 42);
    c.textAlign = 'right';
    c.fillStyle = INK.amber;
    c.fillText(`worth $${worth}`, 618, 42);
    c.textAlign = 'left';
    if (h) {
      const p = h.piece;
      c.font = font(700, 20);
      c.fillStyle = TIER_CSS[p.tier];
      c.fillText(TIERS[p.tier].toUpperCase(), 22, 82);
      c.font = font(700, 32);
      c.fillStyle = INK.hot;
      c.fillText(FISH[p.species].name, 22, 116, 420);
      c.font = font(500, 22);
      c.fillStyle = INK.dim;
      c.fillText(`${Math.round(p.cm)} cm · ${p.kg.toFixed(2)} kg`, 22, 148);
      c.font = font(700, 34);
      c.fillStyle = INK.amber;
      c.textAlign = 'right';
      c.fillText(`$${p.value}`, 618, 116);
      c.font = font(600, 20);
      if (rel) {
        c.fillStyle = INK.sea;
        c.fillText('click to let it go', 618, 180);
      } else if (d && !d.ok) {
        c.fillStyle = INK.danger;
        c.fillText("won't fit there · flick the stick to turn", 618, 180);
      } else if (d && d.partners.length) {
        c.fillStyle = TIER_CSS[p.tier + 1];
        c.fillText(`MERGE → ${TIERS[p.tier + 1].toUpperCase()}  ×${MERGE_BONUS[p.tier + 1]}`, 618, 180);
      } else if (d) {
        c.fillStyle = INK.good;
        c.fillText('click to place', 618, 180);
      } else {
        c.fillStyle = INK.dim;
        c.fillText('bring it over the backpack', 618, 180);
      }
    } else {
      c.font = font(500, 22);
      c.fillStyle = INK.dim;
      c.fillText('Grip a fish to lift it out.', 22, 90);
      c.fillText('Same kind, same tier, touching: they merge —', 22, 124);
      c.fillText('worth more, and they take less room.', 22, 154);
    }
    this.info.commit();
  }

  private buzz(hand: Hand, k: number, ms: number): void {
    pulseHand(this.renderer.xr.getSession() ?? undefined, hand, k, ms);
  }
}
