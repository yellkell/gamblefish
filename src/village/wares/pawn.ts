/**
 * THE PAWN SHOP's curios (J), for your shack: a ship in a bottle on an old rum barrel, a
 * mariner's globe, a painting of the bay in a gilt frame, and (new) a brass diving helmet on
 * the salvage crate it came up in.
 */

import { CylinderGeometry, SphereGeometry, TorusGeometry, Vector3, type Object3D } from 'three';
import { Batch, blade, M, rng, rounded, stalk, turned, type Kit } from '../craft.ts';

const UP = new Vector3(0, 1, 0);

/* ── the ship in a bottle, on its barrel ─────────────────────────────── */

export function shipInBottle(k: Kit): Object3D {
  const b = new Batch();
  // the barrel: bellied staves, four iron hoops, a head on top
  const oak = M.wood(k.renderer, 'oak', 0.6);
  const prof: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const y = (i / 10) * 0.6;
    prof.push([0.19 + 0.035 * Math.sin((Math.PI * i) / 10), y]);
  }
  b.add(oak, turned([[0, 0.004], ...prof, [0.185, 0.6], [0.18, 0.592], [0, 0.592]], 20));
  const iron = M.iron(k.renderer);
  for (const y of [0.06, 0.17, 0.43, 0.54]) {
    const r = 0.19 + 0.035 * Math.sin((Math.PI * y) / 0.6) + 0.003;
    b.at(iron, turned([[r, -0.018], [r + 0.004, -0.014], [r + 0.004, 0.014], [r, 0.018]], 28), 0, y, 0);
  }
  // a cradle on the head, and the bottle lying in it, cork to the right
  const Y = 0.6;
  for (const x of [-0.07, 0.07]) b.at(M.wood(k.renderer, 'mahogany', 0.35), rounded(0.03, 0.03, 0.11, 0.006), x, Y + 0.015, 0);
  const bottle: [number, number][] = [[0, -0.14], [0.06, -0.14], [0.07, -0.13], [0.072, 0.07], [0.066, 0.1], [0.04, 0.13], [0.024, 0.15], [0.022, 0.2], [0.027, 0.205], [0.027, 0.215], [0.022, 0.218]];
  const by = Y + 0.03 + 0.072;
  b.at(M.glass(k.renderer, '#cfeee0', 0.22), turned(bottle, 28), 0, by, 0, 0, 0, -Math.PI / 2);
  b.at(M.satin(k.renderer, '#b8905a'), turned([[0, 0.2], [0.021, 0.2], [0.023, 0.24], [0, 0.24]], 12), 0, by, 0, 0, 0, -Math.PI / 2);
  // inside: a blue putty sea along the bottom, and a three-masted barque sailing on it
  b.at(M.gloss(k.renderer, '#1f5a8a'), rounded(0.2, 0.03, 0.09, 0.012), -0.01, by - 0.05, 0);
  const hull: [number, number][] = [[0, -0.08], [0.012, -0.07], [0.018, -0.04], [0.019, 0.02], [0.016, 0.06], [0.008, 0.085], [0, 0.09]];
  b.at(M.gloss(k.renderer, '#2a1a12'), turned(hull, 10), -0.01, by - 0.03, 0, 0, 0, -Math.PI / 2);
  b.at(M.satin(k.renderer, '#c8a060'), rounded(0.14, 0.004, 0.022, 0.001), -0.01, by - 0.018, 0);
  const sail = M.petal(k.renderer);
  const spar = M.satin(k.renderer, '#4a3020');
  for (const [mx, mh] of [[-0.06, 0.06], [-0.01, 0.075], [0.04, 0.065]] as const) {
    const x = mx - 0.01;
    b.add(spar, stalk([new Vector3(x, by - 0.02, 0), new Vector3(x, by - 0.02 + mh, 0)], 0.0012, 0.0008, 4, 2));
    for (let i = 0; i < 3; i++) {
      const h = 0.018 - i * 0.003;
      const w = 0.03 - i * 0.006;
      const y0 = by - 0.012 + i * 0.019;
      // a square sail, bellied out forward (−x, toward the bottle's base: she sails away from the cork)
      b.at(sail, blade({ len: h, width: w, outline: () => 1, cup: -0.35, segs: 3, across: 2, base: '#f0e6cc', tip: '#e8dcc0' }), x - 0.002, y0, 0, 0, Math.PI / 2, 0);
      b.add(spar, stalk([new Vector3(x, y0 + h, -w / 2 - 0.002), new Vector3(x, y0 + h, w / 2 + 0.002)], 0.0007, 0.0007, 3, 2));
    }
    b.at(M.satin(k.renderer, '#c02020'), blade({ len: 0.008, width: 0.006, outline: () => 1, segs: 1, across: 1, base: '#c02020' }), x, by - 0.02 + mh, 0, 0, 0, -Math.PI / 2);
  }
  // rigging: bow and stern to the mastheads
  const rig = M.satin(k.renderer, '#2a2018');
  const bow = new Vector3(-0.105, by - 0.02, 0);
  const stern = new Vector3(0.085, by - 0.018, 0);
  b.add(rig, stalk([bow, new Vector3(-0.07, by + 0.04, 0)], 0.0005, 0.0005, 3, 2));
  b.add(rig, stalk([stern, new Vector3(0.03, by + 0.045, 0)], 0.0005, 0.0005, 3, 2));
  b.add(spar, stalk([bow.clone().add(new Vector3(0.01, 0.002, 0)), new Vector3(-0.13, by - 0.008, 0)], 0.001, 0.0007, 3, 2));
  return b.group();
}

