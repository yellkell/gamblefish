/**
 * A slot machine in Reel 'Em In: a cabinet with three real reels behind glass, a lever on the
 * side, a coin tray, and the paytable up top.
 *
 *  BET    Point at the bet buttons under the glass (the stake leaves your wallet quietly).
 *  PULL   Grab the lever's red knob (grip) and haul it down: it ratchets under your hand, and
 *         past the catch the reels go. (Or point at SPIN.) The lever springs back when you let go.
 *  STOP   The reels stop left to right, each one thunking onto its detent. The stops are drawn
 *         fairly first (casino/slots.ts), and the reels are sent round to land on exactly them.
 *         When the first two show a marlin or a chest, the last reel keeps you waiting a little.
 *  WIN    Bulbs chase round the glass, coins pour out into the tray, the cash chime and the
 *         wrist counters roll; bells for the big ones.
 */

import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type Camera,
} from 'three';
import { InputComponent, type World } from '@iwsdk/core';
import { coinDrops, leverClick, reelStop, RollBed, slotBells, uiDeny, winFanfare } from '../audio/sfx.ts';
import type { GameState } from '../fishing/tidewater.ts';
import { pulseHand } from '../input/haptics.ts';
import { font } from '../ui/fonts.ts';
import { INK, roundRect } from '../ui/panel.ts';
import { InteractivePanel, register } from '../ui/pointer.ts';
import type { Interior } from '../village/interiors.ts';
import { payOut, refund, stake } from './money.ts';
import { line, pays, pull, REELS, STOPS, THREE, TWO_WORMS, ONE_WORM, type Symbol } from './slots.ts';

type Hand = 'left' | 'right';
const TAU = Math.PI * 2;
const R = 0.2; // reel radius (m): each of the 24 symbols is ~5 cm of arc
const REEL_W = 0.155;
const REEL_X = [-0.163, 0, 0.163];
const REEL_Y = 1.3;
const REEL_Z = 0.03; // the reels' axis: the drums' faces sit just behind the glass (z = +0.25)
const SPEED = 15; // rad/s while spinning
const TRAY = { z: 0.3, hx: 0.17, hz: 0.05, y: 0.93 };
const LEVER = { x: 0.39, y: 1.28, z: 0.02, len: 0.34, catch: 1.0, max: 1.25 };

export interface SlotOptions {
  bets: number[];
  /** the machine's spot in the room's floor frame: x, z, and its turn (0 = facing the door) */
  at: [number, number, number];
  colour: string;
}

interface Reel {
  mesh: Mesh;
  angle: number;
  from: number;
  to: number;
  stopAt: number; // seconds after the pull
  stopped: boolean;
}

interface Coin {
  i: number;
  p: Vector3;
  v: Vector3;
  spin: number;
  age: number;
  rest: boolean;
}

export class SlotMachine {
  readonly group = new Group();
  private readonly panel: InteractivePanel;
  private readonly reels: Reel[] = [];
  private readonly lever = new Group();
  private readonly knob: Mesh;
  private readonly bulbs: Mesh[] = [];
  private readonly coins: InstancedMesh;
  private readonly coinList: Coin[] = [];
  private readonly whirr = new RollBed();

  private bet: number;
  private phase: 'idle' | 'spinning' | 'win' = 'idle';
  private t = 0;
  private stops: number[] = [0, 0, 0];
  private status = 'Pull the lever';
  private lastWin = 0;
  private owed = 0;
  private winT = 0;
  private winSize = 0;
  // lever
  private leverAngle = 0;
  private leverVel = 0;
  private grabbedBy: Hand | null = null;
  private gripWas: Record<Hand, boolean> = { left: false, right: false };
  private lastNotch = 0;
  private fired = false;

