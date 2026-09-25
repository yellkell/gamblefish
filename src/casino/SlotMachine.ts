/**
 * A slot machine in Reel 'Em In.
 *
 * THE CABINET is one piece: a side profile (a sloped button deck, the reel bay, a tall topper
 * with a rounded crown) extruded across and bevelled, in glossy lacquer that catches the room.
 * The reels sit in a chrome-ringed window with shadow at the top and bottom of the drums, glass
 * over them, and a paytable in the lit topper ringed with bulbs.
 *
 * PLAYING IT, every step has weight:
 *  - The LEVER is heavy: it trails your hand a little, ratchets notch by notch (a click and a
 *    tick in the controller each time), hits its catch with a clunk you feel, and twangs back
 *    when you let go. Or press the big SPIN button on the deck: poke it with your controller
 *    (it goes down under your hand) or point and pull the trigger.
 *  - The REELS kick back before they launch, blur at speed, then slow, ticking past their last
 *    few symbols, and thunk onto their detents one by one. The cabinet jolts at each.
 *  - A TEASE: when the first two match a marlin or a chest, the last reel crawls in, the bulbs
 *    flash and a riser climbs. (It changes nothing about the odds: the stops are already drawn.)
 *  - A WIN is counted up on the meter, blip by blip, while coins pour into the tray and clink as
 *    they land; the winning symbols light up; the money lands in your wallet with the cash chime
 *    at the end of the count. Big wins get a BIG WIN banner, a burst of sparks, bells and a boom.
 *    Pull again (or hit SPIN) to skip the count.
 *  - A single worm only gives your bet back, so it isn't dressed up as a win: "BAIT BACK".
 *
 * The rules (reels, paytable, the fair draw) are casino/slots.ts.
 */

import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Camera,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { InputComponent, type World } from '@iwsdk/core';
import { bigWinHit, coinClink, leverClick, leverClunk, leverSpring, reelStop, reelTick, riser, rollTick, RollBed, slotBells, uiClick, uiDeny, winFanfare } from '../audio/sfx.ts';
import type { GameState } from '../fishing/tidewater.ts';
import { pulseHand } from '../input/haptics.ts';
import { font } from '../ui/fonts.ts';
import { Panel, roundRect } from '../ui/panel.ts';
import { InteractivePanel, register } from '../ui/pointer.ts';
import type { Interior } from '../village/interiors.ts';
import { look } from './look.ts';
import { payOut, refund, stake } from './money.ts';
import { line, pays, pull, REELS, STOPS, THREE, TWO_WORMS, ONE_WORM, type Symbol } from './slots.ts';
import { drawSymbol } from './symbols.ts';

type Hand = 'left' | 'right';
const TAU = Math.PI * 2;
const PITCH = TAU / STOPS;

/* ── dimensions (machine frame: floor at 0, front +z, x across) ─────── */
const W = 0.74;
const BEVEL = 0.022; // the cabinet's rounded edges (the profile is drawn this much inside)
const FRONT = 0.24;
const R = 0.2; // reel radius: each symbol ~5 cm of arc
const REEL_W = 0.15;
const REEL_X = [-0.158, 0, 0.158];
const REEL_Y = 1.33;
const REEL_Z = FRONT - R - 0.012;
const WIN_W = 0.5;
const WIN_H = 0.19;
const BAY = { y0: 1.1, y1: 1.56 }; // the recess the reels sit in
const DECK = { z0: 0.4, y0: 0.93, z1: FRONT, y1: 1.06 }; // the sloped button deck, front lip to back
const TOPPER_Y = 1.84;
const LEVER = { x: W / 2 + 0.05, y: 1.3, z: 0.02, len: 0.36, catch: 1.0, max: 1.22 };
const TRAY = { z: 0.39, hx: 0.17, hz: 0.12, y: 0.567 }; // the coin tray's floor, out in front of the stand
const SPEED = 15;

export interface SlotOptions {
  bets: number[];
  /** the machine's spot in the room's floor frame: x, z, and its turn (0 = facing the door) */
  at: [number, number, number];
  /** the cabinet's lacquer (deep), and the accent its neon, glow and SPIN button light in */
  colour: string;
  accent: string;
}

interface Reel {
  mesh: Mesh;
  sharp: MeshBasicMaterial;
  blur: MeshBasicMaterial;
  angle: number;
  from: number;
  to: number;
  stopAt: number;
  cum: Float32Array; // ∫v dt at 240 Hz: this spin's motion shape
  vel: Float32Array;
  scale: number;
  stopped: boolean;
  lastCell: number;
  frame: Mesh; // the win highlight on this reel's payline cell
}

interface Coin {
  p: Vector3;
  v: Vector3;
  spin: number;
  born: number;
  rest: boolean;
}

interface DeckButton {
  id: string;
  x: number; // deck-local centre
  z: number;
  hw: number;
  hz: number;
  cap: Mesh;
  mats: MeshStandardMaterial[];
  press: number; // how far down it is (m)
  poked: Record<Hand, boolean>;
}

export class SlotMachine {
  readonly group = new Group();
  private readonly body = new Group(); // everything that jolts
  private readonly deck = new Group();
  private readonly deckPanel: InteractivePanel;
  private readonly display: Panel;
  private readonly reels: Reel[] = [];
  private readonly lever = new Group();
  private readonly knob: Mesh;
  private readonly bulbs: InstancedMesh;
  private readonly bulbCount: number;
  private readonly coins: InstancedMesh;
  private coinList: Coin[] = [];
  private readonly buttons: DeckButton[] = [];
  private readonly banner: Sprite;
  private readonly sparks: InstancedMesh;
  private sparkList: { p: Vector3; v: Vector3; age: number }[] = [];
  private readonly floorGlow: Mesh;
  private readonly whirr = new RollBed();

