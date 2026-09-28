/**
 * THE GEAR SHOPS: the village's fishing upgrades, on Tidewater's upgrade tracks (fishing/gear.ts).
 *
 *   TACKLE SHOP (S3)     rods, reels and line: how far you cast, how fast you reel, what the
 *                        line will hold. A rack of rods by the wall, reels and spools on the
 *                        counter.
 *   BAIT SHOP (S2)       bait: bites come sooner, and the trophy fish take it. Bait tanks and
 *                        buckets.
 *   FORTUNE TELLER (N)   luck charms: the trophy fish bite more often. A crystal ball, candles,
 *                        velvet on the walls.
 *
 * Like the home shops (village/homeGoods.ts): a counter with the goods on it and a board behind.
 * Point at BUY: it's paid from the wallet (Tidewater's GameState.buy), or the board says how
 * much more you need. The board says what each level does for you, in numbers against what you
 * have (fishing/gear.ts gearEffect), and which trophy fish need it.
 *
 * At the bait shop every bait you've bought (and the frozen shrimp you started with) has a USE
 * button: that's the one that goes on your hook and hangs under the float. At the tackle shop a
 * board by the rack of rods does the same for the rod in your hand and the reel on it. It's only
 * the look: the bites come as fast as your best bait brings them, you cast as far as your best
 * rod and reel in as fast as your best reel.
 */

import { Group, MeshBasicMaterial, SphereGeometry, TorusGeometry, Vector3, type Object3D } from 'three';
import { uiClick, uiDeny, winFanfare } from '../audio/sfx.ts';
import { gearEffect, GEAR_SHOPS, LOOK_TRACKS, shownLevel } from '../fishing/gear.ts';
import { FISH, UPGRADES, type GameState } from '../fishing/tidewater.ts';
import { TROPHY } from '../fishing/trophyFish.ts';
import { InteractivePanel, register } from '../ui/pointer.ts';
import { thumbnail } from '../ui/thumbnail.ts';
import { Lettering, lookFor, mount, type InkName } from '../ui/boards.ts';
import { Batch, M, rng, rounded, stalk, turned, type Kit } from './craft.ts';
import { shopCounter, type Interior } from './interiors.ts';
import { mergeStatic } from './merge.ts';
import { ROLES } from './roles.ts';
import { curtain } from './wares/boutique.ts';
import { bait, charm, hook, hookCard, reel, rod, spool } from './wares/tackle.ts';

const BW = 1200;
const BH = 700;

/** the trophy fish a track's level opens (the ones needing exactly that level) */
function opens(track: string, level: number): string[] {
  return Object.entries(TROPHY)
    .filter(([, t]) => (t.needs as Record<string, number>)[track] === level)
    .map(([id]) => FISH[id].name);
}

/* ── what's on show ─────────────────────────────────────────────────────── */

/** a thing placed at x, y, z, turned by ry (and tipped by rx, rz) */
function put(g: Group, o: Object3D, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, s = 1): void {
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  o.scale.setScalar(s);
  g.add(o);
}

