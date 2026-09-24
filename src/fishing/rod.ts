/**
 * The rod in your hand: Tidewater's 7 ft spinning combo, held by the reel seat in whichever
 * controller has it, the reel hanging under your fingers.
 *
 * Everything that made it feel alive in Tidewater (game/FishingRod.js) carries over — the blank
 * is a damped spring that loads toward the line (only the tip for a nibble, deep into the butt
 * for a big fish), the bail flips open while your finger's on the line, the crank and rotor turn
 * as line comes in, the spool slips back when a fish takes drag. What's new is that the pose
 * isn't animated: it IS your hand, so the tip's speed is real and the cast and the strike read it.
 */

import { Matrix4, Mesh, Quaternion, Vector3, type Object3D } from 'three';
import { bendAt, bendPower, BODY_Y, CRANK, REEL_Z, ROD_L, SEAT_Y, type Props, type RodUniforms } from './props.ts';

/** The rod rides this far up from the controller's pointing axis (a relaxed wrist). */
const ROD_TILT = 0.38;
const GEAR = 5.2; // rotor turns per crank turn
export const LINE_PER_CRANK = 0.8; // m of line per crank turn

const _m = new Matrix4();
const _inv = new Matrix4();
const _v = new Vector3();
const _b = { lat: 0, drop: 0 };
const _p = new Vector3();
const _q = new Quaternion();
const _one = new Vector3(1, 1, 1);

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
  /** smoothed world velocity of the tip (m/s) */
  readonly tipVel = new Vector3();
  private readonly lastTip = new Vector3();
  private hasLast = false;
  private readonly samples: TipSample[] = [];

  bend = 0;
  private bendVel = 0;
  private load = 0.15;
  private readonly bendDir = new Vector3(0, 0, -1);

  rotor = 0;
  crank = 0;
  spoolAng = 0;
  private bail = 0;
  /** crank turns / s (smoothed): animates the handle and drives the reel's sound */
  crankRate = 0;
  lineFill = 1;

  constructor(props: Props) {
    const { mesh, uniforms } = props.makeRod();
    this.mesh = mesh;
    this.u = uniforms;
    this.mesh.visible = false;
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

    // bend: a damped spring toward the load (~2.5 Hz, lightly damped)
    const K = 250;
    const C = 8;
    this.bendVel += ((o.bendT - this.bend) * K - this.bendVel * C) * dt;
    this.bend += this.bendVel * dt;
    this.load += (o.loadT - this.load) * (1 - Math.exp(-dt * 6));
    // direction (rod space, across the blank): toward the line, or down toward the ground
    if (o.towards) _v.copy(o.towards).applyMatrix4(_inv);
    else _v.set(0, -1, 0).transformDirection(_inv);
    _v.y = 0;
    if (_v.lengthSq() > 1e-6) this.bendDir.lerp(_v.normalize(), 1 - Math.exp(-dt * 10)).normalize();
    const P = bendPower(this.load);
    this.u.rodBend.value.set(this.bendDir.x, 0, this.bendDir.z, this.bend);
    this.u.rodShape.value.set(P, 0, 0, 0);

    // the tip, on the same curve as the shader
    bendAt(ROD_L, this.bend, P, _b);
    this.tip.set(this.bendDir.x * _b.lat, ROD_L - _b.drop, this.bendDir.z * _b.lat).applyMatrix4(this.mesh.matrix);
    if (this.hasLast && dt > 0) {
      _v.copy(this.tip).sub(this.lastTip).divideScalar(dt);
      this.tipVel.lerp(_v, 1 - Math.exp(-dt * 30));
      this.samples.push({ t: time, v: this.tipVel.clone() });
      while (this.samples.length && time - this.samples[0].t > 0.15) this.samples.shift();
    }
    this.lastTip.copy(this.tip);
    this.hasLast = true;

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
    this.samples.length = 0;
    this.tipVel.set(0, 0, 0);
  }
}
