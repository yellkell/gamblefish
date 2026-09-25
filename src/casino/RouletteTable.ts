/**
 * The roulette table in The Lucky Lure (and a high-stakes one in the Captain's Table).
 *
 *  BET    Pick a chip on the board behind the table, point at the felt and click: a real chip
 *         lands on the spot with a clack (the stake leaves your wallet quietly). Stack them up.
 *  SPIN   The wheel's rotor turns one way, the ball is sent round the other on the outer track;
 *         it rumbles, slows, drops off the track, ticks over the frets and settles in a pocket.
 *         The result is decided fairly first (crypto RNG) and the ball's launch angle is solved
 *         so its decaying orbit meets that pocket on the turning rotor: what you see is what won.
 *  RESULT The number goes up over the wheel in its colour, the dolly marks it on the felt, losing
 *         chips are swept away, winning stacks are paid and slide over to you — the cash chime
 *         (pitched up), the wrist counters rolling, a fanfare sized to the win.
 *
 * Rules (payouts, what beats what) are casino/roulette.ts.
 */

import {
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  RingGeometry,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Camera,
} from 'three';
import { ballTick, chipClack, RollBed, uiDeny, winFanfare } from '../audio/sfx.ts';
import type { GameState } from '../fishing/tidewater.ts';
import { font } from '../ui/fonts.ts';
import { INK, roundRect } from '../ui/panel.ts';
import { InteractivePanel, register } from '../ui/pointer.ts';
import type { Interior } from '../village/interiors.ts';
import { payOut, refund, stake } from './money.ts';
import { colourOf, settle, spin, WHEEL, type Spot } from './roulette.ts';

const TAU = Math.PI * 2;
const N = WHEEL.length; // 37

/* ── the felt layout (canvas px; the felt is 2.0 × 0.8 m) ─────────────── */

const LAY = { w: 1600, h: 640 };
const GRID = { x: 130, y: 20, cw: 1300 / 12, rh: 120 };
interface Cell {
  spot: Spot;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  fill: string;
}

function layoutCells(): Cell[] {
  const cells: Cell[] = [];
  cells.push({ spot: 'n0', x: 20, y: GRID.y, w: GRID.x - 20, h: GRID.rh * 3, label: '0', fill: '#1f7a3a' });
  for (let col = 0; col < 12; col++) {
    for (let row = 0; row < 3; row++) {
      const n = col * 3 + (3 - row);
      cells.push({ spot: `n${n}`, x: GRID.x + col * GRID.cw, y: GRID.y + row * GRID.rh, w: GRID.cw, h: GRID.rh, label: String(n), fill: colourOf(n) === 'red' ? '#b3242c' : '#16161a' });
    }
  }
  for (let row = 0; row < 3; row++) cells.push({ spot: `col${3 - row}`, x: GRID.x + 1300, y: GRID.y + row * GRID.rh, w: 150, h: GRID.rh, label: '2 : 1', fill: '' });
  for (let k = 0; k < 3; k++) cells.push({ spot: `dozen${k + 1}`, x: GRID.x + (k * 1300) / 3, y: 390, w: 1300 / 3, h: 95, label: ['1st 12', '2nd 12', '3rd 12'][k], fill: '' });
  const outs: [Spot, string, string][] = [
    ['low', '1 – 18', ''],
    ['even', 'EVEN', ''],
    ['red', '◆', '#b3242c'],
    ['black', '◆', '#16161a'],
    ['odd', 'ODD', ''],
    ['high', '19 – 36', ''],
  ];
  outs.forEach(([spot, label, fill], k) => cells.push({ spot, x: GRID.x + (k * 1300) / 6, y: 495, w: 1300 / 6, h: 110, label, fill }));
  return cells;
}

/** The table's slab in its own frame: x from x0 to x1, z within ±hz (the room's collider matches). */
export const TABLE = { x0: -1.66, x1: 1.72, hz: 0.52 };

