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
  readonly panel = new Panel([512, 112], [0.5, 0.109], { depthTest: false });
  private t = 0;
  private dur = 0;
  private readonly pos = new Vector3();
  private readonly want = new Vector3();
  private readonly fwd = new Vector3();

  show(text: string, seconds = 2, colour: string = INK.hot): void {
    const c = this.panel.ctx;
    this.panel.clear();
    c.font = font(700, 56);
    const tw = Math.min(496, c.measureText(text).width + 48);
    roundRect(c, (512 - tw) / 2, 8, tw, 96, 20);
    c.fillStyle = INK.glass;
    c.fill();
    c.fillStyle = colour;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 256, 58, 480);
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
    c.strokeStyle = trophy ? '#ffd45a' : info.record || info.newSpecies ? INK.amber : INK.rim;
    c.lineWidth = trophy ? 7 : 4;
    c.stroke();
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    let y = 62;
    if (info.newSpecies || info.record || trophy) {
      c.font = font(700, 28);
      c.fillStyle = INK.amber;
      c.fillText([trophy ? '★ TROPHY FISH' : '', info.newSpecies ? 'NEW SPECIES' : info.record ? 'NEW RECORD' : ''].filter(Boolean).join('  ·  '), 28, 46);
      y = 92;
    }
    c.font = font(700, 50);
    c.fillStyle = INK.hot;
    c.fillText(f.name, 28, y, 456);
    c.font = font(500, 24);
    c.fillStyle = INK.dim;
    // a fish that keeps its own hours says which, a trophy what it took
    const when = TIMED[info.species]?.when ?? trophy?.when;
    c.fillText(when ? `${f.sci}  ·  ${when}` : f.sci, 28, y + 32, 456);
    c.font = font(700, 44);
    c.fillStyle = INK.hot;
    c.fillText(`${info.cm} cm`, 28, y + 100);
    c.fillText(`${info.kg.toFixed(2)} kg`, 196, y + 100);
    c.fillStyle = INK.amber;
    c.textAlign = 'right';
    c.fillText(`$${info.value}`, 484, y + 100);
    c.textAlign = 'left';
    c.font = font(600, 24);
    c.fillStyle = info.kept ? INK.dim : INK.danger;
    c.fillText('into your backpack…', 28, y + 146);
    if (info.newSpecies) {
      // its page in the backpack's field guide has just filled in
      c.textAlign = 'right';
      c.fillStyle = INK.amber;
      c.fillText('new page in your field guide', 484, y + 146);
    } else if (info.record && info.prevBestKg > 0) {
      c.textAlign = 'right';
      c.fillStyle = INK.dim;
      c.fillText(`best was ${info.prevBestKg.toFixed(2)} kg`, 484, y + 146);
    }
    this.panel.commit();
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }
}
