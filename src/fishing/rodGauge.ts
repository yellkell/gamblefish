/**
 * The line meter clipped to the rod: a little rugged gadget on a ball-jointed arm, clamped to
 * the blank just ahead of the fore grip and tipped back to face you. It reads like the real
 * thing because it is built like one:
 *
 *  - a rubber sleeve round the blank with two stainless band clamps, a saddle, an anodised arm
 *    with a ball joint at each end and a knurled thumb knob, a round plate on the housing's back;
 *  - a moulded housing with a printed faceplate (textured plastic, an orange flash and the
 *    model line, a recessed window) and two rubber buttons;
 *  - a backlit screen behind glass: a black mask round the active area, edge-lit backlight,
 *    seven-segment line counter with ghost segments, a segmented tension meter with its zones
 *    printed under it, and a glass sheet that catches the sun as you turn the rod.
 *
 * What it tells you is unchanged: the instruction for the moment, the line out, the tension
 * with Tidewater's green band, and how full the backpack is (A opens it).
 */

import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  Euler,
  Group,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshPhongMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { font } from '../ui/fonts.ts';
import { INK, Panel, roundRect } from '../ui/panel.ts';

export interface GaugeState {
  label: string;
  labelColour?: string;
  tension: number | null; // null: no fish on
  band: [number, number];
  lineOut: number;
  holdKg: number;
  holdMax: number;
}

/* ---- the build, in metres ---------------------------------------------------------------- */

/** Where the clamp grips the blank (rod height). */
export const CLAMP_Y = 0.652;
/** The head (the housing's front face, centred on the screen) in rod space: ahead of the fore
 *  grip, 5 cm above the blank, tipped back ~52° to face the angler behind it. */
const HEAD = new Matrix4().compose(
  new Vector3(0, 0.66, 0.052),
  new Quaternion().setFromEuler(new Euler(0.9, 0, 0)),
  new Vector3(1, 1, 1),
);

const SCREEN_W = 0.08;
const SCREEN_H = 0.04;
const BEZEL_SIDE = 0.009;
const BEZEL_TOP = 0.005;
const BEZEL_BOTTOM = 0.013;
const BODY_W = SCREEN_W + BEZEL_SIDE * 2;
const BODY_H = SCREEN_H + BEZEL_TOP + BEZEL_BOTTOM;
const BODY_D = 0.015;
const BODY_R = 0.0035;
/** the housing's centre sits this far below the screen's (the deeper bottom bezel) */
const BODY_CY = (BEZEL_TOP - BEZEL_BOTTOM) / 2;
const FACE_W = BODY_W - BODY_R * 2;
const FACE_H = BODY_H - BODY_R * 2;
const BUTTONS = [
  { x: 0.024, colour: 0x2b2e33 },
  { x: 0.035, colour: 0xc2531d },
];
const BUTTON_Y = -SCREEN_H / 2 - BEZEL_BOTTOM / 2 - 0.0003;
const BUTTON_R = 0.0027;

const BLANK_R = 0.0068; // the blank's radius where the clamp sits
const SLEEVE_R = BLANK_R + 0.003;
const SLEEVE_L = 0.03;

const head = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z).applyMatrix4(HEAD);

/** A cylinder from a to b (rod space). */
function strut(r: number, a: Vector3, b: Vector3, seg = 12): BufferGeometry {
  const d = b.clone().sub(a);
  const g = new CylinderGeometry(r, r, d.length(), seg);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

function sphere(r: number, at: Vector3): BufferGeometry {
  return new SphereGeometry(r, 14, 10).translate(at.x, at.y, at.z);
}

/** A geometry built in the head's frame (z out of the face), carried into rod space. */
const inHead = (g: BufferGeometry): BufferGeometry => g.applyMatrix4(HEAD);

const merge = (gs: BufferGeometry[]): BufferGeometry => {
  // strip to position + normal so every part merges whatever it was built with
  for (const g of gs) for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  return mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)))!;
};

const phong = (colour: number, shininess: number, specular: number): MeshPhongMaterial => new MeshPhongMaterial({ color: colour, shininess, specular });

/* ---- the gadget ---------------------------------------------------------------------------- */

export class RodGauge {
  /** Rod space: set its matrix to the rod's (plus the blank's bend at the clamp). */
  readonly group = new Group();
  readonly panel = new Panel([512, 256], [SCREEN_W, SCREEN_H]);
  private readonly face: CanvasTexture;
  private readonly faceCanvas: HTMLCanvasElement;
  private last = '';

