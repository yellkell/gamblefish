/**
 * The great white's staging (the rules are fishing/shark.ts):
 *
 *  - CRUISING: its back just under the surface, the tall dorsal fin cutting the water where the
 *    line goes in, swinging from side to side as it swims;
 *  - BREACH: as each run begins it launches itself clear of the sea, nose first, twists and
 *    crashes back on its side: a white wall of spray going up and coming down, the boom of it;
 *  - THE GRIP: a ring of light round the rod's foregrip, just above your hand, pulsing amber
 *    while the run wants your other hand there, and filling bead by bead in green while you
 *    hold it;
 *  - ALONGSIDE: beaten, it rolls up at the surface under the pier, all 4 m of it, fins
 *    working, while the card and the party go up; then it's let go, and it sinks and sweeps off
 *    with a slap of its tail.
 */

import {
  AdditiveBlending,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Scene,
} from 'three';
import { MIX, shot, surfaceThrash, waterExitFish } from '../audio/samples.ts';
import type { WaterFx } from '../fx/water.ts';
import type { FishUniforms, Props } from './props.ts';
import { SHARK_ID } from './shark.ts';

const BEADS = 16;
/** where the other hand takes hold: the foregrip, just above the reel seat (rod frame) */
export const GRIP_Y = 0.52;

const _v = new Vector3();
const _w = new Vector3();
const _m = new Matrix4();
const _o = new Object3D();

type Mode = 'off' | 'cruise' | 'breach' | 'alongside' | 'release';

export class SharkShow {
  readonly mesh: Mesh;
  private readonly u: FishUniforms;
  /** its length (m) */
  len = 4.2;
  private mode: Mode = 'off';
  private t = 0;
  private readonly heading = new Vector3(0, 0, -1);
  private readonly from = new Vector3();
  private readonly at = new Vector3();
  private rollSide = 1;
  private splashed = false;

  // the grip ring, parented to the rod
  readonly ring = new Group();
  private readonly hoop: Mesh;
  private readonly beads: InstancedMesh;
  private readonly halo: Mesh;