function tackleDecor(k: Kit, room: Interior, top: number, cz: number): Group {
  const g = new Group();
  // the rack by the left wall: a rail top and bottom, a rod of every grade standing in it
  const rack = new Group();
  const b = new Batch();
  const wood = M.wood(k.renderer, 'teak', 0.4);
  b.at(wood, rounded(0.1, 0.05, 1.5, 0.012), 0, 0.95, 0);
  b.at(wood, rounded(0.14, 0.06, 1.5, 0.012), 0, 0.05, 0);
  for (const z of [-0.72, 0.72]) b.at(wood, rounded(0.05, 1.0, 0.05, 0.01), -0.03, 0.5, z);
  for (let i = 0; i < 4; i++) b.at(M.satin(k.renderer, '#2a2a2e'), new TorusGeometry(0.022, 0.006, 5, 12).rotateX(Math.PI / 2), 0.04, 0.95, -0.54 + i * 0.36);
  rack.add(b.group());
  for (let i = 0; i < 4; i++) put(rack, rod(k, i), 0.04, 0.08, -0.54 + i * 0.36, Math.PI / 2, 0, -0.05);
  rack.position.set(-room.w / 2 + 0.16, 0, -0.1);
  g.add(rack);
  // on the counter: the three reels on little stands, spools of line, cards of hooks
  const c = new Batch();
  for (let i = 1; i <= 3; i++) {
    const x = -0.95 + (i - 1) * 0.3;
    c.at(M.wood(k.renderer, 'walnut', 0.3), rounded(0.12, 0.02, 0.1, 0.006), x, top + 0.01, cz);
    c.at(M.metal(k.renderer, '#b8bcc4', 0.25), turned([[0.006, 0], [0.006, 0.12]], 8), x, top + 0.02, cz - 0.03);
    put(g, reel(k, i), x, top + 0.13, cz - 0.03, 0.4, Math.PI, 0);
  }
  for (let i = 1; i <= 4; i++) put(g, spool(k, i), 0.1 + (i - 1) * 0.15, top, cz + 0.05, 0.3);
  for (let i = 0; i < 4; i++) put(g, hookCard(k, i), 0.72 + i * 0.12, top, cz - 0.12, -0.1, -0.15);
  g.add(c.group());
  // a sailfish's bill over the door, the way tackle shops have them
  const bill = new Batch();
  bill.add(M.gloss(k.renderer, '#1a2a5a'), stalk([new Vector3(-0.45, room.h - 0.45, room.d / 2 - 0.05), new Vector3(0.4, room.h - 0.42, room.d / 2 - 0.05), new Vector3(0.45, room.h - 0.43, room.d / 2 - 0.05)], 0.03, 0.003, 8, 8));
  bill.at(M.wood(k.renderer, 'walnut', 0.3), rounded(0.2, 0.14, 0.02, 0.01), -0.45, room.h - 0.45, room.d / 2 - 0.03);
  g.add(bill.group());
  return g;
}

function baitDecor(k: Kit, room: Interior, top: number, cz: number): Group {
  const g = new Group();
  // the live-bait tank by the right wall: blue water in glass, a school of baitfish, a bubbler
  const tank = new Group();
  const b = new Batch();
  b.at(M.metal(k.renderer, '#5a5e66', 0.5), rounded(0.74, 0.62, 0.5, 0.02), 0, 0.31, 0);
  b.at(M.gloss(k.renderer, '#1e6a8a'), rounded(0.68, 0.34, 0.44, 0.01), 0, 0.8, 0);
  b.at(M.glass(k.renderer, '#cfefff', 0.18), rounded(0.72, 0.42, 0.48, 0.008), 0, 0.84, 0);
  b.at(M.metal(k.renderer, '#5a5e66', 0.5), rounded(0.74, 0.03, 0.5, 0.008), 0, 1.06, 0);
  for (let i = 0; i < 10; i++) b.at(M.glass(k.renderer, '#ffffff', 0.5), new SphereGeometry(0.006 + (i % 3) * 0.003, 8, 6), 0.28, 0.66 + i * 0.03, 0.15 + Math.sin(i) * 0.01);
  tank.add(b.group());
  const r = rng(12);
  for (let i = 0; i < 7; i++) {
    const { mesh, uniforms } = k.props.makeFish('silverside');
    uniforms.uSwim.value = 0.05;
    uniforms.uTime.value = r() * 5;
    put(tank, mesh, -0.22 + r() * 0.44, 0.72 + r() * 0.16, -0.14 + r() * 0.28, (r() - 0.5) * 0.8 + Math.PI / 2, 0, 0, 0.1 + r() * 0.03);
  }
  tank.position.set(room.w / 2 - 0.45, 0, 0.35);
  tank.rotation.y = -Math.PI / 2;
  g.add(tank);
  // buckets and a cooler by the counter (each bucket out over its rolled rim and down inside to
  // its floor, clear of the room's floor: a wall with no inside is see-through from above)
  const c = new Batch();
  for (const [x, col] of [[-1.25, '#3f7f55'], [-0.95, '#c23b2e']] as const) {
    c.at(M.gloss(k.renderer, col), turned([[0, 0], [0.12, 0], [0.14, 0.3], [0.146, 0.303], [0.145, 0.31], [0.136, 0.306], [0.134, 0.3], [0.115, 0.03], [0, 0.03]], 20), x, 0, cz + 0.55);
    c.at(M.metal(k.renderer, '#c8ccd0', 0.3), new TorusGeometry(0.14, 0.004, 4, 16, Math.PI), x, 0.3, cz + 0.55, 0, 0.4, 0);
  }
  c.at(M.gloss(k.renderer, '#f4f4f0'), rounded(0.52, 0.3, 0.34, 0.03), 1.0, 0.15, cz + 0.6);
  c.at(M.gloss(k.renderer, '#2f6fa8'), rounded(0.54, 0.05, 0.36, 0.02), 1.0, 0.32, cz + 0.6);
  // a tray of ice along the counter for the bait on show
  c.at(M.metal(k.renderer, '#c8ccd0', 0.25), rounded(1.9, 0.03, 0.3, 0.01), 0, top + 0.015, cz);
  c.at(M.glaze(k.renderer, '#a8c4d0'), rounded(1.84, 0.012, 0.26, 0.006), 0, top + 0.03, cz);
  g.add(c.group());
  for (let lv = 0; lv < 6; lv++) put(g, bait(k, lv), -0.8 + lv * 0.32, top + 0.036, cz, -0.3, 0, 0, lv === 5 ? 0.7 : 1);
  return g;
}

