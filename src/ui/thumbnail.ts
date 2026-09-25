/**
 * Pictures of things, for the shop boards. The thing itself (the same 3D model the shop builds)
 * is photographed once, at load, from a little above and to one side, framed to fill the shot,
 * on a transparent ground; the board draws the picture beside its name. Everything the shops
 * build is lit by the studio environment (casino/look.ts); a soft key light and a little fill
 * are added for the few things that aren't (a fish off the props). A part marked
 * `userData.noThumb` (a chandelier's chain) is left out of the picture.
 */

import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderTarget,
  type Object3D,
  type WebGLRenderer,
} from 'three';
import { roundRect } from './panel.ts';

const PX = 192;
const FOV = 26;

let studio: { scene: Scene; camera: PerspectiveCamera; target: WebGLRenderTarget; pixels: Uint8Array } | null = null;
const _box = new Box3();
const _c = new Vector3();
const _s = new Vector3();
const _prevClear = new Color();

/** A picture of `thing`, looking at its front (+z) from up and to the right. */
export function thumbnail(renderer: WebGLRenderer, thing: Object3D): HTMLCanvasElement {
  if (!studio) {
    const scene = new Scene();
    scene.add(new AmbientLight(0xffffff, 0.35));
    const key = new DirectionalLight(0xfff4e0, 0.9);
    key.position.set(2, 3, 4);
    scene.add(key);
    const target = new WebGLRenderTarget(PX, PX, { colorSpace: SRGBColorSpace });
    studio = { scene, camera: new PerspectiveCamera(FOV, 1, 0.01, 100), target, pixels: new Uint8Array(PX * PX * 4) };
  }
  const { scene, camera, target, pixels } = studio;
  // parts that would only shrink the picture (a chandelier's long chain) stay out of it
  const skip: Object3D[] = [];
  thing.traverse((o) => o.userData.noThumb && skip.push(o));
  for (const o of skip) o.removeFromParent();
  scene.add(thing);
  thing.updateMatrixWorld(true);
  _box.setFromObject(thing);
  _box.getCenter(_c);
  _box.getSize(_s);
  // framed on its largest side, not its bounding sphere: tall and long things fill the shot
  const r = Math.max(0.01, Math.max(_s.x, _s.y, _s.z) / 2) * 1.12;
  const dist = r / Math.tan(((FOV / 2) * Math.PI) / 180) + Math.max(_s.x, _s.z) / 2;
  camera.position.copy(_c).addScaledVector(new Vector3(0.45, 0.4, 1).normalize(), dist);
  camera.near = dist / 20;
  camera.far = dist * 4;
  camera.updateProjectionMatrix();
  camera.lookAt(_c);
  camera.updateMatrixWorld();

  const prevTarget = renderer.getRenderTarget();
  const xr = renderer.xr.enabled;
  renderer.getClearColor(_prevClear);
  const prevAlpha = renderer.getClearAlpha();
  renderer.xr.enabled = false;
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.readRenderTargetPixels(target, 0, 0, PX, PX, pixels);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(_prevClear, prevAlpha);
  renderer.xr.enabled = xr;
  scene.remove(thing);

  // into a canvas, the right way up (GL reads rows bottom first)
  const c = document.createElement('canvas');
  c.width = c.height = PX;
  const g = c.getContext('2d')!;
  const img = g.createImageData(PX, PX);
  for (let y = 0; y < PX; y++) img.data.set(pixels.subarray((PX - 1 - y) * PX * 4, (PX - y) * PX * 4), y * PX * 4);
  g.putImageData(img, 0, 0);
  return c;
}

/** Draw a picture on a board: a rounded tile, the picture over it. */
export function drawThumb(c: CanvasRenderingContext2D, pic: HTMLCanvasElement | undefined, x: number, y: number, size: number, dim = false): void {
  c.save();
  roundRect(c, x, y, size, size, 14);
  c.fillStyle = 'rgba(255, 244, 220, 0.1)';
  c.fill();
  c.strokeStyle = 'rgba(255, 244, 220, 0.22)';
  c.lineWidth = 2;
  c.stroke();
  if (pic) {
    if (dim) c.globalAlpha = 0.45;
    c.drawImage(pic, x + 4, y + 4, size - 8, size - 8);
  }
  c.restore();
}
