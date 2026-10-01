/**
 * The casino's clay chips: one colour per denomination, shared by every table. Each chip has the
 * edge spots and inlay ring of a real casino chip, in cream on the dark chips and in blue on the
 * white one, so a stack reads as money and not as a pile of pucks.
 */

import { CanvasTexture, Color, CylinderGeometry, InstancedMesh, MeshLambertMaterial } from 'three';

export const CHIP_COLOUR: Record<number, number> = { 1: 0xf2efe6, 5: 0xc23b2e, 10: 0x2f5ac2, 25: 0x2f8a4a, 100: 0x1a1a1e, 500: 0x7a3aa8 };

/** An amount as chips, biggest first (bottom of the stack), at most `max` of them. */
export function breakdown(amount: number, max = 20): number[] {
  const out: number[] = [];
  let left = Math.round(amount);
  for (const v of [500, 100, 25, 10, 5, 1])
    while (left >= v && out.length < max) {
      out.push(v);
      left -= v;
    }
  return out;
}

/** An instanced stack of up to `max` chips (colour each with setColorAt from CHIP_COLOUR). */
export function chipMesh(max: number): InstancedMesh {
  // the cylinder's groups: the rim, the top, the bottom
  const rim = chipMaterial(edgeMask());
  const face = chipMaterial(faceMask());
  const mesh = new InstancedMesh(new CylinderGeometry(0.024, 0.024, 0.006, 32), [rim, face, face], max);
  // coloured from the start: colours arriving with the first chip down changed its shader, and it
  // was built again then and there
  const white = new Color(1, 1, 1);
  for (let i = 0; i < max; i++) mesh.setColorAt(i, white);
  mesh.count = 0;
  mesh.frustumCulled = false;
  return mesh;
}

/** Lambert in the chip's instance colour, with the mask's marks laid over it in a contrasting colour. */
function chipMaterial(mask: CanvasTexture): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ color: 0xffffff });
  m.defines = { USE_UV: '' };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMask = { value: mask };
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform sampler2D uMask;\nvoid main() {').replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float mark = texture2D(uMask, vUv).r;
      float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      diffuseColor.rgb = mix(diffuseColor.rgb, lum > 0.6 ? vec3(0.12, 0.25, 0.6) : vec3(0.92, 0.9, 0.84), mark);`,
    );
  };
  return m;
}

let edge: CanvasTexture | null = null;
/** Round the rim (u runs round it): eight edge spots. */
function edgeMask(): CanvasTexture {
  if (edge) return edge;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 8;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 8);
  g.fillStyle = '#fff';
  for (let k = 0; k < 8; k++) g.fillRect(k * 32 + 8, 0, 16, 8);
  edge = new CanvasTexture(c);
  return edge;
}

let face: CanvasTexture | null = null;
/** A face (the whole disc fills the square): the spots carried over the edge, and an inlay ring. */
function faceMask(): CanvasTexture {
  if (face) return face;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.translate(64, 64);
  for (let k = 0; k < 8; k++) {
    const a0 = (k / 8) * Math.PI * 2 + 0.2;
    g.beginPath();
    g.arc(0, 0, 64, a0, a0 + 0.39);
    g.arc(0, 0, 52, a0 + 0.39, a0, true);
    g.closePath();
    g.fill();
  }
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(0, 0, 40, 0, Math.PI * 2);
  g.stroke();
  face = new CanvasTexture(c);
  return face;
}
