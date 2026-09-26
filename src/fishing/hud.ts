/**
 * The fishing readouts, painted on canvases in the world (no screen in VR):
 *
 *  - RodGauge: a small plate clipped to the rod above the reel, facing you — the line tension
 *    with Tidewater's green band, the line out, and a one-word state ("STRIKE!", "REEL").
 *  - Toast: a short message that drifts into view in front of you and fades ("Fish on!").
 *  - CatchCard: the landed fish's name, length, weight and price, with NEW SPECIES / RECORD.
 */

import { Group, Vector3, type Camera } from 'three';
import { font } from '../ui/fonts.ts';
import { INK, Panel, roundRect } from '../ui/panel.ts';
import type { LastCatch } from './tidewater.ts';
import { FISH } from './tidewater.ts';
import { TIMED } from './timedFish.ts';
import { TROPHY } from './trophyFish.ts';
import { SHARK_ID } from './shark.ts';

export interface GaugeState {
  label: string;
  labelColour?: string;
  tension: number | null; // null: no fish on
  band: [number, number];
  lineOut: number;
  holdKg: number;
  holdMax: number;
}

export class RodGauge {
  readonly panel = new Panel([256, 128], [0.08, 0.04]);
  private last = '';

  paint(s: GaugeState): void {
    const key = `${s.label}|${s.tension === null ? '-' : s.tension.toFixed(2)}|${s.lineOut.toFixed(0)}|${s.holdKg.toFixed(1)}`;
    if (key === this.last) return;
    this.last = key;
    const c = this.panel.ctx;
    this.panel.clear();
    roundRect(c, 2, 2, 252, 124, 14);
    c.fillStyle = INK.glass;
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = INK.rim;
    c.stroke();
    c.textBaseline = 'middle';

    c.font = font(700, 34);
    c.fillStyle = s.labelColour ?? INK.hot;
    c.textAlign = 'left';
    c.fillText(s.label, 14, 30, s.lineOut > 0.5 ? 168 : 228);
    c.font = font(600, 22);
    c.fillStyle = INK.dim;
    c.textAlign = 'right';
    c.fillText(s.lineOut > 0.5 ? `${s.lineOut.toFixed(0)} m` : '', 242, 30);

    // tension bar with the green band
    const x = 14;
    const y = 58;
    const w = 228;
    const h = 26;
    roundRect(c, x, y, w, h, 6);
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.fill();
    const scale = (t: number): number => x + (w * Math.min(1.15, Math.max(0, t))) / 1.15;
    c.fillStyle = 'rgba(63, 214, 106, 0.28)';
    c.fillRect(scale(s.band[0]), y, scale(s.band[1]) - scale(s.band[0]), h);
    c.fillStyle = 'rgba(232, 53, 42, 0.35)';
    c.fillRect(scale(1), y, x + w - scale(1), h);
    if (s.tension !== null) {
      const t = s.tension;
      c.fillStyle = t > 1 ? INK.danger : t > s.band[1] ? INK.warn : t >= s.band[0] ? INK.good : INK.sea;
      roundRect(c, x + 2, y + 4, Math.max(4, scale(t) - x - 4), h - 8, 4);
      c.fill();
    }

    c.font = font(500, 20);
    c.fillStyle = INK.dim;
    c.textAlign = 'left';
    c.fillText(`backpack ${s.holdKg} / ${s.holdMax} cells  ·  A to open`, 14, 106, 228);
    this.panel.commit();
  }
}

/** A message that settles in front of you, lazily following your gaze, then fades. */
export class Toast {
  // twice the old canvas, same size in the world: a short message is one line, a long one wraps
  // onto two or three lines instead of being squeezed into one
  readonly panel = new Panel([1024, 320], [0.62, 0.194], { depthTest: false });
  private t = 0;
  private dur = 0;
  private readonly pos = new Vector3();
  private readonly want = new Vector3();
  private readonly fwd = new Vector3();

  show(text: string, seconds = 2, colour: string = INK.hot): void {
    const c = this.panel.ctx;
    this.panel.clear();
    const maxW = 940;
    let size = 92;
    let lines: string[] = [];
    for (; size >= 48; size -= 4) {
      c.font = font(700, size);
      lines = wrapLines(c, text, maxW);
      if (lines.length <= (size > 72 ? 1 : size > 58 ? 2 : 3)) break;
    }
    const lh = size * 1.08;
    const tw = Math.min(1000, Math.max(...lines.map((l) => c.measureText(l).width)) + 72);
    const th = lines.length * lh + 44;
    roundRect(c, (1024 - tw) / 2, (320 - th) / 2, tw, th, 36);
    c.fillStyle = INK.glass;
    c.fill();
    c.fillStyle = colour;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    lines.forEach((l, i) => c.fillText(l, 512, 160 + (i - (lines.length - 1) / 2) * lh, maxW));
    this.panel.commit();
    this.t = 0;
    this.dur = seconds;
    this.panel.mesh.visible = true;
  }

