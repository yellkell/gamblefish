/**
 * A life ring for the end of a walk (woodworks/walks.ts): the orange-and-white ring buoy every
 * pier keeps to hand, hung on a peg on a little board screwed to the rail, its grab line
 * festooned round it and its coil of throwing line on a peg beside it.
 *
 * Lit like everything else out there (Lambert), so it goes grey-blue under the moon, not bright.
 *
 * In its own frame: y up from the deck, the ring's face toward +x (hung on a rail that runs
 * along z, facing into the platform); the top of the rail at y = `railTop`.
 */

import { BoxGeometry, CatmullRomCurve3, CylinderGeometry, Group, Mesh, MeshLambertMaterial, TorusGeometry, TubeGeometry, Vector3 } from 'three';

const ORANGE = new MeshLambertMaterial({ color: 0xe8501e });
const WHITE = new MeshLambertMaterial({ color: 0xf0ece0 });
const LINE = new MeshLambertMaterial({ color: 0xd4c49a });
const BOARD = new MeshLambertMaterial({ color: 0x6e5842 });
const IRON = new MeshLambertMaterial({ color: 0x2c2a28 });

export function lifeRing(railTop: number): Group {
  const g = new Group();
  g.name = 'life-ring';
  const R = 0.265;
  const tube = 0.06;
  // the board screwed to the rail's face, and the peg out of it
  const board = new Mesh(new BoxGeometry(0.03, 0.34, 0.22), BOARD);
  board.position.set(0.015, railTop - 0.12, 0);
  const peg = new Mesh(new CylinderGeometry(0.012, 0.012, 0.12, 8).rotateZ(Math.PI / 2), IRON);
  peg.position.set(0.08, railTop - 0.06, 0);
  g.add(board, peg);

  // the ring, in eight: orange and white by turns; hung off the peg by its top
  const ring = new Group();
  ring.position.set(0.075, railTop - 0.06 - R - tube * 0.2, 0);
  ring.rotation.y = Math.PI / 2;
  for (let i = 0; i < 8; i++) {
    const arc = new Mesh(new TorusGeometry(R, tube, 10, 8, Math.PI / 4), i % 2 ? WHITE : ORANGE);
    arc.rotation.z = (i * Math.PI) / 4 + Math.PI / 8;
    ring.add(arc);
  }
  // the grab line: one rope all the way round, through four seizings on the ring's outside edge,
  // sagging between them (outward, and down: the ring hangs upright, so the top loop lies back on
  // the ring and the bottom one hangs clear)
  const edge = R + tube + 0.006;
  const pts: Vector3[] = [];
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    // a few turns of line round the ring's tube (its axis along the ring there)
    for (const d of [-0.012, 0, 0.012]) {
      const seize = new Mesh(new TorusGeometry(tube + 0.004, 0.0055, 6, 14), LINE);
      const at = a + d / R;
      seize.position.set(Math.cos(at) * R, Math.sin(at) * R, 0);
      seize.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(-Math.sin(at), Math.cos(at), 0));
      ring.add(seize);
    }
    pts.push(new Vector3(Math.cos(a) * edge, Math.sin(a) * edge, 0));
    // the slack to the next seizing: out from the ring, and down
    for (const t of [0.25, 0.5, 0.75]) {
      const b = a + (t * Math.PI) / 2;
      const out = edge + 0.04 * Math.sin(t * Math.PI);
      const drop = 0.03 * Math.sin(t * Math.PI);
      const x = Math.cos(b) * out;
      const y = Math.sin(b) * out - drop;
      // never back inside the ring's tube
      const r = Math.max(edge, Math.hypot(x, y));
      const th = Math.atan2(y, x);
      pts.push(new Vector3(Math.cos(th) * r, Math.sin(th) * r, 0));
    }
  }
  ring.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(pts, true, 'centripetal'), 160, 0.0065, 6, true), LINE));
  g.add(ring);

  // the throwing line, coiled and hung on its own peg along the rail
  const peg2 = new Mesh(new CylinderGeometry(0.01, 0.01, 0.08, 8).rotateZ(Math.PI / 2), IRON);
  peg2.position.set(0.055, railTop - 0.06, 0.36);
  const coil = new Mesh(new TorusGeometry(0.1, 0.017, 6, 20), LINE);
  coil.scale.set(1, 1.35, 1);
  coil.rotation.y = Math.PI / 2;
  coil.position.set(0.05, railTop - 0.06 - 0.13, 0.36);
  const back = new Mesh(new BoxGeometry(0.025, 0.12, 0.1), BOARD);
  back.position.set(0.0125, railTop - 0.06, 0.36);
  g.add(peg2, coil, back);
  return g;
}
