/**
 * The dancers' chest: a planked sea chest bound in iron, with a brass lock plate and a rounded
 * lid on a hinge at the back. Open, the lid swings up and a warm glow comes up out of it.
 *
 * Chest-local frame: the front faces +z, the hinge runs along the back top edge. About 0.9 m
 * wide, 0.55 deep, 0.75 tall with the lid down.
 */

import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const W = 0.9;
const D = 0.55;
const H = 0.5;
/** the lid's round top: a half cylinder along x */
const LID_R = D / 2;
/** how far it swings open (radians) */
const OPEN = 1.95;

let wood: MeshLambertMaterial | null = null;
let iron: MeshLambertMaterial | null = null;
let brass: MeshLambertMaterial | null = null;
let felt: MeshLambertMaterial | null = null;

const merge = (parts: BufferGeometry[]): BufferGeometry => {
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  for (const p of parts) p.dispose();
  return g;
};

export class Chest {
  readonly group = new Group();
  /** the lid, pivoting on the hinge */
  private readonly lid = new Group();
  private readonly glow: Mesh;
  /** 0 shut .. 1 open, and where it's heading */
  private k = 0;
  private want = 0;

  constructor() {
    wood ??= new MeshLambertMaterial({ color: 0x6e4526 });
    iron ??= new MeshLambertMaterial({ color: 0x2c2a28 });
    brass ??= new MeshLambertMaterial({ color: 0xc8a040, emissive: 0x2a1c04 });
    felt ??= new MeshLambertMaterial({ color: 0x2a1410 });
    this.group.name = 'camp-chest';

    // the box: planks (a slab per side, with grooves between the boards), a dark inside
    const planks: BufferGeometry[] = [];
    const wall = (w: number, h: number, d: number, x: number, y: number, z: number): void => {
      const g = new BoxGeometry(w, h, d);
      g.translate(x, y, z);
      planks.push(g);
    };
    const t = 0.035;
    wall(W, t, D, 0, t / 2, 0);
    for (const s of [-1, 1]) {
      // front and back, three boards each with a hair of a gap
      for (let b = 0; b < 3; b++) wall(W, H / 3 - 0.006, t, 0, (b + 0.5) * (H / 3), s * (D / 2 - t / 2));
      wall(t, H, D - t * 2, s * (W / 2 - t / 2), H / 2, 0);
    }
    this.group.add(new Mesh(merge(planks), wood));
    const inside = new Mesh(new PlaneGeometry(W - t * 2, D - t * 2).rotateX(-Math.PI / 2), felt);
    inside.position.y = t + 0.002;
    this.group.add(inside);

    // iron: a band round each end and the middle, corner caps, the handles on the sides
    const bands: BufferGeometry[] = [];
    for (const x of [-W / 2 + 0.09, 0, W / 2 - 0.09]) {
      for (const s of [-1, 1]) {
        const g = new BoxGeometry(0.05, H + 0.01, 0.012);
        g.translate(x, H / 2, s * (D / 2 + 0.006));
        bands.push(g);
      }
      const b = new BoxGeometry(0.05, 0.012, D + 0.024);
      b.translate(x, 0.004, 0);
      bands.push(b);
    }
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const g = new BoxGeometry(0.07, 0.07, 0.07);
        g.translate(sx * (W / 2 - 0.03), 0.03, sz * (D / 2 - 0.03));
        bands.push(g);
      }
    for (const s of [-1, 1]) {
      const h = new CylinderGeometry(0.012, 0.012, 0.16, 6).rotateX(Math.PI / 2);
      h.translate(s * (W / 2 + 0.03), H * 0.62, 0);
      bands.push(h);
    }
    this.group.add(new Mesh(merge(bands), iron));

    // the lid: a rounded top on a shallow rim, hinged along the back edge
    this.lid.position.set(0, H, -D / 2);
    const top = new CylinderGeometry(LID_R, LID_R, W, 14, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);
    top.scale(1, 0.55, 1);
    top.translate(0, 0.04, D / 2);
    const rim = new BoxGeometry(W, 0.04, D);
    rim.translate(0, 0.02, D / 2);
    this.lid.add(new Mesh(merge([top, rim]), wood));
    const lidBands: BufferGeometry[] = [];
    for (const x of [-W / 2 + 0.09, 0, W / 2 - 0.09]) {
      const b = new CylinderGeometry(LID_R + 0.008, LID_R + 0.008, 0.05, 14, 1, true, 0, Math.PI).rotateZ(Math.PI / 2);
      b.scale(1, 0.55, 1);
      b.translate(x, 0.04, D / 2);
      lidBands.push(b);
    }
    this.lid.add(new Mesh(merge(lidBands), iron));
    // the lock: a brass plate on the front of the lid, and its hasp down onto the box
    const plate = new Mesh(new BoxGeometry(0.12, 0.1, 0.014), brass);
    plate.position.set(0, 0.0, D + 0.008);
    this.lid.add(plate);
    const hasp = new Mesh(new BoxGeometry(0.06, 0.08, 0.012), brass);
    hasp.position.set(0, H - 0.05, D / 2 + 0.008);
    this.group.add(hasp, this.lid);

    // what's inside catches the firelight: a warm glow rising out of the open chest
    this.glow = new Mesh(
      new PlaneGeometry(W * 0.9, D * 0.85).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.glow.position.y = H - 0.04;
    this.glow.renderOrder = 3;
    this.group.add(this.glow);
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
    (this.glow.material as MeshBasicMaterial).opacity = this.k * (0.55 + 0.12 * Math.sin(time * 5.1) * Math.sin(time * 3.3));
  }
}
