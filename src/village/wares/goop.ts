/**
 * GOOP BAIT: Goopliath, FIRE FIGHT 2's gel boss (its src/goopliath/), shrunk to the size of your
 * thumb and sold at the bait shop by the tub. Cheap, and the fish will have a go at it.
 *
 * ff2 raymarches him live, a smooth-min of twenty blobs; that's far too much for a bait. Here the
 * same twenty blobs in his boxer's stance (ff2's BOXER_POSE, the same smooth-min blend) are
 * polygonised once at load into a small mesh, in his colours: backlit lime at the thin edges,
 * bottle green in the body, a brighter nucleus glowing through. His two glossy bead eyes, each
 * with its glint, sit on the front of his head.
 */

import { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, BufferGeometry, Float32BufferAttribute, type Object3D } from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { warmUp } from '../../fx/warm.ts';
import { casinoEnv } from '../../casino/look.ts';
import type { Kit } from '../craft.ts';

/** [x, y, z, radius] per blob: ff2 src/goopliath/poses.ts BOXER_POSE (metres, 1.78 m tall, facing +z) */
const BOXER: [number, number, number, number][] = [
  [0.0, 1.6, 0.02, 0.155], // head
  [0.0, 1.42, 0.01, 0.125], // neck
  [-0.13, 1.27, 0.02, 0.175], // chest
  [0.13, 1.27, 0.02, 0.175],
  [0.0, 1.02, 0.03, 0.215], // belly
  [0.0, 0.88, 0.0, 0.185], // pelvis
  [-0.27, 1.37, 0.02, 0.125], // shoulders
  [0.27, 1.37, 0.02, 0.125],
  [-0.34, 1.15, 0.18, 0.105], // elbows
  [0.34, 1.15, 0.18, 0.105],
  [-0.22, 1.31, 0.38, 0.125], // fists, up in his guard
  [0.24, 1.23, 0.34, 0.125],
  [-0.15, 0.8, 0.0, 0.15], // hips
  [0.15, 0.8, 0.0, 0.15],
  [-0.16, 0.45, 0.05, 0.135], // knees
  [0.16, 0.44, -0.02, 0.135],
  [-0.18, 0.13, 0.1, 0.145], // feet
  [0.18, 0.12, -0.06, 0.145],
  [-0.14, 0.11, 0.26, 0.125], // lead toes, rear heel
  [0.2, 0.11, -0.2, 0.125],
];
/** ff2's CREATURE.blend: how gloopily the blobs fuse */
const BLEND = 0.19;
/** his height as bait (m) */
const TALL = 0.075;

/** ff2's GEL_LOOK: shallow lime, deep bottle green, the nucleus */
const SHALLOW = 0x8cff70;
const DEEP = 0x14602f;
const NUCLEUS = 0x36e05a;

let body: BufferGeometry | null = null;

/** his body, native size (1.78 m, feet on y = 0), polygonised from the smooth-min of the blobs */
function bodyGeometry(): BufferGeometry {
  if (body) return body;
  // (the polygoniser's grid: at 44 he was 5,500 see-through glossy triangles for a figure 7.5 cm
  // tall, four of him in the bait shop's tub, and the shop dragged)
  const R = 28;
  // the cube [-1, 1]³ the polygoniser works in, over his body: centre and half-size (m)
  const C = [0, 0.86, 0.06];
  const S = 0.98;
  const mc = new MarchingCubes(R, new MeshBasicMaterial(), false, false, 40000);
  mc.isolation = 0;
  const smin = (a: number, b: number): number => {
    const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / BLEND));
    return b + (a - b) * h - BLEND * h * (1 - h);
  };
  for (let z = 0; z < R; z++)
    for (let y = 0; y < R; y++)
      for (let x = 0; x < R; x++) {
        const px = C[0] + ((x - R / 2) / (R / 2)) * S;
        const py = C[1] + ((y - R / 2) / (R / 2)) * S;
        const pz = C[2] + ((z - R / 2) / (R / 2)) * S;
        let d = 1e9;
        for (const [bx, by, bz, br] of BOXER) d = smin(d, Math.hypot(px - bx, py - by, pz - bz) - br);
        // (inside positive, as the polygoniser's metaballs are)
        mc.field[x + y * R + z * R * R] = -d;
      }
  mc.update();
  const n = mc.count;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = mc.positionArray[i * 3] * S + C[0];
    pos[i * 3 + 1] = mc.positionArray[i * 3 + 1] * S + C[1];
    pos[i * 3 + 2] = mc.positionArray[i * 3 + 2] * S + C[2];
  }
  const soup = new BufferGeometry();
  soup.setAttribute('position', new Float32BufferAttribute(pos, 3));
  soup.setAttribute('normal', new Float32BufferAttribute(mc.normalArray.slice(0, n * 3), 3));
  mc.geometry.dispose();
  // the corners each triangle repeats, shared; and a (blank) uv, so a shop's display bakes every
  // goopling in it into one draw (village/merge.ts takes indexed, uv'd geometry)
  const g = mergeVertices(soup, 1e-4);
  soup.dispose();
  g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  return (body = g);
}