/* ── the globe ──────────────────────────────────────────────────────── */

function oldWorld(g: CanvasRenderingContext2D, w: number, h: number): void {
  const r = rng(19);
  const sea = g.createLinearGradient(0, 0, 0, h);
  sea.addColorStop(0, '#c8b890');
  sea.addColorStop(0.5, '#d8c8a0');
  sea.addColorStop(1, '#c0ae84');
  g.fillStyle = sea;
  g.fillRect(0, 0, w, h);
  // continents: lumpy blobs, shaded inland, a hatched coast
  const land = (cx: number, cy: number, rx: number, ry: number, seed: number): void => {
    const q = rng(seed);
    g.beginPath();
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 0.7 + q() * 0.5 + 0.2 * Math.sin(a * 3 + seed);
      const x = cx + Math.cos(a) * rx * k;
      const y = cy + Math.sin(a) * ry * k;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fillStyle = '#a89860';
    g.fill();
    g.strokeStyle = 'rgba(70, 50, 30, 0.8)';
    g.lineWidth = 2;
    g.stroke();
    g.strokeStyle = 'rgba(70, 50, 30, 0.25)';
    g.lineWidth = 6;
    g.stroke();
  };
  land(w * 0.18, h * 0.35, 90, 70, 2);
  land(w * 0.24, h * 0.66, 50, 80, 3);
  land(w * 0.52, h * 0.3, 120, 60, 4);
  land(w * 0.55, h * 0.6, 60, 70, 5);
  land(w * 0.78, h * 0.38, 110, 60, 6);
  land(w * 0.84, h * 0.72, 50, 34, 7);
  // lines of latitude and longitude
  g.strokeStyle = 'rgba(80, 50, 30, 0.35)';
  g.lineWidth = 1.5;
  for (let i = 1; i < 12; i++) {
    g.beginPath();
    g.moveTo(0, (i * h) / 12);
    g.lineTo(w, (i * h) / 12);
    g.stroke();
  }
  for (let i = 0; i < 24; i++) {
    g.beginPath();
    g.moveTo((i * w) / 24, 0);
    g.lineTo((i * w) / 24, h);
    g.stroke();
  }
  // the equator, a compass rose, a sea serpent's wiggle and a ship's track
  g.strokeStyle = 'rgba(140, 40, 30, 0.7)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, h / 2);
  g.lineTo(w, h / 2);
  g.stroke();
  const rose = (x: number, y: number, s: number): void => {
    g.fillStyle = 'rgba(120, 40, 30, 0.8)';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const l = i % 2 ? s * 0.5 : s;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a + 0.2) * s * 0.2, y + Math.sin(a + 0.2) * s * 0.2);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.fill();
    }
  };
  rose(w * 0.38, h * 0.47, 30);
  rose(w * 0.68, h * 0.8, 22);
  g.strokeStyle = 'rgba(60, 60, 80, 0.7)';
  g.setLineDash([6, 6]);
  g.beginPath();
  for (let x = w * 0.3; x < w * 0.7; x += 8) g.lineTo(x, h * 0.55 + Math.sin(x * 0.03) * 20);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = 'rgba(60, 40, 20, 0.8)';
  g.font = 'italic 20px Georgia, serif';
  g.fillText('Mare Incognitum', w * 0.36, h * 0.2);
  g.fillText('here be fish', w * 0.62, h * 0.52);
  for (let i = 0; i < 300; i++) {
    g.fillStyle = `rgba(90, 60, 30, ${r() * 0.08})`;
    g.fillRect(r() * w, r() * h, 2 + r() * 8, 2 + r() * 8);
  }
}

