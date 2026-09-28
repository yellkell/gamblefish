/**
 * A speech bubble over someone's head: what they say, in a rounded balloon with a tail down to
 * them, turned to face you. It pops up when they start a line, and shrinks away when they're done.
 *
 * `say(line)` puts up a line (a small row of hearts under it if `hearts` is given), `hide()`
 * shrinks it away; `update(dt, camera)` each frame keeps it facing you and runs the pop.
 */

import { MeshBasicMaterial, Vector3, type Camera } from 'three';
import { font } from './fonts.ts';
import { Panel, roundRect } from './panel.ts';

const PX: [number, number] = [1024, 440];
/** world size (m): wide enough to read from across a room */
const M: [number, number] = [1.05, 1.05 * (PX[1] / PX[0])];
const PAD = 48;
const TAIL = 64;
const LINE = 60;

export interface BubbleLook {
  /** the speaker's name, on a tab at the balloon's top edge */
  name: string;
  /** the tab, the rim and the lit hearts */
  accent: string;
  paper: string;
  ink: string;
}

export interface Line {
  text: string;
  /** a row of hearts under the words: `of` in all, `n` filled, the `lit` one glowing (just won) */
  hearts?: { n: number; of: number; lit?: number };
}

const _cam = new Vector3();
const _at = new Vector3();

export class SpeechBubble {
  private readonly panel = new Panel(PX, M, { depthTest: false });
  /** where the tail's tip points (just over the speaker's head), in the mesh's parent's space */
  readonly anchor = new Vector3();
  private shown = 0;
  private want = 0;
  private vel = 0;
  private line: Line | null = null;

  constructor(private readonly look: BubbleLook) {
    this.panel.mesh.renderOrder = 30;
    this.panel.mesh.visible = false;
    // the tail's tip sits at the bottom middle of the quad
    this.panel.mesh.geometry.translate(0, M[1] / 2, 0);
    this.panel.repaintOnFonts(() => this.line && this.paint(this.line));
  }

  get mesh(): Panel['mesh'] {
    return this.panel.mesh;
  }

  /** is a line up (or on its way up)? */
  get speaking(): boolean {
    return this.want > 0;
  }

  say(line: Line): void {
    this.line = line;
    this.paint(line);
    // a new line pops in afresh from small, even over the last one
    this.shown = Math.min(this.shown, 0.35);
    this.vel = 0;
    this.want = 1;
  }

  hide(): void {
    this.want = 0;
  }

  /** gone at once (you've left the room) */
  clear(): void {
    this.want = this.shown = this.vel = 0;
    this.panel.mesh.visible = false;
  }

  update(dt: number, camera: Camera): void {
    const m = this.panel.mesh;
    if (this.want) {
      // up on a spring: a little overshoot, then settles
      this.vel += (260 * (1 - this.shown) - 17 * this.vel) * Math.min(dt, 1 / 30);
      this.shown += this.vel * Math.min(dt, 1 / 30);
    } else {
      // away quicker, no bounce
      this.vel = 0;
      this.shown *= Math.exp(-dt * 16);
      if (this.shown < 0.02) this.shown = 0;
    }
    m.visible = this.shown > 0;
    if (!m.visible) return;
    m.scale.setScalar(Math.max(0.001, this.shown));
    (m.material as MeshBasicMaterial).opacity = Math.min(1, this.shown * 1.6);
    m.position.copy(this.anchor);
    // face you, upright-ish (half your tilt, so it doesn't lie back when you're close)
    camera.getWorldPosition(_cam);
    m.getWorldPosition(_at);
    _cam.y = _at.y + (_cam.y - _at.y) * 0.5;
    m.lookAt(_cam);
  }