  constructor(
    private readonly room: Interior,
    private readonly state: GameState,
    private readonly world: World,
    private readonly opts: SlotOptions,
  ) {
    this.bet = opts.bets[0];
    const g = this.group;
    g.position.set(opts.at[0], 0, opts.at[1]);
    g.rotation.y = opts.at[2];
    room.contents.add(g);

    // the cabinet: a stand, the body, a lit topper
    const paint = new MeshPhongMaterial({ color: opts.colour, shininess: 70 });
    const dark = new MeshLambertMaterial({ color: 0x1a1418 });
    const chrome = new MeshPhongMaterial({ color: 0xd8d8e0, shininess: 140, specular: 0xffffff });
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: Material = paint): Mesh => {
      const b = new Mesh(new BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      g.add(b);
      return b;
    };
    box(0.66, 0.78, 0.46, 0, 0.39, -0.02, dark); // stand
    box(0.72, 0.1, 0.52, 0, 0.83, 0); // the ledge with the coin tray
    // body round the reel window (a frame of four boxes; the reels sit in the hole)
    const wy0 = REEL_Y - 0.09;
    const wy1 = REEL_Y + 0.09;
    box(0.72, wy0 - 0.88, 0.5, 0, (0.88 + wy0) / 2, 0);
    box(0.72, 1.86 - wy1, 0.5, 0, (wy1 + 1.86) / 2, 0);
    box(0.1, wy1 - wy0, 0.5, -0.31, REEL_Y, 0);
    box(0.1, wy1 - wy0, 0.5, 0.31, REEL_Y, 0);
    box(0.52, wy1 - wy0 + 0.02, 0.02, 0, REEL_Y, -0.25, dark); // the back of the reel bay
    // chrome trim round the window
    for (const [w, h, x, y] of [
      [0.54, 0.018, 0, wy1 + 0.009],
      [0.54, 0.018, 0, wy0 - 0.009],
      [0.018, 0.2, -0.27, REEL_Y],
      [0.018, 0.2, 0.27, REEL_Y],
    ] as const)
      box(w, h, 0.02, x, y, 0.255, chrome);
    // glass with a faint sheen, and the payline
    const glass = new Mesh(new PlaneGeometry(0.52, 0.18), new MeshBasicMaterial({ color: 0xaad8ff, transparent: true, opacity: 0.08, depthWrite: false }));
    glass.position.set(0, REEL_Y, 0.252);
    const payline = new Mesh(new PlaneGeometry(0.5, 0.004), new MeshBasicMaterial({ color: 0xff3030, toneMapped: false }));
    payline.position.set(0, REEL_Y, 0.25);
    g.add(glass, payline);

    // the reels
    for (let r = 0; r < 3; r++) {
      const mesh = new Mesh(new CylinderGeometry(R, R, REEL_W, 72, 1, true).rotateZ(-Math.PI / 2), new MeshBasicMaterial({ map: reelTexture(REELS[r]) }));
      mesh.position.set(REEL_X[r], REEL_Y, REEL_Z);
      const start = -stopAngle(Math.floor(Math.random() * STOPS));
      mesh.rotation.x = start;
      g.add(mesh);
      this.reels.push({ mesh, angle: start, from: start, to: start, stopAt: 0, stopped: true });
    }
    // dark caps between the reels so you see three drums, not one
    for (const x of [-0.245, -0.0815, 0.0815, 0.245]) {
      const cap = new Mesh(new CylinderGeometry(R + 0.005, R + 0.005, 0.01, 40).rotateZ(Math.PI / 2), dark);
      cap.position.set(x, REEL_Y, REEL_Z);
      g.add(cap);
    }

    // bulbs round the window
    const bulbGeo = new SphereGeometry(0.011, 8, 6);
    for (let k = 0; k < 18; k++) {
      const u = k / 18;
      const [x, y] = perimeter(u, 0.3, 0.12);
      const b = new Mesh(bulbGeo, new MeshBasicMaterial({ color: 0x806020, toneMapped: false }));
      b.position.set(x, REEL_Y + y, 0.262);
      g.add(b);
      this.bulbs.push(b);
    }

    // the topper: the name and the paytable, lit
    const top = new Mesh(new PlaneGeometry(0.6, 0.406), new MeshBasicMaterial({ map: topperTexture(opts.colour), toneMapped: false }));
    top.position.set(0, 1.645, 0.252);
    g.add(top);

    // the bet panel under the glass, tipped back like a button deck
    this.panel = new InteractivePanel([900, 300], [0.6, 0.2]);
    this.panel.mesh.position.set(0, 1.09, 0.29);
    this.panel.mesh.rotation.x = -0.35;
    g.add(this.panel.mesh);
    this.panel.paint = () => this.paintPanel();
    this.panel.onClick = (id) => this.click(id);
    register(this.panel);

    // the coin tray and the coins that pour into it
    const tray = new Mesh(new BoxGeometry(0.4, 0.05, 0.14), new MeshPhongMaterial({ color: 0x9a9aa4, shininess: 120 }));
    tray.position.set(0, 0.9, TRAY.z);
    g.add(tray);
    const trayIn = new Mesh(new PlaneGeometry(0.37, 0.11).rotateX(-Math.PI / 2), dark);
    trayIn.position.set(0, 0.926, TRAY.z);
    const chute = new Mesh(new PlaneGeometry(0.12, 0.035), dark);
    chute.position.set(0, 0.955, 0.252);
    g.add(trayIn, chute);
    this.coins = new InstancedMesh(new CylinderGeometry(0.013, 0.013, 0.003, 14), new MeshPhongMaterial({ color: 0xffc83a, shininess: 150, specular: 0xffffff }), 60);
    this.coins.count = 0;
    this.coins.frustumCulled = false;
    g.add(this.coins);

    // the lever: a chrome arm on a pivot at the cabinet's side, a red knob
    const hub = new Mesh(new CylinderGeometry(0.045, 0.045, 0.05, 16).rotateZ(Math.PI / 2), chrome);
    hub.position.set(LEVER.x - 0.02, LEVER.y, LEVER.z);
    g.add(hub);
    this.lever.position.set(LEVER.x + 0.02, LEVER.y, LEVER.z);
    const arm = new Mesh(new CylinderGeometry(0.009, 0.012, LEVER.len, 10), chrome);
    arm.position.y = LEVER.len / 2;
    this.knob = new Mesh(new SphereGeometry(0.035, 16, 12), new MeshPhongMaterial({ color: 0xd8202a, shininess: 120 }));
    this.knob.position.y = LEVER.len;
    this.lever.add(arm, this.knob);
    this.lever.rotation.x = -0.12;
    g.add(this.lever);

    this.paintPanel();
    this.panel.repaintOnFonts(() => this.paintPanel());
    state.onChange(() => this.paintPanel());
    window.addEventListener('pagehide', () => {
      if (this.phase === 'spinning') refund(this.state, this.bet * pays(line(this.stops)).mult);
      if (this.owed) refund(this.state, this.owed);
      this.owed = 0;
    });
  }

