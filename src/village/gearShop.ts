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
 * much more you need. The board says what each level opens up among the trophy fish.
 */

import { Group, MeshBasicMaterial, SphereGeometry, TorusGeometry, Vector3, type Object3D } from 'three';
import { uiDeny, winFanfare } from '../audio/sfx.ts';
import { GEAR_BLURB, GEAR_SHOPS } from '../fishing/gear.ts';
import { FISH, UPGRADES, type GameState } from '../fishing/tidewater.ts';
import { TROPHY } from '../fishing/trophyFish.ts';
import { font } from '../ui/fonts.ts';
import { INK, roundRect } from '../ui/panel.ts';
import { InteractivePanel, register } from '../ui/pointer.ts';
import { drawThumb, thumbnail } from '../ui/thumbnail.ts';
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
  // buckets and a cooler by the counter
  const c = new Batch();
  for (const [x, col] of [[-1.25, '#3f7f55'], [-0.95, '#c23b2e']] as const) {
    c.at(M.gloss(k.renderer, col), turned([[0, 0], [0.12, 0], [0.14, 0.3], [0.145, 0.305], [0.135, 0.3]], 20), x, 0, cz + 0.55);
    c.at(M.metal(k.renderer, '#c8ccd0', 0.3), new TorusGeometry(0.14, 0.004, 4, 16, Math.PI), x, 0.3, cz + 0.55, 0, 0.4, 0);
  }
  c.at(M.gloss(k.renderer, '#f4f4f0'), rounded(0.52, 0.3, 0.34, 0.03), 1.0, 0.15, cz + 0.6);
  c.at(M.gloss(k.renderer, '#2f6fa8'), rounded(0.54, 0.05, 0.36, 0.02), 1.0, 0.32, cz + 0.6);
  // a tray of ice along the counter for the bait on show
  c.at(M.metal(k.renderer, '#c8ccd0', 0.25), rounded(1.9, 0.03, 0.3, 0.01), 0, top + 0.015, cz);
  c.at(M.glaze(k.renderer, '#a8c4d0'), rounded(1.84, 0.012, 0.26, 0.006), 0, top + 0.03, cz);
  g.add(c.group());
  for (let lv = 0; lv < 5; lv++) put(g, bait(k, lv), -0.76 + lv * 0.38, top + 0.036, cz, -0.3, 0, 0, lv === 4 ? 0.8 : 1);
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
  private readonly tracks: string[];
  private note = '';
  private noteColour: string = INK.dim;
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
    for (const t of this.tracks) UPGRADES[t].levels.forEach((_, lv) => lv > 0 && this.pics.set(`${t}:${lv}`, thumbnail(kit.renderer, gearIcon(kit, t, lv))));

    this.board = new InteractivePanel([BW, BH], [1.6, (1.6 * BH) / BW]);
    this.board.mesh.position.set(cx, top + 1.05, -room.d / 2 + 0.02);
    room.contents.add(this.board.mesh);
    this.board.paint = () => this.paint();
    this.board.onClick = (id) => this.click(id);
    this.board.repaintOnFonts(() => this.paint());
    register(this.board);
    state.onChange(() => this.paint());
    this.paint();
  }

  /** One row per track (its next level), or, in a one-track shop, one per level. */
  private rows(): Row[] {
    const u = this.state.upgrades;
    if (this.tracks.length === 1) {
      const t = this.tracks[0];
      return UPGRADES[t].levels.slice(1).map((_, i) => ({ track: t, level: i + 1 }));
    }
    return this.tracks.map((t) => ({ track: t, level: Math.min(UPGRADES[t].levels.length - 1, (u[t] | 0) + 1) }));
  }

  click(id: string): void {
    const [, track, lv] = id.split(':');
    const level = Number(lv);
    const u = this.state.upgrades;
    const next = UPGRADES[track]?.levels[level];
    if (!next || (u[track] | 0) + 1 !== level) return;
    if (this.state.money < next.cost) {
      uiDeny();
      this.note = `You need $${Math.ceil(next.cost - this.state.money)} more for the ${next.label.toLowerCase()}.`;
      this.noteColour = INK.danger;
      this.paint();
      return;
    }
    // buy() spends, saves and tells everyone (the rod, the wallet, this board)
    if (!this.state.buy(track)) return;
    winFanfare(1);
    const fish = opens(track, level);
    this.note = fish.length ? `Sold! ${fish.join(' and ')} ${fish.length > 1 ? 'are' : 'is'} closer now.` : `Sold! The ${next.label.toLowerCase()} is yours.`;
    this.noteColour = INK.good;
    this.paint();
  }

  private paint(): void {
    const b = this.board;
    const c = b.ctx;
    const role = ROLES[this.room.name];
    const u = this.state.upgrades;
    b.clear();
    roundRect(c, 6, 6, BW - 12, BH - 12, 26);
    c.fillStyle = 'rgba(24, 18, 12, 0.94)';
    c.fill();
    c.lineWidth = 6;
    c.strokeStyle = role?.colour ?? '#b89a72';
    c.stroke();
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    c.font = font(700, 54);
    c.fillStyle = '#f6ecd4';
    c.fillText(role?.title ?? 'SHOP', 40, 76);
    c.font = font(600, 28);
    c.fillStyle = INK.dim;
    const single = this.tracks.length === 1;
    c.fillText(single ? `yours now: ${UPGRADES[this.tracks[0]].levels[u[this.tracks[0]] | 0].label}` : 'the big ones need big-game tackle', 40, 116, 700);
    c.textAlign = 'right';
    c.font = font(700, 36);
    c.fillStyle = INK.amber;
    c.fillText(`wallet $${Math.floor(this.state.money).toLocaleString('en-US')}`, BW - 40, 76);

    const buttons: { id: string; x: number; y: number; w: number; h: number }[] = [];
    const rows = this.rows();
    const rowH = Math.min(150, 470 / rows.length);
    rows.forEach(({ track, level }, i) => {
      const y = 146 + i * rowH;
      const have = u[track] | 0;
      const lv = UPGRADES[track].levels[level];
      const owned = have >= level;
      const next = have + 1 === level;
      const maxed = !single && have >= UPGRADES[track].levels.length - 1;
      const pic = Math.min(rowH - 12, 124);
      drawThumb(c, this.pics.get(`${track}:${level}`), 36, y + 4, pic, !owned && !next && !maxed);
      const tx = 36 + pic + 20;
      c.textAlign = 'left';
      c.font = font(600, 24);
      c.fillStyle = role?.colour ?? INK.dim;
      if (!single) c.fillText(UPGRADES[track].name.toUpperCase(), tx, y + 22);
      c.font = font(700, 38);
      c.fillStyle = owned || maxed ? INK.dim : next ? INK.hot : 'rgba(234, 244, 248, 0.4)';
      c.fillText(lv.label, tx, y + (single ? 44 : 60), 700 - tx);
      c.font = font(500, 24);
      c.fillStyle = INK.dim;
      const fish = opens(track, level);
      const blurb = [GEAR_BLURB[track]?.[level], fish.length ? `opens: ${fish.join(', ')}` : ''].filter(Boolean).join('  ·  ');
      c.fillText(maxed ? 'the best there is' : blurb, tx, y + (single ? 80 : 94), 700 - tx);
      c.textAlign = 'right';
      c.font = font(700, 40);
      c.fillStyle = owned || maxed ? INK.dim : INK.amber;
      if (!maxed) c.fillText(`$${lv.cost.toLocaleString('en-US')}`, 880, y + 58);
      const bx = 910;
      const bw = 250;
      const bh = 80;
      const id = `buy:${track}:${level}`;
      if (next && !maxed) buttons.push({ id, x: bx, y: y + 14, w: bw, h: bh });
      roundRect(c, bx, y + 14, bw, bh, 16);
      const afford = this.state.money >= lv.cost;
      c.fillStyle = owned || maxed ? 'rgba(63, 214, 106, 0.18)' : !next ? 'rgba(255,255,255,0.06)' : b.hover === id ? '#ffc640' : afford ? INK.amber : 'rgba(255,255,255,0.1)';
      c.fill();
      c.textAlign = 'center';
      c.font = font(700, owned || maxed || !next ? 30 : 36);
      c.fillStyle = owned || maxed ? INK.good : !next ? INK.dim : afford ? '#1a1206' : INK.dim;
      c.fillText(owned || maxed ? 'YOURS ✓' : next ? 'BUY' : 'NEXT', bx + bw / 2, y + 66);
    });
    b.buttons = buttons;
    if (this.note) {
      c.textAlign = 'left';
      c.font = font(600, 28);
      c.fillStyle = this.noteColour;
      c.fillText(this.note, 40, BH - 36, BW - 80);
    }
    b.commit();
  }
}
