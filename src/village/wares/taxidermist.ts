/**
 * THE TAXIDERMIST's trophies (K), for your shack's walls: the fish themselves (Tidewater's
 * models, off the props) on carved and polished plaques, each with its engraved brass plate,
 * posed mid-thrash. The sailfish is new: the big one, leaping, over your bed.
 */

import { ExtrudeGeometry, Group, Matrix4, Shape, Vector3, type Object3D } from 'three';
import { Batch, M, rounded, stalk, welded, type Kit } from '../craft.ts';

/** an engraved brass nameplate's face */
function plate(g: CanvasRenderingContext2D, w: number, h: number, text: string, sub: string): void {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#f0d488');
  grad.addColorStop(0.5, '#c89a40');
  grad.addColorStop(1, '#e8c470');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#6a4a18';
  g.lineWidth = 3;
  g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = '#3a2408';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `600 ${h * 0.36}px Georgia, serif`;
  g.fillText(text.toUpperCase(), w / 2, h * 0.42, w - 30);
  g.font = `italic ${h * 0.2}px Georgia, serif`;
  g.fillText(sub, w / 2, h * 0.76, w - 30);
}

/** a plaque's outline: an oval with its ends drawn out and a scalloped crest */
function plaqueShape(a: number, b: number): Shape {
  const s = new Shape();
  const n = 72;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    // a squarer oval (superellipse), with shallow scallops round its edge
    const c = Math.cos(t);
    const sn = Math.sin(t);
    const r = 1 + 0.035 * Math.cos(t * 8);
    const x = Math.sign(c) * Math.pow(Math.abs(c), 0.8) * a * r;
    const y = Math.sign(sn) * Math.pow(Math.abs(sn), 0.9) * b * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  return s;
}

/**
 * A trophy: the fish on its plaque, flank out of the wall (+z), back up, snout toward −x, with
 * its name engraved below. `pose` bends it (Tidewater's swim wave, frozen), `lift` tips its snout
 * up (rad).
 */
export function mount(k: Kit, species: string, len: number, name: string, sub: string, pose = 0.045, lift = 0): Object3D {
  const b = new Batch();
  const a = len * 0.6;
  const bb = len * 0.3;
  // oiled walnut round a raised panel of warmer teak: two tones, the grain running the
  // plaque's length (craft.ts boxUV)
  const wood = M.wood(k.renderer, 'walnut', 0.55);
  const body = new ExtrudeGeometry(plaqueShape(a, bb), { depth: 0.022, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.014, bevelSegments: 3, curveSegments: 8 });
  b.add(wood, welded(body));
  // a raised inner panel, and a gilt bead round it
  const inner = new ExtrudeGeometry(plaqueShape(a * 0.86, bb * 0.8), { depth: 0.006, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.006, bevelSegments: 2, curveSegments: 8 });
  b.at(M.wood(k.renderer, 'teak', 0.6), welded(inner), 0, 0, 0.03);
  const bead: Vector3[] = [];
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 2;
    const c = Math.cos(t);
    const sn = Math.sin(t);
    const r = 1 + 0.035 * Math.cos(t * 8);
    bead.push(new Vector3(Math.sign(c) * Math.pow(Math.abs(c), 0.8) * a * 0.93 * r, Math.sign(sn) * Math.pow(Math.abs(sn), 0.9) * bb * 0.9 * r, 0.036));
  }
  b.add(M.gold(k.renderer), stalk(bead, 0.0045, 0.0045, 5, 128));
  // the nameplate, low on the plaque
  const pw = Math.min(0.34, len * 0.3);
  b.at(M.brass(k.renderer), rounded(pw + 0.012, pw * 0.26 + 0.012, 0.006, 0.003), 0, -bb * 0.62, 0.04);
  b.at(M.painted(k.renderer, `plate:${species}`, 512, 128, (g, w, h) => plate(g, w, h, name, sub), 0.35), rounded(pw, pw * 0.26, 0.002, 0.0008, 1), 0, -bb * 0.62, 0.0435);
  const out = b.group();
  // the fish: flank out, back up, snout along −x, frozen mid-thrash
  const { mesh, uniforms } = k.props.makeFish(species);
  uniforms.uSwim.value = pose;
  uniforms.uFreq.value = 1;
  uniforms.uTime.value = 0.2;
  const N = new Vector3(0, 0, 1);
  const UP = new Vector3(0, 1, 0).applyAxisAngle(N, lift);
  const S = new Vector3().crossVectors(N, UP);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(new Matrix4().makeBasis(N, UP, S).scale(new Vector3(len, len, len)).setPosition(-len * 0.02, bb * 0.08, 0.1));
  const g = new Group();
  g.add(out, mesh);
  return g;
}

export const tarponMount = (k: Kit): Object3D => mount(k, 'tarpon', 1.25, 'Tarpon', 'the silver king', 0.04);
export const mahiMount = (k: Kit): Object3D => mount(k, 'mahi', 0.85, 'Mahi-mahi', 'dorado of the reef', 0.05);
export const snapperMount = (k: Kit): Object3D => mount(k, 'redSnapper', 0.6, 'Red snapper', 'my first good one', 0.035);
/** new: the sailfish, sail up, leaping */
export const sailfishMount = (k: Kit): Object3D => mount(k, 'sailfish', 1.45, 'Sailfish', 'off the drop-off', 0.06, 0.12);