  constructor() {
    this.group.matrixAutoUpdate = false;

    // --- the mount: sleeve, band clamps, saddle, arm, ball joints, thumb knob ---
    const clamp = new Vector3(0, CLAMP_Y, 0);
    const saddleTop = new Vector3(0, CLAMP_Y, SLEEVE_R + 0.0038);
    const socket = head(0, BODY_CY, -BODY_D - 0.0058); // the ball on the housing's back plate
    const knob = saddleTop.clone().lerp(socket, 0.45);
    const side = new Vector3(1, 0, 0);

    const rubber = merge([
      new CylinderGeometry(SLEEVE_R, SLEEVE_R, SLEEVE_L, 22).translate(clamp.x, clamp.y, clamp.z),
      // soft lips where the sleeve meets the blank
      new TorusGeometry(SLEEVE_R - 0.0012, 0.0012, 6, 22).rotateX(Math.PI / 2).translate(0, CLAMP_Y - SLEEVE_L / 2, 0),
      new TorusGeometry(SLEEVE_R - 0.0012, 0.0012, 6, 22).rotateX(Math.PI / 2).translate(0, CLAMP_Y + SLEEVE_L / 2, 0),
    ]);
    const steel = merge([
      new TorusGeometry(SLEEVE_R + 0.0003, 0.00085, 6, 26).rotateX(Math.PI / 2).translate(0, CLAMP_Y - 0.0085, 0),
      new TorusGeometry(SLEEVE_R + 0.0003, 0.00085, 6, 26).rotateX(Math.PI / 2).translate(0, CLAMP_Y + 0.0085, 0),
      // the band clamps' screw housings, on the side
      new BoxGeometry(0.004, 0.0034, 0.0034).translate(SLEEVE_R + 0.0015, CLAMP_Y - 0.0085, 0),
      new BoxGeometry(0.004, 0.0034, 0.0034).translate(SLEEVE_R + 0.0015, CLAMP_Y + 0.0085, 0),
      // the thumb knob's bolt through the arm
      strut(0.0012, knob.clone().addScaledVector(side, -0.0055), knob.clone().addScaledVector(side, 0.0065), 8),
    ]);
    const anodised = merge([
      new BoxGeometry(0.011, 0.022, 0.0048).translate(0, CLAMP_Y, SLEEVE_R + 0.0014),
      sphere(0.0042, saddleTop),
      strut(0.0028, saddleTop, socket),
      sphere(0.0044, socket),
      // the knurled thumb knob that locks the arm
      strut(0.0052, knob.clone().addScaledVector(side, 0.003), knob.clone().addScaledVector(side, 0.0072), 14),
      // the round plate the ball seats in, on the housing's back
      inHead(new CylinderGeometry(0.0062, 0.0085, 0.004, 20).rotateX(Math.PI / 2).translate(0, BODY_CY, -BODY_D - 0.002)),
    ]);
    this.group.add(
      new Mesh(rubber, phong(0x141618, 6, 0x0a0a0a)),
      new Mesh(steel, phong(0xb8bec5, 90, 0x9a9a9a)),
      new Mesh(anodised, phong(0x2a2f36, 45, 0x444a52)),
    );

    // --- the housing: a moulded body, its printed faceplate and the rubber buttons ---
    const body = inHead(new RoundedBoxGeometry(BODY_W, BODY_H, BODY_D, 3, BODY_R).translate(0, BODY_CY, -BODY_D / 2));
    this.group.add(new Mesh(body, phong(0x1d2024, 14, 0x1a1a1a)));

    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = 512;
    this.faceCanvas.height = Math.round((512 * FACE_H) / FACE_W);
    this.face = new CanvasTexture(this.faceCanvas);
    this.face.colorSpace = SRGBColorSpace;
    this.face.anisotropy = 4;
    const faceplate = new Mesh(
      inHead(new PlaneGeometry(FACE_W, FACE_H).translate(0, BODY_CY, 0.0002)),
      new MeshPhongMaterial({ map: this.face, shininess: 16, specular: 0x202020 }),
    );
    this.group.add(faceplate);

    for (const b of BUTTONS) {
      const g = inHead(new CylinderGeometry(BUTTON_R * 0.92, BUTTON_R, 0.0016, 20).rotateX(Math.PI / 2).translate(b.x, BUTTON_Y, 0.0008));
      this.group.add(new Mesh(g, phong(b.colour, 10, 0x151515)));
    }

    // --- the screen, and the glass over it that catches the sun ---
    const tex = this.panel.texture;
    tex.generateMipmaps = true; // a screen 8 cm wide seen from arm's length: no shimmer on the fine print
    tex.minFilter = LinearMipmapLinearFilter;
    const scr = this.panel.mesh;
    scr.matrixAutoUpdate = false;
    scr.matrix.copy(HEAD).multiply(new Matrix4().makeTranslation(0, 0, 0.0004));
    this.group.add(scr);
    const glass = new Mesh(
      inHead(new PlaneGeometry(SCREEN_W + 0.001, SCREEN_H + 0.001).translate(0, 0, 0.0008)),
      new MeshPhongMaterial({
        color: 0x000000,
        specular: 0x6a6a6a,
        shininess: 140,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    );
    glass.renderOrder = 11;
    this.group.add(glass);

    this.paintFace();
    this.panel.repaintOnFonts(() => {
      this.paintFace();
      this.last = '';
    });
  }

  /** Pose the gadget: the rod's matrix, shifted with the blank where the clamp grips it. */
  place(rodMatrix: Matrix4, blankOffset: Vector3): void {
    this.group.matrix.copy(rodMatrix).multiply(_t.makeTranslation(blankOffset.x, blankOffset.y, blankOffset.z));
    this.group.matrixWorldNeedsUpdate = true;
  }

  /** The printed faceplate: textured plastic, the window's recess, the model line, the button rings. */
  private paintFace(): void {
    const cv = this.faceCanvas;
    const c = cv.getContext('2d')!;
    const W = cv.width;
    const H = cv.height;
    const px = W / FACE_W; // px per metre
    const X = (m: number): number => W / 2 + m * px; // head x (m) → canvas
    const Y = (m: number): number => H / 2 - (m - BODY_CY) * px; // head y (m) → canvas

    // moulded plastic: charcoal with a fine speckle
    c.fillStyle = '#25292e';
    c.fillRect(0, 0, W, H);
    const img = c.getImageData(0, 0, W, H);
    let seed = 7;
    for (let i = 0; i < img.data.length; i += 4) {
      seed = (seed * 16807) % 2147483647;
      const n = ((seed / 2147483647) - 0.5) * 12;
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n;
    }
    c.putImageData(img, 0, 0);
    // a faint sheen from the top of the moulding
    const sheen = c.createLinearGradient(0, 0, 0, H);
    sheen.addColorStop(0, 'rgba(255,255,255,0.06)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.12)');
    c.fillStyle = sheen;
    c.fillRect(0, 0, W, H);

    // the window the screen sits in: a gasket, shadow on the top lip, light on the bottom one
    const wx = X(-SCREEN_W / 2);
    const wy = Y(SCREEN_H / 2);
    const ww = SCREEN_W * px;
    const wh = SCREEN_H * px;
    roundRect(c, wx - 5, wy - 5, ww + 10, wh + 10, 12);
    c.fillStyle = '#0b0c0e';
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(0,0,0,0.55)';
    c.beginPath();
    c.moveTo(wx - 4, wy - 6);
    c.lineTo(wx + ww + 4, wy - 6);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.14)';
    c.beginPath();
    c.moveTo(wx - 2, wy + wh + 6);
    c.lineTo(wx + ww + 2, wy + wh + 6);
    c.stroke();

    // bottom left: an orange flash and the model line (no maker's name)
    const by = Y(-SCREEN_H / 2 - BEZEL_BOTTOM / 2);
    const bx = wx + 2;
    c.fillStyle = '#d0591f';
    c.beginPath();
    c.moveTo(bx, by + 10);
    c.lineTo(bx + 8, by - 12);
    c.lineTo(bx + 14, by - 12);
    c.lineTo(bx + 6, by + 10);
    c.closePath();
    c.fill();
    const spaced = c as CanvasRenderingContext2D & { letterSpacing?: string };
    spaced.letterSpacing = '3px';
    c.font = font(700, 17);
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.fillStyle = 'rgba(214, 219, 224, 0.8)';
    c.fillText('LINE · TENSION METER', bx + 22, by);
    spaced.letterSpacing = '0px';

    // recessed rings round the buttons
    for (const b of BUTTONS) {
      const x = X(b.x);
      const y = Y(BUTTON_Y);
      c.beginPath();
      c.arc(x, y, BUTTON_R * px + 3, 0, Math.PI * 2);
      c.fillStyle = '#0e1012';
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.1)';
      c.lineWidth = 1.5;
      c.stroke();
    }
    // tiny screws in the corners
    for (const [sx, sy] of [
      [10, 10],
      [W - 10, 10],
      [10, H - 10],
      [W - 10, H - 10],
    ]) {
      c.beginPath();
      c.arc(sx, sy, 4.5, 0, Math.PI * 2);
      c.fillStyle = '#101214';
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.18)';
      c.lineWidth = 1;
      c.stroke();
      c.beginPath();
      c.moveTo(sx - 2.5, sy);
      c.lineTo(sx + 2.5, sy);
      c.moveTo(sx, sy - 2.5);
      c.lineTo(sx, sy + 2.5);
      c.strokeStyle = 'rgba(255,255,255,0.25)';
      c.stroke();
    }
    this.face.needsUpdate = true;
  }

  paint(s: GaugeState): void {
    const key = `${s.label}|${s.labelColour}|${s.tension === null ? '-' : s.tension.toFixed(2)}|${s.band[0]},${s.band[1]}|${s.lineOut.toFixed(0)}|${s.holdKg}/${s.holdMax}`;
    if (key === this.last) return;
    this.last = key;
    const c = this.panel.ctx;
    const W = 512;
    const H = 256;
    this.panel.clear();

    // the glass: black mask round the active area
    roundRect(c, 0, 0, W, H, 12);
    c.fillStyle = '#050607';
    c.fill();
    const ax = 12;
    const ay = 12;
    const aw = W - 24;
    const ah = H - 24;
    c.save();
    roundRect(c, ax, ay, aw, ah, 4);
    c.clip();
    // the backlight: brightest in the middle, a little bleed along the lit bottom edge
    c.fillStyle = '#081217';
    c.fillRect(ax, ay, aw, ah);
    const back = c.createRadialGradient(W * 0.45, H * 0.45, 20, W * 0.45, H * 0.45, W * 0.6);
    back.addColorStop(0, 'rgba(40, 80, 96, 0.35)');
    back.addColorStop(1, 'rgba(0, 0, 0, 0)');
    c.fillStyle = back;
    c.fillRect(ax, ay, aw, ah);
    const bleed = c.createLinearGradient(0, ay + ah - 26, 0, ay + ah);
    bleed.addColorStop(0, 'rgba(120, 190, 210, 0)');
    bleed.addColorStop(1, 'rgba(120, 190, 210, 0.08)');
    c.fillStyle = bleed;
    c.fillRect(ax, ay + ah - 26, aw, 26);

    const on = 'rgba(214, 236, 242, 0.82)'; // the display's own white
    const dim = 'rgba(170, 205, 215, 0.5)';
    c.textBaseline = 'middle';

    // status bar: the backpack and how to open it, the battery
    c.fillStyle = 'rgba(160, 210, 225, 0.06)';
    c.fillRect(ax, ay, aw, 38);
    c.fillStyle = 'rgba(160, 210, 225, 0.14)';
    c.fillRect(ax, ay + 38, aw, 1);
    const sy = ay + 19;
    glow(c, on, 4);
    bagIcon(c, ax + 14, sy, on);
    c.font = font(700, 25);
    c.textAlign = 'left';
    c.fillStyle = on;
    c.fillText(`${s.holdKg} / ${s.holdMax}`, ax + 30, sy + 1);
    const used = c.measureText(`${s.holdKg} / ${s.holdMax}`).width;
    c.font = font(600, 21);
    c.fillStyle = dim;
    c.fillText('cells', ax + 37 + used, sy + 1);
    // right: [A] OPEN, then the battery
    const bx = ax + aw - 44;
    batteryIcon(c, bx, sy, on);
    c.font = font(700, 22);
    c.textAlign = 'right';
    c.fillStyle = on;
    c.fillText('OPEN', bx - 14, sy + 1);
    const ox = bx - 14 - c.measureText('OPEN').width - 18;
    c.beginPath();
    c.arc(ox, sy, 13, 0, Math.PI * 2);
    c.fillStyle = on;
    c.fill();
    c.font = font(700, 20);
    c.textAlign = 'center';
    c.fillStyle = '#081217';
    glow(c, on, 0);
    c.fillText('A', ox, sy + 1);

    // the instruction, as big as it will go beside the line counter
    const labelW = 318;
    let size = 62;
    c.font = font(700, size);
    while (size > 34 && c.measureText(s.label).width > labelW) c.font = font(700, (size -= 2));
    const lc = s.labelColour ?? INK.hot;
    glow(c, lc, 10);
    c.textAlign = 'left';
    c.fillStyle = lc;
    c.fillText(s.label, ax + 12, ay + 88, labelW);

    // the line counter: three seven-segment digits, ghosts behind, metres
    const cx = ax + aw - 150;
    glow(c, on, 0);
    c.font = font(600, 13);
    c.textAlign = 'left';
    c.fillStyle = dim;
    spacing(c, '2px');
    c.fillText('LINE OUT', cx + 2, ay + 52);
    spacing(c, '0px');
    const metres = Math.min(999, Math.max(0, Math.round(s.lineOut)));
    const digits = String(metres).padStart(3, ' ');
    for (let i = 0; i < 3; i++) {
      const d = digits[i] === ' ' ? null : Number(digits[i]);
      seg7(c, d, cx + 4 + i * 38, ay + 64, 28, 46, 7, on, 'rgba(160, 210, 225, 0.07)');
    }
    c.font = font(600, 20);
    c.fillStyle = dim;
    c.textAlign = 'left';
    c.fillText('m', cx + 122, ay + 100);

    // the tension meter: a row of segments, lit up to the pull, each in its zone's colour
    const my = ay + 136;
    c.font = font(600, 13);
    c.fillStyle = dim;
    spacing(c, '2px');
    c.fillText('TENSION', ax + 12, my);
    spacing(c, '0px');
    if (s.tension !== null) {
      const t = s.tension;
      const zc = zone(t, s.band);
      glow(c, zc, 6);
      c.font = font(700, 18);
      c.textAlign = 'right';
      c.fillStyle = zc;
      c.fillText(`${Math.round(t * 100)}%`, ax + aw - 12, my);
      glow(c, on, 0);
    }
    const N = 28;
    const x0 = ax + 12;
    const span = aw - 24;
    const pitch = span / N;
    const segW = pitch - 4;
    const top = my + 13;
    const segH = 38;
    const MAX = 1.15;
    for (let i = 0; i < N; i++) {
      const mid = ((i + 0.5) / N) * MAX;
      const zc = zone(mid, s.band);
      const lit = s.tension !== null && s.tension >= (i / N) * MAX + MAX / N / 3;
      // taller toward the top end, like a real bar meter's ramp
      const h = segH * (0.55 + 0.45 * (i / (N - 1)));
      const x = x0 + i * pitch;
      const y = top + segH - h;
      c.globalAlpha = lit ? 1 : 0.13;
      glow(c, zc, lit ? 8 : 0);
      c.fillStyle = zc;
      roundRect(c, x, y, segW, h, 2);
      c.fill();
    }
    c.globalAlpha = 1;
    glow(c, on, 0);
    // the zones, printed under the meter, and its ticks
    const zy = top + segH + 6;
    const at = (t: number): number => x0 + (span * Math.min(MAX, Math.max(0, t))) / MAX;
    const strip: [number, number, string][] = [
      [0, s.band[0], INK.sea],
      [s.band[0], s.band[1], INK.good],
      [s.band[1], 1, INK.warn],
      [1, MAX, INK.danger],
    ];
    for (const [a, b, col] of strip) {
      c.fillStyle = col;
      c.globalAlpha = 0.7;
      c.fillRect(at(a), zy, Math.max(0, at(b) - at(a) - 2), 4);
    }
    c.globalAlpha = 1;
    c.fillStyle = dim;
    for (let i = 0; i <= N; i += 4) c.fillRect(x0 + i * pitch - 1, zy + 7, 1.5, 5);
    c.restore();

    // the display's fine pixel rows, and the glass: a shadow under the top lip, a soft glare
    c.save();
    roundRect(c, ax, ay, aw, ah, 4);
    c.clip();
    c.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = ay; y < ay + ah; y += 3) c.fillRect(ax, y, aw, 1);
    const lip = c.createLinearGradient(0, ay, 0, ay + 10);
    lip.addColorStop(0, 'rgba(0,0,0,0.45)');
    lip.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = lip;
    c.fillRect(ax, ay, aw, 10);
    c.restore();
    const glare = c.createLinearGradient(0, 0, W * 0.55, H);
    glare.addColorStop(0, 'rgba(255,255,255,0.10)');
    glare.addColorStop(0.42, 'rgba(255,255,255,0.03)');
    glare.addColorStop(0.43, 'rgba(255,255,255,0)');
    glare.addColorStop(1, 'rgba(255,255,255,0)');
    roundRect(c, 0, 0, W, H, 12);
    c.fillStyle = glare;
    c.fill();
    this.panel.commit();
  }
}

