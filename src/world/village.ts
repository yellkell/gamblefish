/**
 * Tidewater's village, pier and boardwalks — the real geometry from its own
 * builders (tools/bake-world.mjs), one vertex-coloured Lambert draw per
 * material class.
 *
 * After dark the panes Tidewater lights — the windows it flags lit and the
 * lanterns' glass — glow warm: a per-vertex `glow` from the bake, times the
 * sky's `night` (world/sky.ts), added to the emissive light. No extra draws.
 */

import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshLambertMaterial,
} from 'three';
import { unpack } from './data.ts';

export function buildVillage(buf: ArrayBuffer, night: { value: number }): Group {
  const { arrays } = unpack(buf);
  const group = new Group();
  group.name = 'village';
  const classes = new Set(Object.keys(arrays).map((k) => k.split('.')[0]));
  for (const cls of classes) {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(arrays[`${cls}.position`], 3));
    geo.setAttribute('normal', new BufferAttribute(arrays[`${cls}.normal`], 3, true));
    geo.setAttribute('color', new BufferAttribute(arrays[`${cls}.color`], 4, true));
    geo.setIndex(new BufferAttribute(arrays[`${cls}.index`], 1));
    geo.computeBoundingSphere();
    const mat = new MeshLambertMaterial({ vertexColors: true });
    if (cls === 'cloth') mat.side = DoubleSide;
    const glow = arrays[`${cls}.glow`];
    if (glow) {
      geo.setAttribute('glow', new BufferAttribute(glow, 1, true));
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uNight = night;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying float vGlow;')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.66, 0.32) * vGlow * uNight * 1.6;');
      };
      mat.customProgramCacheKey = () => 'village-glow';
    }
    const mesh = new Mesh(geo, mat);
    mesh.name = `village_${cls}`;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  return group;
}
