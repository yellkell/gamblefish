/**
 * A life ring for the end of a walk (woodworks/walks.ts): the orange-and-white ring buoy every
 * pier keeps to hand, hung on a peg on a little board screwed to the rail. Just the ring: no
 * lines on it.
 *
 * Lit like everything else out there (Lambert), so it goes grey-blue under the moon, not bright.
 *
 * In its own frame: y up from the deck, the ring's face toward +x (hung on a rail that runs
 * along z, facing into the platform); the top of the rail at y = `railTop`.
 */

import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial, TorusGeometry } from 'three';

const ORANGE = new MeshLambertMaterial({ color: 0xe8501e });
const WHITE = new MeshLambertMaterial({ color: 0xf0ece0 });
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
  g.add(ring);

  return g;
}
