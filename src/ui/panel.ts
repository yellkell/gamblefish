/**
 * A canvas-painted quad in the world: the base for every little in-VR readout (the wrist
 * wallet, the rod's tension gauge, the catch card, the toast). Paint into `ctx`, then call
 * `commit()`; the texture only re-uploads when something was painted.
 */

import {
  CanvasTexture,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import { onFontsReady } from './fonts.ts';

export class Panel {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: CanvasTexture;
  readonly mesh: Mesh;

  /** px: canvas size; m: world size (width, height) */
  constructor(px: [number, number], m: [number, number], opts: { depthTest?: boolean } = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = px[0];
    this.canvas.height = px[1];
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.anisotropy = 4;
    const mat = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      depthTest: opts.depthTest ?? true,
      fog: false,
      toneMapped: false,
    });
    this.mesh = new Mesh(new PlaneGeometry(m[0], m[1]), mat);
    this.mesh.renderOrder = 10;
  }

  /** Re-run `paint` once the house face has loaded (first paints use the fallback font). */
  repaintOnFonts(paint: () => void): void {
    onFontsReady(paint);
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  commit(): void {
    this.texture.needsUpdate = true;
  }
}

/** A rounded rectangle path. */
export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** The palette the readouts share (ff2's amber and hot white on dark glass). */
export const INK = {
  glass: 'rgba(10, 16, 22, 0.86)',
  rim: 'rgba(154, 164, 172, 0.55)',
  amber: '#ffb000',
  hot: '#fff3cf',
  dim: 'rgba(234, 244, 248, 0.62)',
  good: '#3fd66a',
  warn: '#ffb000',
  danger: '#e8352a',
  sea: '#3fd6c6',
} as const;
