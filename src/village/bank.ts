/**
 * THE ISLAND BANK (building H): where coins are bought for real money, and
 * where the account that keeps them is made and logged in to.
 *
 * The room is a teller's hall: a long counter in dark wood with a brass rail,
 * a glass screen with brass bars and a window in the middle, the vault door on
 * the back wall, a green banker's lamp, coin stacks on the counter. Behind the
 * window hangs THE BOARD, which is the whole bank:
 *
 *   PACKS     four packs (coins big, price small, BEST VALUE flagged), the
 *             account strip (SAVE MY PURCHASES / LOG IN, or who it's saved to)
 *             and the terms in one line.
 *   CONFIRM   the 18+ and no-cash-value agreement, every purchase.
 *   CHECKOUT  a QR code: screenshot it, bring the screenshot up on your
 *             phone and tap the code there to pay (or OPEN ON THIS HEADSET).
 *             The coins land by themselves within seconds.
 *   PAID      the coins that landed, and (the first time) one tap to save the
 *             purchase to the email you paid with.
 *   LOG IN    on a new headset: type your email, open the link on your phone,
 *             type the six-digit code it shows. The game restarts as your
 *             account, with your save and every coin you bought.
 *
 * The how is net/bank.ts (and server/bank.mjs); this file only draws `bank`
 * and passes on what's pointed at.
 */

import { CanvasTexture, CylinderGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SphereGeometry, SRGBColorSpace, TorusGeometry, type Camera, type WebGLRenderer } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { uiDeny, winFanfare } from '../audio/sfx.ts';
import { look } from '../casino/look.ts';
import type { GameState } from '../fishing/tidewater.ts';
import { bank, cancelCheckout, cancelRecovery, loadPacks, openCheckout, priceLabel, protect, redeemCode, startCheckout, startRecovery, whoami, type CoinPack } from '../net/bank.ts';
import { coinImage } from '../ui/coinIcon.ts';
import { font } from '../ui/fonts.ts';
import { Keyboard } from '../ui/keyboard.ts';
import { INK, roundRect } from '../ui/panel.ts';
import { InteractivePanel, register } from '../ui/pointer.ts';
import { drawQr } from '../ui/qr.ts';
import type { Interior } from './interiors.ts';

type Face = 'packs' | 'confirm' | 'checkout' | 'paid' | 'login';

const W = 1500;
const H = 900;
const BRASS = '#d8b060';
/** on the board, every visit */

interface Btn {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  enabled?: boolean;
}