  /* ── input ──────────────────────────────────────────────────────── */

  private click(id: string): void {
    if (id.startsWith('bet')) {
      if (this.phase === 'spinning') return;
      this.bet = Number(id.slice(3));
      this.paintPanel();
    } else if (id === 'spin') this.spin();
  }

  private spin(): boolean {
    if (this.phase === 'spinning') return false;
    if (!stake(this.state, this.bet)) {
      this.status = "You can't cover the bet";
      uiDeny();
      this.paintPanel();
      return false;
    }
    this.stops = pull();
    const first = line(this.stops);
    const tease = first[0] === first[1] && (first[0] === 'marlin' || first[0] === 'chest');
    const times = [1.0, 1.45, tease ? 2.9 : 1.9];
    this.reels.forEach((r, k) => {
      r.from = r.angle;
      r.stopAt = times[k];
      r.stopped = false;
      // round the drum at speed, to land with stop k's symbol on the payline
      const want = -stopAngle(this.stops[k]);
      const travel = SPEED * (times[k] - 0.06);
      r.to = want + Math.ceil((r.from + travel - want) / TAU) * TAU;
    });
    this.phase = 'spinning';
    this.t = 0;
    this.status = tease ? 'Come on…' : 'Good luck';
    this.lastWin = 0;
    this.paintPanel();
    return true;
  }

