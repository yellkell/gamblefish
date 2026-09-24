/**
 * Tidewater's village, pier and boardwalks — the real geometry from its own
 * builders (tools/bake-world.mjs), one vertex-coloured Lambert draw per
 * material class.
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

export function buildVillage(buf: ArrayBuffer): Group {
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
    const mesh = new Mesh(geo, mat);
    mesh.name = `village_${cls}`;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  return group;
}
