/**
 * The sign under the pier's entrance arch: no words, just a fish. A snapper cut out of a thick
 * plank with its edges eased, painted coral and gold by hand (scales, fin rays, the gill, a
 * bright eye) and weathered back to the grain in places, hanging from the arch beam on two iron
 * chains and swinging a little in the wind. Seen from the sea it's the same fish, facing the other
 * way, as a cut-out painted both sides is.
 *
 * It hangs where Tidewater's plain board hung (world.json `pierSign`: the tops of the chains).
 */

import {
  CanvasTexture,
  ExtrudeGeometry,
  Group,
  LinearMipmapLinearFilter,
  Mesh,
  MeshLambertMaterial,
  RepeatWrapping,
  Shape,
  SRGBColorSpace,
  TorusGeometry,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** the outline's bounds (m, nose at +x) */
const X0 = -0.68;
const X1 = 0.68;
const Y0 = -0.34;
const Y1 = 0.34;

/** the snapper in profile: a deep body, a spiny dorsal, a forked tail, nose to +x */
function outline(): Shape {
  const s = new Shape();
  s.moveTo(0.66, -0.02); // the nose
  s.bezierCurveTo(0.62, 0.1, 0.5, 0.18, 0.34, 0.2);
  // the dorsal fin: spines, then the soft rays
  s.lineTo(0.3, 0.27);
  s.lineTo(0.22, 0.24);
  s.lineTo(0.16, 0.31);
  s.lineTo(0.08, 0.26);
  s.lineTo(0.0, 0.32);
  s.lineTo(-0.08, 0.26);
  s.lineTo(-0.14, 0.3);
  s.bezierCurveTo(-0.24, 0.28, -0.3, 0.2, -0.36, 0.13);
  s.bezierCurveTo(-0.42, 0.09, -0.46, 0.07, -0.48, 0.06);
  // the tail, forked
  s.lineTo(-0.66, 0.24);
  s.bezierCurveTo(-0.62, 0.12, -0.6, 0.04, -0.56, 0.0);
  s.bezierCurveTo(-0.6, -0.04, -0.62, -0.12, -0.66, -0.24);
  s.lineTo(-0.48, -0.07);
  // the belly, the anal and pelvic fins
  s.bezierCurveTo(-0.42, -0.1, -0.34, -0.14, -0.26, -0.16);
  s.lineTo(-0.22, -0.24);
  s.lineTo(-0.1, -0.18);
  s.bezierCurveTo(0.02, -0.2, 0.1, -0.2, 0.16, -0.19);
  s.lineTo(0.18, -0.27);
  s.lineTo(0.26, -0.18);
  s.bezierCurveTo(0.4, -0.16, 0.56, -0.12, 0.66, -0.02);
  return s;
}

/** The paint: laid out over the outline's bounds (x → u, y → v). */
function paint(): CanvasTexture {
  const W = 1024;
  const H = 512;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d')!;
  let seed = 7;
  const r = (): number => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const px = (x: number): number => ((x - X0) / (X1 - X0)) * W;
  const py = (y: number): number => (1 - (y - Y0) / (Y1 - Y0)) * H;
  // raw timber under it all
  c.fillStyle = '#9a8266';
  c.fillRect(0, 0, W, H);
  // the body: coral on the back fading to pale gold on the belly
  const g = c.createLinearGradient(0, py(0.3), 0, py(-0.2));
  g.addColorStop(0, '#b8402c');
  g.addColorStop(0.45, '#e0704c');
  g.addColorStop(1, '#f2c880');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  // fins: a deeper red, rays painted in
  c.fillStyle = 'rgba(150, 30, 24, 0.55)';
  for (const [a, b] of [
    [0.34, -0.14],
    [-0.46, -0.7],
  ])
    c.fillRect(px(b), 0, px(a) - px(b), py(0.2));
  c.fillRect(0, py(-0.16), W, H - py(-0.16));
  c.fillRect(0, 0, px(-0.48), H);
  c.strokeStyle = 'rgba(90, 16, 10, 0.5)';
  c.lineWidth = 3;
  for (let i = 0; i < 16; i++) {
    const x = -0.13 + i * 0.03;
    c.beginPath();
    c.moveTo(px(x), py(0.2));
    c.lineTo(px(x + 0.02), py(0.32));
    c.stroke();
  }
  for (let i = 0; i < 9; i++) {
    const y = -0.2 + i * 0.05;
    c.beginPath();
    c.moveTo(px(-0.5), py(y * 0.3));
    c.lineTo(px(-0.66), py(y));
    c.stroke();
  }
  // scales: rows of little arcs, brushed on
  c.strokeStyle = 'rgba(120, 30, 20, 0.35)';
  c.lineWidth = 2.5;
  for (let row = 0; row < 12; row++) {
    const y = 0.17 - row * 0.03;
    for (let col = 0; col < 28; col++) {
      const x = -0.4 + col * 0.03 + (row % 2) * 0.015;
      c.beginPath();
      c.arc(px(x), py(y), 12, -Math.PI * 0.5, Math.PI * 0.5);
      c.stroke();
    }
  }
  // a gold stripe along the flank, the gill cover, the mouth
  c.strokeStyle = 'rgba(250, 210, 110, 0.7)';
  c.lineWidth = 10;
  c.beginPath();
  c.moveTo(px(0.4), py(0.02));
  c.bezierCurveTo(px(0.1), py(0.05), px(-0.2), py(0.03), px(-0.46), py(0.0));
  c.stroke();
  c.strokeStyle = 'rgba(80, 14, 8, 0.7)';
  c.lineWidth = 6;
  c.beginPath();
  c.moveTo(px(0.36), py(0.17));
  c.bezierCurveTo(px(0.3), py(0.05), px(0.3), py(-0.05), px(0.36), py(-0.15));
  c.stroke();
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(px(0.66), py(-0.02));
  c.lineTo(px(0.56), py(-0.04));
  c.stroke();
  // the eye: gold ring, black pupil, a highlight
  const ex = px(0.52);
  const ey = py(0.06);
  c.fillStyle = '#f6d060';
  c.beginPath();
  c.arc(ex, ey, 26, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#141010';
  c.beginPath();
  c.arc(ex, ey, 15, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.arc(ex - 5, ey - 6, 5, 0, Math.PI * 2);
  c.fill();
  // weather: grain through the paint, chips back to the timber, a bleached top
  for (let i = 0; i < 60; i++) {
    c.strokeStyle = `rgba(60, 36, 20, ${(0.05 + r() * 0.07).toFixed(3)})`;
    c.lineWidth = 1 + r() * 2;
    const y = r() * H;
    c.beginPath();
    c.moveTo(0, y);
    c.bezierCurveTo(W * 0.3, y + (r() - 0.5) * 12, W * 0.7, y + (r() - 0.5) * 12, W, y + (r() - 0.5) * 8);
    c.stroke();
  }
  for (let i = 0; i < 90; i++) {
    const x = r() * W;
    const y = r() * H;
    const s = 2 + r() * r() * 14;
    c.fillStyle = `rgba(${150 + Math.floor(r() * 20)}, ${132 + Math.floor(r() * 14)}, ${108 + Math.floor(r() * 12)}, ${(0.5 + r() * 0.4).toFixed(2)})`;
    c.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      c.lineTo(x + Math.cos(a) * s * (0.6 + r() * 0.8) * 1.4, y + Math.sin(a) * s * (0.6 + r() * 0.8));
    }
    c.closePath();
    c.fill();
  }
  const top = c.createLinearGradient(0, 0, 0, H * 0.5);
  top.addColorStop(0, 'rgba(255, 244, 220, 0.18)');
  top.addColorStop(1, 'rgba(255, 244, 220, 0)');
  c.fillStyle = top;
  c.fillRect(0, 0, W, H);
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearMipmapLinearFilter;
  t.anisotropy = 8;
  // the cut faces' texture coordinates are the outline's own (metres): map them onto the canvas
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(1 / (X1 - X0), 1 / (Y1 - Y0));
  t.offset.set(-X0 / (X1 - X0), -Y0 / (Y1 - Y0));
  return t;
}

export class PierSign {
  readonly group = new Group();
  private readonly fish = new Group();
  private t = Math.random() * 10;

  /** @param at the tops of the chains, under the arch beam (x, y, z) */
  constructor(at: [number, number, number]) {
    const [x, y, z] = at;
    this.group.position.set(x, y, z);
    this.group.name = 'pier-sign';
    // the fish, cut from a 5 cm plank, its edges eased; the paint on its faces, bare timber round
    const depth = 0.05;
    const geo = new ExtrudeGeometry(outline(), { depth, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 10 });
    geo.translate(0, 0, -depth / 2);
    const faces = new MeshLambertMaterial({ map: paint() });
    const timber = new MeshLambertMaterial({ color: 0x8a7258 });
    const fish = new Mesh(geo, [faces, timber]);
    // it hangs with its back 0.34 m under the chain tops (the chains run down to eyes on its back)
    fish.position.y = -0.62;
    this.fish.add(fish);
    // the chains: oval links, alternately turned, from the beam to two eyes on the fish's back
    const links: BufferGeometry[] = [];
    for (const cx of [-0.22, 0.26]) {
      const top = 0;
      const bottom = -0.62 + (cx < 0 ? 0.3 : 0.24) + 0.02;
      const n = Math.max(3, Math.round((top - bottom) / 0.045));
      for (let i = 0; i < n; i++) {
        const l = new TorusGeometry(0.018, 0.004, 4, 8);
        l.scale(1, 1.5, 1);
        if (i % 2) l.rotateY(Math.PI / 2);
        l.translate(cx, top - (i + 0.5) * ((top - bottom) / n), 0);
        links.push(l);
      }
      // the screw eye in the fish's back, its ring facing out like the fish
      const eye = new TorusGeometry(0.018, 0.005, 5, 10);
      eye.translate(cx, bottom - 0.006, 0);
      links.push(eye);
    }
    this.fish.add(new Mesh(mergeGeometries(links, false)!, new MeshLambertMaterial({ color: 0x2c2926 })));
    this.group.add(this.fish);
  }

  /** a slow swing on the chains, and a little twist, as the wind comes and goes */
  update(dt: number): void {
    this.t += dt;
    const gust = 0.6 + 0.4 * Math.sin(this.t * 0.23);
    this.fish.rotation.x = Math.sin(this.t * 1.7) * 0.05 * gust;
    this.fish.rotation.y = Math.sin(this.t * 0.9 + 1.3) * 0.06 * gust;
  }
}