  update(dt: number, head: Camera): void {
    const m = this.panel.mesh;
    if (!m.visible) return;
    this.t += dt;
    head.getWorldPosition(this.want);
    head.getWorldDirection(this.fwd);
    this.fwd.y = Math.max(-0.35, Math.min(0.2, this.fwd.y));
    this.fwd.normalize();
    this.want.addScaledVector(this.fwd, 1.1).y -= 0.18;
    if (this.t < dt * 1.5) this.pos.copy(this.want);
    this.pos.lerp(this.want, 1 - Math.exp(-dt * 4));
    m.position.copy(this.pos);
    m.lookAt(head.getWorldPosition(this.fwd));
    const a = Math.min(1, (this.dur - this.t) / 0.35, this.t / 0.12);
    (m.material as { opacity: number }).opacity = Math.max(0, a);
    if (this.t >= this.dur) m.visible = false;
  }
}

/** The catch card that hangs beside the landed fish. */
export class CatchCard {
  readonly group = new Group();
  readonly panel = new Panel([512, 300], [0.34, 0.199]);

  constructor() {
    this.group.add(this.panel.mesh);
    this.group.visible = false;
  }

  show(info: LastCatch): void {
    const c = this.panel.ctx;
    const f = FISH[info.species];
    this.panel.clear();
    roundRect(c, 4, 4, 504, 292, 22);
    c.fillStyle = INK.glass;
    c.fill();
    c.lineWidth = 4;
    const trophy = TROPHY[info.species];
    const shark = info.species === SHARK_ID;
    c.strokeStyle = trophy || shark ? '#ffd45a' : info.record || info.newSpecies ? INK.amber : INK.rim;
    c.lineWidth = trophy || shark ? 7 : 4;
    c.stroke();
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    let y = 62;
    if (info.newSpecies || info.record || trophy || shark) {
      c.font = font(700, 28);
      c.fillStyle = INK.amber;
      c.fillText([trophy ? '★ TROPHY FISH' : shark ? '★ THE LAST CATCH' : '', info.newSpecies ? 'NEW SPECIES' : info.record ? 'NEW RECORD' : ''].filter(Boolean).join('  ·  '), 28, 46);
      y = 92;
    }
    c.font = font(700, 50);
    c.fillStyle = INK.hot;
    c.fillText(f.name, 28, y, 456);
    c.font = font(500, 24);
    c.fillStyle = INK.dim;
    // a fish that keeps its own hours says which, a trophy what it took
    const when = TIMED[info.species]?.when ?? trophy?.when ?? (shark ? 'held through every run' : undefined);
    const both = when ? `${f.sci}  ·  ${when}` : f.sci;
    c.font = font(500, 22);
    if (!when || c.measureText(both).width <= 456) fitLine(c, both, 28, y + 32, 456, 500, 24, 20);
    else {
      // the name on one line, what it took on the next
      fitLine(c, f.sci, 28, y + 30, 456, 500, 22, 18);
      fitLine(c, when, 28, y + 56, 456, 500, 20, 16);
    }
    // the numbers: length, weight and value on one line, the type shrinking until they fit
    const cm = `${info.cm} cm`;
    const kg = `${info.kg.toFixed(info.kg >= 100 ? 0 : 2)} kg`;
    const value = `$${info.value.toLocaleString('en-US')}`;
    let size = 44;
    const gap = 26;
    const width = (): number => {
      c.font = font(700, size);
      return c.measureText(cm).width + c.measureText(kg).width + c.measureText(value).width + gap * 2;
    };
    while (size > 26 && width() > 456) size -= 2;
    c.font = font(700, size);
    c.fillStyle = INK.hot;
    c.textAlign = 'left';
    c.fillText(cm, 28, y + 106);
    c.fillText(kg, 28 + c.measureText(cm).width + gap, y + 106);
    c.fillStyle = INK.amber;
    c.textAlign = 'right';
    c.fillText(value, 484, y + 106);

    // the last line: where it went, and what it means for the book; two lines if one won't hold both
    const left = shark ? 'released: the bounty is yours' : 'into your backpack…';
    const leftColour = shark ? INK.amber : info.kept ? INK.dim : INK.danger;
    let right = '';
    let rightColour: string = INK.amber;
    if (shark) right = info.newSpecies ? 'field guide complete' : '';
    else if (info.newSpecies) right = 'new page in your field guide';
    else if (info.record && info.prevBestKg > 0) {
      right = `best was ${info.prevBestKg.toFixed(2)} kg`;
      rightColour = INK.dim;
    }
    c.font = font(600, 24);
    c.textAlign = 'left';
    c.fillStyle = leftColour;
    c.fillText(left, 28, y + 148, 456);
    if (right) {
      const fits = c.measureText(left).width + c.measureText(right).width + 24 <= 456;
      c.textAlign = 'right';
      c.fillStyle = rightColour;
      c.fillText(right, 484, fits ? y + 148 : y + 176, 456);
    }
    this.panel.commit();
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }
}

/** Break `text` into lines no wider than `maxW` in the current font. */
function wrapLines(c: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(' ').filter(Boolean)) {
    const next = line ? `${line} ${w}` : w;
    if (c.measureText(next).width > maxW && line) {
      out.push(line);
      line = w;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

/** One line: the type steps down to `min` px to fit, then it ends in an ellipsis rather than squeezing. */
function fitLine(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, weight: 500 | 600 | 700, size: number, min: number): void {
  let s = size;
  c.font = font(weight, s);
  while (s > min && c.measureText(text).width > maxW) c.font = font(weight, (s -= 1));
  let t = text;
  while (t.length > 1 && c.measureText(t).width > maxW) t = t.slice(0, -2) + '…';
  c.fillText(t, x, y);
}
