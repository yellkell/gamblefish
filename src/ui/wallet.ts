/**
 * The wrist wallet: a watch on each wrist with a mechanical rolling money counter.
 *
 * The counter is an odometer. The shown value chases the real balance (quickly for small
 * changes, over about a second for big ones), each digit wheel scrolls to the next number, and
 * a higher wheel only turns while every wheel below it is rolling over from 9 to 0 — so a sale
 * ripples up through the digits the way a pump or a till counter does.
 *
 * Any change to the balance rings ff2's cash chime (audio/cash.ts), pitched by direction:
 * money IN (selling a catch, a payout) rings bright and high, money OUT (buying gear, a stake)
 * rings low. The wallet listens to the save, so every path that moves money gets the sound
 * without having to remember it.
 */

import { BoxGeometry, Group, Mesh, MeshLambertMaterial, type Object3D } from 'three';
import { playCash, preloadCash } from '../audio/cash.ts';
import type { GameState } from '../fishing/tidewater.ts';
import { coinImage } from './coinIcon.ts';
import { font } from './fonts.ts';
import { INK, Panel, roundRect } from './panel.ts';

/** The chime's pitch for money in (a sale) and money out (a purchase). */
const CASH_IN_RATE = 1.12;
const CASH_OUT_RATE = 0.84;

const W = 320;
const H = 112;
const DIGITS = 6;

/** Odometer: how far each wheel has turned toward its next digit, for a shown value v. */
function wheel(v: number, place: number): { digit: number; roll: number } {
  const p = Math.pow(10, place);
  const digit = Math.floor(v / p) % 10;
  // the units wheel turns continuously; a higher one only while everything below is carrying
  const below = v % p;
  const roll = place === 0 ? v - Math.floor(v) : Math.max(0, below - (p - 1));
  return { digit, roll };
}

class Watch {
  readonly group = new Group();
  private readonly panel = new Panel([W, H], [0.064, 0.0224]);

  constructor() {
    // a slim gunmetal case under the face
    const body = new Mesh(new BoxGeometry(0.07, 0.006, 0.028), new MeshLambertMaterial({ color: 0x2a2c2f }));
    body.position.y = -0.0032;
    this.group.add(body);
    this.panel.mesh.rotation.x = -Math.PI / 2; // face up, out of the case
    this.panel.mesh.position.y = 0.0002;
    this.group.add(this.panel.mesh);
  }

  paint(v: number, flash: number): void {
    const c = this.panel.ctx;
    this.panel.clear();
    roundRect(c, 3, 3, W - 6, H - 6, 18);
    c.fillStyle = INK.glass;
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = flash > 0 ? `rgba(255, 176, 0, ${0.35 + 0.65 * flash})` : INK.rim;
    c.stroke();

    // the iron dollar
    const coin = coinImage();
    const cs = 72;
    if (coin) c.drawImage(coin, 16, (H - cs) / 2, cs, cs);
    else {
      c.fillStyle = INK.amber;
      c.font = font(700, 64);
      c.textBaseline = 'middle';
      c.fillText('$', 30, H / 2 + 2);
    }

    // digit wheels, right-aligned; leading zeros are dimmed until the money reaches them
    const x0 = 100;
    const cw = (W - x0 - 16) / DIGITS;
    const top = 14;
    const h = H - 28;
    c.save();
    roundRect(c, x0 - 4, top, cw * DIGITS + 8, h, 8);
    c.fillStyle = 'rgba(0, 0, 0, 0.45)';
    c.fill();
    c.clip();
    c.font = font(700, 76);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const shown = Math.max(0, v);
    const lead = Math.max(1, Math.floor(Math.log10(Math.max(1, Math.round(shown)))) + 1);
    for (let i = 0; i < DIGITS; i++) {
      const place = DIGITS - 1 - i;
      const { digit, roll } = wheel(shown, place);
      const cx = x0 + cw * (i + 0.5);
      const cy = top + h / 2 + 3;
      c.fillStyle = place < lead ? INK.hot : 'rgba(255, 243, 207, 0.18)';
      c.fillText(String(digit), cx, cy - roll * h);
      c.fillText(String((digit + 1) % 10), cx, cy + (1 - roll) * h);
      if (i > 0) {
        c.fillStyle = 'rgba(255, 255, 255, 0.06)';
        c.fillRect(x0 + cw * i - 1, top, 2, h);
      }
    }
    // the drum shading that sells the wheels
    const g = c.createLinearGradient(0, top, 0, top + h);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.28, 'rgba(0,0,0,0)');
    g.addColorStop(0.72, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = g;
    c.fillRect(x0 - 4, top, cw * DIGITS + 8, h);
    c.restore();
    this.panel.commit();
  }
}

export class WristWallet {
  private readonly watches: Watch[] = [];
  private shown: number;
  private target: number;
  private flash = 0;
  private dirty = true;

  /** wrists: each hand's RAY space (level with where you point; the grip frame on Quest is
   *  pitched 45° up from it). The watch sits behind the controller, on the back of the wrist. */
  constructor(state: GameState, wrists: Object3D[]) {
    this.shown = this.target = state.money;
    for (const wrist of wrists) {
      const w = new Watch();
      // ray space: −Z where you point, +Z back up the forearm, +Y the back of the hand
      w.group.position.set(0, 0.012, 0.19);
      w.group.rotation.x = 0.5; // face tipped back toward your eyes
      wrist.add(w.group);
      this.watches.push(w);
    }
    state.onChange((s) => {
      if (s.money === this.target) return;
      playCash(s.money > this.target ? CASH_IN_RATE : CASH_OUT_RATE);
      this.target = s.money;
      this.flash = 1;
      this.dirty = true;
    });
    preloadCash();
  }

  update(dt: number): void {
    const d = this.target - this.shown;
    if (Math.abs(d) > 1e-3) {
      // exponential chase with a floor on the speed, so small sums still roll, not jump
      const step = d * (1 - Math.exp(-dt * 3.2));
      const min = Math.min(Math.abs(d), dt * 6);
      this.shown += Math.sign(d) * Math.max(Math.abs(step), min);
      this.dirty = true;
    } else if (this.shown !== this.target) {
      this.shown = this.target;
      this.dirty = true;
    }
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 1.5);
      this.dirty = true;
    }
    if (!this.dirty) return;
    this.dirty = false;
    for (const w of this.watches) w.paint(this.shown, this.flash);
  }

  /** Force a repaint (the house face finished loading). */
  repaint(): void {
    this.dirty = true;
  }
}