let gel: MeshStandardMaterial | null = null;
let nucleus: MeshStandardMaterial | null = null;
let eye: MeshBasicMaterial | null = null;
let glint: MeshBasicMaterial | null = null;

/** wet gel: bottle green in the body running to lime at the thin edges, a glossy skin */
function gelMaterial(k: Kit): MeshStandardMaterial {
  if (gel) return gel;
  gel = new MeshStandardMaterial({ color: DEEP, roughness: 0.1, metalness: 0, envMap: casinoEnv(k.renderer), envMapIntensity: 1.4, transparent: true, opacity: 0.84, emissive: NUCLEUS, emissiveIntensity: 0.18 });
  gel.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      {
        float rim = 1.0 - abs(dot(normal, normalize(vViewPosition)));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${hex(SHALLOW)}), smoothstep(0.1, 0.85, rim));
        diffuseColor.a = mix(diffuseColor.a, 0.62, rim * rim);
      }`,
    );
  };
  gel.customProgramCacheKey = () => 'goop-gel';
  // its shader, built behind the boot intro rather than as the bait shop comes into view (fx/warm.ts)
  warmUp(new Mesh(bodyGeometry(), gel));
  return gel;
}

const hex = (c: number): string =>
  [(c >> 16) & 255, (c >> 8) & 255, c & 255].map((v) => ((v / 255) ** 2.2).toFixed(4)).join(', ');

/** Goopliath, thumb-sized, feet on the origin, facing +z. */
export function goopling(k: Kit): Group {
  const g = new Group();
  const s = TALL / 1.78;
  // the nucleus first (it shows through the gel), then the body
  nucleus ??= new MeshStandardMaterial({ color: NUCLEUS, emissive: NUCLEUS, emissiveIntensity: 0.7, roughness: 0.4 });
  const core = new Mesh(new SphereGeometry(0.2, 12, 8).scale(1, 1.5, 0.8), nucleus);
  core.position.set(0, 1.08, 0.03);
  const skin = new Mesh(bodyGeometry(), gelMaterial(k));
  skin.renderOrder = 1;
  // his eyes: glossy dark beads with a glint, on the front of his head
  eye ??= new MeshBasicMaterial({ color: 0x101b10 });
  glint ??= new MeshBasicMaterial({ color: 0xf4fff2 });
  const eyes = new Group();
  for (const side of [-1, 1]) {
    const e = new Mesh(new SphereGeometry(0.052, 8, 6), eye);
    e.position.set(side * 0.062, 1.64, 0.15);
    const gl = new Mesh(new SphereGeometry(0.015, 4, 3), glint);
    gl.position.set(side * 0.062 + 0.016, 1.66, 0.195);
    eyes.add(e, gl);
  }
  const him = new Group();
  him.add(core, skin, eyes);
  him.scale.setScalar(s);
  g.add(him);
  return g;
}

/** a tub of goop bait: a little paper tub, three of him standing in it, one climbing out */
export function goopTub(k: Kit, tub: (k: Kit) => Object3D): Group {
  const g = new Group();
  g.add(tub(k));
  const spots: [number, number, number, number][] = [
    [-0.03, 0.03, 0.0, 0.3],
    [0.025, 0.028, -0.02, -0.4],
    [0.0, 0.03, 0.035, 0.1],
  ];
  for (const [x, y, z, ry] of spots) {
    const b = goopling(k);
    b.position.set(x, y, z);
    b.rotation.y = ry;
    g.add(b);
  }
  const climber = goopling(k);
  climber.position.set(0.072, 0.05, 0.02);
  climber.rotation.set(0, Math.PI / 2, -0.5);
  g.add(climber);
  return g;
}