const _t = new Matrix4();

/** The meter's colour for a tension: below the band, in it, over it, breaking. */
function zone(t: number, band: [number, number]): string {
  return t > 1 ? INK.danger : t > band[1] ? INK.warn : t >= band[0] ? INK.good : INK.sea;
}

/** The backlight bleeding round lit pixels. */
function glow(c: CanvasRenderingContext2D, colour: string, blur: number): void {
  c.shadowColor = colour;
  c.shadowBlur = blur;
}

function spacing(c: CanvasRenderingContext2D, v: string): void {
  (c as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = v;
}

/** Which of the segments a–g (top, top right, bottom right, bottom, bottom left, top left, middle) each digit lights. */
const SEG = [0b1111110, 0b0110000, 0b1101101, 0b1111001, 0b0110011, 0b1011011, 0b1011111, 0b1110000, 0b1111111, 0b1111011];

/** A slanted seven-segment digit at (x, y) (top left), w × h, segments `t` thick; unlit segments ghosted. */
function seg7(c: CanvasRenderingContext2D, d: number | null, x: number, y: number, w: number, h: number, t: number, colour: string, ghost: string): void {
  const mask = d === null ? 0 : SEG[d];
  const g = 1.5; // the gap between segments
  const hm = h / 2;
  const hor = (sx: number, sy: number): [number, number][] => [
    [sx + g, sy],
    [sx + g + t / 2, sy - t / 2],
    [sx + w - g - t / 2, sy - t / 2],
    [sx + w - g, sy],
    [sx + w - g - t / 2, sy + t / 2],
    [sx + g + t / 2, sy + t / 2],
  ];
  const ver = (sx: number, sy: number): [number, number][] => [
    [sx, sy + g],
    [sx + t / 2, sy + g + t / 2],
    [sx + t / 2, sy + hm - g - t / 2],
    [sx, sy + hm - g],
    [sx - t / 2, sy + hm - g - t / 2],
    [sx - t / 2, sy + g + t / 2],
  ];
  const segs = [hor(0, 0), ver(w, 0), ver(w, hm), hor(0, h), ver(0, hm), ver(0, 0), hor(0, hm)];
  c.save();
  c.translate(x, y);
  c.transform(1, 0, -0.1, 1, h * 0.1, 0); // the slant real counters have
  segs.forEach((pts, i) => {
    const lit = (mask >> (6 - i)) & 1;
    c.beginPath();
    pts.forEach(([px, py], j) => (j ? c.lineTo(px, py) : c.moveTo(px, py)));
    c.closePath();
    c.shadowColor = colour;
    c.shadowBlur = lit ? 8 : 0;
    c.fillStyle = lit ? colour : ghost;
    c.fill();
  });
  c.restore();
}

function bagIcon(c: CanvasRenderingContext2D, x: number, y: number, colour: string): void {
  c.strokeStyle = colour;
  c.fillStyle = colour;
  c.lineWidth = 2;
  c.beginPath();
  c.arc(x, y - 5, 5, Math.PI, 0);
  c.stroke();
  roundRect(c, x - 10, y - 5, 20, 15, 3);
  c.fill();
}

function batteryIcon(c: CanvasRenderingContext2D, x: number, y: number, colour: string): void {
  c.strokeStyle = colour;
  c.fillStyle = colour;
  c.lineWidth = 1.5;
  roundRect(c, x - 4, y - 8, 30, 16, 2);
  c.stroke();
  c.fillRect(x + 26.5, y - 3.5, 3, 7);
  for (let i = 0; i < 3; i++) c.fillRect(x - 1 + i * 8.6, y - 5, 6.6, 10);
}
