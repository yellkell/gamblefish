/**
 * THE BUILD CRATE: the open-topped box your logs go into, by the reef and deep pier walks' gateways
 * (woodworks/walks.ts) and at the edge of the helter skelter's plot (skelter/SkelterSystem.ts).
 */

import { BoxGeometry, Group, Mesh, MeshLambertMaterial, type BufferGeometry, type Object3D } from 'three';

/** the crate's floor top, inside, and where each log goes in it: laid across, four in a layer and
 * three in the next nestled in the grooves, up to the rim */
export const CRATE_FLOOR = 0.045;
export const CRATE_LOGS: [number, number, number][] = [];
for (let k = 0; k < 4; k++) {
  const zs = k % 2 === 0 ? [-0.27, -0.09, 0.09, 0.27] : [-0.18, 0, 0.18];
  for (const z of zs) CRATE_LOGS.push([0, CRATE_FLOOR + 0.08 + k * 0.135, z]);
}

/**
 * The build crate: open-topped, of rough boards on a floor, three slats a side with gaps between
 * them, nailed to a post at each corner, standing on two skids. You can see in, and down to the
 * floor when it's empty.
 */
export function openCrate(): Group {
  const o = new Group();
  const board = new MeshLambertMaterial({ color: 0x9a7a52 });
  const post = new MeshLambertMaterial({ color: 0x6e5840 });
  const floor = new MeshLambertMaterial({ color: 0x7e6446 });
  // the skids, and the floor on them
  for (const x of [-0.28, 0.28]) o.add(mesh3(new BoxGeometry(0.07, 0.03, 0.78), post, x, 0.015, 0));
  for (let i = 0; i < 5; i++) o.add(mesh3(new BoxGeometry(0.76, 0.015, 0.145), floor, 0, CRATE_FLOOR - 0.0075, -0.304 + i * 0.152));
  // the corner posts, inside the slats
  for (const x of [-0.355, 0.355]) for (const z of [-0.355, 0.355]) o.add(mesh3(new BoxGeometry(0.05, 0.6, 0.05), post, x, 0.32, z));
  // the slats: three a side, gaps between (the ends lap at the corners)
  for (const y of [0.12, 0.33, 0.54])
    for (const [x, z, rot] of [[0, 0.395, 0], [0, -0.395, 0], [0.395, 0, 1], [-0.395, 0, 1]] as const) o.add(mesh3(new BoxGeometry(0.82, 0.13, 0.025), board, x, y, z, (rot * Math.PI) / 2));
  return o;
}

function mesh3(g: BufferGeometry, m: MeshLambertMaterial | MeshLambertMaterial[], x: number, y: number, z: number, ry = 0): Object3D {
  const o = new Mesh(g, m);
  o.position.set(x, y, z);
  o.rotation.y = ry;
  return o;
}