  /** The lever: grab the knob with grip, pull it down past the catch, let go. */
  private updateLever(dt: number): void {
    const input = this.world.input;
    const player = this.world.player;
    const knobW = this.knob.getWorldPosition(_v);
    for (const h of ['left', 'right'] as const) {
      const grip = (input.xr.gamepads[h]?.getButtonValue(InputComponent.Squeeze) ?? 0) > 0.5;
      const pressed = grip && !this.gripWas[h];
      this.gripWas[h] = grip;
      const hp = player.gripSpaces[h].getWorldPosition(_h);
      if (pressed && !this.grabbedBy && hp.distanceTo(knobW) < 0.12) {
        this.grabbedBy = h;
        this.fired = false;
        this.pulse(h, 0.4, 30);
      }
      if (this.grabbedBy === h && !grip) this.grabbedBy = null;
    }
    if (this.grabbedBy) {
      // the hand's position round the pivot (in the machine's frame): up is 0, toward you is +
      const hp = this.group.worldToLocal(this.world.player.gripSpaces[this.grabbedBy].getWorldPosition(_h));
      const a = Math.atan2(hp.z - LEVER.z, hp.y - LEVER.y);
      const target = Math.max(0, Math.min(LEVER.max, a));
      this.leverVel = (target - this.leverAngle) / Math.max(dt, 1e-3);
      this.leverAngle = target;
      const notch = Math.floor(this.leverAngle / 0.16);
      if (notch !== this.lastNotch) {
        if (notch > this.lastNotch) {
          leverClick(this.leverAngle / LEVER.max);
          this.pulse(this.grabbedBy, 0.25 + 0.3 * (this.leverAngle / LEVER.max), 12);
        }
        this.lastNotch = notch;
      }
      if (!this.fired && this.leverAngle > LEVER.catch) {
        this.fired = true;
        if (this.spin()) this.pulse(this.grabbedBy, 0.9, 60);
      }
    } else {
      // a spring back up, with a little bounce at the top
      this.leverVel += (-this.leverAngle * 90 - this.leverVel * 9) * dt;
      this.leverAngle = Math.max(-0.05, this.leverAngle + this.leverVel * dt);
      this.lastNotch = Math.floor(Math.max(0, this.leverAngle) / 0.16);
    }
    this.lever.rotation.x = this.leverAngle - 0.12;
  }

  private pulse(h: Hand, k: number, ms: number): void {
    pulseHand(this.world.renderer.xr.getSession() ?? undefined, h, k, ms);
  }

  /* ── frame ──────────────────────────────────────────────────────── */

