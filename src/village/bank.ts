/**
 * THE ISLAND BANK (building H): where coins are bought for real money, and
 * where the account that keeps them is made and logged in to.
 *
 * The room is a teller's hall: a long counter in dark wood with a brass rail,
 * a glass screen with brass bars and a window in the middle, the vault door on
 * the back wall, a green banker's lamp, coin stacks on the counter. Behind the
 * window hangs THE BOARD, which is the whole bank. It's where you support the
 * game: what you pay is a thank-you to its maker, and the coins are a little
 * something back (you can fish up as many in a few minutes late on).
 *
 *   PACKS     SUPPORT THE GAME, four packs (coins big, price small, BEST VALUE flagged), the
 *             REDEEM for coins bought on another headset, and the terms in one line.
 *   CONFIRM   the 18+ and no-cash-value agreement, every purchase.
 *   CHECKOUT  a PAY CODE: six letters on ivory tiles, to type at
 *             yellkell.com/chips on a phone or computer, where you pick a
 *             pack and pay (or OPEN ON THIS HEADSET, code filled in). The
 *             coins land by themselves within seconds while this face is up;
 *             the small print says a refresh collects them if not, since the
 *             boot claim is the one that always does.
 *   PAID      the coins that landed, and the word to keep the receipt Stripe emails:
 *             its number redeems them. Coins that landed at boot (after the refresh)
 *             bring this face up on the next visit.
 *   REDEEM    on another headset: type the receipt number from a purchase's Stripe
 *             receipt. The game restarts as the account it was bought on, with its
 *             save and every coin bought there. (No email sent, no phone.)
 *
 * The how is net/bank.ts (and server/bank.mjs); this file only draws `bank`
 * and passes on what's pointed at.
 */

import { CanvasTexture, CylinderGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SphereGeometry, SRGBColorSpace, TorusGeometry, type Camera, type WebGLRenderer } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { uiDeny, winFanfare } from '../audio/sfx.ts';
import { look } from '../casino/look.ts';
import type { GameState } from '../fishing/tidewater.ts';
import { bank, cancelCheckout, cancelRecovery, loadPacks, openCheckout, priceLabel, restoreByReceipt, startCheckout, whoami, type CoinPack } from '../net/bank.ts';
import { coinImage } from '../ui/coinIcon.ts';
import { font } from '../ui/fonts.ts';
import { Keyboard } from '../ui/keyboard.ts';
import { INK, roundRect } from '../ui/panel.ts';
import { InteractivePanel, register } from '../ui/pointer.ts';
import { Lettering, LOOKS, mount, type InkName } from '../ui/boards.ts';
import type { Interior } from './interiors.ts';

type Face = 'packs' | 'confirm' | 'checkout' | 'paid' | 'login';

const W = 1500;
const H = 900;
const BRASS = '#d8b060';
/** on the board, every visit */

export class IslandBank {
  readonly group = new Group();
  private readonly board = new InteractivePanel([W, H], [1.5, 0.9]);
  private readonly letters = new Lettering(this.board, LOOKS.bank, 11);
  private readonly keyboard = new Keyboard();
  private face: Face = 'packs';
  private chosen: CoinPack | null = null;
  private seen = -1;
  private wasPaid = false;
  private visited = false;

  constructor(
    private readonly room: Interior,
    private readonly state: GameState,
    renderer: WebGLRenderer,
  ) {
    room.contents.add(this.group);
    // the ceiling light over the customers' side, not in front of the board
    room.lamp.position.z = 0.85;
    this.build(renderer);
    this.board.paint = () => this.paint();
    this.board.onClick = (id) => this.click(id);
    register(this.board);
    this.board.repaintOnFonts(() => this.paint());
    state.onChange(() => this.paint());
    this.paint();
  }

  /* ── the room ───────────────────────────────────────────────────── */

