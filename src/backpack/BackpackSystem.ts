/**
 * BackpackSystem — the backpack menu: Tarkov's grid, Backpack Battles' merges, in VR.
 *
 *  A (or X)        open / close the backpack. It also opens by itself when you land a fish,
 *                  with the catch already on your pointer.
 *  TRIGGER         point at a fish to pick it up; point at the grid to put it down.
 *  STICK / GRIP    flick the stick sideways (or squeeze grip) to turn the fish you're holding.
 *  RELEASE         drop a fish on RELEASE to let it go back to the sea.
 *
 * Put a fish down touching another of the same species and tier and they fuse into one of the
 * next tier (backpack/logic.ts): a flash, the gain rising off it, a chime and a kick in your
 * hand — and if the new fish now touches a match of ITS tier, that one goes too.
 *
 * Closing with a new catch still in hand puts it in the first spot it fits; if nothing fits, it
 * goes back to the sea. While the backpack is open, teleport and the rod are paused.
 *
 * The pieces live on the save's own fish entries (GameState.inventory), so layout, tiers and
 * merges persist, and the fish market sells them at their tier's value.
 */

import { createSystem, InputComponent } from '@iwsdk/core';
import { BufferGeometry, Float32BufferAttribute, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, Plane, Ray, SphereGeometry, Vector3 } from 'three';
import { SKIN, SPECIES } from '../../vendor/tidewater/src/world/fish/FishSpecies.js';
import { shot, MIX } from '../audio/samples.ts';
import { mergeChime, uiClick, uiDeny } from '../audio/sfx.ts';
import { FISH, type GameState } from '../fishing/tidewater.ts';
import { pulseHand } from '../input/haptics.ts';
import { locomotion } from '../locomotion/TeleportSystem.ts';
import { font } from '../ui/fonts.ts';
import { INK, Panel, roundRect } from '../ui/panel.ts';
import {
  bounds,
  cellsOf,
  findSpot,
  fill,
  fits,
  GRID_SIZES,
  merge,
  MERGE_BONUS,
  mergePartners,
  rotate,
  shapeFor,
  TIERS,
  type Piece,
  type Rot,
} from './logic.ts';

type Hand = 'left' | 'right';

const PX = [1024, 640] as const;
const M = [0.96, 0.6] as const;
const GRID_BOX = { x: 24, y: 70, w: 640, h: 540 };
const RELEASE_BOX = { x: 690, y: 520, w: 310, h: 90 };
const TIER_COLOUR = ['#9aa4ac', '#dfe8f0', '#ffb000', '#ff5fd2'];

const SK = SKIN as unknown as Record<string, { back: number; flank: number; belly: number; fin: number; edge: number }>;
const SP = SPECIES as unknown as Record<string, { iris: number }>;
const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/** What the backpack needs from the game; set by main before registration. */
export const backpackDeps: { state: GameState | null; onRelease: ((species: string) => void) | null } = { state: null, onRelease: null };

/** Anyone can ask: is the backpack open (fishing / teleport pause while it is). */
export const backpackView: {
  open: boolean;
  offer?: (id: number) => void;
  toggle?: () => void;
  system?: BackpackSystem;
} = { open: false };

interface Fx {
  kind: 'pop' | 'flash' | 'gain';
  id: number;
  t: number;
  text?: string;
  x?: number;
  y?: number;
}

const _o = new Vector3();
const _d = new Vector3();
const _hit = new Vector3();
const _n = new Vector3();

export class BackpackSystem extends createSystem({}) {
  private panel!: Panel;
  private cursor!: Mesh;
  private beam!: Line;
  private hand: Hand = 'right';
  private hover: { px: number; py: number } | null = null;
  private held: { piece: Piece; fresh: boolean; from: { x: number; y: number; rot: Rot } | null } | null = null;
  private fx: Fx[] = [];
  private dirty = true;
  private triggerDown: Record<Hand, boolean> = { left: false, right: false };
  private stickArmed: Record<Hand, boolean> = { left: true, right: true };
  private gripDown: Record<Hand, boolean> = { left: false, right: false };
  private readonly plane = new Plane();
  private readonly ray = new Ray();

