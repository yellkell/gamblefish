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

import { BoxGeometry, ConeGeometry, Group, Mesh, MeshBasicMaterial, SphereGeometry, TorusGeometry } from 'three';
import { uiDeny, winFanfare } from '../audio/sfx.ts';
import { GEAR_BLURB, GEAR_SHOPS } from '../fishing/gear.ts';
import { FISH, UPGRADES, type GameState } from '../fishing/tidewater.ts';
import { TROPHY } from '../fishing/trophyFish.ts';
import { font } from '../ui/fonts.ts';
import { INK, roundRect } from '../ui/panel.ts';
import { InteractivePanel, register } from '../ui/pointer.ts';
import { drawThumb, thumbnail } from '../ui/thumbnail.ts';
import { ball, box, cyl, glass, mat, type Kit } from './homeGoods.ts';
import { shopCounter, type Interior } from './interiors.ts';
import { mergeStatic } from './merge.ts';
import { ROLES } from './roles.ts';

const BW = 1200;
const BH = 700;

/** the trophy fish a track's level opens (the ones needing exactly that level) */
function opens(track: string, level: number): string[] {
  return Object.entries(TROPHY)
    .filter(([, t]) => (t.needs as Record<string, number>)[track] === level)
    .map(([id]) => FISH[id].name);
}

/* ── what's on show ─────────────────────────────────────────────────────── */

/** a spinning reel: spool, body, handle */
function reel(k: Kit, colour: string): Group {
  const g = new Group();
  g.add(cyl(k, colour, 0.035, 0.035, 0.05, 0, 0.1, 0, 16, 'gloss').rotateX(Math.PI / 2));
  g.add(cyl(k, '#c8ccd0', 0.03, 0.03, 0.03, 0, 0.1, 0.04, 12, 'gloss').rotateX(Math.PI / 2));
  g.add(box(k, '#2a2a2e', 0.02, 0.08, 0.03, 0, 0.05, 0));
  g.add(box(k, '#2a2a2e', 0.1, 0.012, 0.02, 0, 0.01, 0));
  g.add(box(k, '#c8ccd0', 0.012, 0.06, 0.012, 0.045, 0.12, -0.03));
  return g;
}

/** a rod standing in the rack: butt, cork grip, blank, a few guides */
function rod(k: Kit, blank: string, len: number): Group {
  const g = new Group();
  g.add(cyl(k, '#2a2a2e', 0.016, 0.018, 0.12, 0, 0.06, 0, 8));
  g.add(cyl(k, '#c8a070', 0.015, 0.015, 0.32, 0, 0.28, 0, 8));
  g.add(cyl(k, blank, 0.004, 0.011, len - 0.44, 0, 0.44 + (len - 0.44) / 2, 0, 6, 'gloss'));
  for (let i = 1; i <= 4; i++) g.add(new Mesh(new TorusGeometry(0.012 - i * 0.0015, 0.002, 4, 10), mat(k, 'gloss', '#c8ccd0')).translateY(0.44 + ((len - 0.44) * i) / 5).translateZ(0.014));
  return g;
}

function tackleDecor(k: Kit, room: Interior, top: number, cz: number): Group {
  const g = new Group();
  // the rack by the left wall: a rail and four rods, the big-game one last
  const rack = new Group();
  rack.add(box(k, '#6a4428', 0.08, 0.06, 1.3, 0, 0.9, 0));
  rack.add(box(k, '#6a4428', 0.08, 0.04, 1.3, 0, 0.08, 0));
  const rods: [string, number][] = [['#8a6a48', 1.9], ['#2a3a2a', 2.1], ['#c23b2e', 2.4], ['#101a3a', 2.3]];
  rods.forEach(([c, L], i) => {
    const r = rod(k, c, L);
    r.position.set(0.02, 0.02, -0.5 + i * 0.33);
    r.rotation.z = -0.06;
    rack.add(r);
  });
  rack.position.set(-room.w / 2 + 0.2, 0, -0.1);
  g.add(rack);
  // on the counter: three reels and spools of line
  ['#4a4e56', '#c8a040', '#101a3a'].forEach((c, i) => {
    const r = reel(k, c);
    r.position.set(-0.8 + i * 0.35, top, cz);
    r.rotation.y = 0.5;
    g.add(r);
  });
  ['#e8e0c0', '#3fd66a', '#ff8a3a', '#3fa0ff'].forEach((c, i) => g.add(cyl(k, c, 0.045, 0.045, 0.06, 0.35 + i * 0.16, top + 0.03, cz + 0.05, 14, 'gloss')));
  // a trophy sailfish's bill over the door, the way tackle shops have them
  g.add(cyl(k, '#1a2a5a', 0.004, 0.03, 0.9, 0, room.h - 0.5, room.d / 2 - 0.05, 8, 'gloss').rotateZ(Math.PI / 2));
  return g;
}

