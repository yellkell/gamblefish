/**
 * The island ground: Tidewater's heightfield as 128 m chunks with four
 * levels of detail, coloured from one baked albedo texture so every LOD
 * shares the same 2 m colour detail.
 *
 * Quest budget: the chunk under you is 8k triangles, the far ones 128, and
 * chunks that are nothing but deep sea floor aren't built at all — the
 * ocean shades them out anyway.
 */

import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  LOD,
  Mesh,
  MeshLambertMaterial,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three';
import type { TerrainGrid } from './data.ts';

const CHUNK = 64; // cells per chunk edge at full detail (2 m cells → 128 m)
const LEVELS = [1, 2, 4, 8]; // cell stride per LOD
const LOD_DIST = [0, 170, 380, 800]; // metres, camera → chunk centre
const DEEP = -28; // a chunk that never rises above this isn't worth drawing

export function buildTerrain(grid: TerrainGrid): Group {
  const { res, cell, origin, heights } = grid;
  const size = res * cell;

  const map = new DataTexture(grid.albedo, res, res, RGBAFormat, UnsignedByteType);
  map.colorSpace = SRGBColorSpace;
  map.generateMipmaps = true;
  map.minFilter = LinearMipmapLinearFilter;
  map.magFilter = LinearFilter;
  map.anisotropy = 4;
  map.flipY = false;
  map.needsUpdate = true;

  const material = new MeshLambertMaterial({ map });

  const group = new Group();
  group.name = 'terrain';
  const chunks = Math.floor((res - 1) / CHUNK);
  for (let cj = 0; cj < chunks; cj++) {
    for (let ci = 0; ci < chunks; ci++) {
      const i0 = ci * CHUNK;
      const j0 = cj * CHUNK;
      let maxH = -Infinity;
      for (let j = j0; j <= j0 + CHUNK; j++) for (let i = i0; i <= i0 + CHUNK; i++) maxH = Math.max(maxH, heights[j * res + i]);
      if (maxH < DEEP) continue;

      const lod = new LOD();
      const cx = origin + (i0 + CHUNK / 2) * cell;
      const cz = origin + (j0 + CHUNK / 2) * cell;
      lod.position.set(cx, 0, cz);
      LEVELS.forEach((stride, l) => {
        const geo = chunkGeometry(heights, res, cell, origin, size, i0, j0, stride, cx, cz);
        const mesh = new Mesh(geo, material);
        mesh.matrixAutoUpdate = false;
        lod.addLevel(mesh, LOD_DIST[l]);
      });
      lod.matrixAutoUpdate = false;
      lod.updateMatrix();
      group.add(lod);
    }
  }
  return group;
}

/**
 * One chunk at one LOD: a (CHUNK/stride + 1)² vertex grid, plus a skirt
 * hanging off all four edges so a coarser neighbour never opens a crack.
 * Vertices are chunk-local (the LOD sits at the chunk centre).
 */
function chunkGeometry(
  H: Float32Array,
  res: number,
  cell: number,
  origin: number,
  size: number,
  i0: number,
  j0: number,
  stride: number,
  cx: number,
  cz: number,
): BufferGeometry {
  const n = CHUNK / stride + 1;
  const skirt = 1 + stride * cell * 1.5;
  const count = n * n + 4 * n;
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const h = (i: number, j: number): number => H[Math.min(res - 1, Math.max(0, j)) * res + Math.min(res - 1, Math.max(0, i))];

  const put = (k: number, i: number, j: number, drop: number): void => {
    const x = origin + i * cell;
    const z = origin + j * cell;
    pos[k * 3] = x - cx;
    pos[k * 3 + 1] = h(i, j) - drop;
    pos[k * 3 + 2] = z - cz;
    // normals from the full-resolution grid, so a far LOD shades like the near one
    const dx = h(i + 1, j) - h(i - 1, j);
    const dz = h(i, j + 1) - h(i, j - 1);
    const l = Math.hypot(dx, 2 * cell, dz);
    nrm[k * 3] = -dx / l;
    nrm[k * 3 + 1] = (2 * cell) / l;
    nrm[k * 3 + 2] = -dz / l;
    uv[k * 2] = (x - origin + cell * 0.5) / size;
    uv[k * 2 + 1] = (z - origin + cell * 0.5) / size;
  };

  for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) put(b * n + a, i0 + a * stride, j0 + b * stride, 0);

  const idx: number[] = [];
  for (let b = 0; b < n - 1; b++) {
    for (let a = 0; a < n - 1; a++) {
      const k = b * n + a;
      idx.push(k, k + n, k + 1, k + 1, k + n, k + n + 1);
    }
  }

  // skirts: edge order north (b=0), south (b=n-1), west (a=0), east (a=n-1)
  const edges: [number, number][][] = [[], [], [], []];
  for (let t = 0; t < n; t++) {
    edges[0].push([t, 0]);
    edges[1].push([t, n - 1]);
    edges[2].push([0, t]);
    edges[3].push([n - 1, t]);
  }
  let k = n * n;
  edges.forEach((edge, e) => {
    const start = k;
    for (const [a, b] of edge) put(k++, i0 + a * stride, j0 + b * stride, skirt);
    for (let t = 0; t < n - 1; t++) {
      const top0 = edge[t][1] * n + edge[t][0];
      const top1 = edge[t + 1][1] * n + edge[t + 1][0];
      const bot0 = start + t;
      const bot1 = start + t + 1;
      // wind so the skirt faces outward (north/west one way, south/east the other)
      if (e === 0 || e === 3) idx.push(top0, top1, bot0, top1, bot1, bot0);
      else idx.push(top0, bot0, top1, top1, bot0, bot1);
    }
  });

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('normal', new BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
  geo.setIndex(count > 65535 ? new BufferAttribute(new Uint32Array(idx), 1) : new BufferAttribute(new Uint16Array(idx), 1));
  geo.computeBoundingSphere();
  return geo;
}