/** A rectangle in the x–z plane with rounded corners, as a Shape (y is −z after the extrude's turn). */
function rounded(x0: number, x1: number, hz: number, r: number): Shape {
  const s = new Shape();
  s.moveTo(x0 + r, -hz);
  s.lineTo(x1 - r, -hz);
  s.quadraticCurveTo(x1, -hz, x1, -hz + r);
  s.lineTo(x1, hz - r);
  s.quadraticCurveTo(x1, hz, x1 - r, hz);
  s.lineTo(x0 + r, hz);
  s.quadraticCurveTo(x0, hz, x0, hz - r);
  s.lineTo(x0, -hz + r);
  s.quadraticCurveTo(x0, -hz, x0 + r, -hz);
  return s;
}

const CHIP_COLOUR: Record<number, number> = { 1: 0xf2efe6, 5: 0xc23b2e, 25: 0x2f8a4a, 100: 0x1a1a1e, 500: 0x7a3aa8 };

export interface RouletteOptions {
  chips: number[];
  maxBet: number;
  /** where the table stands in the room (its frame: x across, +z toward the door) */
  at: [number, number];
}

export class RouletteTable {
  readonly group = new Group();
  private readonly felt: InteractivePanel;
  private readonly board: InteractivePanel;
  private readonly cells = layoutCells();
  private readonly chips: InstancedMesh;
  private readonly rotor = new Group();
  private readonly ball: Mesh;
  private readonly dolly: Mesh;
  private readonly bowlY: number;
  private readonly roll = new RollBed();

  private chip: number;
  private bets = new Map<Spot, number[]>(); // each chip placed, by spot
  private lastBets = new Map<Spot, number[]>();
  private phase: 'betting' | 'spinning' | 'result' = 'betting';
  private t = 0;
  private history: number[] = [];
  private status = 'Place your bets';
  private resultIndex = 0;
  private result = -1;
  private winners: Spot[] = [];
  private spinPlan = { a0: 0, wr: 0, b0: 0, wb: 0, land: 5.2, end: 7.6 };
  private lastTick = 0;
  private number: Sprite | null = null;
  private sweep = 0; // result animation clock
  private owed = 0; // a win announced but not yet counted into the wallet

