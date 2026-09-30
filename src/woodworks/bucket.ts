/**
 * A fisherman's corner for the end of a walk (woodworks/walks.ts): a galvanised bait bucket with
 * its wire bail, a coil of rope lying beside it, and the rope's end run to an iron cleat on the
 * open edge of the platform. Shaped with the shops' kit (village/craft.ts), one draw per finish,
 * but finished like everything else on the walk: matte, lit by the island's sun and moon (the
 * kit's shiny finishes shine with the casinos' studio light, and out here that made a chrome
 * bucket by day and a black one by night), the zinc the grey of the rail's eye bolts, the iron
 * the lanterns', and the rope the pier's own manila (`rope`: woodworks/walks.ts).
 *
 * In its own frame: y up from the deck, +z toward the open edge (the cleat sits at z = `edge`).
 */

import { BufferAttribute, MeshLambertMaterial, Vector3, type BufferGeometry, type Group, type Material } from 'three';
import { Batch, rounded, stalk, turned } from '../village/craft.ts';

const ZINC = new MeshLambertMaterial({ color: 0x9a9ea2 });
const WIRE = new MeshLambertMaterial({ color: 0x5e6266 });
const IRON = new MeshLambertMaterial({ color: 0x2c2a28 });
const GRIP = new MeshLambertMaterial({ color: 0x5a4030 });

/** one lay of the pier rope's twist every 4 cm */
const LAY = 0.04;

/**
 * The kit's tube runs its texture round (u) then along (v); the pier's rope texture runs along
 * then round. Swap them, a lay every LAY metres along, so the twist matches the pier's rope.
 */
function laid(g: BufferGeometry, pts: Vector3[]): BufferGeometry {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
  const uv = g.getAttribute('uv');
  const out = new Float32Array(uv.count * 2);
  for (let i = 0; i < uv.count; i++) {
    out[i * 2] = (uv.getY(i) * len) / LAY;
    out[i * 2 + 1] = uv.getX(i);
  }
  g.setAttribute('uv', new BufferAttribute(out, 2));
  return g;
}

export function bucketAndRope(rope: Material, edge: number): Group {
  const b = new Batch();
  const zinc = ZINC;
  const wire = WIRE;

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
  b.add(GRIP, stalk([new Vector3(-0.045, h + 0.02, -0.168), new Vector3(0.045, h + 0.02, -0.168)], 0.011, 0.011, 8, 2, true));

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
  const line = [...coil, ...tail.slice(1)];
  b.add(rope, laid(stalk(line, 0.017, 0.017, 7, 220, true), line));

  // the cleat: two horns on a waisted foot, bolted to the edge board
  const iron = IRON;
  b.at(iron, rounded(0.06, 0.035, 0.06, 0.012), cleat.x, 0.017, cleat.z);
  b.at(iron, rounded(0.26, 0.026, 0.04, 0.012), cleat.x, 0.05, cleat.z);
  return b.group();
}
