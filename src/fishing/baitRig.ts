/**
 * What hangs under the float: a short leader, your hook (the hooks track) and your bait (the bait
 * track), the same hooks and bait the shops sell (village/wares/tackle.ts), put on the hook.
 *
 * The float carries it on a pendulum: it trails behind on the cast and when you reel, swings
 * under the float as you move the rod, sinks under it on the water (slowed by the sea) and lies
 * on the boards when you've let the float down onto the deck. A fish that takes it has it: while
 * one's on, it's gone from under the float.
 */

import { CylinderGeometry, Group, Mesh, MeshBasicMaterial, Quaternion, Vector3, type Object3D } from 'three';
import { outdoors, type Kit } from '../village/craft.ts';
import { goopling } from '../village/wares/goop.ts';
import { hook, shrimp, squid } from '../village/wares/tackle.ts';
import type { FishUniforms } from './props.ts';

/** the leader from the float to the hook's eye (m, at arm's length) */
export const LEADER = 0.14;
/** the hook's size against the shop's picture of it (about 3 cm) */
const HOOK_S = 0.45;

const _up = new Vector3(0, 1, 0);
const _d = new Vector3();
const _q = new Quaternion();

interface Rig {
  /** the hook's eye at the origin, the bait below it (+y up the leader) */
  obj: Object3D;
  /** a live bait's tail, beating */
  live: FishUniforms | null;
}

export class BaitRig {
  readonly group = new Group();
  private readonly leader: Mesh;
  private readonly rigs = new Map<string, Rig>();
  private rig: Rig | null = null;
  private key = '';
  /** where the hook's eye is, and how it's moving */
  readonly pos = new Vector3();
  readonly vel = new Vector3();
  private live = false;
  private t = 0;

  constructor(
    private readonly kit: Kit,
    private readonly night: { value: number } | null,
  ) {
    this.leader = new Mesh(new CylinderGeometry(1, 1, 1, 4, 1, true).translate(0, 0.5, 0), new MeshBasicMaterial({ color: 0xd8e2c4, transparent: true, opacity: 0.8 }));
    this.leader.frustumCulled = false;
    this.group.add(this.leader);
    this.group.visible = false;
  }

  /** The leader's colour (the line's). */
  setLineColour(hex: string): void {
    (this.leader.material as MeshBasicMaterial).color.set(hex);
  }

  /** Put this bait on this hook (built once per pair, kept for when you go back to it). */
  setGear(bait: number, hooks: number): void {
    const key = `${bait}/${hooks}`;
    if (key === this.key) return;
    this.key = key;
    if (this.rig) this.group.remove(this.rig.obj);
    let rig = this.rigs.get(key);
    if (!rig) this.rigs.set(key, (rig = this.build(bait, hooks)));
    this.rig = rig;
    this.group.add(rig.obj);
  }

