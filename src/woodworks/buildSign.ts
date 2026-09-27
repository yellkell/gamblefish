/**
 * THE BUILD SIGN: what stands by a build crate and asks for wood. Not a floating screen: a notice
 * board of old planks nailed into a timber frame on two posts, with a little pitched cap to keep
 * the rain off, lettered by hand the way the village's shop signs are (village/signs.ts). What's
 * wanted is painted on it, and how far along it is shows as a row of log ends, the ones already
 * in painted in, the rest chalked round. Under it, hung on two cords, a smaller board: PUT IN
 * WOOD. Point at that and pull the trigger.
 *
 * The board is lit like everything round it (it dims at dusk, with a touch of its own paint
 * showing after dark), and cut out of its canvas so the cords and the tag hang in the open.
 */

import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry } from 'three';
import { InteractivePanel, register } from '../ui/pointer.ts';
import { handLetter, plankBoard, rngOf, serif, weather } from '../village/signs.ts';

/** what the board says */
export interface SignText {
  title: string;
  /** a line under the title: what it is */
  sub: string;
  /** 0..1 (under 0: no row of log ends, for a sign that isn't asking for wood) */
  progress: number;
  /** e.g. "212 of 500 logs", or "FINISHED" */
  count: string;
  /** what to do next */
  note: string;
  /** the hanging tag's words, and whether it's live */
  tag: string;
  can: boolean;
  done: boolean;
  /** the tag is a way in (the helter skelter's RIDE TO THE TOP), not a crate to fill: painted up
   * bright like a button, its arrow pointing up */
  go?: boolean;
}

/** canvas: the board, the cords, the tag */
const PX = 640;
const PY = 830;
const BOARD_H = 520;
const TAG = { x: 120, y: 612, w: 400, h: 190 };
/** metres */
const W = 0.62;
const H = (W * PY) / PX;
/** the foot of the tag, off the ground (over the top of a crate in front of it) */
const FOOT = 0.7;

export class BuildSign {
  readonly group = new Group();
  readonly board: InteractivePanel;
  private readonly bg: HTMLCanvasElement;
  /** the tag again, unlit and pulsing gently, over the lit one when it's a way in (`go`) */
  private readonly glow: Mesh;