export function globe(k: Kit): Object3D {
  const b = new Batch();
  const wood = M.wood(k.renderer, 'walnut', 0.3);
  const brass = M.brass(k.renderer);
  // three turned legs on a ring stretcher, up to the horizon ring
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const foot = new Vector3(Math.cos(a) * 0.24, 0, Math.sin(a) * 0.24);
    const knee = new Vector3(Math.cos(a) * 0.2, 0.32, Math.sin(a) * 0.2);
    const top = new Vector3(Math.cos(a) * 0.27, 0.8, Math.sin(a) * 0.27);
    b.add(wood, stalk([foot, knee, top], 0.022, 0.016, 8, 10, true));
    b.at(wood, turned([[0, 0], [0.03, 0], [0.028, 0.02], [0, 0.03]], 10), foot.x, 0, foot.z);
  }
  b.at(wood, new TorusGeometry(0.2, 0.012, 6, 32).rotateX(Math.PI / 2), 0, 0.3, 0);
  b.at(wood, turned([[0, 0.25], [0.03, 0.25], [0.02, 0.3], [0.025, 0.4], [0.012, 0.5], [0, 0.5]], 12), 0, 0, 0);
  // the horizon ring: a flat wooden band, calendar painted on it
  b.at(M.painted(k.renderer, 'horizon', 512, 32, (g, w, h) => {
    g.fillStyle = '#e8d8b0';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a2a1a';
    for (let i = 0; i < 72; i++) g.fillRect((i * w) / 72, 0, 1, i % 6 ? h * 0.35 : h * 0.7);
  }, 0.5), turned([[0.28, 0.8], [0.31, 0.8], [0.31, 0.812], [0.28, 0.812]], 48), 0, 0, 0);
  // the brass meridian, and the globe on its tilted axis
  const tilt = 0.41;
  const cy = 0.8;
  b.at(brass, new TorusGeometry(0.265, 0.008, 6, 48, Math.PI * 1.25).rotateZ(-Math.PI * 0.125 - Math.PI / 2), 0, cy, 0, 0, 0, tilt);
  b.at(M.painted(k.renderer, 'oldworld', 1024, 512, oldWorld, 0.55), new SphereGeometry(0.25, 36, 24), 0, cy, 0, 0, 1.2, tilt);
  for (const s of [-1, 1]) b.at(brass, turned([[0, 0], [0.012, 0], [0.008, 0.02], [0, 0.022]], 8), -Math.sin(tilt) * 0.265 * s, cy + Math.cos(tilt) * 0.265 * s, 0, s < 0 ? Math.PI : 0, 0, tilt);
  return b.group();
}

/* ── the painting of the bay ────────────────────────────────────────── */

