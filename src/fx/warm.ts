/**
 * Shaders built behind the curtain. three builds a material's shader program the first time it
 * draws it, in that frame, and on the headset a heavy one (a gem's) is a stall you can see: the
 * island hung for a moment just as the rock broke open.
 *
 * Whatever's handed to `warmUp` is drawn for a moment, far too small to see, just ahead of your
 * eyes while the boot intro's black shade is up (experience/bootIntro.ts), so its programs are
 * built then. It has to be in the session, not at load: the headset draws both eyes in one pass,
 * and its programs aren't the page's.
 *
 * Hand it things of its own (sharing the real ones' geometry and materials), not the real ones:
 * they're parented to the camera while they're drawn. They're never disposed, so a material that
 * comes and goes (a burst of twinkles) keeps its program alive between times.
 */

import { Group, type Camera, type Object3D } from 'three';

const waiting: Object3D[] = [];
let started = false;

/** Have these drawn once, early in the first session. */
export function warmUp(...things: Object3D[]): void {
  waiting.push(...things);
}

/** Draw what's waiting in front of `camera` for a moment (once: the first session's intro). */
export function warmUpNow(camera: Camera): void {
  if (started) return;
  started = true;
  const g = new Group();
  for (const t of waiting) {
    t.traverse((o) => (o.frustumCulled = false));
    g.add(t);
  }
  waiting.length = 0;
  g.position.set(0, 0, -0.6);
  g.scale.setScalar(1e-4);
  camera.add(g);
  // a second and a half: well inside the six seconds of black
  window.setTimeout(() => camera.remove(g), 1500);
}
