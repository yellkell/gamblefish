/**
 * The blackjack table in The Card Shark.
 *
 *  BET    Point at the chips on the board behind the dealer: each one goes into your betting
 *         circle as a real chip (the stake leaves your wallet quietly). DEAL (or REBET).
 *  PLAY   Cards slide off the shoe one by one, the dealer's second face down. Your total floats
 *         over your hand. HIT, STAND, DOUBLE, SPLIT; HINT tells you what basic strategy says.
 *  DEALER The hole card turns over and the dealer draws to 17, a card at a time.
 *  PAY    Losing chips are raked away. A winner's pay is stacked beside it chip by chip, then it
 *         all slides over to you, with the cash chime and the wrist counters. The win goes up in
 *         light, confetti and gold over your hand, bigger for a blackjack (casino/celebrate.ts).
 *         Then the cards are swept to the discard tray.
 *
 * Rules (and the shuffle) are casino/blackjack.ts; the table only shows what the rules decide.
 */

import {
  CanvasTexture,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  PlaneGeometry,
  BoxGeometry,
  Shape,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector3,
  type Camera,
} from 'three';
import type { World } from '@iwsdk/core';
import { cardFlip, cardSlide, chipClack, chipRun, uiDeny, winFanfare } from '../audio/sfx.ts';
import type { GameState } from '../fishing/tidewater.ts';
import { font } from '../ui/fonts.ts';
import { INK, roundRect } from '../ui/panel.ts';
import { InteractivePanel, register } from '../ui/pointer.ts';
import type { Interior } from '../village/interiors.ts';
import { basic, isNatural, Round, Shoe, total, type Action, type Card, type Outcome } from './blackjack.ts';
import { CardMesh } from './cards.ts';
import { Celebration, type Tier } from './celebrate.ts';
import { breakdown, CHIP_COLOUR } from './chips.ts';
import { payOut, refund, stake } from './money.ts';

const FELT_Y = 0.903;
const EDGE_Z = -0.35; // the straight (dealer's) edge; the table's arc swings toward you from it
const SHOE = new Vector3(0.62, 0.99, -0.2);
const DISCARD = new Vector3(-0.64, 0.95, -0.2);
const GAP = 0.42; // seconds between cards
const TABLE_R = 1.02;
/** When a winning hand's pay starts landing (after settling), and when the stacks slide to you. */
const PAY_AT = 0.3;
const SLIDE_AT = 1.7;

export interface BlackjackOptions {
  chips: number[];
  maxBet: number;
  /** the table's spot in the room's floor frame (the dealer's edge faces −z) */
  at: [number, number];
}

interface Live {
  mesh: CardMesh;
  age: number; // seconds since it left the shoe
  faceDown: boolean;
  flip: number; // shown flip, 0 face up … 1 face down
  pos: Vector3;
  leaving: number; // >0 once swept
}

export class BlackjackTable {
  readonly group = new Group();
  private readonly board: InteractivePanel;
  private readonly chips: InstancedMesh;
  private readonly labels: Label[] = [];
  private readonly dealerLabel: Label;
  private readonly shoe = new Shoe(6);
  private round: Round | null = null;
  private readonly live = new Map<Card, Live>();
  private readonly party: Celebration;

  private phase: 'betting' | 'dealing' | 'player' | 'settled' = 'betting';
  private bet = 0;
  private lastBet = 0;
  private shown = 0;
  private eventT = 0;
  private revealed = false;
  private results: { outcome: Outcome; returned: number }[] = [];
  private settleT = 0;
  private status = 'Place your bet';