  constructor(
    private readonly seed: number,
    private readonly text: () => SignText,
  ) {
    this.board = new InteractivePanel([PX, PY], [W, H]);
    // lit, and cut out (the cords and the tag hang in the open)
    const old = this.board.mesh.material as MeshBasicMaterial;
    this.board.mesh.material = new MeshLambertMaterial({ map: this.board.texture, alphaTest: 0.5, emissive: 0xffffff, emissiveMap: this.board.texture, emissiveIntensity: 0.12 });
    old.dispose();
    this.board.mesh.renderOrder = 0;
    this.board.mesh.position.set(0, FOOT + H / 2, 0.035);
    this.group.add(this.board.mesh);
    // cut from the same canvas: the tag's rectangle of it, a hair in front of the board
    const tag = new PlaneGeometry((TAG.w / PX) * W, (TAG.h / PY) * H);
    const uv = tag.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (TAG.x + uv.getX(i) * TAG.w) / PX, 1 - (TAG.y + (1 - uv.getY(i)) * TAG.h) / PY);
    const lit = new MeshBasicMaterial({ map: this.board.texture, alphaTest: 0.5, toneMapped: false });
    this.glow = new Mesh(tag, lit);
    this.glow.position.set(((TAG.x + TAG.w / 2) / PX - 0.5) * W, FOOT + H / 2 + (0.5 - (TAG.y + TAG.h / 2) / PY) * H, 0.038);
    this.glow.visible = false;
    this.glow.onBeforeRender = () => lit.color.setScalar(0.92 + 0.12 * Math.sin(performance.now() / 380));
    this.group.add(this.glow);
    this.bg = paintBackground(seed);
    this.group.add(this.frame());
    // (the owner paints it first, once its words are ready; after that, on hovers and the fonts)
    this.board.paint = () => this.live && this.draw();
    this.board.repaintOnFonts(() => this.live && this.draw());
    register(this.board);
  }

  private live = false;

  /** the posts, the frame round the board, the cap */
  private frame(): Group {
    const g = new Group();
    const post = new MeshLambertMaterial({ color: 0x5e4a38 });
    const rail = new MeshLambertMaterial({ color: 0x6e5842 });
    const cap = new MeshLambertMaterial({ color: 0x4e3e30 });
    const top = FOOT + H;
    const boardFoot = top - (BOARD_H / PY) * H;
    const bx = W / 2 + 0.035;
    const box = (m: MeshLambertMaterial, sx: number, sy: number, sz: number, x: number, y: number, z: number, rz = 0): void => {
      const o = new Mesh(new BoxGeometry(sx, sy, sz), m);
      o.position.set(x, y, z);
      o.rotation.z = rz;
      g.add(o);
    };
    // two posts, driven in, a little out of true
    for (const s of [-1, 1]) {
      const p = new Mesh(new CylinderGeometry(0.04, 0.046, top + 0.12, 7), post);
      p.position.set(s * (bx + 0.04), (top + 0.12) / 2, 0);
      p.rotation.z = s * 0.012;
      g.add(p);
    }
    // the frame round the board (the planks sit in it)
    box(rail, W + 0.12, 0.05, 0.05, 0, top + 0.01, 0.02);
    box(rail, W + 0.12, 0.045, 0.05, 0, boardFoot - 0.01, 0.02);
    for (const s of [-1, 1]) box(rail, 0.05, top - boardFoot + 0.06, 0.05, s * bx, (top + boardFoot) / 2, 0.02);
    // a batten across the back, into the posts
    box(rail, W + 0.2, 0.06, 0.03, 0, boardFoot + 0.12, -0.02);
    // the cap: two boards pitched over the top
    for (const s of [-1, 1]) box(cap, (W + 0.3) / 2 + 0.02, 0.025, 0.16, s * ((W + 0.3) / 4 - 0.005), top + 0.075, 0.02, -s * 0.2);
    return g;
  }

  /** Repaint from the owner's words (on a change, and whenever the hover moves). */
  draw(): void {
    this.live = true;
    const b = this.board;
    const c = b.ctx;
    const t = this.text();
    b.clear();
    c.drawImage(this.bg, 0, 0);
    const paint = '#f4ead2';
    const shadow = 'rgba(30, 18, 8, 0.55)';
    handLetter(c, t.title, PX / 2, 74, PX - 80, serif(700, 58), paint, shadow, this.seed);
    handLetter(c, t.sub, PX / 2, 128, PX - 90, `italic ${serif(600, 27)}`, '#e8d8b4', null, this.seed + 3);
    // how far along: twenty log ends, the ones in painted in, the rest chalked round
    const n = 20;
    const cols = 10;
    const r = 21;
    const x0 = PX / 2 - ((cols - 1) * (r * 2 + 8)) / 2;
    const filled = Math.round(t.progress * n);
    const rr = rngOf(this.seed + 21);
    for (let i = 0; i < n && t.progress >= 0; i++) {
      const x = x0 + (i % cols) * (r * 2 + 8) + (rr() - 0.5) * 3;
      const y = 196 + Math.floor(i / cols) * (r * 2 + 8) + (rr() - 0.5) * 3;
      if (i < filled) logEnd(c, x, y, r, rr);
      else {
        c.strokeStyle = 'rgba(240, 236, 226, 0.55)';
        c.lineWidth = 2.5;
        c.beginPath();
        c.ellipse(x, y, r - 2 + rr() * 2, r - 3 + rr() * 2, rr() * 3, 0, Math.PI * 2);
        c.stroke();
      }
    }
    handLetter(c, t.count, PX / 2, 330, PX - 100, serif(700, 44), t.done ? '#bfe8a0' : '#ffd88a', shadow, this.seed + 5);
    handLetter(c, t.note, PX / 2, 392, PX - 70, `italic ${serif(600, 26)}`, '#f0e2c4', null, this.seed + 7);
    if (t.done) handLetter(c, '✓', PX / 2, 452, 60, serif(700, 50), '#bfe8a0', shadow, this.seed + 9);

    // the tag: brighter paint under your pointer (a way in is painted up bright, like a button)
    const hover = b.hover === 'deposit' && t.can;
    const go = !!t.go && t.can;
    this.glow.visible = go;
    c.save();
    c.globalAlpha = t.can ? 1 : 0.8;
    if (go) {
      roundTag(c, TAG.x, TAG.y, TAG.w, TAG.h);
      c.fillStyle = hover ? '#ffe07a' : '#ffc640';
      c.fill();
      c.lineWidth = 8;
      c.strokeStyle = hover ? '#ffffff' : '#fff4c8';
      c.stroke();
    } else if (hover) {
      c.fillStyle = 'rgba(255, 214, 120, 0.35)';
      roundTag(c, TAG.x, TAG.y, TAG.w, TAG.h);
      c.fill();
    }
    c.restore();
    const ink = go ? '#2a1606' : !t.can ? 'rgba(236, 226, 206, 0.55)' : hover ? '#fff4c8' : '#f4ead2';
    handLetter(c, t.tag, PX / 2, TAG.y + TAG.h / 2 - (t.can ? 12 : 0), TAG.w - 60, serif(700, t.tag.length > 12 ? 40 : 48), ink, go ? null : shadow, this.seed + 11);
    if (t.can) {
      // a painted arrow: down to the crate, or up the tower
      const [a, z] = go ? [TAG.y + 172, TAG.y + 118] : [TAG.y + 118, TAG.y + 172];
      const s = Math.sign(z - a);
      c.strokeStyle = ink;
      c.fillStyle = ink;
      c.lineWidth = 6;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(PX / 2, a);
      c.lineTo(PX / 2, z - s * 14);
      c.stroke();
      c.beginPath();
      c.moveTo(PX / 2 - 16, z - s * 24);
      c.lineTo(PX / 2, z);
      c.lineTo(PX / 2 + 16, z - s * 24);
      c.closePath();
      c.fill();
    }
    b.buttons = t.can ? [{ id: 'deposit', x: TAG.x - 10, y: TAG.y - 20, w: TAG.w + 20, h: TAG.h + 30 }] : [];
    b.commit();
  }
}

