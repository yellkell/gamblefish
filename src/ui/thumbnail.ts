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

interface Studio {
  scene: Scene;
  camera: PerspectiveCamera;
  targets: Map<string, { target: WebGLRenderTarget; pixels: Uint8Array }>;
}
let studio: Studio | null = null;
const _box = new Box3();
const _c = new Vector3();
const _s = new Vector3();
const _prevClear = new Color();
const FRONT = new Vector3(0.45, 0.4, 1).normalize();

/**
 * A picture of `thing`, looking at its front (+z) from up and to the right, or from `dir`;
 * `w` × `h` pixels.
 */
export function thumbnail(renderer: WebGLRenderer, thing: Object3D, opts: { w?: number; h?: number; dir?: Vector3 } = {}): HTMLCanvasElement {
  const W = opts.w ?? PX;
  const H = opts.h ?? PX;
  const dir = opts.dir ?? FRONT;
  if (!studio) {
    const scene = new Scene();
    scene.add(new AmbientLight(0xffffff, 0.35));
    const key = new DirectionalLight(0xfff4e0, 0.9);
    key.position.set(2, 3, 4);
    scene.add(key);
    studio = { scene, camera: new PerspectiveCamera(FOV, 1, 0.01, 100), targets: new Map() };
  }
  const key = `${W}x${H}`;
  let rt = studio.targets.get(key);
  if (!rt) studio.targets.set(key, (rt = { target: new WebGLRenderTarget(W, H, { colorSpace: SRGBColorSpace }), pixels: new Uint8Array(W * H * 4) }));
  const { scene, camera } = studio;
  const { target, pixels } = rt;
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
  const aspect = W / H;
  const t = Math.tan(((FOV / 2) * Math.PI) / 180);
  const across = Math.max(_s.x, _s.z) / 2;
  const r = Math.max(0.01, Math.max(_s.y / 2, across / aspect)) * 1.12;
  // back off by the half of it nearest the camera, so its front stays inside the frame
  const dist = r / t + Math.abs(dir.z) * (_s.z / 2) + Math.abs(dir.x) * (_s.x / 2);
  camera.aspect = aspect;
  camera.position.copy(_c).addScaledVector(dir, dist);
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
  renderer.readRenderTargetPixels(target, 0, 0, W, H, pixels);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(_prevClear, prevAlpha);
  renderer.xr.enabled = xr;
  scene.remove(thing);

  // into a canvas, the right way up (GL reads rows bottom first)
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) img.data.set(pixels.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
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

/** The same picture as a flat shadow: every pixel it covers in `colour`. */
export function silhouette(pic: HTMLCanvasElement, colour: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = pic.width;
  c.height = pic.height;
  const g = c.getContext('2d')!;
  g.drawImage(pic, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = colour;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}