  constructor(
    private readonly room: Interior,
    private readonly state: GameState,
    world: World,
    private readonly opts: BlackjackOptions,
  ) {
    const g = this.group;
    g.position.set(opts.at[0], 0, opts.at[1]);
    room.contents.add(g);
    // confetti lands on the felt over the table's half-round, on the floor past it
    const onTable = (x: number, z: number): number => (z >= EDGE_Z && x * x + (z - EDGE_Z) ** 2 < TABLE_R * TABLE_R ? FELT_Y + 0.002 : 0);
    this.party = new Celebration(g, onTable, () => world.renderer.xr.getSession());

    // the table: a half-round slab on a pedestal, a padded rail round the curve
    const wood = new MeshLambertMaterial({ color: 0x5a3a22 });
    const slab = new Shape();
    slab.moveTo(TABLE_R, EDGE_Z);
    slab.absarc(0, EDGE_Z, TABLE_R, 0, Math.PI, false);
    slab.lineTo(TABLE_R, EDGE_Z);
    const top = new Mesh(new ExtrudeGeometry(slab, { depth: 0.06, bevelEnabled: false }).rotateX(Math.PI / 2), wood);
    top.position.y = 0.9;
    const ped = new Mesh(new CylinderGeometry(0.14, 0.24, 0.84, 12), wood);
    ped.position.set(0, 0.42, 0.05);
    const rail = new Mesh(new TorusGeometry(1.0, 0.04, 10, 64, Math.PI).rotateX(Math.PI / 2), new MeshPhongMaterial({ color: 0x3a1e12, shininess: 40 }));
    rail.position.set(0, 0.925, EDGE_Z);
    g.add(top, ped, rail);

    // the felt with its printing
    const felt = new Mesh(new PlaneGeometry(2.0, 1.0).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: feltTexture(), alphaTest: 0.5 }));
    felt.position.set(0, FELT_Y, EDGE_Z + 0.5);
    g.add(felt);

    // the shoe and the discard tray
    const shoe = new Mesh(new BoxGeometry(0.14, 0.09, 0.26), new MeshPhongMaterial({ color: 0x1a1a22, shininess: 60 }));
    shoe.position.set(SHOE.x, 0.95, SHOE.z - 0.1);
    shoe.rotation.y = 0.5;
    const tray = new Mesh(new BoxGeometry(0.13, 0.05, 0.17), new MeshPhongMaterial({ color: 0x8a1a22, shininess: 40, transparent: true, opacity: 0.8 }));
    tray.position.set(DISCARD.x, 0.925, DISCARD.z);
    tray.rotation.y = -0.5;
    g.add(shoe, tray);

    // chips
    this.chips = new InstancedMesh(new CylinderGeometry(0.024, 0.024, 0.006, 20), new MeshLambertMaterial({ color: 0xffffff }), 160);
    this.chips.count = 0;
    this.chips.frustumCulled = false;
    g.add(this.chips);

    // totals floating over the hands
    for (let h = 0; h < 2; h++) {
      const l = new Label();
      g.add(l.sprite);
      this.labels.push(l);
    }
    this.dealerLabel = new Label();
    this.dealerLabel.sprite.position.set(0, 1.08, -0.12);
    g.add(this.dealerLabel.sprite);

    // the board behind the dealer
    this.board = new InteractivePanel([1000, 420], [1.2, 0.504]);
    this.board.mesh.position.set(0, 1.55, -0.85);
    g.add(this.board.mesh);
    this.board.paint = () => this.paintBoard();
    this.board.onClick = (id) => this.button(id);
    register(this.board);
    this.paintBoard();
    this.board.repaintOnFonts(() => this.paintBoard());
    state.onChange(() => this.paintBoard());
    window.addEventListener('pagehide', () => this.walkAway());
  }

  /* ── the player's buttons ───────────────────────────────────────── */

  private button(id: string): void {
    if (id.startsWith('chip')) {
      if (this.phase !== 'betting') return;
      const v = Number(id.slice(4));
      if (this.bet + v > this.opts.maxBet) return this.deny(`Table limit $${this.opts.maxBet}`);
      if (!stake(this.state, v)) return this.deny("You can't cover that chip");
      this.bet += v;
      chipClack();
    } else if (id === 'clear') {
      refund(this.state, this.bet);
      this.bet = 0;
    } else if (id === 'deal') {
      if (!this.bet) {
        if (!this.lastBet || !stake(this.state, this.lastBet)) return this.deny('Put a chip in the circle');
        this.bet = this.lastBet;
        chipClack();
      }
      this.deal();
    } else if (id === 'hint' && this.round && this.phase === 'player') {
      this.status = `The book says: ${basic(this.round).toUpperCase()}`;
    } else if (['hit', 'stand', 'double', 'split'].includes(id)) this.act(id as Action);
    this.paintBoard();
  }

  private deny(why: string): void {
    this.status = why;
    uiDeny();
    this.paintBoard();
  }

  private deal(): void {
    if (this.shoe.due) this.shoe.shuffle();
    this.round = new Round(this.shoe);
    this.round.start(this.bet);
    this.lastBet = this.bet;
    this.bet = 0;
    this.shown = 0;
    this.eventT = GAP;
    this.revealed = false;
    this.results = [];
    this.phase = 'dealing';
    this.status = 'Dealing…';
  }

  private act(a: Action): void {
    const r = this.round;
    if (!r || this.phase !== 'player' || !r.can(a)) return;
    const extra = r.extra(a);
    if (extra && !stake(this.state, extra)) return this.deny(`You need $${extra} more to ${a}`);
    if (extra) chipClack();
    r.act(a);
    this.phase = 'dealing';
    this.eventT = GAP - 0.12;
    this.status = a === 'stand' ? 'Stand' : a === 'double' ? 'Double down — one card' : a === 'split' ? 'Split' : 'Hit';
  }

  /** Leaving mid-hand: you stand on everything, the dealer plays it out, and you're paid what's due. */
  private walkAway(): void {
    if (this.phase === 'betting') refund(this.state, this.bet);
    else if (this.round && this.phase !== 'settled') {
      while (this.round.phase === 'player') this.round.act('stand');
      refund(this.state, this.round.settle().reduce((a, s) => a + s.returned, 0));
    }
    this.bet = 0;
    this.round = null;
  }

  /* ── frame ──────────────────────────────────────────────────────── */

  update(dt: number, camera: Camera): void {
    const e = camera.matrixWorld.elements;
    const inside = this.room.inside(e[12], e[14]);
    const r = this.round;
    if (r && this.phase === 'dealing') {
      this.eventT += dt;
      if (this.eventT >= GAP) {
        const next = r.dealt[this.shown];
        if (next && next.to === 'dealer' && this.shown > 3 && !this.revealed) this.reveal(inside);
        else if (next) {
          this.spawn(next.card, next.faceDown, inside);
          this.shown++;
          this.eventT = 0;
        } else if (r.phase === 'done') {
          if (!this.revealed) this.reveal(inside);
          else this.settle();
        } else {
          this.phase = 'player';
          this.status = this.handStatus();
          this.paintBoard();
        }
      }
    }
    if (this.phase === 'settled') {
      this.settleT += dt;
      if (this.settleT > 3.2 && this.round) {
        for (const l of this.live.values()) if (!l.leaving) l.leaving = 0.001;
        this.round = null;
      }
      if (this.settleT > 3.9) {
        this.phase = 'betting';
        this.status = this.shoe.due ? 'Shuffling up — place your bet' : 'Place your bet';
        this.paintBoard();
      }
    }
    this.layoutCards(dt);
    this.layoutChips();
    this.updateLabels();
    this.party.update(dt, camera);
  }

  private spawn(card: Card, faceDown: boolean, loud: boolean): void {
    const mesh = new CardMesh(card);
    this.group.add(mesh.group);
    this.live.set(card, { mesh, age: 0, faceDown, flip: 1, pos: SHOE.clone(), leaving: 0 });
    if (loud) cardSlide();
  }

  private reveal(loud: boolean): void {
    this.revealed = true;
    this.eventT = 0;
    const hole = this.round?.dealer[1];
    const l = hole && this.live.get(hole);
    if (l) l.faceDown = false;
    if (loud) cardFlip();
  }

  private settle(): void {
    const r = this.round!;
    this.results = r.settle();
    const back = this.results.reduce((a, s) => a + s.returned, 0);
    const staked = r.hands.reduce((a, h) => a + h.bet, 0);
    if (back > 0) payOut(this.state, back);
    const words: Record<Outcome, string> = { blackjack: 'Blackjack!', win: 'You win', push: 'Push', lose: 'Dealer wins', bust: 'Bust' };
    const net = back - staked;
    this.status = this.results.map((s) => words[s.outcome]).join(' · ') + (net > 0 ? ` — +$${net}` : net < 0 ? ` — −$${-net}` : '');
    const blackjack = this.results.some((s) => s.outcome === 'blackjack');
    if (net > 0) {
      winFanfare(blackjack ? 8 : 2);
      // the party goes up over the best hand; its pay lands chip by chip (layoutChips)
      let best = 0;
      this.results.forEach((s, k) => {
        if (s.returned - r.hands[k].bet > this.results[best].returned - r.hands[best].bet) best = k;
      });
      const tier: Tier = blackjack ? 3 : net >= staked ? 2 : 1;
      const x = this.handX(best);
      this.party.win({
        at: new Vector3(x, FELT_Y + 0.12, 0.42),
        tier,
        amount: net,
        banner: blackjack ? 'BLACKJACK!' : undefined,
        bannerAt: new Vector3(0, 1.36, -0.05),
      });
    }
    this.results.forEach((s, k) => {
      const pay = s.returned - r.hands[k].bet;
      if (pay > 0) chipRun(breakdown(pay).length, this.payGap(pay), PAY_AT + k * 0.35);
    });
    this.phase = 'settled';
    this.settleT = 0;
    this.paintBoard();
  }

  private handStatus(): string {
    const r = this.round!;
    const h = r.hand;
    const t = total(h.cards);
    const which = r.hands.length > 1 ? `Hand ${r.active + 1}: ` : '';
    return `${which}${t.soft && t.total < 21 ? 'soft ' : ''}${t.total} — hit or stand?`;
  }

  /* ── layout ─────────────────────────────────────────────────────── */

  private handX(k: number): number {
    const n = this.round?.hands.length ?? 1;
    return (k - (n - 1) / 2) * 0.36;
  }

  /** Seconds between pay chips landing: a quick run, however tall the stack. */
  private payGap(amount: number): number {
    return Math.min(0.08, 0.7 / Math.max(1, breakdown(amount).length));
  }

  /** Where each card on the table should be, from the round's hands. */
  private targets(): Map<Card, Vector3> {
    const out = new Map<Card, Vector3>();
    const r = this.round;
    if (!r) return out;
    const n = r.dealer.length;
    r.dealer.forEach((c, i) => out.set(c, new Vector3((i - (n - 1) / 2) * 0.1, FELT_Y + 0.002 + i * 0.0008, -0.12)));
    const m = r.hands.length;
    r.hands.forEach((h, k) => {
      const hx = (k - (m - 1) / 2) * 0.36;
      h.cards.forEach((c, i) => out.set(c, new Vector3(hx - 0.03 + i * 0.042, FELT_Y + 0.002 + i * 0.0008, 0.3 - i * 0.012)));
    });
    return out;
  }

  private layoutCards(dt: number): void {
    const want = this.targets();
    const k = 1 - Math.exp(-dt * 14);
    for (const [card, l] of this.live) {
      l.age += dt;
      const g = l.mesh.group;
      if (l.leaving) {
        // swept: off to the discard tray, face down, and gone
        l.leaving += dt;
        l.faceDown = true;
        l.pos.lerp(DISCARD, 1 - Math.exp(-dt * 9));
        if (l.leaving > 0.7) {
          this.group.remove(g);
          this.live.delete(card);
          continue;
        }
      } else {
        const t = want.get(card);
        if (t) {
          if (l.age < 0.3) {
            // off the shoe: a low arc across the felt
            const s = l.age / 0.3;
            const e = 1 - (1 - s) * (1 - s);
            l.pos.lerpVectors(SHOE, t, e);
            l.pos.y += Math.sin(s * Math.PI) * 0.04;
          } else l.pos.lerp(t, k);
        }
      }
      const flipTo = l.faceDown ? 1 : 0;
      l.flip += (flipTo - l.flip) * (1 - Math.exp(-dt * (l.age < 0.3 ? 20 : 11)));
      l.mesh.flip = l.flip;
      g.position.copy(l.pos);
      g.position.y += Math.sin(l.flip * Math.PI) * 0.05;
    }
  }

  /** Chips: your bet in its circle (doubled beside it), then the rake or the payout. */
  private layoutChips(): void {
    const m = new Matrix4();
    const c = new Color();
    let n = 0;
    // a stack of `amount`; with `dropAt`, its chips land one by one from then on, each falling
    // onto the one before
    const put = (amount: number, x: number, z: number, dropAt = -1, size = 1): void => {
      let y = FELT_Y + 0.003;
      const gap = this.payGap(amount);
      breakdown(amount).forEach((v, i) => {
        if (n >= 160) return;
        let lift = 0;
        if (dropAt >= 0) {
          const t = this.settleT - dropAt - i * gap;
          if (t < 0) return;
          lift = Math.max(0, 0.09 * (1 - (t / 0.12) ** 2));
        }
        m.makeScale(size, size, size).setPosition(x + Math.sin(n * 2.3) * 0.002, y + lift, z + Math.cos(n * 1.7) * 0.002);
        this.chips.setMatrixAt(n, m);
        this.chips.setColorAt(n++, c.setHex(CHIP_COLOUR[v] ?? 0xffffff));
        y += 0.0065 * size;
      });
    };
    const r = this.round;
    if (this.phase === 'betting') put(this.bet, 0, 0.5);
    else if (r) {
      const hands = r.hands.length;
      const s = this.phase === 'settled' ? Math.min(1, Math.max(0, (this.settleT - SLIDE_AT) / 0.6)) : 0;
      const slide = s * s * (3 - 2 * s);
      r.hands.forEach((h, k) => {
        const x = (k - (hands - 1) / 2) * 0.36;
        const res = this.results[k];
        const lost = res && res.returned === 0;
        // the rake takes losers back past the dealer; winners come to the rail in front of you
        // and shrink away there (into your wallet)
        const dz = lost ? -0.9 * slide : 0.1 * slide;
        if (slide >= 1) return;
        const size = lost ? 1 : Math.max(0.001, 1 - Math.max(0, (s - 0.6) / 0.4));
        const base = h.doubled ? h.bet / 2 : h.bet;
        put(base, x, 0.5 + dz, -1, size);
        if (h.doubled) put(base, x + 0.06, 0.5 + dz, -1, size);
        if (res && res.returned > h.bet) put(res.returned - h.bet, x - 0.06, 0.5 + dz, PAY_AT + k * 0.35, size);
      });
    }
    this.chips.count = n;
    this.chips.instanceMatrix.needsUpdate = true;
    if (this.chips.instanceColor) this.chips.instanceColor.needsUpdate = true;
  }

  private updateLabels(): void {
    const r = this.round;
    const shownCards = (cards: Card[]): Card[] => cards.filter((c) => this.live.has(c));
    this.labels.forEach((l, k) => {
      const h = r?.hands[k];
      if (!h) return l.set('');
      const cards = shownCards(h.cards);
      if (!cards.length) return l.set('');
      const t = total(cards);
      const res = this.results[k];
      const text = res ? { blackjack: 'BLACKJACK', win: 'WIN', push: 'PUSH', lose: 'LOSE', bust: 'BUST' }[res.outcome] : t.total > 21 ? 'BUST' : !h.split && isNatural(cards) ? 'BLACKJACK' : `${t.soft && t.total < 21 ? 'soft ' : ''}${t.total}`;
      const colour = res ? (res.returned > h.bet ? INK.good : res.returned === h.bet ? INK.hot : INK.danger) : t.total > 21 ? INK.danger : r && r.active === k && this.phase === 'player' ? INK.amber : INK.hot;
      l.set(text, colour);
      l.sprite.position.set(this.handX(k) + 0.02, 1.02, 0.34);
      // a winning hand's label throbs while it's paid
      const throb = res && res.returned > h.bet && this.phase === 'settled' ? 1.12 + 0.08 * Math.sin(this.settleT * 9) : 1;
      l.sprite.scale.set(0.24 * throb, 0.06 * throb, 1);
    });
    if (!r) return this.dealerLabel.set('');
    const up = this.revealed ? shownCards(r.dealer) : shownCards(r.dealer).slice(0, 1);
    if (!up.length) return this.dealerLabel.set('');
    const t = total(up);
    this.dealerLabel.set(t.total > 21 ? 'DEALER BUST' : `${this.revealed ? '' : 'showing '}${t.total}`, t.total > 21 ? INK.good : INK.hot);
  }

  /* ── the board ──────────────────────────────────────────────────── */

  private paintBoard(): void {
    const c = this.board.ctx;
    this.board.clear();
    roundRect(c, 4, 4, 992, 412, 22);
    c.fillStyle = 'rgba(10, 18, 12, 0.94)';
    c.fill();
    c.lineWidth = 4;
    c.strokeStyle = '#7dff5a';
    c.stroke();
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    c.font = font(700, 40);
    c.fillStyle = '#9dff80';
    c.fillText('BLACKJACK', 28, 56);
    c.font = font(600, 28);
    c.fillStyle = INK.hot;
    c.fillText(this.status, 250, 55, 520);
    c.textAlign = 'right';
    c.fillStyle = INK.amber;
    c.fillText(`$${this.state.money}`, 972, 55);
    c.textAlign = 'left';
    c.font = font(500, 22);
    c.fillStyle = INK.dim;
    c.fillText('Blackjack pays 3 to 2 · Dealer stands on all 17s · 6 decks', 28, 96);

    const buttons: { id: string; x: number; y: number; w: number; h: number; enabled?: boolean }[] = [];
    const btn = (id: string, label: string, x: number, y: number, w: number, h: number, colour: string, on: boolean, size = 34): void => {
      buttons.push({ id, x, y, w, h, enabled: on });
      roundRect(c, x, y, w, h, 16);
      c.fillStyle = !on ? 'rgba(255,255,255,0.06)' : this.board.hover === id ? '#ffffff' : colour;
      c.fill();
      c.fillStyle = on ? '#0c140c' : INK.dim;
      c.font = font(700, size);
      c.textAlign = 'center';
      c.fillText(label, x + w / 2, y + h / 2 + size * 0.36);
    };
    const betting = this.phase === 'betting';
    if (betting) {
      this.opts.chips.forEach((v, i) => {
        const x = 70 + i * 120;
        const y = 190;
        buttons.push({ id: `chip${v}`, x: x - 48, y: y - 48, w: 96, h: 96 });
        c.fillStyle = `#${(CHIP_COLOUR[v] ?? 0xffffff).toString(16).padStart(6, '0')}`;
        c.beginPath();
        c.arc(x, y, 42, 0, Math.PI * 2);
        c.fill();
        c.lineWidth = 5;
        c.setLineDash([10, 8]);
        c.strokeStyle = this.board.hover === `chip${v}` ? '#fff' : 'rgba(255,255,255,0.55)';
        c.stroke();
        c.setLineDash([]);
        c.fillStyle = v === 1 ? '#222' : '#fff';
        c.font = font(700, 30);
        c.textAlign = 'center';
        c.fillText(`$${v}`, x, y + 10);
      });
      c.textAlign = 'right';
      c.font = font(700, 40);
      c.fillStyle = INK.amber;
      c.fillText(this.bet ? `BET $${this.bet}` : '', 970, 206);
      btn('clear', 'CLEAR', 28, 290, 260, 100, '#9aa4ac', this.bet > 0);
      btn('deal', this.bet ? 'DEAL' : this.lastBet ? `REBET $${this.lastBet}` : 'DEAL', 310, 290, 660, 100, '#7dff5a', this.bet > 0 || this.lastBet > 0, 44);
    } else {
      const r = this.round;
      const on = this.phase === 'player' && !!r;
      btn('hit', 'HIT', 28, 150, 300, 110, '#7dff5a', on && r!.can('hit'), 46);
      btn('stand', 'STAND', 348, 150, 300, 110, '#ffb000', on && r!.can('stand'), 46);
      btn('hint', 'HINT', 668, 150, 302, 110, '#9aa4ac', on);
      btn('double', 'DOUBLE', 28, 280, 460, 110, '#3fd6ff', on && r!.can('double'));
      btn('split', 'SPLIT', 510, 280, 460, 110, '#ff7fcf', on && r!.can('split'));
    }
    this.board.buttons = buttons;
    this.board.commit();
  }
}

