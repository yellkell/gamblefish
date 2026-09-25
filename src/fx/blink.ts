/**
 * A blink: the view dips to black and back (≈0.25 s), for crossing a threshold — stepping
 * through a door you can't see opening. A black sphere around the head, fading.
 */

import { BackSide, Mesh, MeshBasicMaterial, SphereGeometry, type Object3D } from 'three';

export class Blink {
  private readonly mesh: Mesh;
  private readonly mat: MeshBasicMaterial;
  private t = 1;
  private readonly dur = 0.26;

  constructor(head: Object3D) {
    this.mat = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: BackSide, depthTest: false, depthWrite: false, fog: false });
    this.mesh = new Mesh(new SphereGeometry(0.25, 16, 12), this.mat);
    this.mesh.renderOrder = 1000;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    head.add(this.mesh);
  }

  /** Start a blink (it's at its darkest a third of the way through). */
  fire(): void {
    this.t = 0;
    this.mesh.visible = true;
  }

  update(dt: number): void {
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / this.dur);
    const k = this.t < 0.33 ? this.t / 0.33 : 1 - (this.t - 0.33) / 0.67;
    this.mat.opacity = Math.max(0, Math.min(1, k * 1.15));
    if (this.t >= 1) this.mesh.visible = false;
  }
}