  private build(r: WebGLRenderer): void {
    const g = this.group;
    const room = this.room;
    const cw = Math.min(room.w - 0.5, 3.4);
    const cz = -0.55;
    const wood = look.satin(r, 0x3a2012);
    const brass = look.gold(r);
    // the counter: a panelled front, a top, a brass foot rail
    const front = new Mesh(new RoundedBoxGeometry(cw, 1.02, 0.5, 3, 0.03), wood);
    front.position.set(0, 0.51, cz);
    const top = new Mesh(new RoundedBoxGeometry(cw + 0.08, 0.05, 0.62, 3, 0.02), look.gloss(r, 0x24140a));
    top.position.set(0, 1.045, cz);
    g.add(front, top);
    for (let k = 0; k < 5; k++) {
      const panel = new Mesh(new RoundedBoxGeometry(cw / 5 - 0.08, 0.7, 0.02, 2, 0.01), look.satin(r, 0x4a2a16));
      panel.position.set(-cw / 2 + (k + 0.5) * (cw / 5), 0.52, cz + 0.255);
      g.add(panel);
    }
    const rail = new Mesh(new CylinderGeometry(0.018, 0.018, cw, 16).rotateZ(Math.PI / 2), brass);
    rail.position.set(0, 0.16, cz + 0.33);
    g.add(rail);
    // the glass screen with brass bars, open in the middle (the teller's window)
    const glassMat = new MeshBasicMaterial({ color: 0xaad8e8, transparent: true, opacity: 0.08, depthWrite: false });
    const side = (cw - 1.6) / 2;
    for (const sx of [-1, 1]) {
      const glass = new Mesh(new PlaneGeometry(side, 0.9), glassMat);
      glass.position.set(sx * (0.8 + side / 2), 1.52, cz - 0.1);
      g.add(glass);
      for (let k = 0; k <= 6; k++) {
        const bar = new Mesh(new CylinderGeometry(0.008, 0.008, 0.9, 8), brass);
        bar.position.set(sx * (0.8 + (k / 6) * side), 1.52, cz - 0.1);
        g.add(bar);
      }
    }
    const lintel = new Mesh(new RoundedBoxGeometry(cw, 0.08, 0.06, 2, 0.02), brass);
    lintel.position.set(0, 2.0, cz - 0.1);
    g.add(lintel);
    // the vault door on the back wall
    const back = -room.d / 2 + 0.06;
    const vault = new Group();
    vault.position.set(room.w / 2 - 1.0 > 1.2 ? 1.25 : 0, 1.2, back);
    const disc = new Mesh(new CylinderGeometry(0.75, 0.75, 0.1, 48).rotateX(Math.PI / 2), look.chrome(r));
    const ring = new Mesh(new TorusGeometry(0.78, 0.05, 12, 48), brass);
    const hub = new Mesh(new CylinderGeometry(0.1, 0.1, 0.12, 24).rotateX(Math.PI / 2), brass);
    hub.position.z = 0.06;
    vault.add(disc, ring, hub);
    for (let k = 0; k < 3; k++) {
      const spoke = new Mesh(new CylinderGeometry(0.018, 0.018, 0.6, 10), brass);
      spoke.rotation.z = (k * Math.PI) / 3;
      spoke.position.z = 0.1;
      const knob = new Mesh(new SphereGeometry(0.035, 12, 10), brass);
      knob.position.set(Math.sin((k * Math.PI) / 3) * 0.3, Math.cos((k * Math.PI) / 3) * 0.3, 0.1);
      const knob2 = knob.clone();
      knob2.position.set(-knob.position.x, -knob.position.y, 0.1);
      vault.add(spoke, knob, knob2);
    }
    g.add(vault);
    // a banker's lamp and coin stacks on the counter
    const lamp = new Group();
    lamp.position.set(-cw / 2 + 0.35, 1.07, cz - 0.05);
    const stem = new Mesh(new CylinderGeometry(0.012, 0.012, 0.3, 8), brass);
    stem.position.y = 0.15;
    const shade = new Mesh(new CylinderGeometry(0.03, 0.13, 0.08, 20, 1, true), look.gloss(r, 0x0e5a2a));
    shade.position.y = 0.32;
    const bulb = new Mesh(new SphereGeometry(0.03, 10, 8), new MeshBasicMaterial({ color: 0xfff0c0, toneMapped: false }));
    bulb.position.y = 0.29;
    lamp.add(stem, shade, bulb);
    g.add(lamp);
    const coinGeo = new CylinderGeometry(0.022, 0.022, 0.006, 20);
    for (const [x, n] of [
      [cw / 2 - 0.4, 9],
      [cw / 2 - 0.34, 6],
      [cw / 2 - 0.46, 4],
    ] as const) {
      for (let k = 0; k < n; k++) {
        const coin = new Mesh(coinGeo, brass);
        coin.position.set(x + Math.sin(k) * 0.002, 1.073 + k * 0.0062, cz + 0.08 + (x % 0.1) * 0.3);
        g.add(coin);
      }
    }
    // the board, in a brass frame behind the window
    const frame = new Mesh(new RoundedBoxGeometry(1.56, 0.96, 0.03, 3, 0.012), brass);
    frame.position.set(0, 1.6, cz - 0.3);
    this.board.mesh.position.set(0, 1.6, cz - 0.28);
    // (it keeps the brass frame above: just the board made solid)
    mount(this.board, LOOKS.bank, { frame: false });
    g.add(frame, this.board.mesh);
    // the keyboard, on a tilted stand in front of the counter when it's needed
    this.keyboard.panel.mesh.position.set(0, 1.12, cz + 0.42);
    this.keyboard.panel.mesh.rotation.x = -0.75;
    g.add(this.keyboard.panel.mesh);
    // a sign on the lintel
    const sign = new Mesh(new PlaneGeometry(1.0, 0.14), new MeshBasicMaterial({ map: signTexture(), transparent: true, toneMapped: false }));
    sign.position.set(0, 2.13, cz - 0.08);
    g.add(sign);
  }

