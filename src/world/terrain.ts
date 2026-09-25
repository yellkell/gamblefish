/**
 * The island ground: Tidewater's heightfield as 128 m chunks with four
 * levels of detail, coloured from one baked albedo texture so every LOD
 * shares the same 2 m colour detail.
 *
 * Two things keep it from reading as low-res:
 *  - RELIEF PER PIXEL. The heightmap rides along as a (half-float) texture
 *    and the fragment stage takes its normal from it, so a ridge or a gully
 *    shades the same on a 16 m far chunk as on the 2 m one under your feet;
 *    the coarse LODs only change the silhouette, never the lighting.
 *  - DETAIL UP CLOSE. A tiling noise texture at three scales (grain, clumps,
 *    patches) breaks the 2 m colour texels into grass tufts, dry spots and
 *    soil, fading out with distance so it never shimmers.
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
  DataUtils,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  LOD,
  Mesh,
  MeshLambertMaterial,
  RedFormat,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
} from 'three';
import type { TerrainGrid } from './data.ts';

const CHUNK = 64; // cells per chunk edge at full detail (2 m cells → 128 m)
const LEVELS = [1, 2, 4, 8]; // cell stride per LOD
const LOD_DIST = [0, 240, 560, 1100]; // metres, camera → chunk centre
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
  shadeTerrain(material, grid);

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

/** Tileable value noise, three octaves in R (grain), G (clumps), B (patches). */
function detailNoise(n = 256): DataTexture {
  const lattice = (size: number, seed: number): Float32Array => {
    const a = new Float32Array(size * size);
    let x = seed;
    for (let i = 0; i < a.length; i++) {
      x = (x * 16807) % 2147483647;
      a[i] = x / 2147483647;
    }
    return a;
  };
  const sample = (L: Float32Array, size: number, u: number, v: number): number => {
    const x = u * size;
    const y = v * size;
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const at = (a: number, b: number): number => L[(((b % size) + size) % size) * size + (((a % size) + size) % size)];
    return (at(i, j) * (1 - sx) + at(i + 1, j) * sx) * (1 - sy) + (at(i, j + 1) * (1 - sx) + at(i + 1, j + 1) * sx) * sy;
  };
  const oct: [Float32Array, number][] = [
    [lattice(64, 11), 64],
    [lattice(16, 23), 16],
    [lattice(4, 37), 4],
  ];
  const d = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = x / n;
      const v = y / n;
      const k = (y * n + x) * 4;
      oct.forEach(([L, size], c) => {
        const f = sample(L, size, u, v) * 0.65 + sample(L, size, u * 2, v * 2) * 0.35;
        d[k + c] = Math.round(f * 255);
      });
      d[k + 3] = 255;
    }
  }
  const t = new DataTexture(d, n, n, RGBAFormat, UnsignedByteType);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Per-pixel normals from the heightmap, and close-up detail over the colour map. */
function shadeTerrain(material: MeshLambertMaterial, grid: TerrainGrid): void {
  const { res, cell, origin, heights } = grid;
  const half = new Uint16Array(heights.length);
  for (let i = 0; i < heights.length; i++) half[i] = DataUtils.toHalfFloat(heights[i]);
  const heightTex = new DataTexture(half, res, res, RedFormat, HalfFloatType);
  heightTex.minFilter = LinearFilter;
  heightTex.magFilter = LinearFilter;
  heightTex.generateMipmaps = false;
  heightTex.flipY = false;
  heightTex.needsUpdate = true;
  const uniforms = {
    uHeight: { value: heightTex },
    uDetail: { value: detailNoise() },
    uTerrain: { value: new Vector2(origin, res * cell) },
    uCell: { value: cell },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTerrainW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTerrainW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vTerrainW;
        uniform sampler2D uHeight;
        uniform sampler2D uDetail;
        uniform vec2 uTerrain; // origin, size
        uniform float uCell;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          // close-up detail: grain, clumps and patches, faded out with distance (no shimmer)
          float dist = length(vTerrainW - cameraPosition);
          float nearK = 1.0 - smoothstep(25.0, 140.0, dist);
          vec3 g = texture2D(uDetail, vTerrainW.xz / 1.7).rgb;
          vec3 c = texture2D(uDetail, vTerrainW.xz / 9.0).rgb;
          vec3 p = texture2D(uDetail, vTerrainW.xz / 57.0).rgb;
          float grain = (g.r - 0.5) * 0.34 * nearK;
          float clump = (c.g - 0.5) * 0.28 * (0.4 + 0.6 * nearK);
          float patchK = smoothstep(0.55, 0.8, p.b);
          vec3 col = diffuseColor.rgb;
          // green ground gets dry, yellowed patches; everything gets grain and clumps
          float greenness = clamp((col.g - max(col.r, col.b)) * 6.0, 0.0, 1.0);
          col = mix(col, col * vec3(1.18, 1.05, 0.72), patchK * greenness * 0.55);
          col *= 1.0 + grain + clump;
          diffuseColor.rgb = col;
        }`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        {
          // relief from the heightmap itself: a 2 m gully shades on every LOD
          vec2 huv = (vTerrainW.xz - uTerrain.x) / uTerrain.y;
          float t = uCell / uTerrain.y;
          float hL = texture2D(uHeight, huv - vec2(t, 0.0)).r;
          float hR = texture2D(uHeight, huv + vec2(t, 0.0)).r;
          float hD = texture2D(uHeight, huv - vec2(0.0, t)).r;
          float hU = texture2D(uHeight, huv + vec2(0.0, t)).r;
          vec3 nW = normalize(vec3(hL - hR, 2.0 * uCell, hD - hU));
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`,
      );
  };
  material.customProgramCacheKey = () => 'terrain-relief';
}