  update(dt: number, camera: Camera): void {
    const e = camera.matrixWorld.elements;
    const inside = this.room.inside(e[12], e[14]);
    if (inside) this.updateLever(dt);
    this.t += dt;

    if (this.phase === 'spinning') {
      let spinning = 0;
      this.reels.forEach((r, k) => {
        if (r.stopped) {
          // the detent's kick: a little past, and back
          const s = this.t - r.stopAt;
          r.mesh.rotation.x = r.to + 0.07 * Math.exp(-s * 14) * Math.sin(s * 30);
          return;
        }
        spinning++;
        const T = r.stopAt;
        const t = Math.min(this.t, T);
        // constant speed, easing only in the last tenth of a second
        const cruise = (r.to - r.from) / (T - 0.06);
        const tEase = T - 0.12;
        r.angle = t < tEase ? r.from + cruise * t : r.from + cruise * tEase + cruise * (t - tEase) - (cruise / 0.24) * (t - tEase) ** 2;
        if (this.t >= T) {
          r.angle = r.to;
          r.stopped = true;
          if (inside) reelStop(k);
        }
        r.mesh.rotation.x = r.angle;
      });
      this.whirr.set(inside ? 0.18 * (spinning / 3) : 0, 0.8 + spinning * 0.3);
      if (this.reels.every((r) => r.stopped) && this.t > this.reels[2].stopAt + 0.25) this.finish();
    } else {
      this.whirr.set(0, 0);
      for (const r of this.reels) r.mesh.rotation.x = r.angle = r.to;
    }

    // bulbs: a slow idle chase; a fast bright one on a win
    const winning = this.phase === 'win';
    if (winning) this.winT += dt;
    this.bulbs.forEach((b, k) => {
      const m = b.material as MeshBasicMaterial;
      const on = winning ? (k + Math.floor(this.winT * 14)) % 3 === 0 : (k + Math.floor(this.t * 3)) % 6 === 0;
      m.color.setHex(on ? (winning ? 0xfff2a0 : 0xffd060) : 0x5a4418);
    });
    if (winning && this.winT > Math.min(6, 1.5 + this.winSize * 0.05)) this.phase = 'idle';
    this.updateCoins(dt);
  }

  private finish(): void {
    const { mult } = pays(line(this.stops));
    const win = this.bet * mult;
    this.lastWin = win;
    if (win > 0) {
      this.phase = 'win';
      this.winT = 0;
      this.winSize = mult;
      this.status = mult >= 25 ? `${line(this.stops)[0].toUpperCase()}! WIN $${win}` : `WIN $${win}`;
      this.owed = win;
      this.pour(Math.min(60, Math.max(3, Math.round(4 + Math.sqrt(win) * 3))));
      coinDrops(Math.min(40, 3 + mult * 2));
      winFanfare(mult);
      if (mult >= 12) slotBells(Math.min(4, 1 + mult / 30));
      window.setTimeout(() => {
        if (!this.owed) return;
        payOut(this.state, this.owed);
        this.owed = 0;
      }, 450);
    } else {
      this.phase = 'idle';
      this.status = 'Pull the lever';
    }
    this.paintPanel();
  }

  /* ── coins ──────────────────────────────────────────────────────── */

  private pour(n: number): void {
    this.coinList.length = 0;
    for (let i = 0; i < n; i++) {
      this.coinList.push({
        i,
        p: new Vector3((Math.random() - 0.5) * 0.08, 0.955, 0.26),
        v: new Vector3((Math.random() - 0.5) * 0.6, 0.1 + Math.random() * 0.3, 0.15 + Math.random() * 0.25),
        spin: Math.random() * TAU,
        age: -i * 0.035,
        rest: false,
      });
    }
  }

  private updateCoins(dt: number): void {
    const m = new Matrix4();
    const o = _o;
    let n = 0;
    for (const c of this.coinList) {
      c.age += dt;
      if (c.age < 0) continue;
      if (!c.rest) {
        c.v.y -= 9.8 * dt;
        c.p.addScaledVector(c.v, dt);
        c.spin += dt * 20;
        // the tray's walls and floor
        if (Math.abs(c.p.x) > TRAY.hx) (c.p.x = Math.sign(c.p.x) * TRAY.hx), (c.v.x *= -0.4);
        if (c.p.z > TRAY.z + TRAY.hz) (c.p.z = TRAY.z + TRAY.hz), (c.v.z *= -0.4);
        if (c.p.y < TRAY.y) {
          c.p.y = TRAY.y;
          if (Math.abs(c.v.y) < 0.35) c.rest = true;
          c.v.y *= -0.3;
          c.v.x *= 0.5;
          c.v.z *= 0.5;
        }
      }
      if (c.age > 7) continue; // swept into the wallet
      o.position.copy(c.p);
      o.rotation.set(c.rest ? 0.05 * Math.sin(c.i) : c.spin, c.i, c.rest ? 0.05 * Math.cos(c.i) : c.spin * 0.7);
      const s = c.age > 6 ? Math.max(0.001, 7 - c.age) : 1;
      o.scale.setScalar(s);
      o.updateMatrix();
      m.copy(o.matrix);
      this.coins.setMatrixAt(n++, m);
    }
    this.coins.count = n;
    this.coins.instanceMatrix.needsUpdate = true;
  }

