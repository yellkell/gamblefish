/**
 * Grass: tufts of painted blades around you, growing where Tidewater's grass mask says grass
 * grows (tools/bake-world.mjs → veg.bin `grass.mask`: beach grass behind the sand, meadow on
 * the open ground, thinning into the forest and trodden round the houses).
 *
 * Each tuft is three crossed cards from the foliage atlas, tinted by the ground colour under it
 * so the grass and the terrain read as one surface, and shrunk toward the edge of the patch so
 * nothing pops as you move. Placement is a jittered 0.55 m grid hashed by cell, so the same
 * tuft is always in the same place; it's re-grown around you whenever you've moved 2 m.
 */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
  type Camera,
  type CanvasTexture,
} from 'three';
import type { TerrainGrid } from './data.ts';
import { REGION } from './foliage.ts';
import type { Heightfield } from './heightfield.ts';

const RADIUS = 32;
const SPACING = 0.55;
const CAPACITY = 9000;

function hash2(i: number, j: number, k: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function tuftGeometry(): BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const [u0, v0, u1, v1] = REGION.grass;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI + 0.3;
    const dx = Math.cos(a) * 0.5;
    const dz = Math.sin(a) * 0.5;
    // each card takes a different third of the painted strip
    const ua = u0 + ((u1 - u0) * k) / 3;
    const ub = u0 + ((u1 - u0) * (k + 1)) / 3;
    const quad: [number, number, number, number, number][] = [
      [-dx, 0, -dz, ua, v0],
      [dx, 0, dz, ub, v0],
      [dx, 1, dz, ub, v1],
      [-dx, 1, -dz, ua, v1],
    ];
    for (const q of [0, 1, 2, 0, 2, 3]) {
      const [x, y, z, u, v] = quad[q];
      pos.push(x, y, z);
      // lit like the ground it grows from, so the patch and the terrain match
      nrm.push(0, 1, 0);
      uv.push(u, v);
      const s = 0.7 + 0.3 * y;
      col.push(s, s, s);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  return g;
}

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _c = new Color();
const _up = new Vector3(0, 1, 0);

export class Grass {
  readonly mesh: InstancedMesh;
  private readonly last = new Vector3(1e9, 0, 0);
  private readonly uniforms = { uTime: { value: 0 } };
  private readonly mask: Uint8Array;
  private readonly res: number;
  private readonly terrain: Heightfield;
  private readonly grid: TerrainGrid;

  constructor(atlas: CanvasTexture, mask: Uint8Array, res: number, terrain: Heightfield, grid: TerrainGrid) {
    this.mask = mask;
    this.res = res;
    this.terrain = terrain;
    this.grid = grid;
    const mat = new MeshLambertMaterial({ map: atlas, vertexColors: true, side: DoubleSide, alphaTest: 0.45, alphaToCoverage: true });
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.9;
        transformed.x += sin(uTime * 1.7 + ph) * 0.06 * transformed.y;
        transformed.z += sin(uTime * 1.3 + ph * 1.4) * 0.04 * transformed.y;`,
      );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <normal_fragment_begin>',
          '#include <normal_fragment_begin>\n  // foliage: both faces take the authored normal (a card seen from behind is not facing down)\n  normal = normalize(vNormal);',
        );
    };
    mat.customProgramCacheKey = () => 'grass';
    this.mesh = new InstancedMesh(tuftGeometry(), mat, CAPACITY);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'grass';
  }

  /** Grass density (dune, meadow) at world (x, z), 0..1 each. */
  private density(x: number, z: number): [number, number] {
    const t = this.grid;
    const size = t.res * t.cell;
    const i = Math.floor(((x - t.origin) / size) * this.res);
    const j = Math.floor(((z - t.origin) / size) * this.res);
    if (i < 0 || j < 0 || i >= this.res || j >= this.res) return [0, 0];
    const k = (j * this.res + i) * 2;
    return [this.mask[k] / 255, this.mask[k + 1] / 255];
  }

  /** The ground's colour under (x, z) (the baked albedo, linear). */
  private ground(x: number, z: number, out: Color): Color {
    const t = this.grid;
    const i = Math.min(t.res - 1, Math.max(0, Math.round((x - t.origin) / t.cell)));
    const j = Math.min(t.res - 1, Math.max(0, Math.round((z - t.origin) / t.cell)));
    const k = (j * t.res + i) * 4;
    return out.setRGB(t.albedo[k] / 255, t.albedo[k + 1] / 255, t.albedo[k + 2] / 255).convertSRGBToLinear();
  }

  update(time: number, camera: Camera): void {
    this.uniforms.uTime.value = time;
    camera.getWorldPosition(_p);
    const cx = _p.x;
    const cz = _p.z;
    if ((cx - this.last.x) ** 2 + (cz - this.last.z) ** 2 < 4) return;
    this.last.set(cx, 0, cz);
    let n = 0;
    const m = this.mesh;
    const i0 = Math.floor((cx - RADIUS) / SPACING);
    const i1 = Math.floor((cx + RADIUS) / SPACING);
    const j0 = Math.floor((cz - RADIUS) / SPACING);
    const j1 = Math.floor((cz + RADIUS) / SPACING);
    for (let j = j0; j <= j1 && n < CAPACITY; j++) {
      for (let i = i0; i <= i1 && n < CAPACITY; i++) {
        const x = (i + hash2(i, j, 1)) * SPACING;
        const z = (j + hash2(i, j, 2)) * SPACING;
        const d = Math.hypot(x - cx, z - cz);
        if (d > RADIUS) continue;
        const [dune, meadow] = this.density(x, z);
        // thin out with distance as well as shrinking, so the patch melts into the ground
        const far = Math.min(1, Math.max(0, (d - RADIUS * 0.45) / (RADIUS * 0.55)));
        const want = Math.max(dune, meadow) * (1 - far * 0.75);
        if (want < 0.05 || hash2(i, j, 3) > want) continue;
        const y = this.terrain.heightAt(x, z);
        const edge = 1 - far * far;
        const tall = dune > meadow ? 0.45 + hash2(i, j, 4) * 0.3 : 0.26 + hash2(i, j, 4) * 0.24;
        // thin toward the edge by density; never shrink to specks
        const s = (0.7 + hash2(i, j, 5) * 0.6) * (0.55 + 0.45 * edge);
        _q.setFromAxisAngle(_up, hash2(i, j, 6) * Math.PI * 2);
        m.setMatrixAt(n, _m.compose(_p.set(x, y - 0.03, z), _q, _s.set(s, s * tall, s)));
        // the ground's own colour, a shade lighter; beach grass paler and straw-toned
        this.ground(x, z, _c).multiplyScalar(0.95 + hash2(i, j, 7) * 0.3);
        if (dune > meadow) _c.lerp(new Color(0.42, 0.44, 0.24), 0.25);
        m.setColorAt(n, _c);
        n++;
      }
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
}
