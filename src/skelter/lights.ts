/**
 * The helter skelter's lanterns: lit after dark like the pier's, all the way up the spiral. A
 * little iron lantern stands on the outer rail every few metres of the slide, from the balcony
 * 300 m up round and round to the plinth, so at night the whole tower is wound in a spiral of
 * warm lights you can see from the beach. Each lantern wears the pier lamps' halo
 * (world/lamps.ts), holding some size from far off, and its glass warms up as the sky darkens.
 * Four draws in all, instanced.
 */

import { BoxGeometry, Color, ConeGeometry, CylinderGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry, Quaternion, Vector3 } from 'three';
import { haloMaterial } from '../world/lamps.ts';
import { OUTER_LIP, TRACK_WIDTH } from './constants.ts';
import { HelterPath } from './path.ts';

/** a lantern every so many metres along the slide */
const EVERY = 4.8;
/** a far halo grows past this many metres off (haloMaterial's grow) */
const HALO_FAR = 60;
/** the stem stands on the outer rail; the lantern sits this far over the lip's top */
const STEM = 0.34;
const RAIL_Y = OUTER_LIP + 0.08;
const GLASS_Y = RAIL_Y + STEM + 0.1;
/** the glass by day (unlit, a dull amber) and at night (lit) */
const DAY = new Color(0x6f5a3c);
const NIGHT = new Color(0xffd08a);

export interface SkelterLights {
  group: Group;
  /** the island's night, 0 by day .. 1 after dark */
  update(night: number): void;
}

export function createLights(path: HelterPath): SkelterLights {
  const group = new Group();
  group.name = 'skelter-lights';
  const night = { value: 0 };

  const spots: { at: Vector3; yaw: number }[] = [];
  const s = HelterPath.makeSample();
  const up = new Vector3(0, 1, 0);
  // on the outer rail (s.right points at the tower, so out is the other way)
  const onRail = (d: number, lift: number): Vector3 => {
    path.sample(d, s);
    return s.position.clone().addScaledVector(s.right, -TRACK_WIDTH / 2).addScaledVector(up, RAIL_Y + lift);
  };
  for (let d = EVERY * 0.5; d < path.totalLength; d += EVERY) {
    const at = onRail(d, 0);
    spots.push({ at, yaw: s.yaw });
  }

  const iron = new MeshLambertMaterial({ color: 0x2a2624 });
  const stems = new InstancedMesh(new CylinderGeometry(0.022, 0.028, STEM, 6).translate(0, STEM / 2, 0), iron, spots.length);
  const caps = new InstancedMesh(new ConeGeometry(0.1, 0.09, 4).rotateY(Math.PI / 4).translate(0, GLASS_Y - RAIL_Y + 0.135, 0), iron, spots.length);
  const glassMat = new MeshBasicMaterial({ color: DAY.clone(), toneMapped: false });
  const glass = new InstancedMesh(new BoxGeometry(0.12, 0.18, 0.12).translate(0, GLASS_Y - RAIL_Y, 0), glassMat, spots.length);
  const halos = new InstancedMesh(new PlaneGeometry(1.8, 1.8), haloMaterial(night, 1 / HALO_FAR), spots.length);
  halos.renderOrder = 5;
  halos.visible = false;

  const m = new Matrix4();
  const q = new Quaternion();
  const one = new Vector3(1, 1, 1);
  const halo = new Vector3();
  spots.forEach(({ at, yaw }, i) => {
    q.setFromAxisAngle(up, yaw);
    m.compose(at, q, one);
    stems.setMatrixAt(i, m);
    caps.setMatrixAt(i, m);
    glass.setMatrixAt(i, m);
    halos.setMatrixAt(i, m.makeTranslation(halo.copy(at).addScaledVector(up, GLASS_Y - RAIL_Y)));
  });
  for (const mesh of [stems, caps, glass, halos]) {
    // the tower's 300 m tall and the lanterns are strung all over it: never cull the lot for one bound
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  return {
    group,
    update(n: number): void {
      night.value = n;
      glassMat.color.copy(DAY).lerp(NIGHT, n);
      halos.visible = n > 0.01;
    },
  };
}