function fortuneDecor(k: Kit, room: Interior, top: number, cz: number): Group {
  const g = new Group();
  const b = new Batch();
  // velvet on the side walls, falling in folds
  const velvet = M.cloth(k.renderer, '#3a1a5a', 'velvet');
  for (const sx of [-1, 1]) b.at(velvet, curtain(room.d - 0.4, room.h - 0.1, 6, 0, -9, 0.06), sx * (room.w / 2 - 0.1), room.h - 0.05, 0, 0, (sx * Math.PI) / 2, 0);
  // her little round table: a floor-length cloth, the crystal ball on a gold stand
  b.at(M.cloth(k.renderer, '#5a3a8a', 'velvet'), turned([[0, 0.76], [0.46, 0.76], [0.5, 0.72], [0.52, 0.4], [0.55, 0.02], [0.54, 0], [0.4, 0]], 32), 1.4, 0, 0.6);
  b.at(M.gold(k.renderer), turned([[0, 0], [0.09, 0], [0.1, 0.02], [0.06, 0.04], [0.07, 0.08], [0.05, 0.09]], 20), 1.4, 0.76, 0.6);
  b.at(M.glass(k.renderer, '#d8c8ff', 0.35), new SphereGeometry(0.13, 28, 20), 1.4, 0.97, 0.6);
  // tarot cards fanned on the cloth
  const r = rng(4);
  for (let i = 0; i < 5; i++) b.at(M.painted(k.renderer, `tarot${i % 3}`, 64, 112, (c, w, h) => {
    c.fillStyle = '#f4ead6';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#8a6a2a';
    c.lineWidth = 4;
    c.strokeRect(4, 4, w - 8, h - 8);
    c.fillStyle = ['#2a3a8a', '#8a1a2a', '#1a6a4a'][i % 3];
    c.beginPath();
    c.arc(w / 2, h / 2, 18, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#e8c060';
    c.beginPath();
    for (let p = 0; p < 10; p++) {
      const a = (p / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = p % 2 ? 6 : 14;
      c.lineTo(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr);
    }
    c.fill();
  }), rounded(0.06, 0.002, 0.1, 0.001, 1), 1.2 + i * 0.05, 0.765 + i * 0.001, 0.85 + (r() - 0.5) * 0.04, 0, -0.5 + i * 0.25, 0);
  // candles on the counter's ends, dripping
  const wax = M.glaze(k.renderer, '#f4ead6');
  for (const x of [-1.05, 1.05]) {
    for (const [dx, h] of [[0, 0.2], [0.06, 0.13], [-0.05, 0.1]] as const) {
      b.at(wax, turned([[0.02, 0], [0.02, h], [0.014, h + 0.005], [0, h + 0.006]], 12), x + dx, top, cz + (dx ? 0.04 : 0));
      b.at(M.satin(k.renderer, '#2a2a2a'), turned([[0.001, 0], [0.001, 0.01]], 4), x + dx, top + h, cz + (dx ? 0.04 : 0));
    }
  }
  // little velvet stands for the charms
  for (let lv = 1; lv <= 4; lv++) {
    const x = -0.6 + (lv - 1) * 0.4;
    b.at(M.cloth(k.renderer, '#2a1040', 'velvet'), rounded(0.2, 0.05, 0.14, 0.02, 2), x, top + 0.025, cz);
    b.at(M.gold(k.renderer), turned([[0.004, 0], [0.004, 0.2], [0, 0.205]], 8), x, top + 0.05, cz - 0.03);
    b.at(M.gold(k.renderer), turned([[0.003, -0.03], [0.003, 0.03]], 6), x, top + 0.24, cz - 0.03, 0, 0, Math.PI / 2);
  }
  g.add(b.group());
  for (let lv = 1; lv <= 4; lv++) put(g, charm(k, lv), -0.6 + (lv - 1) * 0.4, top + 0.17, cz - 0.02, 0, 0, 0, 1.1);
  // the flames and the ball's glow: lit from within
  const flame = new MeshBasicMaterial({ color: 0xffc860, toneMapped: false });
  const glow = new MeshBasicMaterial({ color: 0xb89aff, transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false });
  const lights = new Batch();
  for (const x of [-1.05, 1.05]) for (const [dx, h] of [[0, 0.2], [0.06, 0.13], [-0.05, 0.1]] as const) lights.at(flame, turned([[0, 0], [0.008, 0.01], [0.006, 0.02], [0, 0.034]], 8), x + dx, top + h + 0.008, cz + (dx ? 0.04 : 0));
  lights.at(glow, new SphereGeometry(0.07, 20, 14), 1.4, 0.97, 0.6);
  g.add(lights.group());
  return g;
}

/* ── pictures for the board: each level of each track ────────────────── */

/** the thing a level of a track is, for its picture on the board */
function gearIcon(k: Kit, track: string, level: number): Object3D {
  const g = new Group();
  switch (track) {
    case 'rod':
      put(g, rod(k, level), 0, 0, 0, 0.3, 0, -0.95);
      break;
    case 'reel':
      put(g, reel(k, level), 0, 0, 0, 0.6 + (level >= 2 ? Math.PI / 2 : 0), Math.PI, 0);
      break;
    case 'line':
      put(g, spool(k, level), 0, 0, 0, 0, 1.1);
      break;
    case 'hooks':
      put(g, hook(k, level, 2.4), 0, 0, 0, 0.2);
      break;
    case 'bait':
      put(g, bait(k, level), 0, 0, 0, 0.4);
      break;
    case 'charm':
      put(g, charm(k, level), 0, 0, 0, 0.3);
      break;
  }
  return g;
}

const DECOR: Record<string, (k: Kit, room: Interior, top: number, cz: number) => Group> = { S3: tackleDecor, S2: baitDecor, N: fortuneDecor };

/* ── the counter and the board ─────────────────────────────────────────── */

interface Row {
  track: string;
  level: number;
}

export class GearShopCounter {
  private readonly board: InteractivePanel;
  private readonly letters: Lettering;
  private readonly tracks: string[];
  private note = '';
  private noteColour: InkName = 'dim';
  /** a picture of every level of every track this shop sells */
  private readonly pics = new Map<string, HTMLCanvasElement>();

  constructor(
    private readonly room: Interior,
    private readonly state: GameState,
    kit: Kit,
  ) {
    this.tracks = GEAR_SHOPS[room.name] ?? [];
    const [cx, cz, hx, hz, top] = shopCounter(room.d);
    const display = new Group();
    const counter = new Batch();
    counter.at(M.wood(kit.renderer, 'walnut', 0.45), rounded(hx * 2, top - 0.05, hz * 2, 0.02), cx, (top - 0.05) / 2, cz);
    counter.at(M.wood(kit.renderer, 'mahogany', 0.25), rounded(hx * 2 + 0.08, 0.05, hz * 2 + 0.08, 0.015), cx, top - 0.025, cz);
    for (let i = 0; i < 4; i++) counter.at(M.wood(kit.renderer, 'mahogany', 0.4), rounded(hx * 0.42, top * 0.62, 0.02, 0.008), cx - hx + (hx * 2 * (i + 0.5)) / 4, top * 0.46, cz + hz + 0.005);
    display.add(counter.group());
    display.add(DECOR[room.name]?.(kit, room, top, cz) ?? new Group());
    room.contents.add(mergeStatic(display));
    for (const t of this.tracks) UPGRADES[t].levels.forEach((_, lv) => (lv > 0 || t === 'bait') && this.pics.set(`${t}:${lv}`, thumbnail(kit.renderer, gearIcon(kit, t, lv))));

    this.board = new InteractivePanel([BW, BH], [1.6, (1.6 * BH) / BW]);
    // a board in the shop's own style, framed, hung on the back wall (ui/boards.ts)
    const look = lookFor(room.name);
    this.letters = new Lettering(this.board, look, room.name.charCodeAt(0) + room.name.length);
    mount(this.board, look, { renderer: kit.renderer });
    this.board.mesh.position.set(cx, top + 1.05, -room.d / 2 + 0.02 + look.frame.d);
    room.contents.add(this.board.mesh);
    this.board.paint = () => this.paint();
    this.board.onClick = (id) => this.click(id);
    this.board.repaintOnFonts(() => this.paint());
    register(this.board);
    state.onChange(() => this.paint());
    this.paint();
  }

  /**
   * One row per track (its next level), or, in a one-track shop, one per level (at the bait shop
   * the frozen shrimp you started with too, to go back to).
   */
  private rows(): Row[] {
    const u = this.state.upgrades;
    if (this.tracks.length === 1) {
      const t = this.tracks[0];
      const from = t === 'bait' ? 0 : 1;
      return UPGRADES[t].levels.slice(from).map((_, i) => ({ track: t, level: i + from }));
    }
    return this.tracks.map((t) => ({ track: t, level: Math.min(UPGRADES[t].levels.length - 1, (u[t] | 0) + 1) }));
  }

  click(id: string): void {
    const [act, track, lv] = id.split(':');
    const level = Number(lv);
    if (act === 'use') return this.use(track, level);
    const u = this.state.upgrades;
    const next = UPGRADES[track]?.levels[level];
    if (!next || (u[track] | 0) + 1 !== level) return;
    if (this.state.money < next.cost) {
      uiDeny();
      this.note = `You need $${Math.ceil(next.cost - this.state.money)} more for the ${next.label.toLowerCase()}.`;
      this.noteColour = 'bad';
      this.paint();
      return;
    }
    // new gear goes straight on (a new bait on the hook, a new rod in your hand)
    delete this.state.looks[track];
    // buy() spends, saves and tells everyone (the rod, the wallet, this board)
    if (!this.state.buy(track)) return;
    winFanfare(1);
    const fish = opens(track, level);
    this.note = `Sold! ${gearEffect(UPGRADES[track].levels, track, level, level)} now.` + (fish.length ? ` Needed for ${fish.join(' and ')}.` : '');
    this.noteColour = 'good';
    this.paint();
  }

  /** Put a bait you've bought on the hook. */
  private use(track: string, level: number): void {
    if (track !== 'bait' || !pickLook(this.state, track, level)) return;
    const best = this.state.upgrades.bait | 0;
    const lv = UPGRADES.bait.levels;
    this.note = `On your hook: ${lv[level].label.toLowerCase()}.` + (level < best ? ` The fish bite as fast as for your ${lv[best].label.toLowerCase()}.` : '');
    this.noteColour = 'good';
    this.paint();
  }

  private paint(): void {
    const L = this.letters;
    const role = ROLES[this.room.name];
    const u = this.state.upgrades;
    L.begin();
    L.title(role?.title ?? 'SHOP', 44, 82, 56, 'left', 620);
    const single = this.tracks.length === 1;
    const t0 = this.tracks[0];
    const onHook = t0 === 'bait' ? shownLevel(u, this.state.looks, 'bait') : -1;
    const sub = !single
      ? 'the big ones need big-game tackle'
      : t0 === 'bait'
        ? `on your hook: ${UPGRADES.bait.levels[onHook].label}` + (onHook < (u.bait | 0) ? `  ·  bites as fast as ${UPGRADES.bait.levels[u.bait | 0].label}` : '')
        : `yours now: ${UPGRADES[t0].levels[u[t0] | 0].label}`;
    L.text(sub, 44, 122, 28, 'dim', 'left', 600, 700);
    L.text(`wallet $${Math.floor(this.state.money).toLocaleString('en-US')}`, BW - 44, 80, 34, 'accent', 'right', 700);
    const rows = this.rows();
    const rowH = Math.min(150, 470 / rows.length);
    // (laid out for rows 94 high; more rows than that, and it all shrinks to fit)
    const k = Math.min(1, rowH / 94);
    rows.forEach(({ track, level }, i) => {
      const y = 148 + i * rowH;
      const have = u[track] | 0;
      const lv = UPGRADES[track].levels[level];
      const owned = have >= level;
      const next = have + 1 === level;
      const maxed = !single && have >= UPGRADES[track].levels.length - 1;
      const pic = Math.min(rowH - 12, 124);
      L.thumb(this.pics.get(`${track}:${level}`), 40, y + 4, pic, !owned && !next && !maxed);
      const tx = 40 + pic + 20;
      if (!single) L.text(UPGRADES[track].name.toUpperCase(), tx, y + 22, 24, 'accent', 'left', 600);
      const on = level === onHook;
      L.text(lv.label, tx, y + (single ? 44 * k : 60), Math.round(38 * k), on ? 'ink' : owned || maxed ? 'dim' : next ? 'ink' : 'dim', 'left', 700, 700 - tx);
      const fish = opens(track, level);
      // what it does for you, in numbers, and which trophy fish need it
      const does = [gearEffect(UPGRADES[track].levels, track, level, have), fish.length ? `needed for ${fish.join(', ')}` : ''].filter(Boolean).join('  ·  ');
      L.text(maxed ? 'Fully upgraded' : does, tx, y + (single ? 80 * k : 94), Math.round(24 * k), 'dim', 'left', 500, 750 - tx);
      if (!maxed && lv.cost > 0) L.text(`$${lv.cost.toLocaleString('en-US')}`, 880, y + 58 * k, Math.round(40 * k), owned ? 'dim' : 'accent', 'right', 700);
      const bh = 80 * k;
      if (track === 'bait' && owned) {
        // a bait you've got: put it on the hook
        L.button(`use:${track}:${level}`, on ? 'ON HOOK ✓' : 'USE', 906, y + 14 * k, 250, bh, on ? 'done' : 'go', Math.round((on ? 30 : 36) * k));
        return;
      }
      const afford = this.state.money >= lv.cost;
      const st = owned || maxed ? 'done' : !next ? 'off' : afford ? 'go' : 'off';
      L.button(`buy:${track}:${level}`, owned || maxed ? 'YOURS ✓' : next ? 'BUY' : 'NEXT', 906, y + 14 * k, 250, bh, st, Math.round((owned || maxed || !next ? 30 : 36) * k));
    });
    if (this.note) L.text(this.note, 44, BH - 38, 28, this.noteColour, 'left', 600, BW - 88);
    L.end();
  }
}

/**
 * Show a level of a track you've bought (fishing/gear.ts LOOK_TRACKS): only its look. Your best
 * clears the pick, so the next one you buy is the one you use. Saved and told if it changed.
 */
function pickLook(state: GameState, track: string, level: number): boolean {
  const best = state.upgrades[track] | 0;
  if (!LOOK_TRACKS.includes(track) || !Number.isInteger(level) || level < 0 || level > best) return false;
  const was = shownLevel(state.upgrades, state.looks, track);
  if (level === best) delete state.looks[track];
  else state.looks[track] = level;
  if (level !== was) {
    uiClick();
    state.save();
    state.emit();
  }
  return true;
}

/* ── the tackle shop's rod rack: which rod's in your hand ─────────────── */

const RW = 1240;
const RH = 560;

/** the board's two columns: what each track's pick is called, and what its number is */
const RACK: { track: 'rod' | 'reel'; on: string; stat: (lv: Record<string, unknown>) => string; same: string; you: string }[] = [
  { track: 'rod', on: 'IN HAND ✓', stat: (lv) => `casts ${lv.castM} m`, same: 'casts as far as', you: 'cast as far as' },
  { track: 'reel', on: 'ON ROD ✓', stat: (lv) => `reels in ${lv.reelSpeed} m/s`, same: 'reels in as fast as', you: 'reel in as fast as' },
];

/**
 * A board on the wall by the rack of rods: every rod and every reel, the ones you've bought with
 * a USE button, the ones you fish with ticked. You cast as far as your best rod and reel in as
 * fast as your best reel, whichever you use.
 */
export class RodRackBoard {
  private readonly board: InteractivePanel;
  private readonly letters: Lettering;
  private readonly pics = new Map<string, HTMLCanvasElement>();
  private note = '';

  constructor(
    room: Interior,
    private readonly state: GameState,
    kit: Kit,
  ) {
    for (const { track } of RACK) UPGRADES[track].levels.forEach((_, lv) => this.pics.set(`${track}:${lv}`, thumbnail(kit.renderer, gearIcon(kit, track, lv))));
    const W = 1.0;
    this.board = new InteractivePanel([RW, RH], [W, (W * RH) / RW]);
    const look = lookFor(room.name);
    this.letters = new Lettering(this.board, look, room.name.charCodeAt(0) * 3 + 1);
    mount(this.board, look, { renderer: kit.renderer });
    // on the left wall, between the rack and the door, facing into the room
    this.board.mesh.position.set(-room.w / 2 + 0.02 + look.frame.d, 1.4, Math.min(room.d / 2 - W / 2 - 0.12, 1.15));
    this.board.mesh.rotation.y = Math.PI / 2;
    room.contents.add(this.board.mesh);
    this.board.paint = () => this.paint();
    this.board.onClick = (id) => this.click(id);
    this.board.repaintOnFonts(() => this.paint());
    register(this.board);
    state.onChange(() => this.paint());
    this.paint();
  }

  click(id: string): void {
    const [act, track, lv] = id.split(':');
    const level = Number(lv);
    const col = RACK.find((c) => c.track === track);
    if (act !== 'use' || !col || !pickLook(this.state, track, level)) return;
    const best = this.state.upgrades[track] | 0;
    const lvs = UPGRADES[track].levels;
    this.note = `${track === 'rod' ? 'In your hand' : 'On your rod'}: the ${lvs[level].label.toLowerCase()}.` + (level < best ? ` It ${col.same} your ${lvs[best].label.toLowerCase()}.` : '');
    this.paint();
  }

  private paint(): void {
    const L = this.letters;
    const u = this.state.upgrades;
    L.begin();
    L.title('YOUR ROD AND REEL', 36, 70, 48, 'left', RW - 72);
    const behind = RACK.filter((c) => shownLevel(u, this.state.looks, c.track) < (u[c.track] | 0)).map((c) => `${c.you} your ${UPGRADES[c.track].levels[u[c.track] | 0].label}`);
    L.text(behind.length ? `you still ${behind.join(' and ')}` : 'pick the ones you fish with: only the look changes', 36, 108, 24, 'dim', 'left', 600, RW - 72);
    const rowH = 90;
    RACK.forEach((c, k) => {
      const x0 = 32 + k * 604;
      const best = u[c.track] | 0;
      const shown = shownLevel(u, this.state.looks, c.track);
      UPGRADES[c.track].levels.forEach((lv, i) => {
        const y = 124 + i * rowH;
        const owned = i <= best;
        const on = i === shown;
        L.thumb(this.pics.get(`${c.track}:${i}`), x0, y + 6, rowH - 14, !owned);
        L.text(lv.label, x0 + 94, y + 40, 28, on ? 'ink' : 'dim', 'left', 700, 300);
        L.text(owned ? c.stat(lv) : `$${lv.cost.toLocaleString('en-US')} at the counter`, x0 + 94, y + 70, 22, 'dim', 'left', 500, 300);
        if (owned) L.button(`use:${c.track}:${i}`, on ? c.on : 'USE', x0 + 404, y + 12, 164, 64, on ? 'done' : 'go', on ? 22 : 30);
      });
    });
    if (this.note) L.text(this.note, 36, RH - 36, 20, 'good', 'left', 600, RW - 72);
    L.end();
  }
}