function baitDecor(k: Kit, room: Interior, top: number, cz: number): Group {
  const g = new Group();
  // the live-bait tank by the right wall: blue water in glass, a school of silver baitfish
  const tank = new Group();
  tank.add(box(k, '#4a4e56', 0.7, 0.7, 0.5, 0, 0.35, 0));
  const water = new Mesh(new BoxGeometry(0.66, 0.36, 0.46), mat(k, 'gloss', '#1e6a8a'));
  water.position.y = 0.88;
  tank.add(water);
  const pane = new Mesh(new BoxGeometry(0.7, 0.42, 0.5), glass());
  pane.position.y = 0.91;
  tank.add(pane);
  for (let i = 0; i < 9; i++) {
    const f = new Mesh(new ConeGeometry(0.018, 0.09, 5).rotateZ(Math.PI / 2), mat(k, 'gloss', '#d8e0e4'));
    f.position.set(-0.24 + (i % 3) * 0.22 + (i % 2) * 0.04, 0.8 + Math.floor(i / 3) * 0.08, -0.12 + ((i * 7) % 5) * 0.06);
    tank.add(f);
  }
  tank.position.set(room.w / 2 - 0.45, 0, 0.35);
  tank.rotation.y = -Math.PI / 2;
  g.add(tank);
  // buckets and a cooler by the counter
  for (const [x, c] of [[-1.25, '#3f7f55'], [-0.95, '#c23b2e']] as const) {
    g.add(cyl(k, c, 0.14, 0.12, 0.3, x, 0.15, cz + 0.55, 14));
    g.add(new Mesh(new TorusGeometry(0.13, 0.006, 4, 16, Math.PI), mat(k, 'gloss', '#c8ccd0')).translateX(x).translateY(0.3).translateZ(cz + 0.55));
  }
  g.add(box(k, '#f4f4f0', 0.5, 0.34, 0.34, 1.0, 0.17, cz + 0.6));
  // on the counter: tubs of pilchards and squid, and the glow rig
  ['#b8c4c8', '#e8c8c8', '#3fd6c6'].forEach((c, i) => {
    g.add(cyl(k, '#f4f4f0', 0.09, 0.08, 0.1, -0.6 + i * 0.6, top + 0.05, cz, 14));
    g.add(cyl(k, c, 0.08, 0.08, 0.02, -0.6 + i * 0.6, top + 0.1, cz, 14, 'gloss'));
  });
  return g;
}