  constructor(
    private readonly room: Interior,
    private readonly state: GameState,
    private readonly opts: RouletteOptions,
  ) {
    this.chip = opts.chips[0];
    const g = this.group;
    g.position.set(opts.at[0], 0, opts.at[1]);
    room.contents.add(g);

    // the table: a wooden base, a padded rail, green felt
    const wood = new MeshLambertMaterial({ color: 0x5a3a22 });
    const base = new Mesh(new CylinderGeometry(0.1, 0.16, 0.86, 10), wood);
    base.position.set(0, 0.43, 0);
    // a long rounded slab (TABLE in the room's furniture list matches it), a padded rail round it
    const slab = (inset: number): Shape => rounded(TABLE.x0 + inset, TABLE.x1 - inset, TABLE.hz - inset, 0.42 - inset);
    const top = new Mesh(new ExtrudeGeometry(slab(0), { depth: 0.06, bevelEnabled: false }).rotateX(Math.PI / 2), wood);
    top.position.y = 0.9;
    const ring = slab(0);
    ring.holes.push(slab(0.08));
    const rail = new Mesh(
      new ExtrudeGeometry(ring, { depth: 0.03, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 3 }).rotateX(Math.PI / 2),
      new MeshPhongMaterial({ color: 0x3a1e12, shininess: 40 }),
    );
    rail.position.y = 0.94;
    const base2 = base.clone();
    base.position.x = -0.9;
    base2.position.x = 1.0;
    g.add(base, base2, top, rail);

    // the felt: a point-and-click panel lying on the table
    this.felt = new InteractivePanel([LAY.w, LAY.h], [2.0, 0.8]);
    this.felt.mesh.rotation.x = -Math.PI / 2;
    this.felt.mesh.position.set(0.52, 0.903, 0);
    (this.felt.mesh.material as MeshBasicMaterial).transparent = false;
    g.add(this.felt.mesh);
    this.felt.buttons = this.cells.map((c) => ({ id: c.spot, x: c.x, y: c.y, w: c.w, h: c.h }));
    this.felt.paint = () => this.paintFelt();
    this.felt.onClick = (id) => this.place(id);
    register(this.felt);

    // the board behind the table: chips, spin, clear, rebet, the last numbers
    this.board = new InteractivePanel([1000, 420], [1.2, 0.504]);
    this.board.mesh.position.set(0.35, 1.55, -0.95);
    g.add(this.board.mesh);
    this.board.paint = () => this.paintBoard();
    this.board.onClick = (id) => this.button(id);
    register(this.board);

    // the wheel at the table's end
    this.bowlY = 0.9;
    const bowl = new Group();
    bowl.position.set(-1.18, this.bowlY, 0);
    const outer = new Mesh(new CylinderGeometry(0.36, 0.33, 0.1, 48, 1, true), new MeshPhongMaterial({ color: 0x6a3a1e, shininess: 60, side: DoubleSide }));
    outer.position.y = 0.02;
    const track = new Mesh(new RingGeometry(0.26, 0.345, 64).rotateX(-Math.PI / 2), new MeshPhongMaterial({ color: 0x8a5a32, shininess: 80 }));
    track.position.y = 0.035;
    bowl.add(outer, track);
    const pockets = new Mesh(new RingGeometry(0.11, 0.26, 74).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: pocketTexture() }));
    pockets.position.y = 0.012;
    const cone = new Mesh(new ConeGeometry(0.11, 0.07, 32), new MeshPhongMaterial({ color: 0x8a5a32, shininess: 80 }));
    cone.position.y = 0.045;
    const turret = new Mesh(new CylinderGeometry(0.012, 0.018, 0.08, 10), new MeshPhongMaterial({ color: 0xd8c070, shininess: 120 }));
    turret.position.y = 0.1;
    for (let k = 0; k < 4; k++) {
      const arm = new Mesh(new CylinderGeometry(0.006, 0.006, 0.12, 6), turret.material);
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = (k * Math.PI) / 2;
      arm.position.y = 0.12;
      this.rotor.add(arm);
    }
    this.rotor.add(pockets, cone, turret);
    bowl.add(this.rotor);
    this.ball = new Mesh(new SphereGeometry(0.011, 12, 10), new MeshPhongMaterial({ color: 0xffffff, shininess: 120 }));
    this.ball.position.set(0.3, 0.05, 0);
    bowl.add(this.ball);
    g.add(bowl);

    // chips on the felt, and the dolly that marks the winner
    this.chips = new InstancedMesh(new CylinderGeometry(0.024, 0.024, 0.006, 20), new MeshLambertMaterial({ color: 0xffffff }), 400);
    this.chips.count = 0;
    this.chips.frustumCulled = false;
    g.add(this.chips);
    this.dolly = new Mesh(new CylinderGeometry(0.012, 0.02, 0.06, 12), new MeshPhongMaterial({ color: 0xf2f6ff, transparent: true, opacity: 0.85, shininess: 120 }));
    this.dolly.visible = false;
    g.add(this.dolly);

    this.paintFelt();
    this.paintBoard();
    state.onChange(() => this.paintBoard());
    // leaving mid-round never costs you: chips down come back, a spin already decided is paid
    window.addEventListener('pagehide', () => this.walkAway());
  }

  private walkAway(): void {
    if (this.phase === 'betting') refund(this.state, this.total);
    else if (this.phase === 'spinning') {
      const flat = new Map<Spot, number>();
      for (const [s, l] of this.bets) flat.set(s, l.reduce((a, b) => a + b, 0));
      refund(this.state, settle(flat, this.result).returned);
    }
    if (this.owed) refund(this.state, this.owed);
    this.owed = 0;
    this.bets.clear();
  }

  private get total(): number {
    let t = 0;
    for (const list of this.bets.values()) for (const c of list) t += c;
    return t;
  }

  /* ── betting ─────────────────────────────────────────────────────── */

  private place(spot: Spot): void {
    if (this.phase !== 'betting') return;
    if (this.total + this.chip > this.opts.maxBet) {
      this.status = `Table limit $${this.opts.maxBet}`;
      uiDeny();
      this.paintBoard();
      return;
    }
    if (!stake(this.state, this.chip)) {
      this.status = "You can't cover that chip";
      uiDeny();
      this.paintBoard();
      return;
    }
    const list = this.bets.get(spot) ?? [];
    list.push(this.chip);
    this.bets.set(spot, list);
    chipClack();
    this.status = 'Place your bets';
    this.layChips();
    this.paintBoard();
    this.paintFelt();
  }

  private button(id: string): void {
    if (id.startsWith('chip')) {
      this.chip = Number(id.slice(4));
      chipClack();
      this.paintBoard();
      return;
    }
    if (this.phase !== 'betting') return;
    if (id === 'clear') {
      refund(this.state, this.total);
      this.bets.clear();
      this.layChips();
    } else if (id === 'rebet') {
      let need = 0;
      for (const l of this.lastBets.values()) for (const c of l) need += c;
      if (need && need + this.total <= this.opts.maxBet && stake(this.state, need)) {
        for (const [s, l] of this.lastBets) this.bets.set(s, [...(this.bets.get(s) ?? []), ...l]);
        chipClack();
        this.layChips();
      } else uiDeny();
    } else if (id === 'spin') {
      if (!this.total) {
        this.status = 'Put a chip down first';
        uiDeny();
      } else this.spin();
    }
    this.paintBoard();
    this.paintFelt();
  }

  /** Stack each spot's chips on its centre, a little ragged like a real stack. */
  private layChips(): void {
    const m = new Matrix4();
    const c = new Color();
    let n = 0;
    for (const [spot, list] of this.bets) {
      const p = this.spotLocal(spot);
      list.forEach((v, k) => {
        if (n >= 400) return;
        m.makeTranslation(p.x + Math.sin(k * 2.3) * 0.002, 0.907 + k * 0.0062, p.z + Math.cos(k * 1.7) * 0.002);
        this.chips.setMatrixAt(n, m);
        this.chips.setColorAt(n, c.setHex(CHIP_COLOUR[v] ?? 0xffffff));
        n++;
      });
    }
    this.chips.count = n;
    this.chips.instanceMatrix.needsUpdate = true;
    if (this.chips.instanceColor) this.chips.instanceColor.needsUpdate = true;
  }

  /** A spot's centre on the felt, in the table group's frame. */
  private spotLocal(spot: Spot): Vector3 {
    const cell = this.cells.find((c) => c.spot === spot)!;
    const u = (cell.x + cell.w / 2) / LAY.w - 0.5;
    const v = (cell.y + cell.h / 2) / LAY.h - 0.5;
    const f = this.felt.mesh.position;
    return new Vector3(f.x + u * 2.0, f.y, f.z + v * 0.8);
  }

  /* ── the spin ────────────────────────────────────────────────────── */

  private spin(): void {
    this.phase = 'spinning';
    this.t = 0;
    this.status = 'No more bets';
    this.lastBets = new Map([...this.bets].map(([s, l]) => [s, [...l]]));
    this.resultIndex = spin();
    this.result = WHEEL[this.resultIndex];
    // the rotor: decaying from ~3.4 rad/s (one way); the ball: from ~13 rad/s the other way
    const p = this.spinPlan;
    p.a0 = this.rotor.rotation.y;
    p.wr = 3.2 + Math.random() * 0.6;
    p.wb = 12 + Math.random() * 2;
    p.land = 5.0 + Math.random() * 0.6;
    p.end = p.land + 2.4;
    // solve the ball's start angle so that at `land` it sits in the drawn pocket
    const target = pocketAngle(this.resultIndex) + this.rotorAngle(p.land);
    p.b0 = target + p.wb * 2.2 * (1 - Math.exp(-p.land / 2.2));
    this.lastTick = 0;
    chipClack();
  }

  private rotorAngle(t: number): number {
    const p = this.spinPlan;
    return p.a0 + p.wr * 5 * (1 - Math.exp(-t / 5));
  }

  private ballAngle(t: number): number {
    const p = this.spinPlan;
    return p.b0 - p.wb * 2.2 * (1 - Math.exp(-t / 2.2));
  }

  private finish(): void {
    const flat = new Map<Spot, number>();
    for (const [s, l] of this.bets) flat.set(s, l.reduce((a, b) => a + b, 0));
    const r = settle(flat, this.result);
    this.winners = r.winners;
    this.history.unshift(this.result);
    this.history = this.history.slice(0, 12);
    const col = colourOf(this.result);
    this.status = r.returned ? `${this.result} ${col.toUpperCase()} — you win $${r.won}` : `${this.result} ${col.toUpperCase()}`;
    this.showNumber(this.result, col);
    // the dolly on the winning number
    const p = this.spotLocal(`n${this.result}`);
    this.dolly.position.set(p.x, 0.94, p.z);
    this.dolly.visible = true;
    if (r.returned) {
      this.owed = r.returned;
      window.setTimeout(() => {
        if (!this.owed) return;
        this.owed = 0;
        payOut(this.state, r.returned);
        winFanfare(r.won / Math.max(1, this.total));
      }, 700);
    }
    this.phase = 'result';
    this.sweep = 0;
    this.t = 0;
    this.paintFelt();
    this.paintBoard();
  }

  private showNumber(n: number, col: string): void {
    if (this.number) this.number.parent?.remove(this.number);
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = col === 'red' ? '#b3242c' : col === 'green' ? '#1f7a3a' : '#16161a';
    g.beginPath();
    g.arc(128, 128, 118, 0, TAU);
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = '#ffd24a';
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = font(700, 140);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), 128, 138);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    this.number = new Sprite(new SpriteMaterial({ map: t, transparent: true, toneMapped: false }));
    this.number.scale.set(0.001, 0.001, 1);
    this.number.position.set(-1.18, 1.45, 0);
    this.group.add(this.number);
  }

  /* ── frame ───────────────────────────────────────────────────────── */

  update(dt: number, camera: Camera): void {
    const inside = this.room.inside(camera.matrixWorld.elements[12], camera.matrixWorld.elements[14]);
    if (this.phase === 'betting') {
      // the wheel idles round slowly between spins
      this.rotor.rotation.y += dt * 0.25;
      this.roll.set(0, 0);
      return;
    }
    this.t += dt;
    const p = this.spinPlan;
    if (this.phase === 'spinning') {
      this.rotor.rotation.y = this.rotorAngle(this.t);
      let beta: number;
      let r: number;
      let y = 0.05;
      const dropStart = p.land - 1.0;
      if (this.t < p.land) {
        beta = this.ballAngle(this.t);
        const k = Math.max(0, (this.t - dropStart) / 1.0);
        r = 0.3 - (0.3 - 0.19) * k * k;
        y = 0.05 - 0.035 * k + Math.abs(Math.sin(k * 14)) * 0.012 * k * (1 - k);
        const speed = p.wb * Math.exp(-this.t / 2.2);
        this.roll.set(inside ? Math.min(1, speed / 8) * (1 - k) : 0, speed / 12);
        // ticking over the frets as it drops
        if (k > 0 && this.t - this.lastTick > 0.12 + k * 0.15) {
          this.lastTick = this.t;
          if (inside) ballTick(1 - k * 0.5);
        }
      } else {
        // in the pocket, riding the rotor; a last couple of settling hops
        beta = pocketAngle(this.resultIndex) + this.rotor.rotation.y;
        r = 0.19;
        const s = this.t - p.land;
        y = 0.015 + Math.abs(Math.sin(s * 18)) * 0.01 * Math.exp(-s * 5);
        this.roll.set(0, 0);
        if (s < 0.5 && this.t - this.lastTick > 0.16 && inside) {
          this.lastTick = this.t;
          ballTick(0.4);
        }
        if (this.t >= p.end) this.finish();
      }
      this.ball.position.set(Math.cos(beta) * r, y, -Math.sin(beta) * r);
      return;
    }
    // result: the number pops in, losers swept, then back to betting
    this.rotor.rotation.y += dt * 0.25;
    this.ball.position.set(Math.cos(pocketAngle(this.resultIndex) + this.rotor.rotation.y) * 0.19, 0.015, -Math.sin(pocketAngle(this.resultIndex) + this.rotor.rotation.y) * 0.19);
    this.sweep += dt;
    if (this.number) {
      const s = Math.min(1, this.sweep / 0.25);
      this.number.scale.set(0.28 * s, 0.28 * s, 1);
    }
    if (this.sweep > 1.2 && this.bets.size) {
      // the croupier's rake: losing chips go, winners stay while they're paid
      for (const s of [...this.bets.keys()]) if (!this.winners.includes(s)) this.bets.delete(s);
      this.layChips();
    }
    if (this.sweep > 4.0) {
      this.bets.clear();
      this.layChips();
      this.dolly.visible = false;
      if (this.number) this.number.parent?.remove(this.number);
      this.number = null;
      this.phase = 'betting';
      this.status = 'Place your bets';
      this.winners = [];
      this.paintFelt();
      this.paintBoard();
    }
  }

  /* ── painting ────────────────────────────────────────────────────── */

  private paintFelt(): void {
    const c = this.felt.ctx;
    const g = c;
    g.fillStyle = '#1d5a34';
    g.fillRect(0, 0, LAY.w, LAY.h);
    for (const cell of this.cells) {
      const hot = this.felt.hover === cell.spot && this.phase === 'betting';
      const win = this.phase === 'result' && this.winners.includes(cell.spot);
      if (cell.fill) {
        g.fillStyle = cell.fill;
        g.fillRect(cell.x + 3, cell.y + 3, cell.w - 6, cell.h - 6);
      }
      if (hot || win) {
        g.fillStyle = win ? 'rgba(255, 210, 74, 0.55)' : 'rgba(255, 255, 255, 0.22)';
        g.fillRect(cell.x + 3, cell.y + 3, cell.w - 6, cell.h - 6);
      }
      g.strokeStyle = '#e8e2c8';
      g.lineWidth = 3;
      g.strokeRect(cell.x, cell.y, cell.w, cell.h);
      g.fillStyle = '#f6f0dc';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const size = cell.spot.startsWith('n') ? 46 : cell.label === '◆' ? 70 : 38;
      g.font = font(700, size);
      g.save();
      g.translate(cell.x + cell.w / 2, cell.y + cell.h / 2);
      if (cell.spot.startsWith('n') && cell.spot !== 'n0') g.rotate(-Math.PI / 2);
      if (cell.label === '◆') g.fillStyle = cell.fill === '#b3242c' ? '#ff5a5a' : '#0a0a0c';
      g.fillText(cell.label, 0, 2);
      g.restore();
    }
    this.felt.commit();
  }

  private paintBoard(): void {
    const c = this.board.ctx;
    this.board.clear();
    roundRect(c, 4, 4, 992, 412, 22);
    c.fillStyle = 'rgba(22, 10, 14, 0.94)';
    c.fill();
    c.lineWidth = 4;
    c.strokeStyle = '#ff3fb4';
    c.stroke();
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    c.font = font(700, 40);
    c.fillStyle = '#ff7fcf';
    c.fillText('ROULETTE', 28, 56);
    c.font = font(600, 26);
    c.fillStyle = INK.hot;
    c.fillText(this.status, 230, 54, 560);
    c.textAlign = 'right';
    c.fillStyle = INK.amber;
    c.fillText(`bet $${this.total}  ·  $${this.state.money}`, 972, 54);
    // the last numbers
    c.textAlign = 'center';
    this.history.forEach((n, i) => {
      const x = 56 + i * 62;
      const col = colourOf(n);
      c.fillStyle = col === 'red' ? '#b3242c' : col === 'green' ? '#1f7a3a' : '#2a2a30';
      c.beginPath();
      c.arc(x, 104, 24, 0, TAU);
      c.fill();
      c.fillStyle = '#fff';
      c.font = font(700, 24);
      c.fillText(String(n), x, 113);
    });
    // chips
    const buttons: { id: string; x: number; y: number; w: number; h: number; enabled?: boolean }[] = [];
    this.opts.chips.forEach((v, i) => {
      const x = 60 + i * 120;
      const y = 200;
      buttons.push({ id: `chip${v}`, x: x - 48, y: y - 48, w: 96, h: 96 });
      const sel = v === this.chip;
      c.fillStyle = `#${(CHIP_COLOUR[v] ?? 0xffffff).toString(16).padStart(6, '0')}`;
      c.beginPath();
      c.arc(x, y, sel ? 46 : 40, 0, TAU);
      c.fill();
      c.lineWidth = sel ? 8 : 4;
      c.strokeStyle = sel ? INK.amber : this.board.hover === `chip${v}` ? '#ffffff' : 'rgba(255,255,255,0.5)';
      c.setLineDash([10, 8]);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = v === 1 ? '#222' : '#fff';
      c.font = font(700, 30);
      c.fillText(`$${v}`, x, y + 10);
    });
    // actions
    const act = (id: string, label: string, x: number, w: number, colour: string, on: boolean): void => {
      buttons.push({ id, x, y: 300, w, h: 90, enabled: on });
      roundRect(c, x, 300, w, 90, 16);
      c.fillStyle = !on ? 'rgba(255,255,255,0.06)' : this.board.hover === id ? '#ffffff' : colour;
      c.fill();
      c.fillStyle = on ? '#1a0a10' : INK.dim;
      c.font = font(700, 36);
      c.fillText(label, x + w / 2, 358);
    };
    const betting = this.phase === 'betting';
    act('spin', 'SPIN', 28, 380, '#ff3fb4', betting && this.total > 0);
    act('clear', 'CLEAR', 430, 260, '#9aa4ac', betting && this.total > 0);
    let last = 0;
    for (const l of this.lastBets.values()) for (const v of l) last += v;
    act('rebet', last ? `REBET $${last}` : 'REBET', 712, 260, INK.amber, betting && last > 0);
    this.board.buttons = buttons;
    this.board.commit();
  }
}