  private build(bait: number, hooks: number): Rig {
    const k = this.kit;
    const obj = new Group();
    const h = hook(k, hooks, HOOK_S);
    // the shop's hook stands on its bend with the eye at the top, 6.6 cm up
    h.position.y = -0.066 * HOOK_S;
    obj.add(h);
    // the bend, where the bait goes on
    const bend = -0.06 * HOOK_S;
    let live: FishUniforms | null = null;
    /** a fish hooked through the lips, hanging nose up */
    const fish = (species: string, len: number): Object3D => {
      const { mesh, uniforms } = k.props.makeFish(species);
      // the model is 1 long, snout at +z: stood on its tail, nose to the hook
      mesh.scale.setScalar(len);
      mesh.rotation.set(-Math.PI / 2, 0, 0);
      mesh.position.y = bend + 0.01 - len * 0.5;
      live = uniforms;
      return mesh;
    };
    let b: Object3D;
    switch (bait) {
      case 0: {
        // a frozen shrimp, threaded on round the bend
        b = shrimp(k);
        b.scale.setScalar(0.45);
        b.position.set(0.006, bend - 0.012, 0);
        b.rotation.z = -1.2;
        break;
      }
      case 1: {
        // a goopling, hooked by the ankle and hanging upside down
        b = goopling(k);
        b.scale.setScalar(0.7);
        b.rotation.z = Math.PI;
        b.position.y = bend + 0.004;
        break;
      }
      case 2:
        b = fish('silverside', 0.09);
        break;
      case 3:
      case 4: {
        // a squid hooked through the tip of its mantle, its arms trailing down
        b = squid(k, bait === 4);
        b.scale.setScalar(0.42);
        b.rotation.z = Math.PI / 2;
        b.position.y = bend - 0.16 * 0.42 + 0.006;
        break;
      }
      default:
        b = fish('tuna', 0.2);
    }
    obj.add(b);
    // the kit's shine is the casino's studio light: out here it fades with the day (the fish and
    // the goop have shaders of their own, which a copy of their material would lose, and their
    // own light)
    if (this.night) {
      outdoors(h, this.night);
      if (bait === 0 || bait === 3 || bait === 4) outdoors(b, this.night);
    }
    return { obj, live };
  }

  /**
   * Hang it under the float. `anchor`: the float's bottom; `scale`: the float's (it's grown with
   * distance so it reads, and the rig with it); `floor`: the lowest it can go at a point (the sea
   * bed, the sand, the deck); `sea`: the water's height there.
   */
  update(dt: number, show: boolean, anchor: Vector3, scale: number, floor: (x: number, z: number) => number, sea: (x: number, z: number) => number): void {
    this.group.visible = show && this.rig !== null;
    if (!this.group.visible) {
      this.live = false;
      return;
    }
    this.t += dt;
    const len = LEADER * scale;
    if (!this.live) {
      this.live = true;
      this.pos.copy(anchor).y -= len;
      this.vel.set(0, 0, 0);
    }
    // a weight on a short line: gravity, drag (much more in the water), the leader's length
    const n = 3;
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const wet = this.pos.y < sea(this.pos.x, this.pos.z);
      // in the sea it sinks slowly and its swing dies away
      this.vel.y -= (wet ? 2.5 : 9.81) * h;
      this.vel.multiplyScalar(Math.exp(-h * (wet ? 6 : 1.1)));
      this.pos.addScaledVector(this.vel, h);
      _d.copy(this.pos).sub(anchor);
      const d = _d.length();
      if (d > len) {
        _d.divideScalar(d);
        this.pos.copy(anchor).addScaledVector(_d, len);
        const vr = this.vel.dot(_d);
        if (vr > 0) this.vel.addScaledVector(_d, -vr);
      }
    }
    const f = floor(this.pos.x, this.pos.z) + 0.01 * scale;
    if (this.pos.y < f) {
      this.pos.y = f;
      if (this.vel.y < 0) this.vel.y = 0;
      this.vel.x *= Math.exp(-dt * 8);
      this.vel.z *= Math.exp(-dt * 8);
    }

    // the leader from the float down to the eye, and the rig hanging off it
    _d.copy(anchor).sub(this.pos);
    const d = Math.max(1e-4, _d.length());
    _d.divideScalar(d);
    _q.setFromUnitVectors(_up, _d);
    this.leader.position.copy(this.pos);
    this.leader.quaternion.copy(_q);
    const r = 0.0005 * scale;
    this.leader.scale.set(r, d, r);
    const rig = this.rig!;
    rig.obj.position.copy(this.pos);
    rig.obj.quaternion.copy(_q);
    // it turns slowly on the leader; live bait kicks and swims
    rig.obj.rotateY(Math.sin(this.t * 0.7) * 0.8);
    rig.obj.scale.setScalar(scale);
    if (rig.live) {
      rig.live.uTime.value = this.t;
      rig.live.uSwim.value = 0.05 + 0.03 * Math.sin(this.t * 0.9);
      rig.live.uFreq.value = 2.2;
    }
  }
}