/** The wood: planks in the board, cords, the tag's plank. Painted once. */
function paintBackground(seed: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = PX;
  cv.height = PY;
  const c = cv.getContext('2d')!;
  // the board: four weathered planks, a darker tar line round the edge where it meets the frame
  c.save();
  c.beginPath();
  c.rect(0, 0, PX, BOARD_H);
  c.clip();
  plankBoard(c, 0, 0, PX, BOARD_H, '#7a5c3e', seed, 4);
  weather(c, PX, BOARD_H, seed, 0.7);
  c.strokeStyle = 'rgba(30, 18, 8, 0.5)';
  c.lineWidth = 10;
  c.strokeRect(0, 0, PX, BOARD_H);
  // nail heads at the plank ends
  for (let i = 0; i < 4; i++)
    for (const x of [18, PX - 18]) {
      const y = ((i + 0.5) * BOARD_H) / 4;
      c.fillStyle = 'rgba(40, 32, 28, 0.9)';
      c.beginPath();
      c.arc(x, y, 5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(160, 150, 140, 0.5)';
      c.beginPath();
      c.arc(x - 1.5, y - 1.5, 2, 0, Math.PI * 2);
      c.fill();
    }
  c.restore();
  // the cords the tag hangs by
  for (const x of [TAG.x + 40, TAG.x + TAG.w - 40]) {
    c.strokeStyle = '#b89a6a';
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(x - 4, BOARD_H - 6);
    c.quadraticCurveTo(x + 3, (BOARD_H + TAG.y) / 2, x, TAG.y + 14);
    c.stroke();
    c.strokeStyle = 'rgba(80, 60, 30, 0.6)';
    c.lineWidth = 2;
    c.setLineDash([5, 5]);
    c.stroke();
    c.setLineDash([]);
  }
  // the tag: one thick plank, its corners cut off
  c.save();
  roundTag(c, TAG.x, TAG.y, TAG.w, TAG.h);
  c.clip();
  plankBoard(c, TAG.x, TAG.y, TAG.w, TAG.h, '#9a4a2c', seed + 40, 1);
  c.translate(TAG.x, TAG.y);
  weather(c, TAG.w, TAG.h, seed + 41, 0.6);
  c.restore();
  c.save();
  roundTag(c, TAG.x, TAG.y, TAG.w, TAG.h);
  c.strokeStyle = 'rgba(30, 18, 8, 0.55)';
  c.lineWidth = 6;
  c.stroke();
  c.restore();
  // the cords' knots through it
  for (const x of [TAG.x + 40, TAG.x + TAG.w - 40]) {
    c.fillStyle = '#2a1a10';
    c.beginPath();
    c.arc(x, TAG.y + 18, 7, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#c4a674';
    c.beginPath();
    c.arc(x, TAG.y + 18, 5, 0, Math.PI * 2);
    c.fill();
  }
  return cv;
}

/** a plank with its corners cut off */
function roundTag(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const k = 22;
  c.beginPath();
  c.moveTo(x + k, y);
  c.lineTo(x + w - k, y);
  c.lineTo(x + w, y + k);
  c.lineTo(x + w, y + h - k);
  c.lineTo(x + w - k, y + h);
  c.lineTo(x + k, y + h);
  c.lineTo(x, y + h - k);
  c.lineTo(x, y + k);
  c.closePath();
}

/** a painted log end: bark round the rim, the pale cut with its rings */
function logEnd(c: CanvasRenderingContext2D, x: number, y: number, r: number, rr: () => number): void {
  c.fillStyle = '#4a321e';
  c.beginPath();
  c.ellipse(x, y, r, r - 1, rr(), 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#d8b884';
  c.beginPath();
  c.arc(x, y, r - 4, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(120, 80, 40, 0.55)';
  c.lineWidth = 1.5;
  for (let k = 1; k <= 3; k++) {
    c.beginPath();
    c.arc(x + (rr() - 0.5) * 2, y + (rr() - 0.5) * 2, ((r - 4) * k) / 4, 0, Math.PI * 2);
    c.stroke();
  }
}