  constructor(
    scene: Scene,
    props: Props,
    private readonly sea: (x: number, z: number) => number,
    private readonly fx: () => WaterFx | null,
  ) {
    const { mesh, uniforms } = props.makeFish(SHARK_ID);
    this.mesh = mesh;
    this.u = uniforms;
    mesh.visible = false;
    mesh.rotation.order = 'YXZ';
    scene.add(mesh);

    // a hoop round the grip, beads round the hoop, a soft halo
    this.hoop = new Mesh(new TorusGeometry(0.036, 0.004, 8, 40).rotateX(Math.PI / 2), new MeshBasicMaterial({ color: 0xffb000, transparent: true, toneMapped: false, depthTest: false }));
    this.hoop.renderOrder = 30;
    this.beads = new InstancedMesh(new SphereGeometry(0.0055, 8, 6), new MeshBasicMaterial({ toneMapped: false, depthTest: false, transparent: true }), BEADS);
    this.beads.renderOrder = 31;
    for (let i = 0; i < BEADS; i++) {
      const a = (i / BEADS) * Math.PI * 2;
      this.beads.setMatrixAt(i, _m.makeTranslation(Math.cos(a) * 0.048, 0, Math.sin(a) * 0.048));
      this.beads.setColorAt(i, new Color(0x333333));
    }
    this.halo = new Mesh(new TorusGeometry(0.042, 0.009, 8, 32).rotateX(Math.PI / 2), new MeshBasicMaterial({ color: 0xffb000, transparent: true, opacity: 0.25, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.ring.add(this.halo, this.hoop, this.beads);
    this.ring.position.set(0, GRIP_Y, 0);
    this.ring.visible = false;
  }

  get active(): boolean {
    return this.mode !== 'off';
  }

  /** The fight starts: it's out there, under the bobber. */
  hook(bob: Vector3, tip: Vector3): void {
    this.mode = 'cruise';
    this.t = 0;
    this.mesh.visible = true;
    this.mesh.scale.setScalar(this.len);
    this.heading.copy(bob).sub(tip).setY(0).normalize();
    this.at.copy(bob);
  }

  /** A run begins: up out of the sea it comes, where the line goes in. */
  breach(): void {
    if (this.mode !== 'cruise') return;
    this.mode = 'breach';
    this.t = 0;
    this.splashed = false;
    this.from.copy(this.at);
    this.rollSide = Math.random() < 0.5 ? -1 : 1;
    const fx = this.fx();
    fx?.splash(this.at, 1.6);
    surfaceThrash(this.at, 1);
    shot('big_splash', MIX.splash - 4, { rate: 0.8, at: this.at, ref: 10 });
  }

  /** Beaten: it rolls up alongside, below where you stand. */
  alongside(at: Vector3, towardYou: Vector3): void {
    this.mode = 'alongside';
    this.t = 0;
    this.at.copy(at);
    // side on to you, so you see all of it, rolled toward you
    this.heading.set(-towardYou.z, 0, towardYou.x).normalize();
    this.rollSide = 1;
    waterExitFish(at, 400);
    this.fx()?.splash(at, 1.4);
  }

  /** Let go: it sinks and sweeps away. */
  release(): void {
    if (this.mode !== 'alongside') return;
    this.mode = 'release';
    this.t = 0;
    this.from.copy(this.mesh.position);
    surfaceThrash(this.at, 0.9);
    this.fx()?.splash(_v.copy(this.at).addScaledVector(this.heading, -this.len * 0.4), 1.1);
  }

  stop(): void {
    this.mode = 'off';
    this.mesh.visible = false;
    this.ring.visible = false;
  }

  /**
   * Once a frame. `bob` is where the line goes in (the fight moves it); during a breach the line
   * follows its jaw instead, so this may move `bob`. Returns true while it's in the air.
   */
  update(dt: number, time: number, bob: Vector3, tip: Vector3): boolean {
    if (this.mode === 'off') return false;
    this.t += dt;
    const L = this.len;
    const m = this.mesh;
    this.u.uTime.value = time;
    let airborne = false;

    if (this.mode === 'cruise') {
      // swinging along under the line, heading away from you, dorsal fin through the surface
      _v.copy(bob).sub(tip).setY(0);
      if (_v.lengthSq() > 1e-4) {
        _v.normalize();
        _w.set(-_v.z, 0, _v.x).multiplyScalar(Math.sin(time * 0.55) * 0.5);
        this.heading.lerp(_v.add(_w).normalize(), 1 - Math.exp(-dt * 1.5)).normalize();
      }
      this.at.copy(bob);
      const water = this.sea(bob.x, bob.z);
      // the snout is at the line; the body trails back toward you
      m.position.copy(bob).addScaledVector(this.heading, -L * 0.5);
      m.position.y = water - L * 0.1;
      m.rotation.set(0.04, Math.atan2(this.heading.x, this.heading.z), Math.sin(time * 1.1) * 0.06);
      this.u.uSwim.value = 0.05;
      this.u.uFreq.value = 0.7;
      // the mouth hangs a little open as it swims, as theirs do
      this.u.uJaw.value = 0.1 + 0.05 * Math.sin(time * 0.8);
      // a wake off the fin now and then
      if (Math.random() < dt * 3) this.fx()?.ripple(_v.copy(m.position).addScaledVector(this.heading, L * 0.05), 0.9, 0, 1.2);
    } else if (this.mode === 'breach') {
      // 1.7 s: up at an angle, twisting at the top, down on its side
      const T = 1.7;
      const k = Math.min(1, this.t / T);
      const water = this.sea(this.from.x, this.from.z);
      const rise = 4 * k * (1 - k); // 0 .. 1 .. 0
      const centreY = water - L * 0.35 + rise * (L * 0.62 + 1.2);
      m.position.copy(this.from).addScaledVector(this.heading, (k - 0.5) * 1.6);
      m.position.y = centreY;
      // nose up out of the water, level at the top, nose down onto its side coming back
      const pitch = -1.25 + k * 1.9;
      m.rotation.set(pitch, Math.atan2(this.heading.x, this.heading.z), this.rollSide * Math.max(0, k - 0.35) * 2.2);
      this.u.uSwim.value = 0.1;
      this.u.uFreq.value = 2.2;
      // jaws wide as it comes out of the water, snapping shut at the top
      this.u.uJaw.value = k < 0.45 ? 0.2 + 0.6 * Math.min(1, k / 0.3) : Math.max(0.12, 0.8 - (k - 0.45) * 3);
      airborne = rise > 0.2;
      // the line follows its jaw
      _o.position.copy(m.position);
      _o.rotation.copy(m.rotation);
      _o.scale.setScalar(L);
      _o.updateMatrix();
      bob.set(0, 0, 0.47).applyMatrix4(_o.matrix);
      if (!this.splashed && k > 0.8) {
        this.splashed = true;
        this.fx()?.splash(m.position, 2);
        shot('big_splash', MIX.splash, { rate: 0.7, at: m.position, ref: 12 });
        surfaceThrash(m.position, 1);
      }
      if (k >= 1) {
        this.mode = 'cruise';
        this.at.copy(bob);
      }
    } else if (this.mode === 'alongside') {
      // spent, rolled half onto its side at the surface, its white belly toward you, fins working
      const water = this.sea(this.at.x, this.at.z);
      const rise = Math.min(1, this.t / 1.2);
      m.position.copy(this.at);
      m.position.y = water - L * 0.2 + rise * L * 0.23 + Math.sin(time * 0.9) * 0.03;
      m.rotation.set(0.02, Math.atan2(this.heading.x, this.heading.z), this.rollSide * (0.55 + Math.sin(time * 0.7) * 0.08));
      this.u.uSwim.value = 0.03;
      this.u.uFreq.value = 0.5;
      // spent, but it still works its jaws at you
      this.u.uJaw.value = 0.2 + 0.28 * Math.max(0, Math.sin(time * 1.3)) ** 3;
      if (Math.random() < dt * 1.5) this.fx()?.ripple(_v.copy(m.position).addScaledVector(this.heading, -L * 0.45), 0.8, 0, 1.4);
    } else if (this.mode === 'release') {
      // down and away
      const k = Math.min(1, this.t / 3.2);
      m.position.copy(this.from).addScaledVector(this.heading, k * k * 9);
      m.position.y = this.from.y - k * 2.6;
      m.rotation.set(0.25 * k, Math.atan2(this.heading.x, this.heading.z), 0.25 * (1 - k));
      this.u.uSwim.value = 0.09;
      this.u.uFreq.value = 1.6;
      this.u.uJaw.value = 0.12;
      if (k >= 1) this.stop();
    }
    return airborne;
  }

  /**
   * The grip ring: shown while a run wants your other hand; `held` 0..1 lights the beads, and
   * `holding` turns it green.
   */
  updateRing(show: boolean, holding: boolean, held: number, time: number): void {
    this.ring.visible = show;
    if (!show) return;
    const lit = Math.round(held * BEADS);
    const c = new Color();
    for (let i = 0; i < BEADS; i++) this.beads.setColorAt(i, c.setHex(i < lit ? 0x7dff5a : holding ? 0x2a4a2a : 0x4a3a1a));
    this.beads.instanceColor!.needsUpdate = true;
    const pulse = 0.5 + 0.5 * Math.sin(time * (holding ? 4 : 10));
    const colour = holding ? 0x7dff5a : 0xffb000;
    (this.hoop.material as MeshBasicMaterial).color.setHex(colour);
    const h = this.halo.material as MeshBasicMaterial;
    h.color.setHex(colour);
    h.opacity = holding ? 0.3 : 0.1 + 0.25 * pulse;
    this.halo.scale.setScalar(holding ? 1 : 1 + 0.45 * pulse);
  }
}