/** Angle (rotor frame) of pocket i's centre — the same angle the pocket texture paints it at. */
function pocketAngle(i: number): number {
  // clockwise seen from above, as on a real wheel: 0, 32, 15, 19, 4 …
  return -((i + 0.5) / N) * TAU;
}

/** The pocket ring: 37 wedges (green zero, then red and black round the wheel), numbered. */
function pocketTexture(): CanvasTexture {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const R = S / 2;
  g.translate(R, R);
  for (let i = 0; i < N; i++) {
    const a0 = -(i / N) * TAU;
    const a1 = -((i + 1) / N) * TAU;
    const n = WHEEL[i];
    g.fillStyle = n === 0 ? '#1f7a3a' : colourOf(n) === 'red' ? '#b3242c' : '#16161a';
    g.beginPath();
    g.moveTo(0, 0);
    // canvas y runs down: angle φ (counter-clockwise, y up) → (cos φ, −sin φ)
    g.arc(0, 0, R, -a0, -a1, false);
    g.closePath();
    g.fill();
    // frets
    g.strokeStyle = '#d8c070';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(Math.cos(a0) * R * 0.42, -Math.sin(a0) * R * 0.42);
    g.lineTo(Math.cos(a0) * R, -Math.sin(a0) * R);
    g.stroke();
    // number near the rim, upright toward the centre
    const am = (a0 + a1) / 2;
    g.save();
    g.rotate(-am + Math.PI / 2);
    g.fillStyle = '#ffffff';
    g.font = font(700, 40);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), 0, -R * 0.88);
    g.restore();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
