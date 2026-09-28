/**
 * The rod in your hand: Tidewater's 7 ft spinning combo, held by the reel seat in whichever
 * controller has it, the reel hanging under your fingers.
 *
 * Everything that made it feel alive in Tidewater (game/FishingRod.js) carries over — the blank
 * is a damped spring that loads toward the line (only the tip for a nibble, deep into the butt
 * for a big fish), the bail flips open while your finger's on the line, the crank and rotor turn
 * as line comes in, the spool slips back when a fish takes drag. What's new is that the pose
 * isn't animated: it IS your hand, so the tip's speed is real and the cast and the strike read it.
 *
 * It's painted for the gear you've bought (fishing/rodLook.ts): the blank, grips, wraps and
 * metalwork for your rod, the reel's body and trim for your reel, the line on the spool and
 * through the guides for your line.
 */

import { BufferAttribute, Color, Matrix3, Matrix4, Mesh, Quaternion, Vector2, Vector3, type Object3D } from 'three';
import { bendAt, bendPower, BODY_Y, CRANK, REEL_Z, ROD_L, SEAT_Y, type Props, type RodTags, type RodUniforms } from './props.ts';
import { rodPaint, type GearLevels } from './rodLook.ts';

/** The rod rides this far up from the controller's pointing axis (a relaxed wrist). */
const ROD_TILT = 0.38;
const GEAR = 5.2; // rotor turns per crank turn
export const LINE_PER_CRANK = 0.8; // m of line per crank turn

/* The blank is a damped 2-D spring across its axis (~2.5 Hz, lightly damped). */
const K = 250;
const C = 8;
/** What the blank's own weight bends it when it's held level. */
const SAG = 0.012;
/** How much of the hand's swing the tip lags by (1 = all of its mass at the tip). */
const INERTIA = 0.7;
/** The hand's acceleration is clamped here (m/s²): a tracking glitch mustn't fold the rod. */
const MAX_ACC = 120;
/** The tip jumping this far in a frame is a teleport or a snap turn, not a swing. */
const JUMP = 0.6;
const MAX_BEND = 0.75;
/** The unbent tip-top, rod space. */
const TIP0 = new Vector3(0, ROD_L, 0);

const _m = new Matrix4();
const _inv = new Matrix4();
const _v = new Vector3();
const _b = { lat: 0, drop: 0 };
const _p = new Vector3();
const _q = new Quaternion();
const _one = new Vector3(1, 1, 1);
const _g = new Vector3();
const _a = new Vector3();
const _t = new Vector2();
const _rot = new Matrix3();

/**
 * Add the part of a pull that bends the blank to `out` (rod space x, z). `d` is the pull's unit
 * direction in rod space, `amount` what it would bend a blank it pulls square across. Along the
 * blank a pull only compresses it: pointing the rod at the fish takes the bend out of it. Across it
 * bends it by the sine of the angle, and a line running back past the tip (a rod held high over a
 * fish below) hooks the tip over with all of it.
 */
function addPull(d: Vector3, amount: number, out: Vector2): void {
  const s = Math.hypot(d.x, d.z);
  if (amount <= 0 || s < 1e-4) return;
  const f = d.y >= 0 ? s : Math.min(1, s / 0.2);
  out.x += (d.x / s) * f * amount;
  out.y += (d.z / s) * f * amount;
}

/** Hand → rod: rod +Y along the blank (tilted up from the pointing −Z), rod −Z (the reel) hanging below. */
const HOLD = new Matrix4()
  .makeBasis(
    new Vector3(1, 0, 0),
    new Vector3(0, Math.sin(ROD_TILT), -Math.cos(ROD_TILT)),
    new Vector3(0, Math.cos(ROD_TILT), Math.sin(ROD_TILT)),
  )
  .multiply(new Matrix4().makeTranslation(0, -SEAT_Y, 0));

interface TipSample {
  t: number;
  v: Vector3;
}

export class Rod {
  readonly mesh: Mesh;
  private readonly u: RodUniforms;
  /** world position of the tip-top (the line leaves from here) */
  readonly tip = new Vector3();
  /** smoothed world velocity of the tip as your hand swings it (the unbent tip: the blank's wobble isn't your swing) (m/s) */
  readonly tipVel = new Vector3();
  private readonly lastTip = new Vector3();
  private readonly lastVel = new Vector3();
  /** smoothed world acceleration of the unbent tip (m/s²): the blank lags it */
  private readonly tipAcc = new Vector3();
  private hasLast = false;
  private hasVel = false;
  private readonly samples: TipSample[] = [];