function bay(g: CanvasRenderingContext2D, w: number, h: number): void {
  const r = rng(41);
  const horizon = h * 0.56;
  const sky = g.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#3a4a7a');
  sky.addColorStop(0.35, '#c8607a');
  sky.addColorStop(0.7, '#f4a060');
  sky.addColorStop(1, '#ffd890');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, horizon);
  // brushy clouds lit from below
  for (let i = 0; i < 70; i++) {
    const y = h * (0.1 + r() * 0.3);
    g.fillStyle = `rgba(${255}, ${150 + Math.round(r() * 80)}, ${120 + Math.round(r() * 60)}, ${0.15 + r() * 0.25})`;
    g.beginPath();
    g.ellipse(r() * w, y, 20 + r() * 50, 3 + r() * 5, (r() - 0.5) * 0.1, 0, Math.PI * 2);
    g.fill();
  }
  // the sun on the horizon, and its glow
  const sx = w * 0.64;
  const glow = g.createRadialGradient(sx, horizon, 4, sx, horizon, 160);
  glow.addColorStop(0, 'rgba(255, 250, 220, 0.95)');
  glow.addColorStop(0.2, 'rgba(255, 220, 140, 0.6)');
  glow.addColorStop(1, 'rgba(255, 200, 120, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff4d0';
  g.beginPath();
  g.arc(sx, horizon, 26, Math.PI, 0);
  g.fill();
  // the sea: deepening down, a road of light to the sun in dabs
  const sea = g.createLinearGradient(0, horizon, 0, h);
  sea.addColorStop(0, '#5a6aa0');
  sea.addColorStop(0.4, '#2a4a7a');
  sea.addColorStop(1, '#122a48');
  g.fillStyle = sea;
  g.fillRect(0, horizon, w, h - horizon);
  for (let i = 0; i < 160; i++) {
    const y = horizon + 4 + Math.pow(r(), 1.5) * (h - horizon);
    const spread = 10 + (y - horizon) * 0.7;
    g.fillStyle = `rgba(255, ${200 + Math.round(r() * 50)}, 150, ${0.25 + r() * 0.5})`;
    g.fillRect(sx + (r() - 0.5) * spread * 2, y, 6 + r() * 16, 2);
  }
  for (let i = 0; i < 200; i++) {
    g.fillStyle = `rgba(${150 + Math.round(r() * 60)}, ${170 + Math.round(r() * 50)}, 230, ${0.08 + r() * 0.15})`;
    g.fillRect(r() * w, horizon + r() * (h - horizon), 8 + r() * 24, 1.5);
  }
  // the island's headland and its palms, black against the sky
  g.fillStyle = '#1a1420';
  g.beginPath();
  g.moveTo(0, horizon + 6);
  g.bezierCurveTo(w * 0.1, horizon - 50, w * 0.22, horizon - 30, w * 0.34, horizon + 4);
  g.lineTo(0, horizon + 20);
  g.fill();
  const palm = (x: number, y: number, s: number): void => {
    g.strokeStyle = '#1a1420';
    g.lineWidth = 3 * s;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 8 * s, y - 40 * s, x + 4 * s, y - 70 * s);
    g.stroke();
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.5;
      g.lineWidth = 2 * s;
      g.beginPath();
      g.moveTo(x + 4 * s, y - 70 * s);
      g.quadraticCurveTo(x + 4 * s + Math.cos(a) * 20 * s, y - 70 * s + Math.sin(a) * 10 * s - 6 * s, x + 4 * s + Math.cos(a) * 34 * s, y - 70 * s + 14 * s);
      g.stroke();
    }
  };
  palm(w * 0.08, horizon - 8, 1);
  palm(w * 0.15, horizon - 20, 0.8);
  // the pier running out, and a little boat
  g.fillStyle = '#20161a';
  g.fillRect(w * 0.2, horizon + 30, w * 0.36, 7);
  for (let i = 0; i < 9; i++) g.fillRect(w * 0.21 + i * w * 0.042, horizon + 30, 4, 34);
  g.beginPath();
  g.moveTo(w * 0.78, horizon + 20);
  g.lineTo(w * 0.86, horizon + 20);
  g.lineTo(w * 0.84, horizon + 27);
  g.lineTo(w * 0.8, horizon + 27);
  g.fill();
  g.fillRect(w * 0.818, horizon - 10, 2, 30);
  // canvas texture over it all
  for (let y = 0; y < h; y += 3) {
    g.fillStyle = 'rgba(255,255,255,0.03)';
    g.fillRect(0, y, w, 1);
  }
  // the signature
  g.fillStyle = 'rgba(40, 20, 20, 0.7)';
  g.font = 'italic 16px Georgia, serif';
  g.fillText('M. Qwrx', w - 90, h - 14);
}