function fortuneDecor(k: Kit, room: Interior, top: number, cz: number): Group {
  const g = new Group();
  // velvet on the side walls, a little table with the crystal ball, candles on the counter
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 6; i++) g.add(cyl(k, i % 2 ? '#3a1a5a' : '#4a2a6a', 0.08, 0.11, room.h - 0.2, sx * (room.w / 2 - 0.08), (room.h - 0.2) / 2, -1.2 + i * 0.2, 10));
  }
  const t = new Group();
  t.add(cyl(k, '#2a1a3a', 0.45, 0.45, 0.04, 0, 0.72, 0, 24, 'gloss'));
  t.add(cyl(k, '#2a1a3a', 0.05, 0.08, 0.7, 0, 0.35, 0, 10));
  t.add(cyl(k, '#5a3a8a', 0.47, 0.5, 0.3, 0, 0.6, 0, 24)); // the cloth
  t.add(cyl(k, '', 0.08, 0.1, 0.06, 0, 0.77, 0, 16, 'gold'));
  const orb = new Mesh(new SphereGeometry(0.13, 24, 16), new MeshBasicMaterial({ color: 0xb89aff, transparent: true, opacity: 0.8, toneMapped: false }));
  orb.position.y = 0.92;
  t.add(orb);
  t.add(new Mesh(new SphereGeometry(0.05, 12, 8), new MeshBasicMaterial({ color: 0xffffff, toneMapped: false })).translateY(0.92));
  t.position.set(1.4, 0, 0.6);
  g.add(t);
  // on the counter: the charms themselves — a shark's tooth, a black pearl, a golden comb
  const tooth = new Mesh(new ConeGeometry(0.03, 0.1, 3), mat(k, 'gloss', '#f4f0e0'));
  tooth.position.set(-0.6, top + 0.05, cz);
  g.add(tooth);
  g.add(ball(k, '#14141c', 0.04, 0, top + 0.04, cz, 'gloss'));
  const comb = new Group();
  comb.add(box(k, '', 0.16, 0.03, 0.01, 0, 0.06, 0, 'gold'));
  for (let i = 0; i < 9; i++) comb.add(box(k, '', 0.006, 0.05, 0.006, -0.07 + i * 0.0175, 0.025, 0, 'gold'));
  comb.position.set(0.6, top, cz);
  g.add(comb);
  for (const x of [-1.05, 1.05]) {
    g.add(cyl(k, '#f4ead6', 0.02, 0.02, 0.18, x, top + 0.09, cz, 8));
    g.add(new Mesh(new SphereGeometry(0.02, 8, 6), new MeshBasicMaterial({ color: 0xffc860, toneMapped: false })).translateX(x).translateY(top + 0.2).translateZ(cz));
  }
  return g;
}

/* ── pictures for the board: each level of each track ────────────────── */

/** a little fish: a silver body with a dark back, and a tail fin */
function baitfish(k: Kit, colour: string, len: number): Group {
  const g = new Group();
  g.add(new Mesh(new SphereGeometry(len * 0.5, 12, 8).scale(1, 0.32, 0.18), mat(k, 'satin', colour)));
  const back = new Mesh(new SphereGeometry(len * 0.47, 12, 8).scale(1, 0.18, 0.19), mat(k, 'satin', '#1e3a5a'));
  back.position.y = len * 0.07;
  g.add(back);
  const tail = new Mesh(new ConeGeometry(len * 0.16, len * 0.28, 4).rotateZ(-Math.PI / 2).scale(1, 1, 0.2), mat(k, 'gloss', colour));
  tail.position.x = -len * 0.58;
  g.add(tail);
  g.add(ball(k, '#101014', len * 0.04, len * 0.36, len * 0.04, len * 0.07, 'gloss'));
  return g;
}

/** a squid: mantle, fins, tentacles */
function squid(k: Kit, colour: string): Group {
  const g = new Group();
  g.add(new Mesh(new ConeGeometry(0.05, 0.22, 12).rotateZ(Math.PI / 2), mat(k, 'gloss', colour)).translateX(0.1));
  g.add(new Mesh(new BoxGeometry(0.07, 0.004, 0.12), mat(k, 'gloss', colour)).translateX(0.19));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const t = cyl(k, colour, 0.006, 0.003, 0.16, -0.08, Math.cos(a) * 0.02, Math.sin(a) * 0.02, 5).rotateZ(Math.PI / 2 + Math.cos(a) * 0.15);
    g.add(t);
  }
  return g;
}

const ROD_LOOK: [string, number][] = [['#8a6a48', 1.9], ['#2a3a2a', 2.1], ['#c23b2e', 2.4], ['#101a3a', 2.3]];
const REEL_LOOK = ['#4a4e56', '#c8a040', '#101a3a', '#c23b2e'];
const LINE_LOOK = ['#e8e0c0', '#f4f4f0', '#3fd66a', '#ff8a3a', '#3fa0ff'];