export class IslandBank {
  readonly group = new Group();
  private readonly board = new InteractivePanel([W, H], [1.5, 0.9]);
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
    // the lamp hangs over the customers' side, not in front of the board
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
    (this.board.mesh.material as MeshBasicMaterial).transparent = false;
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
      if (bank.checkout) cancelCheckout();
      cancelRecovery();
      this.face = 'packs';
    } else if (id === 'open') {
      if (!openCheckout()) uiDeny();
    } else if (id === 'retry') void loadPacks();
    else if (id === 'save-paid') void protect(bank.lastEmail);
    else if (id === 'save-type') this.typeEmail('protect');
    else if (id === 'login') {
      cancelRecovery();
      this.face = 'login';
    } else if (id === 'login-email') this.typeEmail('login');
    else if (id === 'login-code') {
      this.keyboard.onDone = (code) => void redeemCode(code);
      this.keyboard.onCancel = () => this.paint();
      this.keyboard.open('code', 'The six-digit code on your phone', '');
    }
    this.paint();
  }

  private typeEmail(why: 'protect' | 'login'): void {
    this.keyboard.onDone = (text) => {
      if (why === 'protect') void protect(text);
      else void startRecovery(text);
      this.paint();
    };
    this.keyboard.onCancel = () => this.paint();
    this.keyboard.open('email', why === 'protect' ? 'Your email: your purchases are saved to it' : 'The email your account is saved to', why === 'protect' ? bank.lastEmail : '');
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
    if (paid && !this.wasPaid) {
      this.face = 'paid';
      if (inside) winFanfare(8);
    }
    this.wasPaid = paid;
    if (bank.version !== this.seen) {
      this.seen = bank.version;
      this.paint();
    }
  }

  /* ── the board ──────────────────────────────────────────────────── */

  private paint(): void {
    const c = this.board.ctx;
    const buttons: Btn[] = [];
    const btn = (id: string, label: string, x: number, y: number, w: number, h: number, tone = BRASS, on = true, size = 38): void => {
      buttons.push({ id, x, y, w, h, enabled: on });
      roundRect(c, x, y, w, h, 18);
      c.fillStyle = !on ? 'rgba(255,255,255,0.07)' : this.board.hover === id ? '#ffffff' : tone;
      c.fill();
      c.fillStyle = on ? '#1a1206' : INK.dim;
      c.font = font(700, size);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(label, x + w / 2, y + h / 2 + 2, w - 20);
      c.textBaseline = 'alphabetic';
    };
    const text = (s: string, x: number, y: number, size: number, colour: string = INK.hot, align: CanvasTextAlign = 'left', weight: 500 | 600 | 700 = 600, max?: number): void => {
      c.font = font(weight, size);
      c.fillStyle = colour;
      c.textAlign = align;
      c.fillText(s, x, y, max);
    };
    // the ground: deep green baize with a brass rule
    const grad = c.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#12301f');
    grad.addColorStop(1, '#081a10');
    c.fillStyle = grad;
    c.fillRect(0, 0, W, H);
    c.strokeStyle = BRASS;
    c.lineWidth = 6;
    c.strokeRect(14, 14, W - 28, H - 28);
    text('ISLAND BANK', 44, 88, 64, BRASS, 'left', 700);
    text(`wallet $${Math.floor(this.state.money).toLocaleString('en-US')}`, W - 44, 84, 40, INK.amber, 'right', 700);
    const badge = bank.mode === 'test' ? 'TEST MODE · no real money' : bank.mode === 'dev' ? 'DEV BANK · no real money' : bank.mode === 'live' ? '' : '';
    if (badge) text(badge, 470, 84, 30, '#3fd6c6', 'left', 700);

    const co = bank.checkout;
    switch (this.face) {
      case 'packs': {
        if (bank.status === 'loading' || bank.status === 'idle') text('opening the bank…  (the first visit can take half a minute)', 44, 170, 32, INK.dim);
        if (bank.status === 'off') {
          text(bank.note || 'the bank is closed right now', 44, 170, 32, INK.danger);
          btn('retry', 'TRY AGAIN', 44, 200, 300, 80);
        }
        const open = bank.status === 'ready';
        bank.packs.forEach((p, i) => {
          const x = 44 + i * 358;
          const y = 300;
          const id = `pack:${p.id}`;
          buttons.push({ id, x, y, w: 336, h: 330, enabled: open });
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
        // the account
        const a = bank.account;
        if (a.protected) {
          text(`✓ Your purchases are saved to ${a.email}.`, 44, 700, 36, INK.good, 'left', 700);
          text('Log in with it at this bank on any headset to get them back.', 44, 744, 30, INK.dim);
        } else {
          text('Keep what you buy: save it to your email, then log in on any headset.', 44, 700, 30, INK.dim);
          btn('save-type', 'SAVE MY PURCHASES', 44, 720, 520, 80, BRASS, true, 34);
          btn('login', 'LOG IN (new headset)', 590, 720, 520, 80, '#3fd6c6', true, 34);
        }
        text('18+ only. Coins are for play in Gamble Fish: no cash value, never withdrawn or exchanged. Payments by Stripe.', 44, 872, 22, INK.dim, 'left', 500, W - 88);
        break;
      }
      case 'confirm': {
        const p = this.chosen!;
        text(`${p.coins.toLocaleString('en-US')} coins for ${priceLabel(p.minor)}`, W / 2, 230, 72, INK.hot, 'center', 700);
        text('Before you buy:', 120, 340, 36, BRASS, 'left', 700);
        const lines = [
          '• You are 18 or over.',
          '• Coins are for play in Gamble Fish only. They have no cash value and',
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
          // the QR on white, big enough to scan from a phone held up to the lens
          roundRect(c, 60, 130, 560, 560, 24);
          c.fillStyle = '#f4f2ee';
          c.fill();
          drawQr(c, co.short, 90, 160, 500);
          text('Pay on your phone', 680, 200, 54, INK.hot, 'left', 700);
          text(`${priceLabel(co.pack.minor)} for ${co.pack.coins.toLocaleString('en-US')} coins`, 680, 252, 36, INK.dim);
          text('1.  Take a screenshot of this code.', 680, 314, 32, INK.hot);
          text('2.  Bring the screenshot up on your phone.', 680, 356, 32, INK.hot);
          text('3.  Tap the QR code there to pay.', 680, 398, 32, INK.hot);
          const dots = '.'.repeat(1 + (Math.floor(performance.now() / 500) % 3));
          text(`waiting for the payment${dots}`, 680, 450, 38, '#3fd6c6', 'left', 700);
          btn('open', 'OPEN ON THIS HEADSET', 680, 520, 560, 90, 'rgba(255,255,255,0.3)', true, 34);
          btn('back', 'CANCEL', 680, 630, 560, 90, 'rgba(255,255,255,0.18)', true, 34);
          text(co.short.replace(/^https?:\/\//, ''), 340, 740, 26, INK.dim, 'center');
        }
        break;
      }
      case 'paid': {
        const got = co?.paid ?? 0;
        text(`+${got.toLocaleString('en-US')}`, W / 2, 300, 150, '#ffd24a', 'center', 700);
        text('coins landed in your wallet', W / 2, 370, 44, INK.hot, 'center');
        const a = bank.account;
        if (a.protected) {
          text(`Saved to ${a.email}: log in with it on any headset.`, W / 2, 480, 34, INK.good, 'center', 700);
          btn('done', 'DONE', W / 2 - 220, 560, 440, 110, BRASS, true, 44);
        } else if (bank.protecting.stage === 'busy') text('saving…', W / 2, 520, 40, INK.dim, 'center');
        else {
          text('Save this purchase to your email, so a new headset can get it back:', W / 2, 470, 32, INK.dim, 'center');
          if (bank.lastEmail) btn('save-paid', `SAVE TO ${bank.lastEmail}`, W / 2 - 520, 520, 1040, 100, '#ffb000', true, 38);
          btn('save-type', bank.lastEmail ? 'ANOTHER EMAIL' : 'SAVE TO MY EMAIL', W / 2 - 520, 640, 500, 90, BRASS, true, 32);
          btn('done', 'NOT NOW', W / 2 + 20, 640, 500, 90, 'rgba(255,255,255,0.25)', true, 32);
          if (bank.protecting.stage === 'failed') text(bank.protecting.note, W / 2, 780, 30, INK.danger, 'center');
        }
        break;
      }
      case 'login': {
        const r = bank.recovery;
        text('LOG IN', 44, 190, 52, '#3fd6c6', 'left', 700);
        if (r.stage === 'idle' || r.stage === 'failed' || r.stage === 'sending') {
          text('Played before on another headset? Get your account back:', 44, 270, 36, INK.hot);
          const steps = ['1.  Type the email your purchases are saved to.', '2.  Open the link we email you, on your phone.', '3.  Your phone shows a six-digit code: type it here.'];
          steps.forEach((s, i) => text(s, 70, 340 + i * 56, 34, INK.dim));
          btn('login-email', r.stage === 'sending' ? 'SENDING…' : 'TYPE MY EMAIL', 44, 540, 600, 100, '#3fd6c6', r.stage !== 'sending', 40);
          btn('back', 'BACK', 680, 540, 360, 100, 'rgba(255,255,255,0.25)', true, 38);
          if (r.stage === 'failed') text(r.note, 44, 700, 32, INK.danger);
        } else if (r.stage === 'sent' || r.stage === 'redeeming') {
          text(`We emailed a sign-in link to ${r.email}.`, 44, 270, 38, INK.hot, 'left', 700);
          text('Open it on your phone: it shows a six-digit code. Then:', 44, 330, 34, INK.dim);
          btn('login-code', r.stage === 'redeeming' ? 'CHECKING…' : 'TYPE THE CODE', 44, 390, 600, 110, '#ffb000', r.stage === 'sent', 42);
          btn('login-email', 'SEND IT AGAIN', 680, 390, 440, 110, 'rgba(255,255,255,0.25)', true, 34);
          btn('back', 'BACK', 1150, 390, 300, 110, 'rgba(255,255,255,0.18)', true, 34);
          text('The code works once and lasts ten minutes. No email? Check spam.', 44, 580, 30, INK.dim);
        } else if (r.stage === 'done') {
          text('Welcome back.', W / 2, 400, 80, INK.good, 'center', 700);
          text('Restarting as your account…', W / 2, 480, 40, INK.hot, 'center');
        }
        break;
      }
    }
    this.board.buttons = buttons;
    this.board.commit();
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
