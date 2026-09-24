/**
 * Bilinear queries over the baked 2 m island heightfield. Pure (no three.js).
 */

import type { TerrainGrid } from './data.ts';

export class Heightfield {
  readonly res: number;
  readonly cell: number;
  readonly origin: number;
  readonly heights: Float32Array;

  constructor(grid: TerrainGrid) {
    this.res = grid.res;
    this.cell = grid.cell;
    this.origin = grid.origin;
    this.heights = grid.heights;
  }

  /** Ground height (m) at world (x, z); the open sea floor off the map edge. */
  heightAt(x: number, z: number): number {
    const fx = (x - this.origin) / this.cell;
    const fz = (z - this.origin) / this.cell;
    const n = this.res - 1;
    if (fx < 0 || fz < 0 || fx > n || fz > n) return -100;
    const i = Math.min(n - 1, Math.floor(fx));
    const j = Math.min(n - 1, Math.floor(fz));
    const u = fx - i;
    const v = fz - j;
    const H = this.heights;
    const r = this.res;
    const a = H[j * r + i];
    const b = H[j * r + i + 1];
    const c = H[(j + 1) * r + i];
    const d = H[(j + 1) * r + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  /** Unit surface normal at (x, z), central differences one cell wide. */
  normalAt(x: number, z: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const e = this.cell;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    const nx = -dx;
    const ny = 2 * e;
    const nz = -dz;
    const l = Math.hypot(nx, ny, nz);
    out.x = nx / l;
    out.y = ny / l;
    out.z = nz / l;
    return out;
  }
}