export function painting(k: Kit): Object3D {
  const b = new Batch();
  const gold = M.gold(k.renderer);
  const W = 0.8;
  const H = 0.58;
  // the gilt frame: a moulded profile run round the picture, a bead inside, corner cartouches
  const frame = (w: number, h: number, d: number, depth: number, z: number): void => {
    b.at(gold, rounded(w + d * 2, d, depth, d * 0.35), 0, h / 2 + d / 2, z);
    b.at(gold, rounded(w + d * 2, d, depth, d * 0.35), 0, -h / 2 - d / 2, z);
    b.at(gold, rounded(d, h, depth, d * 0.35), -w / 2 - d / 2, 0, z);
    b.at(gold, rounded(d, h, depth, d * 0.35), w / 2 + d / 2, 0, z);
  };
  frame(W, H, 0.07, 0.045, 0.022);
  frame(W, H, 0.018, 0.06, 0.03);
  b.at(M.wood(k.renderer, 'walnut'), rounded(W + 0.02, H + 0.02, 0.01, 0.003), 0, 0, 0.005);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const x = sx * (W / 2 + 0.035);
      const y = sy * (H / 2 + 0.035);
      b.at(gold, turned([[0, 0], [0.03, 0.004], [0.026, 0.018], [0.012, 0.026], [0, 0.03]], 12), x, y, 0.04, Math.PI / 2);
    }
  }
  b.at(gold, turned([[0, 0], [0.04, 0.006], [0.03, 0.024], [0.012, 0.034], [0, 0.04]], 14), 0, H / 2 + 0.05, 0.04, Math.PI / 2);
  b.at(M.painted(k.renderer, 'bay', 800, 580, bay, 0.7), rounded(W, H, 0.004, 0.001, 1), 0, 0, 0.034);
  return b.group();
}

/* ── the diving helmet (new) ─────────────────────────────────────────── */