  /* ── clicks ─────────────────────────────────────────────────────── */

  private click(id: string): void {
    if (id.startsWith('pack:')) {
      this.chosen = bank.packs.find((p) => p.id === id.slice(5)) ?? null;
      if (this.chosen) this.face = 'confirm';
    } else if (id === 'agree' && this.chosen) {
      this.face = 'checkout';
      void startCheckout(this.chosen.id);
    } else if (id === 'back' || id === 'done') {
      bank.landed = 0;
      if (bank.checkout) cancelCheckout();
      cancelRecovery();
      this.face = 'packs';
    } else if (id === 'open') {
      if (!openCheckout()) uiDeny();
    } else if (id === 'retry') void loadPacks();
    else if (id === 'login') {
      cancelRecovery();
      this.face = 'login';
    } else if (id === 'login-receipt') this.typeReceipt();
    this.paint();
  }

  /** REDEEM: the receipt number on the Stripe receipt for a purchase. */
  private typeReceipt(): void {
    this.keyboard.onDone = (receipt) => {
      void restoreByReceipt(receipt);
      this.paint();
    };
    this.keyboard.onCancel = () => this.paint();
    this.keyboard.open('receipt', 'The receipt number on your Stripe receipt', '');
  }

  /* ── frame ──────────────────────────────────────────────────────── */

  update(_dt: number, camera: Camera): void {
    const e = camera.matrixWorld.elements;
    const inside = this.room.inside(e[12], e[14]);
    if (inside && !this.visited) {
      // first time in the door this session: wake the server (Render's free tier sleeps) and ask who we are
      this.visited = true;
      void loadPacks();
      void whoami();
    }
    if (!inside) this.visited = false;
    const co = bank.checkout;
    const paid = co?.state === 'paid';
    if ((paid && !this.wasPaid) || (bank.landed > 0 && this.face === 'packs' && inside)) {
      this.face = 'paid';
      if (inside) winFanfare(8);
      this.paint();
    }
    this.wasPaid = paid;
    if (bank.version !== this.seen) {
      this.seen = bank.version;
      this.paint();
    }
  }

