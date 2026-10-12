/**
 * A blink: the view dips to black and back (≈0.25 s), for crossing a threshold — stepping
 * through a door you can't see opening. A black sphere around the head, fading.
 *
 * A gentle fade is the slow kind (≈2 s), for being taken somewhere: the view sinks to black, holds
 * there while you're moved, and comes back up.
 */

import { BackSide, Mesh, MeshBasicMaterial, SphereGeometry, type Object3D } from 'three';

export class Blink {
  private readonly mesh: Mesh;
  private readonly mat: MeshBasicMaterial;
  /** seconds into it, and how long it takes to go dark, stay dark and come back */
  private t = 0;
  private out = 0;
  private hold = 0;
  private back = 0;
  /** what happens once it's dark (a gentle fade), and whether it's still to come */
  private atDark: (() => void) | null = null;
  private gentle = false;

  constructor(head: Object3D) {
    this.mat = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: BackSide, depthTest: false, depthWrite: false, fog: false });
    this.mesh = new Mesh(new SphereGeometry(0.25, 16, 12), this.mat);
    this.mesh.renderOrder = 1000;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    head.add(this.mesh);
  }

  /** Start a blink (it's at its darkest a third of the way through). A gentle fade under way carries on. */
  fire(): void {
    if (this.gentle) return;
    this.start(0.086, 0, 0.174);
  }

  /** Start a gentle fade: `atDark` runs once the view's black, and it comes back up after. */
  fade(atDark: () => void): void {
    this.gentle = true;
    this.atDark = atDark;
    this.start(0.7, 0.45, 1.0);
  }

  get fading(): boolean {
    return this.gentle;
  }

  private start(out: number, hold: number, back: number): void {
    this.t = 0;
    this.out = out;
    this.hold = hold;
    this.back = back;
    this.mesh.visible = true;
  }

  update(dt: number): void {
    if (!this.mesh.visible) return;
    this.t += dt;
    let k: number;
    if (this.t < this.out) k = this.t / this.out;
    else {
      if (this.atDark) {
        const f = this.atDark;
        this.atDark = null;
        f();
      }
      k = this.t < this.out + this.hold ? 1 : 1 - (this.t - this.out - this.hold) / this.back;
    }
    k = Math.max(0, Math.min(1, k));
    // (a blink's peak runs a touch over, to reach black; a gentle fade eases in and out)
    this.mat.opacity = this.gentle ? k * k * (3 - 2 * k) : Math.min(1, k * 1.15);
    if (this.t >= this.out + this.hold + this.back) {
      this.mesh.visible = false;
      this.mat.opacity = 0;
      this.gentle = false;
    }
  }
}
