/**
 * A keyboard in the world, for the few things the game has to be told in
 * letters: an email address to save purchases to or log in with, and the
 * six-digit code from the phone. Point and pull the trigger on a key. It is
 * one InteractivePanel: the typed line across the top, then the keys.
 *
 *   'email'  letters, digits, @ . - _ + and a .com key
 *   'code'   a telephone keypad, six digits
 */

import { font } from './fonts.ts';
import { INK, roundRect } from './panel.ts';
import { InteractivePanel, register } from './pointer.ts';

export type KeyboardMode = 'email' | 'code';

interface Key {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  wide?: boolean;
}

const PX: [number, number] = [1200, 560];
const M: [number, number] = [0.84, 0.392];

const EMAIL_ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl@', 'zxcvbnm.-_'];

export class Keyboard {
  readonly panel = new InteractivePanel(PX, M);
  text = '';
  mode: KeyboardMode = 'email';
  prompt = '';
  onDone: (text: string) => void = () => {};
  onCancel: () => void = () => {};
  private keys: Key[] = [];

  constructor() {
    this.panel.paint = () => this.paint();
    this.panel.onClick = (id) => this.press(id);
    this.panel.mesh.visible = false;
    register(this.panel);
  }

  open(mode: KeyboardMode, prompt: string, initial = ''): void {
    this.mode = mode;
    this.prompt = prompt;
    this.text = initial;
    this.layout();
    this.panel.mesh.visible = true;
    this.paint();
  }

  close(): void {
    this.panel.mesh.visible = false;
  }

  get isOpen(): boolean {
    return this.panel.mesh.visible;
  }

  private layout(): void {
    const keys: Key[] = [];
    const top = 150;
    if (this.mode === 'email') {
      const kw = 104;
      const kh = 72;
      EMAIL_ROWS.forEach((row, r) => {
        const x0 = 30 + r * 14;
        [...row].forEach((ch, i) => keys.push({ id: `k:${ch}`, label: ch, x: x0 + i * (kw + 8), y: top + r * (kh + 8), w: kw, h: kh }));
      });
      const y = top + 4 * (kh + 8);
      keys.push({ id: 'k:+', label: '+', x: 30, y, w: kw, h: kh });
      keys.push({ id: 'dotcom', label: '.com', x: 30 + (kw + 8), y, w: kw * 1.6, h: kh, wide: true });
      keys.push({ id: 'back', label: '⌫', x: 30 + (kw + 8) * 2.7, y, w: kw * 1.4, h: kh, wide: true });
      keys.push({ id: 'cancel', label: 'CANCEL', x: 30 + (kw + 8) * 4.2, y, w: kw * 2.2, h: kh, wide: true });
      keys.push({ id: 'done', label: 'DONE', x: 30 + (kw + 8) * 6.5, y, w: kw * 3.3, h: kh, wide: true });
    } else {
      const kw = 200;
      const kh = 76;
      const x0 = 290;
      '123456789'.split('').forEach((d, i) => keys.push({ id: `k:${d}`, label: d, x: x0 + (i % 3) * (kw + 12), y: top + Math.floor(i / 3) * (kh + 10), w: kw, h: kh }));
      const y = top + 3 * (kh + 10);
      keys.push({ id: 'back', label: '⌫', x: x0, y, w: kw, h: kh });
      keys.push({ id: 'k:0', label: '0', x: x0 + kw + 12, y, w: kw, h: kh });
      keys.push({ id: 'done', label: 'ENTER', x: x0 + (kw + 12) * 2, y, w: kw, h: kh, wide: true });
      keys.push({ id: 'cancel', label: 'CANCEL', x: 30, y, w: 230, h: kh, wide: true });
    }
    this.keys = keys;
    this.panel.buttons = keys.map((k) => ({ id: k.id, x: k.x, y: k.y, w: k.w, h: k.h }));
  }

  private press(id: string): void {
    const max = this.mode === 'code' ? 6 : 96;
    if (id.startsWith('k:')) {
      if (this.text.length < max) this.text += id.slice(2);
    } else if (id === 'dotcom') {
      if (this.text.length < max - 4) this.text += '.com';
    } else if (id === 'back') this.text = this.text.slice(0, -1);
    else if (id === 'cancel') {
      this.close();
      this.onCancel();
      return;
    } else if (id === 'done') {
      this.close();
      this.onDone(this.text);
      return;
    }
    this.paint();
  }

  private paint(): void {
    const c = this.panel.ctx;
    this.panel.clear();
    roundRect(c, 4, 4, PX[0] - 8, PX[1] - 8, 26);
    c.fillStyle = 'rgba(14, 20, 26, 0.95)';
    c.fill();
    c.lineWidth = 4;
    c.strokeStyle = '#b08d4a';
    c.stroke();
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    c.font = font(600, 28);
    c.fillStyle = INK.dim;
    c.fillText(this.prompt, 34, 50, PX[0] - 70);
    // the typed line, with a caret
    roundRect(c, 30, 66, PX[0] - 60, 66, 12);
    c.fillStyle = 'rgba(0, 0, 0, 0.5)';
    c.fill();
    c.font = font(700, this.mode === 'code' ? 50 : 40);
    c.fillStyle = INK.hot;
    const shown = this.mode === 'code' ? this.text.padEnd(6, '·').replace(/(.{3})/, '$1 ') : this.text;
    c.fillText(shown + (this.mode === 'code' ? '' : '|'), 48, 115, PX[0] - 100);
    for (const k of this.keys) {
      const hot = this.panel.hover === k.id;
      roundRect(c, k.x, k.y, k.w, k.h, 12);
      c.fillStyle = hot ? '#ffffff' : k.id === 'done' ? '#ffb000' : k.wide ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.09)';
      c.fill();
      c.fillStyle = hot || k.id === 'done' ? '#141008' : INK.hot;
      c.font = font(700, k.label.length > 2 ? 32 : 40);
      c.textAlign = 'center';
      c.fillText(k.label, k.x + k.w / 2, k.y + k.h / 2 + 14);
      c.textAlign = 'left';
    }
    this.panel.commit();
  }
}