  /* ── the board ──────────────────────────────────────────────────── */

  private paint(): void {
    // green leather tooled in gold, brass plates for buttons (ui/boards.ts: the bank's look)
    const L = this.letters;
    const c = L.begin();
    const btn = (id: string, label: string, x: number, y: number, w: number, h: number, tone = BRASS, on = true, size = 38): void =>
      L.button(id, label, x, y, w, h, !on ? 'off' : tone.startsWith('rgba(255,255,255') ? 'alt' : 'go', size);
    const INKS: Record<string, InkName> = { [INK.hot]: 'ink', [INK.dim]: 'dim', [INK.amber]: 'accent', [BRASS]: 'title', [INK.good]: 'good', [INK.danger]: 'bad' };
    const text = (s: string, x: number, y: number, size: number, colour: string = INK.hot, align: CanvasTextAlign = 'left', weight: 500 | 600 | 700 = 600, max?: number): void =>
      L.text(s, x, y, size, INKS[colour] ?? colour, align, weight, max);
    L.title('ISLAND BANK', 48, 90, 64, 'left', 600);
    text(`wallet $${Math.floor(this.state.money).toLocaleString('en-US')}`, W - 44, 84, 40, INK.amber, 'right', 700);
    const badge = bank.mode === 'test' ? 'TEST MODE · no real money' : bank.mode === 'dev' ? 'DEV BANK · no real money' : bank.mode === 'live' ? '' : '';
    if (badge) text(badge, 620, 84, 30, '#3fd6c6', 'left', 700);

    const co = bank.checkout;
    switch (this.face) {
      case 'packs': {
        text('SUPPORT THE GAME', 44, 190, 56, BRASS, 'left', 700);
        if (bank.status === 'loading' || bank.status === 'idle') text('opening the bank…  (the first visit can take half a minute)', 44, 250, 32, INK.dim);
        else if (bank.status === 'off') {
          text(bank.note || 'the bank is closed right now', 44, 250, 32, INK.danger);
          btn('retry', 'TRY AGAIN', W - 344, 140, 300, 80);
        } else text('Enjoying the island? Chip in to keep it growing, and take some coins as a thank-you.', 44, 250, 32, INK.hot, 'left', 600, W - 88);
        const open = bank.status === 'ready';
        bank.packs.forEach((p, i) => {
          const x = 44 + i * 358;
          const y = 300;
          const id = `pack:${p.id}`;
          L.area(id, x, y, 336, 330, open);
          roundRect(c, x, y, 336, 330, 24);
          c.fillStyle = this.board.hover === id ? 'rgba(255, 220, 140, 0.22)' : 'rgba(255, 255, 255, 0.07)';
          c.fill();
          c.lineWidth = p.best ? 6 : 3;
          c.strokeStyle = p.best ? '#ffb000' : 'rgba(216, 176, 96, 0.5)';
          c.stroke();
          const img = coinImage();
          const stack = Math.min(5, 1 + i);
          for (let k = 0; k < stack; k++) {
            if (img) c.drawImage(img, x + 168 - 50 + (k - (stack - 1) / 2) * 34, y + 40 - k * 4, 100, 100);
          }
          text(p.coins.toLocaleString('en-US'), x + 168, y + 200, 72, INK.hot, 'center', 700);
          text('coins', x + 168, y + 236, 28, INK.dim, 'center');
          text(priceLabel(p.minor), x + 168, y + 300, 46, open ? INK.amber : INK.dim, 'center', 700);
          if (p.best) {
            roundRect(c, x + 88, y - 20, 160, 40, 20);
            c.fillStyle = '#ffb000';
            c.fill();
            text('BEST VALUE', x + 168, y + 9, 24, '#1a1206', 'center', 700);
          }
        });
        // REDEEM: a purchase's Stripe receipt is its key, on any headset
        text('Bought coins on another headset? Redeem them with the number on your Stripe receipt.', 44, 700, 30, INK.dim);
        btn('login', 'REDEEM', 44, 720, 520, 80, '#3fd6c6', true, 34);
        text('18+ only. Coins are a thank-you for play in Fish & Chips: no cash value, never withdrawn or exchanged. Payments by Stripe.', 44, 872, 22, INK.dim, 'left', 500, W - 88);
        break;
      }
      case 'confirm': {
        const p = this.chosen!;
        text(`Support the game with ${priceLabel(p.minor)}`, W / 2, 210, 64, INK.hot, 'center', 700);
        text(`and take ${p.coins.toLocaleString('en-US')} coins as a thank-you`, W / 2, 268, 38, INK.dim, 'center');
        text('Before you pay:', 120, 340, 36, BRASS, 'left', 700);
        const lines = [
          '• You are 18 or over.',
          '• Coins are for play in Fish & Chips only. They have no cash value and',
          '   can never be withdrawn, sold or exchanged for money or prizes.',
          '• You pay on your phone through Stripe; this headset never sees your card.',
        ];
        lines.forEach((l, i) => text(l, 120, 400 + i * 50, 34, INK.hot));
        btn('agree', `I AGREE: PAY ${priceLabel(p.minor)}`, 120, 680, 760, 110, '#ffb000', true, 44);
        btn('back', 'BACK', 910, 680, 470, 110, 'rgba(255,255,255,0.3)', true, 40);
        break;
      }
      case 'checkout': {
        if (!co || co.state === 'opening') text('opening a checkout…', W / 2, 400, 48, INK.dim, 'center');
        else if (co.state === 'failed' || co.state === 'expired') {
          text(co.state === 'expired' ? 'That checkout expired.' : "The checkout didn't open.", W / 2, 360, 52, INK.danger, 'center', 700);
          text(co.note, W / 2, 420, 32, INK.dim, 'center');
          btn('back', 'BACK', W / 2 - 200, 520, 400, 100);
        } else {
          // the pay code: what you type on your phone or computer, big enough to read at arm's length
          text('Pay on your phone or computer', 44, 186, 54, INK.hot, 'left', 700);
          text(`${priceLabel(co.pack.minor)} support · ${co.pack.coins.toLocaleString('en-US')} coins back (you can pick another pack there)`, 44, 236, 30, INK.dim, 'left', 600, W - 88);
          text('1.  Go to', 44, 316, 40, INK.hot);
          text(co.page, 228, 318, 56, '#ffd24a', 'left', 700);
          text('2.  Type this code:', 44, 392, 40, INK.hot);
          codeTiles(c, co.code, W / 2, 420);
          text('3.  Pay there. The coins land here by themselves.', 44, 666, 36, INK.hot);
          const dots = '.'.repeat(1 + (Math.floor(performance.now() / 500) % 3));
          text(`waiting for the payment${dots}`, W - 44, 666, 36, '#3fd6c6', 'right', 700);
          btn('open', 'OPEN ON THIS HEADSET', 44, 712, 860, 96, 'rgba(255,255,255,0.3)', true, 36);
          btn('back', 'CANCEL', 936, 712, 520, 96, 'rgba(255,255,255,0.18)', true, 36);
          text('Paid and no coins after a minute? Refresh the Fish & Chips page: they land as it starts.', 44, 864, 24, INK.dim, 'left', 500, W - 88);
        }
        break;
      }
      case 'paid': {
        const got = co?.paid || bank.landed;
        text('THANK YOU FOR SUPPORTING THE GAME!', W / 2, 180, 52, BRASS, 'center', 700);
        text(`+${got.toLocaleString('en-US')}`, W / 2, 320, 130, '#ffd24a', 'center', 700);
        text('coins landed in your wallet, with thanks', W / 2, 390, 40, INK.hot, 'center');
        // the receipt Stripe emails is how these coins come back on another headset (REDEEM)
        text('Stripe is emailing you a receipt: keep it. Its receipt number redeems', W / 2, 470, 32, INK.dim, 'center');
        text('these coins, and your game, on any headset (REDEEM, here at the bank).', W / 2, 514, 32, INK.dim, 'center');
        btn('done', 'DONE', W / 2 - 220, 580, 440, 110, BRASS, true, 44);
        break;
      }
      case 'login': {
        // REDEEM: a purchase's receipt number brings its account (coins and game) to this headset
        const r = bank.recovery;
        text('REDEEM', 44, 190, 52, '#3fd6c6', 'left', 700);
        if (r.stage === 'done') {
          text('Welcome back.', W / 2, 400, 80, INK.good, 'center', 700);
          text('Restarting as your account…', W / 2, 480, 40, INK.hot, 'center');
        } else {
          text('Bought coins on another headset? Bring them, and that game, here:', 44, 270, 36, INK.hot);
          text('type the receipt number from the Stripe receipt you were emailed (like 1234-5678).', 70, 336, 32, INK.dim);
          const busy = r.stage === 'redeeming';
          btn('login-receipt', busy ? 'CHECKING…' : 'TYPE THE RECEIPT NUMBER', 44, 420, 760, 100, '#ffb000', !busy, 40);
          btn('back', 'BACK', 840, 420, 360, 100, 'rgba(255,255,255,0.25)', true, 38);
          if (r.stage === 'failed') text(r.note, 44, 580, 32, INK.danger);
        }
        break;
      }
    }
    L.end();
  }
}