  private bet: number;
  private phase: 'idle' | 'spinning' | 'counting' | 'won' = 'idle';
  private t = 0;
  private clock = 0;
  private stops: number[] = [0, 0, 0];
  private tease = false;
  private message = 'PULL THE LEVER';
  private meter = 0; // what the WIN meter shows
  private win = 0;
  private mult = 0;
  private countT = 0;
  private countDur = 1;
  private lastBlip = 0;
  private coinsDue = 0;
  private coinsPoured = 0;
  private owed = 0;
  private shake = 0;
  private bannerT = -1;
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
    opts: SlotOptions,
  ) {
    this.bet = opts.bets[0];
    const r = world.renderer;
    const g = this.group;
    g.position.set(opts.at[0], 0, opts.at[1]);
    g.rotation.y = opts.at[2];
    g.add(this.body);
    room.contents.add(g);
    const paint = look.paint(r, opts.colour);
    const chrome = look.chrome(r);
    const black = look.gloss(r, 0x14101a);

    // the cabinet, extruded from its side profile and bevelled round every edge
    const cab = new Mesh(new ExtrudeGeometry(profile(), { depth: W - BEVEL * 2, bevelEnabled: true, bevelSize: BEVEL, bevelThickness: BEVEL, bevelSegments: 4, curveSegments: 16 }), paint);
    cab.geometry.rotateY(-Math.PI / 2).translate(W / 2 - BEVEL, 0, 0);
    this.body.add(cab);
    const plinth = new Mesh(new RoundedBoxGeometry(W + 0.04, 0.1, 0.56, 3, 0.02), black);
    plinth.position.set(0, 0.05, -0.01);
    this.body.add(plinth);
    for (const sx of [-1, 1]) {
      const strip = new Mesh(new RoundedBoxGeometry(0.018, 0.66, 0.018, 2, 0.008), look.gold(r));
      strip.position.set(sx * (W / 2 - 0.006), 0.44, FRONT + 0.002);
      this.body.add(strip);
    }

    // the reel bay: a dark lining behind the drums, the bezel with its chrome ring, glass
    const lining = new Mesh(new PlaneGeometry(W - 0.06, BAY.y1 - BAY.y0), new MeshBasicMaterial({ color: 0x08060a }));
    lining.position.set(0, (BAY.y0 + BAY.y1) / 2, REEL_Z - R - 0.005);
    this.body.add(lining);
    const plate = new Shape();
    rrect(plate, -(W / 2 - 0.02), BAY.y0 - 0.005, W - 0.04, BAY.y1 - BAY.y0 + 0.01, 0.02);
    const hole = new Shape();
    rrect(hole, -WIN_W / 2, REEL_Y - WIN_H / 2, WIN_W, WIN_H, 0.03);
    plate.holes.push(hole);
    const bezel = new Mesh(new ExtrudeGeometry(plate, { depth: 0.012, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 }), black);
    bezel.position.z = FRONT - 0.006;
    this.body.add(bezel);
    const ringOuter = new Shape();
    rrect(ringOuter, -WIN_W / 2 - 0.022, REEL_Y - WIN_H / 2 - 0.022, WIN_W + 0.044, WIN_H + 0.044, 0.05);
    const ringHole = new Shape();
    rrect(ringHole, -WIN_W / 2, REEL_Y - WIN_H / 2, WIN_W, WIN_H, 0.03);
    ringOuter.holes.push(ringHole);
    const ring = new Mesh(new ExtrudeGeometry(ringOuter, { depth: 0.01, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 4 }), chrome);
    ring.position.z = FRONT + 0.012;
    this.body.add(ring);

    // the reels, dividers between them, the win frames
    const frameTex = winFrameTexture();
    for (let k = 0; k < 3; k++) {
      const sharp = new MeshBasicMaterial({ map: reelTexture(REELS[k], false) });
      const blur = new MeshBasicMaterial({ map: reelTexture(REELS[k], true) });
      const mesh = new Mesh(new CylinderGeometry(R, R, REEL_W, 96, 1, true).rotateZ(-Math.PI / 2), sharp);
      mesh.position.set(REEL_X[k], REEL_Y, REEL_Z);
      const start = -stopAngle(Math.floor(Math.random() * STOPS));
      mesh.rotation.x = start;
      this.body.add(mesh);
      const frame = new Mesh(new PlaneGeometry(REEL_W - 0.008, PITCH * R + 0.014), new MeshBasicMaterial({ map: frameTex, transparent: true, depthWrite: false, toneMapped: false }));
      frame.position.set(REEL_X[k], REEL_Y, FRONT + 0.006);
      frame.visible = false;
      this.body.add(frame);
      this.reels.push({ mesh, sharp, blur, angle: start, from: start, to: start, stopAt: 0, cum: new Float32Array(1), vel: new Float32Array(1), scale: 0, stopped: true, lastCell: 0, frame });
    }
    for (const x of [-0.079, 0.079]) {
      const div = new Mesh(new CylinderGeometry(R + 0.004, R + 0.004, 0.008, 48).rotateZ(Math.PI / 2), black);
      div.position.set(x, REEL_Y, REEL_Z);
      this.body.add(div);
    }
    // shadow at the drums' top and bottom (it's what makes them read as round), payline, glass
    const shade = new Mesh(new PlaneGeometry(WIN_W, WIN_H), new MeshBasicMaterial({ map: shadeTexture(), transparent: true, depthWrite: false }));
    shade.position.set(0, REEL_Y, FRONT - 0.008);
    const payline = new Mesh(new PlaneGeometry(WIN_W, 0.0035), new MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.85, toneMapped: false }));
    payline.position.set(0, REEL_Y, FRONT - 0.006);
    const glass = new Mesh(new PlaneGeometry(WIN_W, WIN_H), new MeshBasicMaterial({ map: glassTexture(), transparent: true, blending: AdditiveBlending, depthWrite: false }));
    glass.position.set(0, REEL_Y, FRONT + 0.004);
    this.body.add(shade, payline, glass);
    for (const sx of [-1, 1]) {
      const arrow = new Mesh(new CylinderGeometry(0.014, 0.014, 0.006, 3).rotateX(Math.PI / 2).rotateZ(sx > 0 ? Math.PI / 2 : -Math.PI / 2), new MeshBasicMaterial({ color: 0xff3030, toneMapped: false }));
      arrow.position.set(sx * (WIN_W / 2 + 0.045), REEL_Y, FRONT + 0.016);
      this.body.add(arrow);
    }

    // the meter under the glass: credit, bet, win — amber on black
    this.display = new Panel([1000, 150], [WIN_W + 0.04, 0.06], { depthTest: true });
    this.display.mesh.position.set(0, BAY.y0 + 0.052, FRONT + 0.014);
    this.body.add(this.display.mesh);

    // the topper: title and paytable, lit, ringed by bulbs; a glow behind it and on the floor
    const topper = new Mesh(new PlaneGeometry(0.62, 0.44), new MeshBasicMaterial({ map: topperTexture(opts.accent), toneMapped: false }));
    topper.position.set(0, TOPPER_Y, FRONT + 0.034);
    this.body.add(topper);
    const bulbPts: [number, number, number][] = [];
    for (let k = 0; k < 34; k++) {
      const [x, y] = perimeter(k / 34, 0.335, 0.245);
      bulbPts.push([x, TOPPER_Y + y, FRONT + 0.04]);
    }
    for (let k = 0; k < 18; k++) {
      const [x, y] = perimeter(k / 18, WIN_W / 2 + 0.05, WIN_H / 2 + 0.045);
      bulbPts.push([x, REEL_Y + y, FRONT + 0.026]);
    }
    this.bulbCount = bulbPts.length;
    this.bulbs = new InstancedMesh(new SphereGeometry(0.0105, 10, 8), new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), this.bulbCount);
    const m = new Matrix4();
    bulbPts.forEach(([x, y, z], i) => {
      this.bulbs.setMatrixAt(i, m.makeTranslation(x, y, z));
      this.bulbs.setColorAt(i, new Color(0x604010));
    });
    this.body.add(this.bulbs);
    const halo = new Sprite(new SpriteMaterial({ map: glowTexture(), color: new Color(opts.accent), transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0.35 }));
    halo.scale.set(1.3, 1.0, 1);
    halo.position.set(0, TOPPER_Y, -0.2);
    this.body.add(halo);
    this.floorGlow = new Mesh(new PlaneGeometry(1.3, 1.0).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: glowTexture(), color: new Color(opts.accent), transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0.22 }));
    this.floorGlow.position.set(0, 0.006, 0.6);
    g.add(this.floorGlow);

    // the button deck: bet buttons and a big SPIN — physical caps you can poke or point at
    this.deck.position.set(0, (DECK.y0 + DECK.y1) / 2 + 0.003, (DECK.z0 + DECK.z1) / 2);
    this.deck.rotation.x = Math.atan2(DECK.y1 - DECK.y0, DECK.z0 - DECK.z1);
    this.body.add(this.deck);
    opts.bets.forEach((b, i) => this.addButton(`bet${b}`, `$${b}`, -0.27 + i * 0.1, 0, 0.04, 0.03, '#f0e6c8'));
    this.addButton('spin', 'SPIN', 0.2, 0, 0.062, 0.062, opts.accent, true);
    const deckLen = Math.hypot(DECK.y1 - DECK.y0, DECK.z0 - DECK.z1);
    const pxM = 200 / deckLen;
    this.deckPanel = new InteractivePanel([740, 200], [0.74, deckLen]);
    this.deckPanel.mesh.rotation.x = -Math.PI / 2;
    this.deckPanel.mesh.position.y = 0.03;
    (this.deckPanel.mesh.material as MeshBasicMaterial).opacity = 0; // a hit-target only: the caps are the buttons
    this.deckPanel.buttons = this.buttons.map((b) => ({ id: b.id, x: (b.x - b.hw + 0.37) * 1000, y: (b.z - b.hz + deckLen / 2) * pxM, w: b.hw * 2000, h: b.hz * 2 * pxM }));
    this.deckPanel.onClick = (id) => this.press(id);
    this.deck.add(this.deckPanel.mesh);
    register(this.deckPanel);

    // the coin chute and the tray out in front of the stand
    const trayMesh = new Mesh(new RoundedBoxGeometry(TRAY.hx * 2 + 0.04, 0.05, TRAY.hz * 2 + 0.03, 3, 0.012), chrome);
    trayMesh.position.set(0, TRAY.y - 0.02, TRAY.z - 0.005);
    const trayIn = new Mesh(new PlaneGeometry(TRAY.hx * 2 + 0.01, TRAY.hz * 2).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0x0a080c }));
    trayIn.position.set(0, TRAY.y + 0.0055, TRAY.z);
    const chute = new Mesh(new RoundedBoxGeometry(0.16, 0.05, 0.03, 2, 0.01), black);
    chute.position.set(0, TRAY.y + 0.075, FRONT + 0.005);
    this.body.add(trayMesh, trayIn, chute);
    this.coins = new InstancedMesh(new CylinderGeometry(0.014, 0.014, 0.0028, 18), look.gold(r), 80);
    this.coins.count = 0;
    this.coins.frustumCulled = false;
    this.body.add(this.coins);

    // the lever: a chrome housing on the side, a chrome arm, a glossy red ball
    const housing = new Mesh(new RoundedBoxGeometry(0.06, 0.18, 0.18, 3, 0.02), chrome);
    housing.position.set(W / 2 + 0.02, LEVER.y, LEVER.z);
    this.body.add(housing);
    this.lever.position.set(LEVER.x, LEVER.y, LEVER.z);
    const arm = new Mesh(new CylinderGeometry(0.01, 0.014, LEVER.len, 14), chrome);
    arm.position.y = LEVER.len / 2;
    this.knob = new Mesh(new SphereGeometry(0.038, 24, 18), look.gloss(r, 0xd8141e));
    this.knob.position.y = LEVER.len;
    this.lever.add(arm, this.knob);
    this.lever.rotation.x = -0.12;
    this.body.add(this.lever);

    // big-win banner and sparks
    this.banner = new Sprite(new SpriteMaterial({ map: bannerTexture('BIG WIN'), transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
    this.banner.position.set(0, 1.62, 0.5);
    this.banner.visible = false;
    this.banner.renderOrder = 20;
    g.add(this.banner);
    this.sparks = new InstancedMesh(new PlaneGeometry(0.024, 0.024), new MeshBasicMaterial({ map: glowTexture(), color: 0xffe080, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), 120);
    this.sparks.count = 0;
    this.sparks.frustumCulled = false;
    g.add(this.sparks);

    this.paintDisplay();
    this.display.repaintOnFonts(() => this.paintDisplay());
    state.onChange(() => this.paintDisplay());
    window.addEventListener('pagehide', () => {
      if (this.phase === 'spinning') refund(this.state, this.bet * pays(line(this.stops)).mult);
      if (this.owed) refund(this.state, this.owed);
      this.owed = 0;
    });
  }

  private addButton(id: string, label: string, x: number, z: number, hw: number, hz: number, colour: string, round = false): void {
    const r = this.world.renderer;
    const bezel = new Mesh(round ? new CylinderGeometry(hw + 0.008, hw + 0.012, 0.012, 40) : new RoundedBoxGeometry(hw * 2 + 0.016, 0.012, hz * 2 + 0.016, 2, 0.006), look.chrome(r));
    bezel.position.set(x, 0.004, z);
    const side = look.gloss(r, colour);
    side.emissive = new Color(round ? colour : '#ffb000');
    side.emissiveIntensity = 0.15;
    const top = side.clone();
    top.map = capTexture(label, colour, round);
    top.color.set(0xffffff); // the texture carries the cap's colour, so white text can sit on it
    // the label only on the top face (cylinder groups: side, top, bottom; box: ±x, ±y, ±z)
    const mats = round ? [side, top, side] : [side, side, top, side, side, side];
    const cap = new Mesh(round ? new CylinderGeometry(hw, hw, 0.02, 40) : new RoundedBoxGeometry(hw * 2, 0.02, hz * 2, 3, 0.008), mats);
    cap.position.set(x, 0.016, z);
    this.deck.add(bezel, cap);
    this.buttons.push({ id, x, z, hw, hz, cap, mats: [side, top], press: 0, poked: { left: false, right: false } });
  }

  /* ── input ──────────────────────────────────────────────────────── */

  private press(id: string): void {
    const b = this.buttons.find((k) => k.id === id);
    if (b) b.press = 0.012;
    if (id.startsWith('bet')) {
      if (this.phase === 'spinning') return uiDeny();
      this.bet = Number(id.slice(3));
      this.paintDisplay();
    } else if (id === 'spin') this.spin();
  }

  /** Start a spin (or, mid count-up, finish the count at once). */
  private spin(): boolean {
    if (this.phase === 'counting') {
      this.completeCount();
      return false;
    }
    if (this.phase === 'spinning') return false;
    if (!stake(this.state, this.bet)) {
      this.message = "CAN'T COVER THE BET";
      this.meter = 0;
      uiDeny();
      this.paintDisplay();
      return false;
    }
    this.stops = pull();
    const first = line(this.stops);
    this.tease = first[0] === first[1] && (first[0] === 'marlin' || first[0] === 'chest');
    const times = [1.05, 1.5, this.tease ? 3.6 : 1.95];
    const decel = [0.42, 0.42, this.tease ? 1.7 : 0.42];
    this.reels.forEach((r, k) => {
      r.from = r.angle;
      r.stopAt = times[k];
      r.stopped = false;
      r.frame.visible = false;
      plan(r, times[k], decel[k]);
      const total = r.cum[r.cum.length - 1];
      const want = -stopAngle(this.stops[k]);
      r.to = want + Math.ceil((r.from + SPEED * total - want) / TAU) * TAU;
      r.scale = (r.to - r.from) / total;
      r.lastCell = Math.floor(r.angle / PITCH);
    });
    if (this.tease) window.setTimeout(() => riser(1.9), 1600);
    this.phase = 'spinning';
    this.t = 0;
    this.meter = 0;
    this.win = 0;
    this.message = 'GOOD LUCK';
    this.paintDisplay();
    return true;
  }

  private pulse(h: Hand, k: number, ms: number): void {
    pulseHand(this.world.renderer.xr.getSession() ?? undefined, h, k, ms);
  }

  /** The lever: grab the knob with grip and haul it down past the catch. */
  private updateLever(dt: number): void {
    const input = this.world.input;
    const player = this.world.player;
    const knobW = this.knob.getWorldPosition(_v);
    for (const h of ['left', 'right'] as const) {
      const grip = (input.xr.gamepads[h]?.getButtonValue(InputComponent.Squeeze) ?? 0) > 0.5;
      const pressed = grip && !this.gripWas[h];
      this.gripWas[h] = grip;
      const hp = player.gripSpaces[h].getWorldPosition(_h);
      if (pressed && !this.grabbedBy && hp.distanceTo(knobW) < 0.13) {
        this.grabbedBy = h;
        this.fired = false;
        this.pulse(h, 0.45, 25);
      }
      if (this.grabbedBy === h && !grip) {
        this.grabbedBy = null;
        if (this.leverAngle > 0.4) leverSpring();
      }
    }
    if (this.grabbedBy) {
      // the hand's angle round the pivot; the lever follows with some weight behind it
      const hp = this.group.worldToLocal(this.world.player.gripSpaces[this.grabbedBy].getWorldPosition(_h));
      const target = Math.max(0, Math.min(LEVER.max, Math.atan2(hp.z - LEVER.z, hp.y - LEVER.y)));
      const k = 1 - Math.exp(-dt * (this.leverAngle > LEVER.catch - 0.12 ? 9 : 16));
      const prev = this.leverAngle;
      this.leverAngle += (target - this.leverAngle) * k;
      this.leverVel = (this.leverAngle - prev) / Math.max(dt, 1e-3);
      const notch = Math.floor(this.leverAngle / 0.14);
      if (notch > this.lastNotch) {
        leverClick(this.leverAngle / LEVER.max);
        this.pulse(this.grabbedBy, 0.2 + 0.45 * (this.leverAngle / LEVER.max), 10);
      }
      this.lastNotch = notch;
      if (!this.fired && this.leverAngle > LEVER.catch) {
        this.fired = true;
        leverClunk();
        this.pulse(this.grabbedBy, 1, 70);
        this.shake = Math.max(this.shake, 0.004);
        this.spin();
      }
    } else {
      this.leverVel += (-this.leverAngle * 110 - this.leverVel * 8) * dt;
      this.leverAngle = Math.max(-0.08, this.leverAngle + this.leverVel * dt);
      this.lastNotch = Math.floor(Math.max(0, this.leverAngle) / 0.14);
    }
    this.lever.rotation.x = this.leverAngle - 0.12;
  }

  /** Poking the deck buttons with a controller: the cap goes down under it and fires near the bottom. */
  private updateButtons(dt: number, inside: boolean): void {
    const player = this.world.player;
    for (const b of this.buttons) {
      let depth = 0;
      if (inside)
        for (const h of ['left', 'right'] as const) {
          const tip = this.deck.worldToLocal(player.raySpaces[h].getWorldPosition(_h));
          const over = Math.abs(tip.x - b.x) < b.hw + 0.012 && Math.abs(tip.z - b.z) < b.hz + 0.012;
          const d = over && tip.y > -0.03 ? 0.028 - tip.y : 0;
          if (d > 0) depth = Math.max(depth, d);
          if (over && d > 0.01 && !b.poked[h]) {
            b.poked[h] = true;
            uiClick();
            this.pulse(h, 0.7, 35);
            this.press(b.id);
          }
          if (b.poked[h] && (!over || tip.y > 0.035)) b.poked[h] = false;
        }
      const selected = b.id === `bet${this.bet}`;
      // the chosen bet stays latched halfway down, like a radio button
      b.press = Math.max(Math.min(0.012, depth), selected ? 0.006 : 0, b.press - dt * 0.08);
      b.cap.position.y = 0.016 - b.press;
      const hot = this.deckPanel.hover === b.id;
      const spinReady = b.id === 'spin' && this.phase !== 'spinning';
      const glow = hot ? 0.5 : selected ? 0.3 : spinReady ? 0.35 + 0.25 * Math.sin(this.clock * 4) : 0.02;
      for (const mat of b.mats) mat.emissiveIntensity += (glow - mat.emissiveIntensity) * Math.min(1, dt * 12);
    }
  }

  /* ── frame ──────────────────────────────────────────────────────── */

  update(dt: number, camera: Camera): void {
    const e = camera.matrixWorld.elements;
    const inside = this.room.inside(e[12], e[14]);
    this.clock += dt;
    if (inside) this.updateLever(dt);
    this.updateButtons(dt, inside);

    if (this.phase === 'spinning') this.updateReels(dt, inside);
    else this.whirr.set(0, 0);
    if (this.phase === 'counting') this.updateCount(dt, inside);
    if (this.phase === 'won') this.countT += dt;
    for (const r of this.reels) if (r.frame.visible) (r.frame.material as MeshBasicMaterial).opacity = 0.55 + 0.45 * Math.sin(this.clock * 9);

    this.updateBulbs();
    this.updateCoins(dt, inside);
    this.updateBanner(dt);
    // the cabinet's jolt
    this.shake *= Math.exp(-dt * 14);
    this.body.position.set((Math.random() - 0.5) * this.shake, 0, (Math.random() - 0.5) * this.shake);
  }

  private updateReels(dt: number, inside: boolean): void {
    this.t += dt;
    let moving = 0;
    this.reels.forEach((r, k) => {
      if (r.stopped) {
        const s = this.t - r.stopAt;
        r.mesh.rotation.x = r.to + 0.06 * Math.exp(-s * 16) * Math.sin(s * 34);
        return;
      }
      moving++;
      const i = Math.min(r.cum.length - 1, Math.floor(this.t * 240));
      r.angle = r.from + r.scale * r.cum[i];
      const speed = Math.abs(r.scale * r.vel[i]);
      r.mesh.material = speed > 7 ? r.blur : r.sharp;
      // ticking past the last few symbols as it slows
      const cell = Math.floor(r.angle / PITCH);
      if (cell !== r.lastCell && speed < 7 && inside) reelTick(k === 2 && this.tease ? 1.4 : 1);
      r.lastCell = cell;
      if (this.t >= r.stopAt) {
        r.angle = r.to;
        r.stopped = true;
        r.mesh.material = r.sharp;
        if (inside) reelStop(k);
        this.shake = Math.max(this.shake, 0.0025);
        if (this.grabbedBy) this.pulse(this.grabbedBy, 0.5, 30);
      }
      r.mesh.rotation.x = r.angle;
    });
    this.whirr.set(inside ? 0.16 * (moving / 3) : 0, 0.6 + moving * 0.35);
    if (this.reels.every((r) => r.stopped) && this.t > this.reels[2].stopAt + 0.3) this.finish(inside);
  }

  private finish(inside: boolean): void {
    const syms = line(this.stops);
    const { mult, reels } = pays(syms);
    this.mult = mult;
    this.win = this.bet * mult;
    this.meter = 0;
    this.countT = 0;
    if (mult === 0) {
      this.phase = 'idle';
      this.message = 'PULL THE LEVER';
    } else if (mult === ONE_WORM) {
      // your bet back: no party for that
      refund(this.state, this.win);
      this.phase = 'won';
      this.message = 'BAIT BACK';
      this.reels[0].frame.visible = true;
      this.pour(1);
      if (inside) coinClink();
    } else {
      this.owed = this.win;
      this.phase = 'counting';
      this.countDur = Math.min(6, 0.9 + Math.log2(mult) * 0.75);
      this.coinsDue = Math.min(70, Math.round(3 + mult * 1.1));
      this.coinsPoured = 0;
      this.message = mult >= 25 ? (syms[0] === 'chest' ? 'JACKPOT!' : 'BIG WIN!') : 'WIN';
      for (let k = 0; k < reels; k++) this.reels[k].frame.visible = true;
      if (mult >= 25) {
        this.bannerT = 0;
        const text = syms[0] === 'chest' ? 'JACKPOT' : 'BIG WIN';
        const mat = this.banner.material;
        if (mat.map?.name !== text) {
          mat.map?.dispose();
          mat.map = bannerTexture(text);
          mat.map.name = text;
        }
        bigWinHit();
        slotBells(Math.min(5, 1.5 + mult / 60));
        this.burst(40 + Math.min(60, mult));
        this.shake = 0.008;
      } else winFanfare(mult);
    }
    this.paintDisplay();
  }

  /** The count-up: the meter climbs, coins pour, then the money lands with the chime. */
  private updateCount(dt: number, inside: boolean): void {
    this.countT += dt;
    const k = Math.min(1, this.countT / this.countDur);
    const shown = Math.floor(this.win * (1 - Math.pow(1 - k, 2.2)));
    if (shown !== this.meter) {
      this.meter = shown;
      if (inside && this.clock - this.lastBlip > 0.045) {
        this.lastBlip = this.clock;
        rollTick(k);
      }
      this.paintDisplay();
    }
    const due = Math.round(this.coinsDue * Math.min(1, k * 1.15));
    while (this.coinsPoured < due) {
      this.pour(1);
      this.coinsPoured++;
    }
    if (k >= 1) this.completeCount();
  }

  private completeCount(): void {
    if (this.phase !== 'counting') return;
    this.meter = this.win;
    if (this.owed) payOut(this.state, this.owed);
    this.owed = 0;
    this.phase = 'won';
    this.countT = 0;
    this.paintDisplay();
  }

  /* ── bulbs, coins, sparks, banner ───────────────────────────────── */

  private updateBulbs(): void {
    const c = _c;
    const t = this.clock;
    const winning = this.phase === 'counting' || (this.phase === 'won' && this.mult > 1 && this.countT < 3);
    const tense = this.phase === 'spinning' && this.tease && this.t > 1.6;
    for (let i = 0; i < this.bulbCount; i++) {
      if (winning && this.mult >= 25) {
        this.bulbs.setColorAt(i, c.setHSL((i / this.bulbCount + t * 0.8) % 1, 1, 0.62));
        continue;
      }
      let on: boolean;
      let hex = 0xffd060;
      if (winning) {
        on = (i + Math.floor(t * 16)) % 2 === 0;
        hex = 0xfff4b0;
      } else if (this.phase === 'spinning') {
        on = tense ? Math.floor(t * 12) % 2 === 0 : (i + Math.floor(t * 12)) % 4 === 0;
        if (tense) hex = 0xff5040;
      } else on = (i + Math.floor(t * 4)) % 7 === 0 || (i + Math.floor(t * 4)) % 7 === 3;
      this.bulbs.setColorAt(i, c.setHex(on ? hex : 0x4a3410));
    }
    this.bulbs.instanceColor!.needsUpdate = true;
    const glow = this.floorGlow.material as MeshBasicMaterial;
    glow.opacity = winning ? 0.4 + 0.2 * Math.sin(t * 12) : 0.2 + 0.04 * Math.sin(t * 1.5);
  }

  private pour(n: number): void {
    for (let i = 0; i < n; i++)
      this.coinList.push({
        p: new Vector3((Math.random() - 0.5) * 0.1, TRAY.y + 0.075, FRONT + 0.03),
        v: new Vector3((Math.random() - 0.5) * 0.5, 0.1 + Math.random() * 0.3, 0.35 + Math.random() * 0.45),
        spin: Math.random() * TAU,
        born: this.clock,
        rest: false,
      });
    if (this.coinList.length > 80) this.coinList.splice(0, this.coinList.length - 80);
  }

  private updateCoins(dt: number, inside: boolean): void {
    const m = new Matrix4();
    const o = _o;
    let n = 0;
    let clinks = 0;
    this.coinList = this.coinList.filter((c) => this.clock - c.born < 9);
    let resting = 0;
    for (const c of this.coinList) if (c.rest) resting++;
    const floor = TRAY.y + 0.0075 + Math.min(0.02, resting * 0.0004); // the pile rises as coins land
    for (const c of this.coinList) {
      if (!c.rest) {
        c.v.y -= 9.8 * dt;
        c.p.addScaledVector(c.v, dt);
        c.spin += dt * 22;
        if (Math.abs(c.p.x) > TRAY.hx) (c.p.x = Math.sign(c.p.x) * TRAY.hx), (c.v.x *= -0.4);
        if (c.p.z > TRAY.z + TRAY.hz) (c.p.z = TRAY.z + TRAY.hz), (c.v.z *= -0.4);
        if (c.p.y < floor) {
          c.p.y = floor;
          if (Math.abs(c.v.y) > 0.3 && inside && clinks < 2) (coinClink(), clinks++);
          if (Math.abs(c.v.y) < 0.35) c.rest = true;
          c.v.set(c.v.x * 0.45, -c.v.y * 0.3, c.v.z * 0.45);
        }
      }
      const age = this.clock - c.born;
      o.position.copy(c.p);
      o.rotation.set(c.rest ? 0.08 * Math.sin(c.born * 7) : c.spin, c.born * 13, c.rest ? 0.08 * Math.cos(c.born * 5) : c.spin * 0.7);
      o.scale.setScalar(age > 8 ? Math.max(0.001, 9 - age) : 1);
      o.updateMatrix();
      this.coins.setMatrixAt(n++, m.copy(o.matrix));
    }
    this.coins.count = n;
    this.coins.instanceMatrix.needsUpdate = true;
  }

  private burst(n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      this.sparkList.push({ p: new Vector3(0, TOPPER_Y, FRONT + 0.06), v: new Vector3(Math.cos(a) * (0.4 + Math.random()), 0.6 + Math.random() * 1.6, 0.3 + Math.random() * 0.8), age: 0 });
    }
  }

  private updateBanner(dt: number): void {
    if (this.bannerT >= 0) {
      this.bannerT += dt;
      const s = this.bannerT;
      // punch in, hold with a throb, shrink away
      const k = s < 0.25 ? easeOutBack(s / 0.25) : s < 3.2 ? 1 + 0.05 * Math.sin(s * 10) : Math.max(0, 1 - (s - 3.2) / 0.3);
      this.banner.visible = k > 0.001;
      this.banner.scale.set(0.6 * k, 0.2 * k, 1);
      if (s > 3.5) this.bannerT = -1;
    } else this.banner.visible = false;
    const m = new Matrix4();
    const o = _o;
    let n = 0;
    this.sparkList = this.sparkList.filter((p) => p.age < 1.6);
    for (const p of this.sparkList) {
      p.age += dt;
      p.v.y -= 3.5 * dt;
      p.p.addScaledVector(p.v, dt);
      o.position.copy(p.p);
      o.rotation.set(0, 0, 0);
      o.scale.setScalar(Math.max(0.001, 1.6 - p.age));
      o.updateMatrix();
      if (n < 120) this.sparks.setMatrixAt(n++, m.copy(o.matrix));
    }
    this.sparks.count = n;
    this.sparks.instanceMatrix.needsUpdate = true;
  }

  /* ── the meter ──────────────────────────────────────────────────── */

  private paintDisplay(): void {
    const c = this.display.ctx;
    c.fillStyle = '#050305';
    c.fillRect(0, 0, 1000, 150);
    const led = (label: string, value: string, x: number, colour: string, size = 70): void => {
      c.textAlign = 'left';
      c.font = font(600, 24);
      c.fillStyle = 'rgba(255, 180, 60, 0.55)';
      c.fillText(label, x, 40);
      c.font = font(700, size);
      c.fillStyle = colour;
      c.shadowColor = colour;
      c.shadowBlur = 16;
      c.fillText(value, x, 116, 1000 - x - 20);
      c.shadowBlur = 0;
    };
    led('CREDIT', `$${this.state.money}`, 24, '#ffb020');
    led('BET', `$${this.bet}`, 390, '#ffb020');
    if (this.meter > 0) led(this.message, `$${this.meter}`, 580, '#7dff5a');
    else led('', this.message, 580, this.message === 'GOOD LUCK' || this.message === 'PULL THE LEVER' ? '#ff7fb0' : '#ff5a5a', 46);
    this.display.commit();
  }
}

/* ── motion ─────────────────────────────────────────────────────────── */

/**
 * A reel's velocity shape for one spin (in units of full speed), sampled at 240 Hz, and its
 * running integral: a little kick back, a surge up to speed, a cruise, then `decel` seconds of
 * slowing into the stop. The spin scales it so the integral lands exactly on the drawn stop.
 */
function plan(r: Reel, T: number, decel: number): void {
  const n = Math.ceil(T * 240) + 1;
  r.vel = new Float32Array(n);
  r.cum = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const t = i / 240;
    let v: number;
    if (t < 0.09) v = -0.3 * Math.sin((Math.PI * t) / 0.09);
    else if (t < 0.32) {
      const s = (t - 0.09) / 0.23;
      v = s * s * (3 - 2 * s);
    } else if (t < T - decel) v = 1;
    else v = Math.pow(1 - Math.min(1, (t - (T - decel)) / decel), 2.2);
    r.vel[i] = v;
    acc += v / 240;
    r.cum[i] = acc;
  }
}