/** A little floating readout (a hand's total, the dealer's). */
class Label {
  readonly sprite: Sprite;
  private readonly canvas = document.createElement('canvas');
  private readonly tex: CanvasTexture;
  private text = '\u0000';
  private colour = '';

  constructor() {
    this.canvas.width = 384;
    this.canvas.height = 96;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.sprite = new Sprite(new SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false }));
    this.sprite.scale.set(0.24, 0.06, 1);
    this.sprite.renderOrder = 12;
  }

  set(text: string, colour: string = INK.hot): void {
    if (text === this.text && colour === this.colour) return;
    this.text = text;
    this.colour = colour;
    this.sprite.visible = !!text;
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, 384, 96);
    if (!text) return;
    g.font = font(700, 54);
    const w = Math.min(376, g.measureText(text).width + 44);
    roundRect(g, 192 - w / 2, 8, w, 80, 40);
    g.fillStyle = 'rgba(8, 12, 10, 0.82)';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = colour;
    g.stroke();
    g.fillStyle = colour;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 192, 50);
    this.tex.needsUpdate = true;
  }
}

/** The felt: green baize in the table's half-round, with the house rules printed round it. */
function feltTexture(): CanvasTexture {
  const W = 1600;
  const H = 800; // 2.0 × 1.0 m; canvas top is the dealer's edge
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const R = 800 * 0.985;
  g.fillStyle = '#1d5a34';
  g.beginPath();
  g.moveTo(W / 2 + R, 0);
  g.arc(W / 2, 0, R, 0, Math.PI, false);
  g.closePath();
  g.fill();
  // a darker ring near the rail
  g.strokeStyle = 'rgba(0,0,0,0.15)';
  g.lineWidth = 30;
  g.beginPath();
  g.arc(W / 2, 0, R - 15, 0, Math.PI, false);
  g.stroke();
  const arcText = (text: string, radius: number, size: number, colour: string): void => {
    g.save();
    g.translate(W / 2, 0);
    g.font = font(700, size);
    g.fillStyle = colour;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const total = g.measureText(text).width / radius;
    let a = Math.PI / 2 + total / 2;
    for (const ch of text) {
      const w = g.measureText(ch).width / radius;
      a -= w / 2;
      g.save();
      g.rotate(a);
      g.translate(radius, 0);
      g.rotate(-Math.PI / 2);
      g.fillText(ch, 0, 0);
      g.restore();
      a -= w / 2;
    }
    g.restore();
  };
  // between the dealer's cards (z ≈ −0.12) and yours (z ≈ +0.3)
  arcText('BLACKJACK PAYS 3 TO 2', 322, 50, '#ffd24a');
  arcText('DEALER MUST DRAW TO 16 AND STAND ON ALL 17s', 392, 28, 'rgba(246, 240, 220, 0.8)');
  // the betting circle (at z = +0.5 → canvas y = 0.85 × 800) and the dealer's card line
  g.strokeStyle = 'rgba(246, 240, 220, 0.8)';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(W / 2, 680, 48, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = 'rgba(246, 240, 220, 0.35)';
  g.lineWidth = 3;
  g.strokeRect(W / 2 - 230, 110, 460, 130);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