  private paint(line: Line): void {
    const c = this.panel.ctx;
    const [W, H] = PX;
    const { name, accent, paper, ink } = this.look;
    this.panel.clear();
    c.font = font(600, 52);
    const words = balanced(c, line.text, W - PAD * 2 - 16, 3);
    const foot = line.hearts ? 58 : 0;
    const bodyH = PAD + words.length * LINE + foot + PAD - 12;
    const bw = Math.min(W - 16, Math.max(360, ...words.map((w) => c.measureText(w).width + PAD * 2)));
    const x0 = (W - bw) / 2;
    const y1 = H - TAIL;
    const y0 = y1 - bodyH;
    // the balloon, its tail curling down and a little to her side
    c.save();
    c.shadowColor = 'rgba(40, 10, 20, 0.35)';
    c.shadowBlur = 14;
    c.shadowOffsetY = 4;
    roundRect(c, x0, y0, bw, bodyH, 38);
    c.fillStyle = paper;
    c.fill();
    c.beginPath();
    c.moveTo(W / 2 - 44, y1 - 2);
    c.quadraticCurveTo(W / 2 - 18, y1 + TAIL * 0.55, W / 2 - 34, H - 6);
    c.quadraticCurveTo(W / 2 + 18, y1 + TAIL * 0.5, W / 2 + 26, y1 - 2);
    c.closePath();
    c.fill();
    c.restore();
    c.lineWidth = 5;
    c.strokeStyle = accent;
    roundRect(c, x0, y0, bw, bodyH, 38);
    c.stroke();
    // cover the rim where the tail joins, then rim the tail
    c.fillStyle = paper;
    c.fillRect(W / 2 - 41, y1 - 6, 64, 10);
    c.beginPath();
    c.moveTo(W / 2 - 44, y1);
    c.quadraticCurveTo(W / 2 - 18, y1 + TAIL * 0.55, W / 2 - 34, H - 6);
    c.quadraticCurveTo(W / 2 + 18, y1 + TAIL * 0.5, W / 2 + 26, y1);
    c.stroke();
    // her name on a tab over the top edge
    c.font = font(700, 34);
    const tw = c.measureText(name).width + 36;
    roundRect(c, x0 + 34, y0 - 24, tw, 48, 24);
    c.fillStyle = accent;
    c.fill();
    c.fillStyle = paper;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(name, x0 + 34 + tw / 2, y0 + 1);
    // the words
    c.font = font(600, 52);
    c.fillStyle = ink;
    c.textBaseline = 'alphabetic';
    words.forEach((w, i) => c.fillText(w, W / 2, y0 + PAD + 22 + i * LINE, W - PAD * 2));
    // the hearts
    if (line.hearts) {
      const { n, of, lit } = line.hearts;
      const size = of > 12 ? 34 : 42;
      const step = size * 1.05;
      const hy = y1 - PAD / 2 - 14;
      c.font = `700 ${size}px serif`;
      c.textBaseline = 'middle';
      for (let i = 0; i < of; i++) {
        const hx = W / 2 + (i - (of - 1) / 2) * step;
        c.save();
        if (i === lit) {
          c.shadowColor = accent;
          c.shadowBlur = 22;
        }
        // an empty heart is the same heart, faint
        c.globalAlpha = i < n ? 1 : 0.22;
        c.fillStyle = accent;
        c.fillText('♥', hx, hy);
        c.restore();
      }
    }
    this.panel.commit();
  }
}

/** Wrap, then narrow the measure while it takes no more lines: no one word left alone underneath. */
function balanced(c: CanvasRenderingContext2D, text: string, w: number, max: number): string[] {
  let best = wrap(c, text, w, max);
  if (best.length < 2) return best;
  for (let tw = w - 24; tw > w * 0.4; tw -= 24) {
    const next = wrap(c, text, tw, max);
    if (next.length > best.length || next.some((l) => c.measureText(l).width > tw)) break;
    best = next;
  }
  return best;
}

/** Break `text` into at most `max` lines no wider than `w` (the last squeezed if it must be). */
function wrap(c: CanvasRenderingContext2D, text: string, w: number, max: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const word of text.split(/\s+/)) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && c.measureText(next).width > w && out.length < max - 1) {
      out.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}