  bend = 0;
  /** the tip's deflection across the blank (rod space x, z; its length is `bend`) and its rate */
  private readonly bendXZ = new Vector2();
  private readonly bendVel = new Vector2();
  private load = 0.15;
  private readonly bendDir = new Vector3(0, 0, -1);
  private shapeP = bendPower(0.15);

  rotor = 0;
  crank = 0;
  spoolAng = 0;
  private bail = 0;
  /** crank turns / s (smoothed): animates the handle and drives the reel's sound */
  crankRate = 0;
  lineFill = 1;

  private readonly tags: RodTags | null;
  /** the colours as baked (Tidewater's), and the ones it wears now */
  private readonly baked: Uint8Array;
  private readonly paint: BufferAttribute;
  private dressed = '';

  constructor(props: Props) {
    const { mesh, uniforms } = props.makeRod();
    this.mesh = mesh;
    this.u = uniforms;
    this.mesh.visible = false;
    this.tags = props.rodTags;
    // its own colours, so repainting it leaves the shared geometry alone
    const col = mesh.geometry.getAttribute('color') as BufferAttribute;
    this.baked = (col.array as Uint8Array).slice();
    this.paint = new BufferAttribute((col.array as Uint8Array).slice(), 3, true);
    mesh.geometry = mesh.geometry.clone();
    mesh.geometry.setAttribute('color', this.paint);
  }

  /** Paint it for these gear levels (cheap to call every frame: it only repaints on a change). */
  dress(g: GearLevels): void {
    const key = `${g.rod}/${g.reel}/${g.line}`;
    if (key === this.dressed || !this.tags) return;
    this.dressed = key;
    const { names, mat, reel } = this.tags;
    // each material's colour on the rod and on the reel, as the vertex colours hold them (linear)
    const lut = new Map<number, [number, number, number] | null>();
    const c = new Color();
    const out = this.paint.array as Uint8Array;
    for (let i = 0; i < mat.length; i++) {
      const k = mat[i] * 2 + reel[i];
      let rgb = lut.get(k);
      if (rgb === undefined) {
        const hex = rodPaint(names[mat[i]], reel[i] === 1, g);
        rgb = hex ? (c.set(hex), [c.r, c.g, c.b].map((v) => Math.round(Math.min(1, v) * 255)) as [number, number, number]) : null;
        lut.set(k, rgb);
      }
      for (let j = 0; j < 3; j++) out[i * 3 + j] = rgb ? rgb[j] : this.baked[i * 3 + j];
    }
    this.paint.needsUpdate = true;
  }