/**
 * A pay code on six ivory tiles edged in brass, like a teller's number plates: one letter each,
 * in big dark type, so nobody mistakes a letter typing it on a phone. Centred on `cx`, top at `y`.
 */
function codeTiles(c: CanvasRenderingContext2D, code: string, cx: number, y: number): void {
  const n = code.length;
  const tw = 150;
  const th = 190;
  const gap = n > 3 ? 22 : 0;
  // a wider gap down the middle: two groups of three read faster than six in a row
  const mid = n === 6 ? 30 : 0;
  const total = n * tw + (n - 1) * gap + mid;
  let x = cx - total / 2;
  for (let i = 0; i < n; i++) {
    if (n === 6 && i === 3) x += mid;
    c.save();
    // a soft drop shadow under each plate
    c.shadowColor = 'rgba(0, 0, 0, 0.55)';
    c.shadowBlur = 18;
    c.shadowOffsetY = 8;
    roundRect(c, x, y, tw, th, 22);
    const face = c.createLinearGradient(0, y, 0, y + th);
    face.addColorStop(0, '#fbf5e6');
    face.addColorStop(1, '#e6d8b8');
    c.fillStyle = face;
    c.fill();
    c.restore();
    // the brass edge, bright on top
    roundRect(c, x + 3, y + 3, tw - 6, th - 6, 19);
    const edge = c.createLinearGradient(0, y, 0, y + th);
    edge.addColorStop(0, '#ffe7a6');
    edge.addColorStop(0.5, BRASS);
    edge.addColorStop(1, '#8a6a2c');
    c.lineWidth = 6;
    c.strokeStyle = edge;
    c.stroke();
    c.font = font(700, 150);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#1a1206';
    c.fillText(code[i], x + tw / 2, y + th / 2 + 8);
    x += tw + gap;
  }
}

function signTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1000;
  c.height = 140;
  const g = c.getContext('2d')!;
  g.font = font(700, 96);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = BRASS;
  g.shadowColor = 'rgba(255, 200, 100, 0.6)';
  g.shadowBlur = 16;
  g.fillText('TELLER', 500, 76);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
