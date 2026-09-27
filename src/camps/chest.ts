/**
 * The dancers' chest: the carpenter's iron-bound sea chest (village/wares/builder.ts, the one
 * for the foot of your bed), built in two so its barrel lid swings up on its hinge. Open, a warm
 * glow comes up out of it.
 *
 * Chest-local frame: the front faces +z. A touch bigger than the shack's, about 0.94 m wide.
 */

import { AdditiveBlending, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import type { Kit } from '../village/craft.ts';
import { SEA_CHEST, seaChestParts } from '../village/wares/builder.ts';

/** the camp chests beside the shack's */
const SCALE = 1.15;
/** how far the lid swings open (radians) */
const OPEN = 1.95;
/** the chest's height with its lid down (m), for whatever stands over it */
export const CHEST_H = (SEA_CHEST.H + SEA_CHEST.D * 0.21) * SCALE;

export class Chest {
  readonly group = new Group();
  /** the lid, pivoting on the hinge */
  private readonly lid = new Group();
  private readonly glow: Mesh;
  /** 0 shut .. 1 open, and where it's heading */
  private k = 0;
  private want = 0;

  constructor(kit: Kit) {
    this.group.name = 'camp-chest';
    const { W, D, H } = SEA_CHEST;
    const inner = new Group();
    inner.scale.setScalar(SCALE);
    this.group.add(inner);
    const parts = seaChestParts(kit);
    inner.add(parts.body);
    this.lid.position.copy(parts.hinge);
    this.lid.add(parts.lid);
    inner.add(this.lid);
    // the dark inside you see into with the lid up, and the glow off what's in there
    const inside = new Mesh(new PlaneGeometry(W - 0.05, D - 0.05).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0x140a06 }));
    inside.position.y = H + 0.002;
    this.glow = new Mesh(
      new PlaneGeometry(W * 0.9, D * 0.85).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.glow.position.y = H + 0.01;
    this.glow.renderOrder = 3;
    inner.add(inside, this.glow);
  }

  get open(): boolean {
    return this.want > 0;
  }

  set open(on: boolean) {
    this.want = on ? 1 : 0;
  }

  /** the lid's travel, 0 shut .. 1 open */
  get amount(): number {
    return this.k;
  }

  update(dt: number, time: number): void {
    // up with a swing, a little bounce at the top; down with a clap
    const speed = this.want > this.k ? 3.2 : 4.5;
    this.k += Math.sign(this.want - this.k) * Math.min(Math.abs(this.want - this.k), dt * speed);
    const e = this.want > 0 ? 1 - Math.pow(1 - this.k, 3) + Math.sin(this.k * Math.PI) * 0.04 : this.k * this.k;
    this.lid.rotation.x = -OPEN * e;
    (this.glow.material as MeshBasicMaterial).opacity = this.k * (0.2 + 0.06 * Math.sin(time * 5.1) * Math.sin(time * 3.3));
  }
}