  /* ── painting ───────────────────────────────────────────────────── */

  private paintPanel(): void {
    const c = this.panel.ctx;
    this.panel.clear();
    roundRect(c, 4, 4, 892, 292, 20);
    c.fillStyle = 'rgba(16, 10, 20, 0.95)';
    c.fill();
    c.lineWidth = 4;
    c.strokeStyle = this.opts.colour;
    c.stroke();
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    c.font = font(700, 40);
    c.fillStyle = this.lastWin ? INK.good : INK.hot;
    c.fillText(this.status, 30, 60, 560);
    c.textAlign = 'right';
    c.font = font(600, 30);
    c.fillStyle = INK.amber;
    c.fillText(`$${this.state.money}`, 870, 58);
    const buttons: { id: string; x: number; y: number; w: number; h: number; enabled?: boolean }[] = [];
    c.textAlign = 'center';
    c.font = font(600, 24);
    c.fillStyle = INK.dim;
    c.fillText('BET', 70, 150);
    this.opts.bets.forEach((b, i) => {
      const x = 120 + i * 130;
      const id = `bet${b}`;
      buttons.push({ id, x, y: 100, w: 115, h: 90 });
      roundRect(c, x, 100, 115, 90, 14);
      const sel = b === this.bet;
      c.fillStyle = sel ? INK.amber : this.panel.hover === id ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)';
      c.fill();
      c.fillStyle = sel ? '#1a0a10' : INK.hot;
      c.font = font(700, 38);
      c.fillText(`$${b}`, x + 57, 158);
    });
    const on = this.phase !== 'spinning';
    buttons.push({ id: 'spin', x: 560, y: 90, w: 310, h: 110, enabled: on });
    roundRect(c, 560, 90, 310, 110, 18);
    c.fillStyle = !on ? 'rgba(255,255,255,0.08)' : this.panel.hover === 'spin' ? '#ffffff' : this.opts.colour;
    c.fill();
    c.fillStyle = on ? '#10141a' : INK.dim;
    c.font = font(700, 50);
    c.fillText('SPIN', 715, 164);
    c.font = font(500, 24);
    c.fillStyle = INK.dim;
    c.fillText('or grab the lever and pull it down', 450, 262);
    this.panel.buttons = buttons;
    this.panel.commit();
  }
}

const _v = new Vector3();
const _h = new Vector3();
const _o = new Object3D();

/** The reel's turn that puts stop i on the payline (its symbols run down the front as it turns). */
function stopAngle(i: number): number {
  return ((i + 0.5) / STOPS) * TAU;
}

/** A point on a rounded rectangle's perimeter (for the bulbs), u from 0 to 1. */
function perimeter(u: number, hw: number, hh: number): [number, number] {
  const P = 4 * (hw + hh);
  let d = u * P;
  if (d < 2 * hw) return [-hw + d, hh];
  d -= 2 * hw;
  if (d < 2 * hh) return [hw, hh - d];
  d -= 2 * hh;
  if (d < 2 * hw) return [hw - d, -hh];
  d -= 2 * hw;
  return [-hw, -hh + d];
}

/* ── art ───────────────────────────────────────────────────────────── */

/**
 * One reel's strip: 24 cells round the drum. The cylinder's u runs DOWN the front as it turns
 * and its v runs across, so each symbol is drawn turned a quarter (its "down" along canvas x).
 */