function easeOutBack(x: number): number {
  const c1 = 2.2;
  return 1 + (c1 + 1) * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/** The reel's turn that puts stop i on the payline (its symbols run down the front as it turns). */
function stopAngle(i: number): number {
  return (i + 0.5) * PITCH;
}

/**
 * The cabinet's side profile in (z, y), extruded across x. It's drawn BEVEL inside the finished
 * surfaces: the bevel grows it back out to them.
 */
function profile(): Shape {
  const b = BEVEL;
  const s = new Shape();
  const back = -0.26 + b;
  const front = FRONT - b;
  const bayBack = REEL_Z - R - 0.02 + b;
  s.moveTo(back, 0.1 + b);
  s.lineTo(front, 0.1 + b);
  s.lineTo(front, 0.82);
  // the ledge, then the sloped deck up to the reel bay
  s.lineTo(DECK.z0 - b - 0.03, DECK.y0 - 0.07);
  s.quadraticCurveTo(DECK.z0 - b, DECK.y0 - 0.065, DECK.z0 - b, DECK.y0 - 0.035);
  s.lineTo(DECK.z0 - b, DECK.y0 - b);
  s.lineTo(DECK.z1 - b, DECK.y1 - b);
  s.lineTo(front, BAY.y0 - b);
  s.lineTo(bayBack, BAY.y0 - b);
  s.lineTo(bayBack, BAY.y1 + b);
  s.lineTo(front, BAY.y1 + b);
  // the topper leans out a touch, then a rounded crown
  s.lineTo(front + 0.03, BAY.y1 + 0.05);
  s.lineTo(front + 0.03, 2.08);
  s.quadraticCurveTo(front + 0.03, 2.2 - b, front - 0.12, 2.2 - b);
  s.lineTo(back + 0.06, 2.2 - b);
  s.quadraticCurveTo(back, 2.2 - b, back, 2.12);
  s.lineTo(back, 0.1 + b);
  return s;
}

function rrect(s: Shape, x: number, y: number, w: number, h: number, r: number): void {
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
}

/** A point on a rectangle's perimeter (for the bulbs), u from 0 to 1. */
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

const _v = new Vector3();
const _h = new Vector3();
const _o = new Object3D();
const _c = new Color();

/* ── art ───────────────────────────────────────────────────────────── */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * One reel's strip: 24 cells round the drum. The cylinder's u runs DOWN the front as it turns
 * and its v runs across, so each symbol is drawn turned a quarter (its "down" along canvas x).
 * The blurred version smears it along the direction of travel, for speed.
 */
function reelTexture(strip: Symbol[], blurred: boolean): CanvasTexture {
  const CELL = 160;
  const [c, g] = canvas(CELL * STOPS, 320);
  const paper = g.createLinearGradient(0, 0, 0, 320);
  paper.addColorStop(0, '#e8dfc6');
  paper.addColorStop(0.5, '#fbf6e8');
  paper.addColorStop(1, '#e8dfc6');
  g.fillStyle = paper;
  g.fillRect(0, 0, c.width, c.height);
  strip.forEach((s, i) => {
    g.save();
    g.translate((i + 0.5) * CELL, 160);
    g.rotate(-Math.PI / 2);
    drawSymbol(g, s, 132);
    g.restore();
  });
  if (!blurred) return tex(c);
  const [c2, g2] = canvas(c.width, c.height);
  g2.globalAlpha = 1 / 7;
  for (let k = -6; k <= 6; k += 2) {
    g2.drawImage(c, k * 10, 0);
    g2.drawImage(c, k * 10 + (k < 0 ? c.width : -c.width), 0);
  }
  return tex(c2);
}

/** Dark at the top and bottom of the window, clear across the middle. */
function shadeTexture(): CanvasTexture {
  const [c, g] = canvas(8, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(0,0,0,0.92)');
  grad.addColorStop(0.3, 'rgba(0,0,0,0.1)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0)');
  grad.addColorStop(0.7, 'rgba(0,0,0,0.1)');
  grad.addColorStop(1, 'rgba(0,0,0,0.92)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 256);
  return tex(c);
}

/** A couple of soft diagonal reflections on the glass. */
function glassTexture(): CanvasTexture {
  const [c, g] = canvas(256, 128);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.beginPath();
  g.moveTo(40, 0);
  g.lineTo(90, 0);
  g.lineTo(50, 128);
  g.lineTo(0, 128);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.07)';
  g.beginPath();
  g.moveTo(110, 0);
  g.lineTo(124, 0);
  g.lineTo(84, 128);
  g.lineTo(70, 128);
  g.fill();
  return tex(c);
}

function winFrameTexture(): CanvasTexture {
  const [c, g] = canvas(256, 128);
  roundRect(g, 10, 10, 236, 108, 18);
  g.strokeStyle = '#3a1004';
  g.lineWidth = 14;
  g.stroke();
  g.strokeStyle = '#ffd24a';
  g.lineWidth = 8;
  g.stroke();
  g.strokeStyle = '#fff6c8';
  g.lineWidth = 2.5;
  g.stroke();
  return tex(c);
}

function glowTexture(): CanvasTexture {
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return tex(c);
}

function capTexture(label: string, colour: string, round: boolean): CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = colour;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = round ? '#ffffff' : '#2a1410';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = font(700, round ? 84 : label.length > 3 ? 84 : 104);
  g.translate(128, 128);
  // a cylinder's top cap maps u along +z and v along +x, so its label is drawn a quarter-turn round
  if (round) g.rotate(-Math.PI / 2);
  if (round) {
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.strokeText(label, 0, 6);
  }
  g.fillText(label, 0, 6);
  return tex(c);
}

function bannerTexture(text: string): CanvasTexture {
  const [c, g] = canvas(768, 256);
  const grad = g.createLinearGradient(0, 40, 0, 216);
  grad.addColorStop(0, '#fff6b0');
  grad.addColorStop(0.5, '#ffc020');
  grad.addColorStop(1, '#e06a10');
  g.font = font(700, 170);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 22;
  g.strokeStyle = '#3a1004';
  g.strokeText(text, 384, 136, 740);
  g.shadowColor = '#ffb000';
  g.shadowBlur = 30;
  g.fillStyle = grad;
  g.fillText(text, 384, 136, 740);
  const t = tex(c);
  t.name = text;
  return t;
}

/** The topper: the machine's name, then the paytable (the only thing the odds come from). */
function topperTexture(colour: string): CanvasTexture {
  const [c, g] = canvas(744, 528);
  const grad = g.createLinearGradient(0, 0, 0, 528);
  grad.addColorStop(0, '#2a1236');
  grad.addColorStop(1, '#0a0610');
  g.fillStyle = grad;
  g.fillRect(0, 0, 744, 528);
  // sunburst rays behind the title
  g.save();
  g.translate(372, 70);
  for (let i = 0; i < 24; i++) {
    g.rotate(TAU / 24);
    if (i % 2) continue;
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(600, -60);
    g.lineTo(600, 60);
    g.fill();
  }
  g.restore();
  // the title as a neon tube: a wide glow in the colour, a white-hot core
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.font = font(700, 86);
  g.lineJoin = 'round';
  g.shadowColor = colour;
  g.shadowBlur = 34;
  g.strokeStyle = colour;
  g.lineWidth = 10;
  g.strokeText("REEL 'EM IN", 372, 104);
  g.shadowBlur = 0;
  g.fillStyle = '#ffffff';
  g.fillText("REEL 'EM IN", 372, 104);
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
    const y = 162 + (i % 4) * 84;
    const x0 = 28 + col * 360;
    g.fillStyle = 'rgba(251, 246, 232, 0.95)';
    roundRect(g, x0, y - 34, 196, 70, 14);
    g.fill();
    syms.forEach((s, k) => {
      g.save();
      g.translate(x0 + 36 + k * 62, y + 1);
      drawSymbol(g, s, 58);
      g.restore();
    });
    g.fillStyle = mult >= 25 ? '#ffd24a' : '#f6f0dc';
    g.font = font(700, 46);
    g.textAlign = 'left';
    g.fillText(`× ${mult}`, x0 + 210, y + 17);
    g.textAlign = 'center';
  });
  g.font = font(500, 21);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillText('middle line · from the left · pays × bet · returns 94.8%', 372, 512);
  return tex(c);
}
