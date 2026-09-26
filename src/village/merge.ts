/**
 * One draw per material. The rooms' things are built from dozens of little primitives (a
 * bookshelf is sixty boxes), and on the headset every mesh is a draw call in each eye. Once a
 * thing is built and still, its meshes are baked together: every piece sharing a material
 * becomes one mesh, in the thing's own frame. Anything that isn't a plain primitive (a fish off
 * the props, with its own attributes and shader) is kept as it is, in place.
 */

import { BufferGeometry, Group, Matrix4, Mesh, type Material, type Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** the attribute sets that bake together: plain, and vertex-coloured (village/craft.ts blades) */
const PLAIN = [['normal', 'position', 'uv'].join(), ['color', 'normal', 'position', 'uv'].join()];

export function mergeStatic(root: Object3D): Group {
  root.updateMatrixWorld(true);
  const inv = new Matrix4().copy(root.matrixWorld).invert();
  const byMat = new Map<string, { mat: Material; list: BufferGeometry[] }>();
  const out = new Group();
  out.name = root.name;
  out.position.copy(root.position);
  out.quaternion.copy(root.quaternion);
  out.scale.copy(root.scale);
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const local = new Matrix4().multiplyMatrices(inv, m.matrixWorld);
    const g = m.geometry;
    const sig = Object.keys(g.attributes).sort().join();
    if (Array.isArray(m.material) || !g.index || !PLAIN.includes(sig)) {
      const keep = new Mesh(g, m.material);
      // (its geometry is the original's, not a baked copy: whoever re-bakes mustn't dispose it)
      keep.userData.kept = true;
      keep.matrixAutoUpdate = false;
      keep.matrix.copy(local);
      keep.renderOrder = m.renderOrder;
      out.add(keep);
      return;
    }
    const c = g.clone().applyMatrix4(local);
    c.clearGroups();
    const key = `${m.material.uuid}:${sig}`;
    let e = byMat.get(key);
    if (!e) byMat.set(key, (e = { mat: m.material, list: [] }));
    e.list.push(c);
  });
  for (const { mat, list } of byMat.values()) {
    const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
    if (!merged) continue;
    const mesh = new Mesh(merged, mat);
    mesh.matrixAutoUpdate = false;
    out.add(mesh);
    for (const g of list) if (g !== merged) g.dispose();
  }
  return out;
}