  init(): void {
    this.panel = new Panel([PX[0], PX[1]], [M[0], M[1]]);
    this.panel.mesh.visible = false;
    this.panel.mesh.renderOrder = 20;
    this.scene.add(this.panel.mesh);
    this.cursor = new Mesh(new SphereGeometry(0.008, 10, 8), new MeshBasicMaterial({ color: 0xffb000, depthTest: false }));
    this.cursor.renderOrder = 21;
    this.cursor.visible = false;
    this.scene.add(this.cursor);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, 0, -1], 3));
    this.beam = new Line(g, new LineBasicMaterial({ color: 0xffb000, transparent: true, opacity: 0.6, depthTest: false }));
    this.beam.frustumCulled = false;
    this.beam.visible = false;
    this.scene.add(this.beam);
    backpackView.offer = (id) => this.offer(id);
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

  /** Fish saved before the backpack existed get a shape and a spot (or, if full, stay loose). */
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

  /* ── open / close ────────────────────────────────────────────────────── */

  private open(): void {
    if (backpackView.open) return;
    backpackView.open = true;
    // a trigger already down (the press that dismissed the catch card) isn't a click in here
    for (const h of ['left', 'right'] as const) {
      this.triggerDown[h] = (this.input.xr.gamepads[h]?.getButtonValue(InputComponent.Trigger) ?? 0) > 0.3;
    }
    // in front of you at chest height, tipped back a little, world-locked until you close it
    const cam = this.camera;
    cam.getWorldPosition(_o);
    cam.getWorldDirection(_d);
    _d.y = 0;
    _d.normalize();
    const m = this.panel.mesh;
    m.position.copy(_o).addScaledVector(_d, 0.72);
    m.position.y -= 0.28;
    m.lookAt(_o.x, m.position.y + 0.25, _o.z);
    m.visible = true;
    this.dirty = true;
    shot('bail_click', MIX.bail + 6, { rate: 0.7 });
    uiClick();
  }

  /** Whatever's in hand goes back where it came from — or, if it's a new catch, into the first
   *  spot it fits; with no room anywhere it goes back to the sea. */
  private stowHeld(): void {
    const h = this.held;
    if (!h) return;
    const [C, R] = this.grid;
    if (h.from) Object.assign(h.piece, h.from, { placed: true });
    else {
      const s = findSpot(h.piece, this.pieces, C, R);
      if (s) {
        Object.assign(h.piece, s, { placed: true });
        this.mergeFrom(h.piece);
      } else this.release(h.piece, 'No room — back to the sea');
    }
    this.held = null;
    this.state.save();
  }

  private close(): void {
    if (!backpackView.open) return;
    this.stowHeld();
    backpackView.open = false;
    this.panel.mesh.visible = false;
    this.cursor.visible = false;
    this.beam.visible = false;
    uiClick();
  }

  /** A new catch: open the backpack with it on the pointer. */
  private offer(id: number): void {
    const p = this.pieces.find((f) => f.id === id);
    if (!p) return;
    this.stowHeld();
    p.shape = shapeFor(p.species, p.cm, p.kg);
    p.tier = 0;
    p.rot = bounds(p.shape).w >= bounds(p.shape).h ? 0 : 1;
    p.placed = false;
    this.open();
    this.held = { piece: p, fresh: true, from: null };
    this.dirty = true;
  }

  private release(p: Piece, msg: string): void {
    this.state.release(p.id);
    backpackDeps.onRelease?.(p.species);
    this.toast = { text: msg, t: 0 };
    shot('splash', MIX.splash - 10, { rate: 1.3 });
  }
  private toast: { text: string; t: number } | null = null;

  /* ── frame ───────────────────────────────────────────────────────────── */

  update(delta: number): void {
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
    if (!backpackView.open) return;

    this.point();
    this.handleInput();

    // effects
    for (const f of this.fx) f.t += dt;
    const live = this.fx.filter((f) => f.t < (f.kind === 'gain' ? 1.4 : 0.35));
    if (live.length || this.fx.length) this.dirty = true;
    this.fx = live;
    if (this.toast) {
      this.toast.t += dt;
      if (this.toast.t > 2.2) this.toast = null;
      this.dirty = true;
    }
    if (this.dirty) this.paint();
    this.dirty = false;
  }

  /** Cast the pointing hand's ray at the panel: the cursor, and the canvas point under it. */
  private point(): void {
    const ray = this.player.raySpaces[this.hand];
    ray.getWorldPosition(_o);
    ray.getWorldDirection(_d).negate(); // an Object3D's world direction is its +Z; the ray points −Z
    const m = this.panel.mesh;
    m.updateMatrixWorld();
    _n.set(0, 0, 1).transformDirection(m.matrixWorld);
    this.plane.setFromNormalAndCoplanarPoint(_n, m.position);
    this.ray.set(_o, _d);
    const hit = this.ray.intersectPlane(this.plane, _hit);
    let hover: { px: number; py: number } | null = null;
    if (hit) {
      const local = m.worldToLocal(_hit.clone());
      const u = local.x / M[0] + 0.5;
      const v = 0.5 - local.y / M[1];
      if (u >= -0.05 && u <= 1.05 && v >= -0.05 && v <= 1.05) hover = { px: u * PX[0], py: v * PX[1] };
    }
    this.cursor.visible = !!hover;
    this.beam.visible = !!hover;
    if (hover && hit) {
      this.cursor.position.copy(_hit);
      const pos = this.beam.geometry.attributes.position as Float32BufferAttribute;
      pos.setXYZ(0, _o.x, _o.y, _o.z);
      pos.setXYZ(1, _hit.x, _hit.y, _hit.z);
      pos.needsUpdate = true;
    }
    const was = this.hover;
    if (!was !== !hover || (was && hover && (Math.floor(was.px / 8) !== Math.floor(hover.px / 8) || Math.floor(was.py / 8) !== Math.floor(hover.py / 8)))) this.dirty = true;
    this.hover = hover;
  }

  private handleInput(): void {
    let pressed = false;
    for (const h of ['left', 'right'] as const) {
      const pad = this.input.xr.gamepads[h];
      const v = pad?.getButtonValue(InputComponent.Trigger) ?? 0;
      if (!this.triggerDown[h] && v > 0.6) {
        this.triggerDown[h] = true;
        this.hand = h; // the hand that clicks is the one that points
        pressed = true;
      } else if (this.triggerDown[h] && v < 0.3) this.triggerDown[h] = false;
      // turn the held fish: a sideways flick, or a squeeze
      const ax = pad?.getAxesValues(InputComponent.Thumbstick);
      if (ax) {
        if (Math.abs(ax.x) < 0.3) this.stickArmed[h] = true;
        else if (this.stickArmed[h] && Math.abs(ax.x) > 0.7) {
          this.stickArmed[h] = false;
          this.turn(ax.x > 0 ? 1 : 3);
        }
      }
      const g = pad?.getButtonValue(InputComponent.Squeeze) ?? 0;
      if (!this.gripDown[h] && g > 0.6) {
        this.gripDown[h] = true;
        this.turn(1);
      } else if (this.gripDown[h] && g < 0.3) this.gripDown[h] = false;
    }
    if (pressed) this.click();
  }

  private turn(q: 1 | 3): void {
    if (!this.held) return;
    const p = this.held.piece;
    p.rot = ((p.rot + q) % 4) as Rot;
    this.dirty = true;
    shot('bail_click', MIX.bail + 4, { rate: 1.3 });
    this.buzz(0.15, 25);
  }

  private buzz(k: number, ms: number): void {
    pulseHand(this.renderer.xr.getSession() ?? undefined, this.hand, k, ms);
  }

  /** The grid cell under the canvas point (fractional), or null outside the grid. */
  private cellAt(px: number, py: number): { c: number; r: number } | null {
    const [C, R] = this.grid;
    const cs = this.cellSize();
    const gx = GRID_BOX.x + (GRID_BOX.w - C * cs) / 2;
    const gy = GRID_BOX.y + (GRID_BOX.h - R * cs) / 2;
    const c = (px - gx) / cs;
    const r = (py - gy) / cs;
    if (c < -0.5 || r < -0.5 || c > C + 0.5 || r > R + 0.5) return null;
    return { c, r };
  }

  private cellSize(): number {
    const [C, R] = this.grid;
    return Math.floor(Math.min(GRID_BOX.w / C, GRID_BOX.h / R));
  }

  /** Where the held piece would sit if dropped now (its top-left cell), centred on the cursor. */
  private dropSpot(): { x: number; y: number } | null {
    if (!this.hover || !this.held) return null;
    const at = this.cellAt(this.hover.px, this.hover.py);
    if (!at) return null;
    const b = bounds(rotate(this.held.piece.shape, this.held.piece.rot));
    const [C, R] = this.grid;
    // centred on the pointer, but kept inside the grid: pointing at the edge still lands it
    const x = Math.max(0, Math.min(C - b.w, Math.round(at.c - b.w / 2)));
    const y = Math.max(0, Math.min(R - b.h, Math.round(at.r - b.h / 2)));
    return { x, y };
  }

  private inRelease(): boolean {
    const h = this.hover;
    return !!h && h.px >= RELEASE_BOX.x && h.px <= RELEASE_BOX.x + RELEASE_BOX.w && h.py >= RELEASE_BOX.y && h.py <= RELEASE_BOX.y + RELEASE_BOX.h;
  }

  private click(): void {
    const [C, R] = this.grid;
    if (this.held) {
      const p = this.held.piece;
      if (this.inRelease()) {
        this.held = null;
        this.release(p, `Released the ${FISH[p.species].name.toLowerCase()}`);
        this.state.save();
        this.dirty = true;
        return;
      }
      const spot = this.dropSpot();
      if (spot && fits({ ...p, ...spot }, this.pieces, C, R)) {
        Object.assign(p, spot, { placed: true });
        this.held = null;
        this.fx.push({ kind: 'pop', id: p.id, t: 0 });
        uiClick();
        this.buzz(0.3, 30);
        this.mergeFrom(p);
        this.state.save();
      } else {
        uiDeny();
        this.buzz(0.6, 60);
      }
      this.dirty = true;
      return;
    }
    // pick up the fish under the cursor
    const h = this.hover;
    if (!h) return;
    if (h.px >= 690 && h.px <= 1000 && h.py >= 18 && h.py <= 58) {
      this.close();
      return;
    }
    const at = this.cellAt(h.px, h.py);
    if (!at) return;
    const c = Math.floor(at.c);
    const r = Math.floor(at.r);
    const p = this.pieces.find((f) => f.placed && cellsOf(f).some(([x, y]) => x === c && y === r));
    if (!p) return;
    this.held = { piece: p, fresh: false, from: { x: p.x, y: p.y, rot: p.rot } };
    p.placed = false;
    shot('bail_click', MIX.bail + 4, { rate: 1.1 });
    this.buzz(0.2, 25);
    this.dirty = true;
  }

  /** Merge the piece just placed with any match it touches — and chain. */
  private mergeFrom(start: Piece): void {
    const [C, R] = this.grid;
    let p: Piece | null = start;
    let chain = 0;
    while (p) {
      const partner: Piece | undefined = mergePartners(p, this.pieces)[0];
      if (!partner) break;
      const nextId = Math.max(0, ...this.pieces.map((f) => f.id)) + 1;
      const res = merge(p, partner, this.pieces, C, R, nextId);
      if (!res) break;
      const inv = this.state.inventory as unknown as Piece[];
      for (const id of res.consumed) {
        const i = inv.findIndex((f) => f.id === id);
        if (i >= 0) inv.splice(i, 1);
      }
      const merged = { ...res.piece, cm: Math.round(res.piece.cm), caughtAt: 12, record: false } as Piece & { caughtAt: number; record: boolean };
      inv.push(merged);
      (this.state as unknown as { _nextId: number })._nextId = nextId + 1;
      chain++;
      // the show: flash, the gain rising off it, a chime that climbs with the chain
      this.fx.push({ kind: 'flash', id: merged.id, t: 0 });
      this.fx.push({ kind: 'gain', id: merged.id, t: 0, text: `${TIERS[merged.tier].toUpperCase()}  +$${res.gained}` });
      window.setTimeout(() => mergeChime(merged.tier, chain), (chain - 1) * 180);
      this.buzz(0.7 + 0.1 * chain, 120);
      p = merged;
    }
    if (chain) this.state.save();
  }

  /* ── painting ────────────────────────────────────────────────────────── */

  private paint(): void {
    const c = this.panel.ctx;
    const [C, R] = this.grid;
    const cs = this.cellSize();
    const gx = GRID_BOX.x + (GRID_BOX.w - C * cs) / 2;
    const gy = GRID_BOX.y + (GRID_BOX.h - R * cs) / 2;
    this.panel.clear();
    roundRect(c, 4, 4, PX[0] - 8, PX[1] - 8, 26);
    c.fillStyle = 'rgba(10, 16, 22, 0.92)';
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = INK.rim;
    c.stroke();

    // header
    const pieces = this.pieces.filter((f) => f.placed);
    const { used, total } = fill(pieces, C, R);
    const worth = pieces.reduce((a, f) => a + f.value, 0);
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.font = font(700, 38);
    c.fillStyle = INK.hot;
    c.fillText('BACKPACK', 30, 38);
    c.font = font(600, 24);
    c.fillStyle = INK.dim;
    c.fillText(`${used} / ${total} cells`, 236, 40);
    c.fillStyle = INK.amber;
    c.textAlign = 'right';
    c.fillText(`worth $${worth}`, 660, 40);
    // close button
    roundRect(c, 690, 18, 310, 40, 10);
    c.fillStyle = this.hover && this.hover.px >= 690 && this.hover.py <= 58 && this.hover.py >= 18 ? 'rgba(255,176,0,0.25)' : 'rgba(255,255,255,0.06)';
    c.fill();
    c.fillStyle = INK.hot;
    c.textAlign = 'center';
    c.font = font(600, 22);
    c.fillText('CLOSE  (A)', 845, 39);

    // grid
    for (let r = 0; r < R; r++) {
      for (let q = 0; q < C; q++) {
        roundRect(c, gx + q * cs + 2, gy + r * cs + 2, cs - 4, cs - 4, 6);
        c.fillStyle = 'rgba(255,255,255,0.05)';
        c.fill();
      }
    }

    // the drop preview (green fits, red doesn't) and who it would merge with
    const drop = this.dropSpot();
    let partners: Piece[] = [];
    if (this.held && drop) {
      const p = { ...this.held.piece, ...drop };
      const ok = fits(p, this.pieces, C, R);
      for (const [q, r] of cellsOf(p)) {
        if (q < 0 || r < 0 || q >= C || r >= R) continue;
        roundRect(c, gx + q * cs + 2, gy + r * cs + 2, cs - 4, cs - 4, 6);
        c.fillStyle = ok ? 'rgba(63, 214, 106, 0.28)' : 'rgba(232, 53, 42, 0.32)';
        c.fill();
      }
      if (ok) partners = mergePartners({ ...p, placed: true }, this.pieces);
    }

    // the fish
    const t = performance.now() / 1000;
    for (const p of pieces) {
      const pop = this.fx.find((f) => f.id === p.id && f.kind === 'pop');
      const flash = this.fx.find((f) => f.id === p.id && f.kind === 'flash');
      const scale = pop ? 1 + 0.12 * Math.sin((pop.t / 0.35) * Math.PI) : 1;
      this.drawPiece(c, p, gx, gy, cs, scale, partners.includes(p) ? 0.5 + 0.5 * Math.sin(t * 10) : 0, flash ? 1 - flash.t / 0.35 : 0);
    }

    // the held fish under the cursor
    if (this.held && this.hover) {
      const p = this.held.piece;
      const b = bounds(rotate(p.shape, p.rot));
      c.globalAlpha = 0.9;
      this.drawPiece(c, { ...p, x: 0, y: 0 }, this.hover.px - (b.w * cs) / 2, this.hover.py - (b.h * cs) / 2, cs, 1.06, 0, 0);
      c.globalAlpha = 1;
    }

    // gains rising off merged fish
    for (const f of this.fx) {
      if (f.kind !== 'gain') continue;
      const p = pieces.find((x) => x.id === f.id);
      if (!p) continue;
      const cells = cellsOf(p);
      const cx = gx + (Math.min(...cells.map((k) => k[0])) + Math.max(...cells.map((k) => k[0])) + 1) * cs * 0.5;
      const cy = gy + Math.min(...cells.map((k) => k[1])) * cs - f.t * 60;
      c.globalAlpha = Math.max(0, 1 - f.t / 1.4);
      c.font = font(700, 34);
      c.textAlign = 'center';
      c.fillStyle = TIER_COLOUR[p.tier];
      c.fillText(f.text ?? '', cx, cy);
      c.globalAlpha = 1;
    }

    this.paintInfo(c, partners);
    this.panel.commit();
  }

  /** A fish painted across its cells: tier frame, then the fish itself, turned with the piece. */
  private drawPiece(c: CanvasRenderingContext2D, p: Piece, gx: number, gy: number, cs: number, scale: number, glow: number, flash: number): void {
    const cells = cellsOf(p);
    const tc = p.tier === 3 ? `hsl(${(performance.now() / 8) % 360}, 90%, 65%)` : TIER_COLOUR[p.tier];
    for (const [q, r] of cells) {
      roundRect(c, gx + q * cs + 3, gy + r * cs + 3, cs - 6, cs - 6, 8);
      c.fillStyle = `rgba(${p.tier === 2 ? '255,176,0' : p.tier === 1 ? '220,232,240' : p.tier === 3 ? '255,95,210' : '154,164,172'}, ${0.14 + glow * 0.25 + flash * 0.5})`;
      c.fill();
      c.lineWidth = 2 + glow * 3;
      c.strokeStyle = tc;
      c.stroke();
    }
    // the fish, drawn along its length (rot 0: tail at the left, head at the right)
    const b = bounds(rotate(p.shape, 0));
    const len = b.w * cs * 0.94 * scale;
    const hgt = Math.max(cs * 0.5, b.h * cs * 0.78) * scale;
    const minC = Math.min(...cells.map((k) => k[0]));
    const minR = Math.min(...cells.map((k) => k[1]));
    const rb = bounds(rotate(p.shape, p.rot));
    const cx = gx + (minC + rb.w / 2) * cs;
    const cy = gy + (minR + rb.h / 2) * cs;
    const model = FISH[p.species]?.model ?? p.species;
    const k = SK[model] ?? { back: 0x445566, flank: 0x99aabb, belly: 0xdddddd, fin: 0x778899, edge: 0x556677 };
    c.save();
    c.translate(cx, cy);
    c.rotate((p.rot * Math.PI) / 2);
    const tail = len * 0.18;
    const x0 = -len / 2 + tail;
    const x1 = len / 2;
    // tail fin
    c.fillStyle = hex(k.fin);
    c.beginPath();
    c.moveTo(x0 + tail * 0.2, 0);
    c.lineTo(-len / 2, -hgt * 0.42);
    c.lineTo(-len / 2 + tail * 0.35, 0);
    c.lineTo(-len / 2, hgt * 0.42);
    c.closePath();
    c.fill();
    // body: counter-shaded like the 3-D fish
    const g = c.createLinearGradient(0, -hgt / 2, 0, hgt / 2);
    g.addColorStop(0, hex(k.back));
    g.addColorStop(0.5, hex(k.flank));
    g.addColorStop(1, hex(k.belly));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x0, 0);
    c.bezierCurveTo(x0 + (x1 - x0) * 0.25, -hgt * 0.55, x1 - (x1 - x0) * 0.2, -hgt * 0.5, x1, 0);
    c.bezierCurveTo(x1 - (x1 - x0) * 0.2, hgt * 0.5, x0 + (x1 - x0) * 0.25, hgt * 0.55, x0, 0);
    c.fill();
    // dorsal fin and eye
    c.fillStyle = hex(k.fin);
    c.beginPath();
    c.moveTo(x0 + (x1 - x0) * 0.35, -hgt * 0.38);
    c.lineTo(x0 + (x1 - x0) * 0.5, -hgt * 0.62);
    c.lineTo(x0 + (x1 - x0) * 0.7, -hgt * 0.36);
    c.fill();
    c.fillStyle = '#0a0a0c';
    c.beginPath();
    c.arc(x1 - (x1 - x0) * 0.13, -hgt * 0.08, Math.max(2.5, hgt * 0.07), 0, Math.PI * 2);
    c.fill();
    c.fillStyle = hex(SP[model]?.iris ?? 0xd8d8c0);
    c.beginPath();
    c.arc(x1 - (x1 - x0) * 0.13 + 1, -hgt * 0.08 - 1, Math.max(1, hgt * 0.025), 0, Math.PI * 2);
    c.fill();
    c.restore();
    // tier pips in the corner
    if (p.tier > 0) {
      c.fillStyle = tc;
      c.font = font(700, 18);
      c.textAlign = 'left';
      c.fillText('★'.repeat(p.tier), gx + minC * cs + 8, gy + minR * cs + 16);
    }
  }

  private paintInfo(c: CanvasRenderingContext2D, partners: Piece[]): void {
    const x = 700;
    let y = 100;
    // what you're holding, or what you're pointing at
    let p: Piece | null = this.held?.piece ?? null;
    if (!p && this.hover) {
      const at = this.cellAt(this.hover.px, this.hover.py);
      if (at) {
        const q = Math.floor(at.c);
        const r = Math.floor(at.r);
        p = this.pieces.find((f) => f.placed && cellsOf(f).some(([a, b]) => a === q && b === r)) ?? null;
      }
    }
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    if (p) {
      const f = FISH[p.species];
      c.font = font(700, 20);
      c.fillStyle = p.tier === 3 ? `hsl(${(performance.now() / 8) % 360}, 90%, 65%)` : TIER_COLOUR[p.tier];
      c.fillText(TIERS[p.tier].toUpperCase(), x, y);
      y += 38;
      c.font = font(700, 34);
      c.fillStyle = INK.hot;
      c.fillText(f.name, x, y, 300);
      y += 34;
      c.font = font(500, 22);
      c.fillStyle = INK.dim;
      c.fillText(`${Math.round(p.cm)} cm · ${p.kg.toFixed(2)} kg`, x, y);
      y += 40;
      c.font = font(700, 40);
      c.fillStyle = INK.amber;
      c.fillText(`$${p.value}`, x, y);
      y += 40;
      if (p.tier < TIERS.length - 1) {
        c.font = font(500, 20);
        c.fillStyle = INK.dim;
        c.fillText(`Touch another ${TIERS[p.tier].toLowerCase()} one`, x, y);
        y += 24;
        c.fillText(`to merge: ×${MERGE_BONUS[p.tier + 1]} → ${TIERS[p.tier + 1]}`, x, y);
        y += 30;
      }
      if (partners.length) {
        c.font = font(700, 24);
        c.fillStyle = INK.good;
        c.fillText('WILL MERGE!', x, y);
        y += 30;
      }
      if (this.held) {
        c.font = font(500, 20);
        c.fillStyle = INK.dim;
        c.fillText('Flick the stick / grip to turn', x, y + 10);
      }
    } else {
      c.font = font(500, 22);
      c.fillStyle = INK.dim;
      const lines = ['Point and pull the trigger', 'to pick up a fish.', '', 'Two of the same kind,', 'same tier, touching:', 'they merge — worth more,', 'and they take less room.'];
      lines.forEach((l, i) => c.fillText(l, x, y + i * 28));
    }
    // release zone
    const over = this.inRelease() && !!this.held;
    roundRect(c, RELEASE_BOX.x, RELEASE_BOX.y, RELEASE_BOX.w, RELEASE_BOX.h, 14);
    c.fillStyle = over ? 'rgba(63, 214, 198, 0.35)' : 'rgba(63, 214, 198, 0.1)';
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = INK.sea;
    c.setLineDash([10, 8]);
    c.stroke();
    c.setLineDash([]);
    c.font = font(700, 26);
    c.fillStyle = INK.sea;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('RELEASE', RELEASE_BOX.x + RELEASE_BOX.w / 2, RELEASE_BOX.y + 34);
    c.font = font(500, 18);
    c.fillText('drop a fish here to let it go', RELEASE_BOX.x + RELEASE_BOX.w / 2, RELEASE_BOX.y + 64);
    if (this.toast) {
      c.globalAlpha = Math.min(1, (2.2 - this.toast.t) / 0.4);
      c.font = font(700, 26);
      c.fillStyle = INK.hot;
      c.fillText(this.toast.text, RELEASE_BOX.x + RELEASE_BOX.w / 2, RELEASE_BOX.y - 30, 300);
      c.globalAlpha = 1;
    }
  }
}