export function divingHelmet(k: Kit): Object3D {
  const b = new Batch();
  const copper = M.copper(k.renderer);
  const brass = M.brass(k.renderer);
  // the salvage crate it came up in
  const crate = M.wood(k.renderer, 'drift', 0.75);
  const S = 0.44;
  for (let i = 0; i < 3; i++) {
    const y = 0.02 + (i + 0.5) * (0.36 / 3);
    for (const [w, d, x, z] of [[S, 0.02, 0, S / 2 - 0.01], [S, 0.02, 0, -S / 2 + 0.01], [0.02, S - 0.04, S / 2 - 0.01, 0], [0.02, S - 0.04, -S / 2 + 0.01, 0]] as const) {
      b.at(crate, rounded(w, 0.36 / 3 - 0.008, d, 0.004), x, y, z);
    }
  }
  b.at(crate, rounded(S + 0.01, 0.025, S + 0.01, 0.006), 0, 0.395, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.at(crate, rounded(0.035, 0.38, 0.035, 0.006), (sx * (S - 0.02)) / 2, 0.2, (sz * (S - 0.02)) / 2);
  b.at(M.painted(k.renderer, 'salvage', 256, 96, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(30, 30, 40, 0.75)';
    g.font = `bold ${h * 0.45}px monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('SALVAGE', w / 2, h * 0.4);
    g.font = `${h * 0.22}px monospace`;
    g.fillText('No. 7 · THIS SIDE UP', w / 2, h * 0.78);
  }), rounded(0.3, 0.1, 0.001, 0.0004, 1), 0, 0.2, S / 2 + 0.002);
  const Y = 0.408;
  // the breastplate (corselet): a low brass collar over the shoulders, bolts round its edge
  b.at(brass, turned([[0.2, 0], [0.205, 0.008], [0.19, 0.03], [0.16, 0.055], [0.13, 0.075], [0.122, 0.085], [0.11, 0.085]], 32), 0, Y, 0);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.at(brass, turned([[0, 0], [0.011, 0], [0.011, 0.01], [0.006, 0.017], [0, 0.017]], 6), Math.cos(a) * 0.188, Y + 0.012, Math.sin(a) * 0.188);
  }
  // the bonnet: a copper sphere on a brass neck ring
  b.at(brass, turned([[0.122, 0], [0.13, 0.006], [0.13, 0.04], [0.122, 0.046]], 32), 0, Y + 0.08, 0);
  const C = Y + 0.25;
  const R = 0.165;
  const dome: [number, number][] = [];
  for (let i = 0; i <= 18; i++) {
    const a = -0.8 + (i / 18) * (Math.PI / 2 + 0.8);
    dome.push([R * Math.cos(a), C - Y + R * Math.sin(a)]);
  }
  b.at(copper, turned([[0.12, 0.12], ...dome], 36), 0, Y, 0);
  // the faceplate: a round port with a brass rim and a grille, the side ports and the top one
  const port = (dir: Vector3, r: number, grille: boolean): void => {
    const c = new Vector3(0, C, 0).addScaledVector(dir, R - 0.012);
    const rx = Math.atan2(-dir.y, Math.hypot(dir.x, dir.z)) + Math.PI / 2;
    const ry = Math.atan2(dir.x, dir.z);
    b.at(brass, turned([[r, 0], [r + 0.012, 0.004], [r + 0.014, 0.022], [r + 0.008, 0.03], [r, 0.03]], 24), c.x, c.y, c.z, rx, ry, 0);
    b.at(M.glass(k.renderer, '#a8d8e8', 0.35), new CylinderGeometry(r, r, 0.004, 24), c.x + dir.x * 0.018, c.y + dir.y * 0.018, c.z + dir.z * 0.018, rx, ry, 0);
    if (grille) {
      const side = new Vector3().crossVectors(dir, UP).normalize();
      const up = new Vector3().crossVectors(side, dir).normalize();
      for (const off of [-0.5, 0, 0.5]) {
        const p = c.clone().addScaledVector(dir, 0.032).addScaledVector(side, off * r);
        const h = Math.sqrt(1 - off * off) * r;
        b.add(brass, stalk([p.clone().addScaledVector(up, -h), p.clone().addScaledVector(up, h)], 0.0035, 0.0035, 5, 2));
      }
    }
  };
  port(new Vector3(0, -0.05, 1).normalize(), 0.058, true);
  port(new Vector3(0.94, 0, 0.34).normalize(), 0.038, true);
  port(new Vector3(-0.94, 0, 0.34).normalize(), 0.038, true);
  port(new Vector3(0, 0.75, 0.66).normalize(), 0.03, false);
  // the air inlet and exhaust valves at the back
  for (const [x, len] of [[-0.06, 0.08], [0.06, 0.06]] as const) {
    const p = new Vector3(x, C - 0.02, -R + 0.01);
    b.add(brass, stalk([p, p.clone().add(new Vector3(0, 0.01, -len))], 0.018, 0.015, 10, 2, true));
    b.at(brass, turned([[0.022, -0.01], [0.026, 0], [0.022, 0.01], [0.018, 0]], 12), p.x, p.y + 0.01, p.z - len, Math.PI / 2);
  }
  // wing nuts at the collar's front
  for (const x of [-0.07, 0.07]) {
    b.at(brass, rounded(0.05, 0.012, 0.012, 0.004), x, Y + 0.075, 0.15);
    b.at(brass, turned([[0, 0], [0.01, 0], [0.01, 0.015], [0, 0.015]], 8), x, Y + 0.065, 0.145, Math.PI / 2);
  }
  // a verdigris bloom here and there, where the sea had it
  b.at(M.satin(k.renderer, '#5a9a88'), new SphereGeometry(0.03, 8, 6).scale(1, 0.3, 1), 0.1, Y + 0.05, 0.13, 0.6, 0, -0.4);
  return b.group();
}