function reelTexture(strip: Symbol[]): CanvasTexture {
  const CELL = 128;
  const c = document.createElement('canvas');
  c.width = CELL * STOPS;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f6efdc';
  g.fillRect(0, 0, c.width, c.height);
  strip.forEach((s, i) => {
    const cx = (i + 0.5) * CELL;
    g.fillStyle = 'rgba(0,0,0,0.06)';
    g.fillRect(i * CELL, 0, 2, c.height);
    g.save();
    g.translate(cx, 128);
    g.rotate(-Math.PI / 2);
    drawSymbol(g, s, 100);
    g.restore();
  });
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** A symbol centred on the origin, about `s` px across (upright: y down). */
export function drawSymbol(g: CanvasRenderingContext2D, sym: Symbol, s: number): void {
  const k = s / 100;
  g.save();
  g.scale(k, k);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  switch (sym) {
    case 'worm': {
      g.strokeStyle = '#7a2c3a';
      g.lineWidth = 20;
      const path = (): void => {
        g.beginPath();
        g.moveTo(-40, 10);
        g.bezierCurveTo(-25, -30, -8, 30, 8, -5);
        g.bezierCurveTo(20, -30, 32, -10, 40, -22);
      };
      path();
      g.stroke();
      g.strokeStyle = '#e87a8a';
      g.lineWidth = 14;
      path();
      g.stroke();
      g.fillStyle = '#1a0a10';
      g.beginPath();
      g.arc(38, -24, 2.5, 0, TAU);
      g.fill();
      break;
    }
    case 'shell': {
      g.fillStyle = '#f2a36a';
      g.strokeStyle = '#a8522a';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0, 34);
      for (let i = 0; i <= 8; i++) {
        const a = Math.PI + (i / 8) * Math.PI;
        g.quadraticCurveTo(Math.cos(a - 0.2) * 48, Math.sin(a - 0.2) * 48 + 10, Math.cos(a) * 40, Math.sin(a) * 40 + 4);
      }
      g.closePath();
      g.fill();
      g.stroke();
      for (let i = 1; i < 8; i++) {
        const a = Math.PI + (i / 8) * Math.PI;
        g.beginPath();
        g.moveTo(0, 34);
        g.lineTo(Math.cos(a) * 38, Math.sin(a) * 38 + 4);
        g.stroke();
      }
      g.fillStyle = '#d0784a';
      g.fillRect(-10, 30, 20, 10);
      break;
    }
    case 'hook': {
      g.strokeStyle = '#6a7480';
      g.lineWidth = 11;
      g.beginPath();
      g.moveTo(6, -38);
      g.lineTo(6, 14);
      g.arc(-10, 14, 16, 0, Math.PI, false);
      g.lineTo(-26, 0);
      g.stroke();
      g.strokeStyle = '#d8e0ea';
      g.lineWidth = 6;
      g.stroke();
      // barb and eye
      g.fillStyle = '#d8e0ea';
      g.beginPath();
      g.moveTo(-26, -8);
      g.lineTo(-18, 4);
      g.lineTo(-31, 2);
      g.fill();
      g.lineWidth = 5;
      g.strokeStyle = '#6a7480';
      g.beginPath();
      g.arc(6, -42, 7, 0, TAU);
      g.stroke();
      break;
    }
    case 'anchor': {
      g.strokeStyle = '#1f3a6a';
      g.lineWidth = 10;
      g.beginPath();
      g.arc(0, -34, 8, 0, TAU);
      g.moveTo(0, -26);
      g.lineTo(0, 36);
      g.moveTo(-20, -14);
      g.lineTo(20, -14);
      g.moveTo(-34, 8);
      g.quadraticCurveTo(-30, 36, 0, 38);
      g.quadraticCurveTo(30, 36, 34, 8);
      g.stroke();
      g.fillStyle = '#1f3a6a';
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.moveTo(sx * 34, 0);
        g.lineTo(sx * 42, 14);
        g.lineTo(sx * 26, 12);
        g.fill();
      }
      break;
    }
    case 'marlin': {
      g.fillStyle = '#2a6ab0';
      g.beginPath();
      g.moveTo(-46, -2);
      g.lineTo(-20, -4);
      g.quadraticCurveTo(0, -18, 26, -6);
      g.lineTo(38, -20);
      g.lineTo(34, 0);
      g.lineTo(38, 20);
      g.lineTo(26, 6);
      g.quadraticCurveTo(0, 16, -20, 4);
      g.closePath();
      g.fill();
      // the sail
      g.fillStyle = '#1a4a88';
      g.beginPath();
      g.moveTo(-14, -8);
      g.quadraticCurveTo(-2, -44, 18, -10);
      g.closePath();
      g.fill();
      g.fillStyle = '#cfe4f4';
      g.beginPath();
      g.moveTo(-20, 2);
      g.quadraticCurveTo(0, 12, 26, 3);
      g.quadraticCurveTo(0, 6, -20, 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(-16, -3, 3, 0, TAU);
      g.fill();
      break;
    }
    case 'chest': {
      g.fillStyle = '#7a4a22';
      g.strokeStyle = '#3a200e';
      g.lineWidth = 3;
      roundRect(g, -38, -8, 76, 44, 5);
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(-38, -8);
      g.quadraticCurveTo(0, -46, 38, -8);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#ffc83a';
      g.fillRect(-38, -10, 76, 7);
      g.fillRect(-26, -30, 7, 66);
      g.fillRect(19, -30, 7, 66);
      g.fillRect(-7, -4, 14, 16);
      g.fillStyle = '#3a200e';
      g.fillRect(-2, 2, 4, 7);
      // gold spilling over the lip
      g.fillStyle = '#ffe070';
      for (const [x, y] of [
        [-10, -14],
        [2, -17],
        [13, -13],
      ])
        g.beginPath(), g.arc(x, y, 5, 0, TAU), g.fill();
      break;
    }
  }
  g.restore();
}