  /**
   * Pose the rod on the hand and step its spring. It sits in the palm (the GRIP space's origin)
   * but points where the controller points (the RAY space's −Z): on Quest the grip frame is
   * pitched ~45° up from the ray, and a rod follows where you aim, not the angle of the handle. `towards`: where the line pulls (world), or
   * null for a line hanging straight down. `bendT` / `loadT`: Tidewater's targets for the state.
   */
  update(dt: number, time: number, grip: Object3D, ray: Object3D, o: { bendT: number; loadT: number; towards: Vector3 | null; bailOpen: boolean }): void {
    grip.updateWorldMatrix(true, false);
    ray.updateWorldMatrix(true, false);
    grip.getWorldPosition(_p);
    ray.getWorldQuaternion(_q);
    this.mesh.matrix.compose(_p, _q, _one).multiply(HOLD);
    this.mesh.matrixWorldNeedsUpdate = true;
    _inv.copy(this.mesh.matrix).invert();

    // the hand's swing, read off the unbent tip (the cast and the strike read this too)
    _p.copy(TIP0).applyMatrix4(this.mesh.matrix);
    let swung = false;
    if (this.hasLast && dt > 0) {
      _v.copy(_p).sub(this.lastTip);
      if (_v.lengthSq() > JUMP * JUMP) {
        this.resetMotion();
      } else {
        this.lastVel.copy(this.tipVel);
        this.tipVel.lerp(_v.divideScalar(dt), 1 - Math.exp(-dt * 30));
        this.samples.push({ t: time, v: this.tipVel.clone() });
        while (this.samples.length && time - this.samples[0].t > 0.15) this.samples.shift();
        if (this.hasVel) {
          _a.copy(this.tipVel).sub(this.lastVel).divideScalar(dt);
          this.tipAcc.lerp(_a, 1 - Math.exp(-dt * 20));
          swung = true;
        }
        this.hasVel = true;
      }
    }
    this.lastTip.copy(_p);
    this.hasLast = true;

    // where it's pulled (rod space, across the blank): its own weight toward the ground, and the
    // line from the tip-top toward the bob (a fish hanging off it, or the rod loaded in the
    // back-cast, pulls straight down)
    _g.set(0, -1, 0).transformDirection(_inv);
    _t.set(0, 0);
    addPull(_g, SAG, _t);
    const lineLoad = Math.max(0, o.bendT - SAG);
    if (!o.towards) addPull(_g, lineLoad, _t);
    else if (_v.copy(o.towards).applyMatrix4(_inv).sub(TIP0).lengthSq() > 1e-6) addPull(_v.normalize(), lineLoad, _t);

    // the spring: toward the pull, and the tip lagging behind the hand when you swing it
    let ax = 0;
    let az = 0;
    if (swung) {
      _rot.setFromMatrix4(_inv);
      _a.copy(this.tipAcc).clampLength(0, MAX_ACC).applyMatrix3(_rot);
      ax = (-_a.x * INERTIA) / ROD_L;
      az = (-_a.z * INERTIA) / ROD_L;
    }
    const b = this.bendXZ;
    const bv = this.bendVel;
    const h = Math.min(dt, 0.05); // a long frame mustn't blow the spring up
    bv.x += ((_t.x - b.x) * K - bv.x * C + ax) * h;
    bv.y += ((_t.y - b.y) * K - bv.y * C + az) * h;
    b.addScaledVector(bv, h).clampLength(0, MAX_BEND);
    this.bend = b.length();
    if (this.bend > 1e-5) this.bendDir.set(b.x / this.bend, 0, b.y / this.bend);
    this.load += (o.loadT - this.load) * (1 - Math.exp(-dt * 6));
    const P = bendPower(this.load);
    this.shapeP = P;
    this.u.rodBend.value.set(this.bendDir.x, 0, this.bendDir.z, this.bend);
    this.u.rodShape.value.set(P, 0, 0, 0);

    // the tip, on the same curve as the shader
    bendAt(ROD_L, this.bend, P, _b);
    this.tip.set(this.bendDir.x * _b.lat, ROD_L - _b.drop, this.bendDir.z * _b.lat).applyMatrix4(this.mesh.matrix);

    // reel: bail, rotor (GEAR× the crank, shown at most ~3 turns/s), spool
    const bailT = o.bailOpen ? 1 : 0;
    const rate = bailT > this.bail ? 6 : 16;
    this.bail += Math.sign(bailT - this.bail) * Math.min(Math.abs(bailT - this.bail), rate * dt);
    this.u.reelAnim.value.set(this.rotor, this.bail, this.crank, this.spoolAng);
    this.u.reelAnim2.value.set(Math.sin(this.crank * 0.5) * 0.0035, this.lineFill, 0, 0);
  }

  /** Turn the crank by `turns` (from the reel's line speed or your other hand). */
  turnCrank(turns: number, dt: number): void {
    const d = turns * Math.PI * 2;
    this.crank += d;
    this.rotor += Math.min(d * GEAR, 3.1 * Math.PI * 2 * dt);
  }

  /** The fastest the tip moved in the last ~0.15 s (a cast is released just after its peak). */
  peakTipVelocity(out: Vector3): Vector3 {
    out.set(0, 0, 0);
    let best = -1;
    for (const s of this.samples) {
      const l = s.v.lengthSq();
      if (l > best) {
        best = l;
        out.copy(s.v);
      }
    }
    return out;
  }

  /** Where the bent blank's axis is at rod height `y`, relative to the straight rod (rod space). */
  blankOffset(y: number, out: Vector3): Vector3 {
    bendAt(y, this.bend, this.shapeP, _b);
    return out.set(this.bendDir.x * _b.lat, -_b.drop, this.bendDir.z * _b.lat);
  }

  /** World → rod space. */
  toRod(world: Vector3, out: Vector3): Vector3 {
    return out.copy(world).applyMatrix4(_m.copy(this.mesh.matrix).invert());
  }

  /** World position of the crank's axis (where your other hand reaches for the handle). */
  crankCentre(out: Vector3): Vector3 {
    return out.set(CRANK.x, BODY_Y, REEL_Z).applyMatrix4(this.mesh.matrix);
  }

  /** The crank angle your hand is at (rod space, same convention as the shader), in radians. */
  crankAngleOf(world: Vector3): number {
    this.toRod(world, _v);
    const qy = _v.y - BODY_Y;
    const qz = _v.z - REEL_Z;
    // the knob at rest hangs below the axis: (y, z) = (−r cos a, −r sin a)
    return Math.atan2(-qz, -qy);
  }

  resetMotion(): void {
    this.hasLast = false;
    this.hasVel = false;
    this.samples.length = 0;
    this.tipVel.set(0, 0, 0);
    this.tipAcc.set(0, 0, 0);
  }
}
