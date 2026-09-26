/**
 * A fisherman's corner for the end of a walk (woodworks/walks.ts): a galvanised bait bucket with
 * its wire bail, a coil of rope lying beside it, and the rope's end run to an iron cleat on the
 * open edge of the platform. Made with the shops' kit (village/craft.ts): one draw per finish.
 *
 * In its own frame: y up from the deck, +z toward the open edge (the cleat sits at z = `edge`).
 */

import { Vector3, type Group, type WebGLRenderer } from 'three';
import { Batch, M, rounded, stalk, turned } from '../village/craft.ts';

export function bucketAndRope(renderer: WebGLRenderer, edge: number): Group {
  const b = new Batch();
  const zinc = M.metal(renderer, '#a4acb0', 0.45);
  const wire = M.metal(renderer, '#6a6e72', 0.45);
  const rope = M.satin(renderer, '#c6ae7c');

  // the bucket: tapered, a rolled rim, two stiffening ribs; out over the rim and down inside
  const r0 = 0.12;
  const r1 = 0.155;
  const h = 0.28;
  const at = (k: number): number => r0 + (r1 - r0) * k;
  b.add(
    zinc,
    turned([
      [0, 0],
      [r0 - 0.004, 0],
      [r0, 0.006],
      [at(0.3), h * 0.3],
      [at(0.3) + 0.004, h * 0.31],
      [at(0.33), h * 0.33],
      [at(0.7), h * 0.7],
      [at(0.7) + 0.004, h * 0.71],
      [at(0.73), h * 0.73],
      [r1, h],
      [r1 + 0.008, h + 0.004],
      [r1 + 0.006, h + 0.012],
      [r1 - 0.004, h + 0.008],
      [r1 - 0.006, h],
      [r0 - 0.006, 0.014],
      [0, 0.014],
    ], 20),
  );
  // the lugs, and the wire bail lying back over the rim
  for (const s of [-1, 1]) b.at(zinc, rounded(0.02, 0.035, 0.03, 0.006), s * (r1 + 0.004), h - 0.03, 0);
  const bail: Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI;
    bail.push(new Vector3(-Math.cos(a) * (r1 + 0.012), h - 0.03 + Math.sin(a) * 0.05, -Math.sin(a) * 0.17));
  }
  b.add(wire, stalk(bail, 0.0035, 0.0035, 5, 20));
  // the grip on it
  b.add(M.wood(renderer, 'walnut'), stalk([new Vector3(-0.045, h + 0.02, -0.168), new Vector3(0.045, h + 0.02, -0.168)], 0.011, 0.011, 8, 2, true));

  // the coil of rope beside it: three turns lying flat, the last climbing onto the others
  const cx = -0.45;
  const cz = 0.05;
  const coil: Vector3[] = [];
  const turns = 3.2;
  const n = 90;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * turns * Math.PI * 2;
    const R = 0.2 - t * 0.075;
    coil.push(new Vector3(cx + Math.cos(a) * R, 0.018 + (t > 0.66 ? (t - 0.66) * 0.09 : 0), cz + Math.sin(a) * R));
  }
  const endA = coil[n];
  // the working end, from the top of the coil out across the deck to the cleat, and round it
  const cleat = new Vector3(-0.2, 0, edge - 0.12);
  const tail = [endA, new Vector3(endA.x + 0.05, 0.04, endA.z + 0.12), new Vector3((endA.x + cleat.x) / 2, 0.018, (endA.z + cleat.z) / 2), new Vector3(cleat.x - 0.1, 0.03, cleat.z), new Vector3(cleat.x + 0.02, 0.07, cleat.z + 0.035), new Vector3(cleat.x + 0.1, 0.05, cleat.z - 0.03), new Vector3(cleat.x + 0.02, 0.065, cleat.z - 0.04), new Vector3(cleat.x - 0.08, 0.06, cleat.z + 0.02)];
  b.add(rope, stalk([...coil, ...tail.slice(1)], 0.017, 0.017, 7, 220, true));

  // the cleat: two horns on a waisted foot, bolted to the edge board
  const iron = M.iron(renderer);
  b.at(iron, rounded(0.06, 0.035, 0.06, 0.012), cleat.x, 0.017, cleat.z);
  b.at(iron, rounded(0.26, 0.026, 0.04, 0.012), cleat.x, 0.05, cleat.z);
  return b.group();
}