/** The topper: the machine's name, then the paytable (the only thing the odds come from). */
function topperTexture(colour: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 680;
  c.height = 460;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 460);
  grad.addColorStop(0, '#20102a');
  grad.addColorStop(1, '#0a0610');
  g.fillStyle = grad;
  g.fillRect(0, 0, 680, 460);
  g.strokeStyle = colour;
  g.lineWidth = 8;
  g.strokeRect(6, 6, 668, 448);
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.font = font(700, 64);
  g.fillStyle = colour;
  g.shadowColor = colour;
  g.shadowBlur = 18;
  g.fillText("REEL 'EM IN", 340, 78);
  g.shadowBlur = 0;
  const rows: [Symbol[], number][] = [
    [['chest', 'chest', 'chest'], THREE.chest],
    [['marlin', 'marlin', 'marlin'], THREE.marlin],
    [['anchor', 'anchor', 'anchor'], THREE.anchor],
    [['hook', 'hook', 'hook'], THREE.hook],
    [['shell', 'shell', 'shell'], THREE.shell],
    [['worm', 'worm', 'worm'], THREE.worm],
    [['worm', 'worm'], TWO_WORMS],
    [['worm'], ONE_WORM],
  ];
  rows.forEach(([syms, mult], i) => {
    const col = i < 4 ? 0 : 1;
    const y = 128 + (i % 4) * 82;
    const x0 = 40 + col * 320;
    g.fillStyle = 'rgba(246, 239, 220, 0.92)';
    roundRect(g, x0, y - 30, 170, 64, 10);
    g.fill();
    syms.forEach((s, k) => {
      g.save();
      g.translate(x0 + 30 + k * 55, y + 2);
      drawSymbol(g, s, 48);
      g.restore();
    });
    g.fillStyle = '#ffd24a';
    g.font = font(700, 40);
    g.textAlign = 'left';
    g.fillText(`× ${mult}`, x0 + 185, y + 16);
    g.textAlign = 'center';
  });
  g.font = font(500, 20);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillText('middle line · left to right · pays × bet · returns 94.8%', 340, 446);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