/** the thing a level of a track is, for its picture on the board */
function gearIcon(k: Kit, track: string, level: number): Group {
  const g = new Group();
  switch (track) {
    case 'rod': {
      const [c, L] = ROD_LOOK[Math.min(level, ROD_LOOK.length - 1)];
      const r = rod(k, c, L);
      const rl = reel(k, REEL_LOOK[Math.min(level, REEL_LOOK.length - 1)]);
      rl.position.set(0, 0.34, 0.03);
      rl.rotation.set(Math.PI, 0, 0);
      r.add(rl);
      r.rotation.z = -0.95;
      g.add(r);
      break;
    }
    case 'reel': {
      const r = reel(k, REEL_LOOK[Math.min(level, REEL_LOOK.length - 1)]);
      r.scale.setScalar(1 + level * 0.12);
      r.rotation.y = 0.6;
      g.add(r);
      break;
    }
    case 'line': {
      const c = LINE_LOOK[Math.min(level, LINE_LOOK.length - 1)];
      const spool = new Group();
      spool.add(cyl(k, '#2a2a2e', 0.075, 0.075, 0.012, 0, 0.044, 0, 20, 'gloss'));
      spool.add(cyl(k, '#2a2a2e', 0.075, 0.075, 0.012, 0, -0.044, 0, 20, 'gloss'));
      spool.add(cyl(k, c, 0.06 + level * 0.003, 0.06 + level * 0.003, 0.078, 0, 0, 0, 20, 'gloss'));
      spool.rotation.x = 1.1;
      g.add(spool);
      break;
    }
    case 'bait': {
      if (level === 0) {
        // a frozen shrimp, curled
        for (let i = 0; i < 6; i++) g.add(ball(k, '#f0a890', 0.035 - i * 0.004, Math.cos(i * 0.5) * 0.06, Math.sin(i * 0.5) * 0.06, 0, 'gloss'));
      } else if (level === 1) {
        for (let i = 0; i < 3; i++) g.add(baitfish(k, '#8a9cac', 0.2).translateY(i * 0.05).translateX(i * 0.03));
      } else {
        g.add(squid(k, level === 3 ? '#e8d0e8' : '#f0d8d0'));
        if (level === 3) {
          const glow = new Mesh(new BoxGeometry(0.012, 0.012, 0.1), new MeshBasicMaterial({ color: 0x5aff9a, toneMapped: false }));
          glow.position.set(0.02, 0.06, 0);
          glow.rotation.y = 1.2;
          g.add(glow);
        }
      }
      break;
    }
    case 'charm': {
      if (level === 1) {
        g.add(new Mesh(new TorusGeometry(0.08, 0.004, 4, 24), mat(k, 'satin', '#6a4a2a')));
        g.add(new Mesh(new ConeGeometry(0.02, 0.07, 3).rotateX(Math.PI), mat(k, 'gloss', '#f4f0e0')).translateY(-0.1));
      } else if (level === 2) {
        g.add(ball(k, '#14141c', 0.05, 0, 0, 0, 'gloss'));
        g.add(new Mesh(new TorusGeometry(0.052, 0.006, 6, 24).rotateX(Math.PI / 2), mat(k, 'gold', '')));
        g.add(new Mesh(new TorusGeometry(0.012, 0.004, 6, 12), mat(k, 'gold', '')).translateY(0.062));
      } else if (level === 3) {
        g.add(box(k, '', 0.16, 0.03, 0.01, 0, 0.06, 0, 'gold'));
        for (let i = 0; i < 9; i++) g.add(box(k, '', 0.006, 0.06, 0.006, -0.07 + i * 0.0175, 0.02, 0, 'gold'));
        g.add(ball(k, '#e8f6ff', 0.01, 0, 0.078, 0.006, 'gloss'));
      }
      break;
    }
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
    display.add(box(kit, '#6a4428', hx * 2, top, hz * 2, cx, top / 2, cz));
    display.add(box(kit, '#4a2e1a', hx * 2 + 0.08, 0.05, hz * 2 + 0.08, cx, top + 0.025, cz, 'gloss'));
    display.add(DECOR[room.name]?.(kit, room, top + 0.05, cz) ?? new Group());
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
