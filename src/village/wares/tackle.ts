/**
 * THE GEAR SHOPS' goods (village/gearShop.ts): rods, reels, line and hooks at the TACKLE SHOP,
 * bait at the BAIT SHOP, luck charms at the FORTUNE TELLER. Each level of each track is its own
 * thing, for its picture on the board and its place on the counter.
 */

import { CanvasTexture, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector3, type Object3D } from 'three';
import { casinoEnv } from '../../casino/look.ts';
import { Batch, blade, M, OUTLINE, rounded, stalk, turned, type Kit } from '../craft.ts';

/* ── rods ───────────────────────────────────────────────────────────── */

const RODS: { blank: string; len: number; grip: 'cork' | 'eva'; wrap: string }[] = [
  { blank: '#8a6a48', len: 1.9, grip: 'cork', wrap: '#2a2a2e' }, // hand-me-down
  { blank: '#1c1c20', len: 2.1, grip: 'cork', wrap: '#c8a040' }, // 7 ft graphite
  { blank: '#a8201c', len: 2.4, grip: 'eva', wrap: '#f4f0e8' }, // 9 ft surf
  { blank: '#101a3a', len: 2.2, grip: 'eva', wrap: '#c8a040' }, // carbon big-game
];

/** a rod standing up: butt cap, grip, reel seat, fore grip, a tapering blank with its guides */
export function rod(k: Kit, level: number, withReel = true): Group {
  const r = RODS[Math.min(level, RODS.length - 1)];
  const b = new Batch();
  const grip = r.grip === 'cork' ? M.wood(k.renderer, 'bamboo', 0.8) : M.satin(k.renderer, '#26262a');
  const metal = M.metal(k.renderer, level >= 3 ? '#c8a040' : '#b8bcc4', 0.25);
  const blank = M.gloss(k.renderer, r.blank);
  const wrap = M.satin(k.renderer, r.wrap);
  // butt: a rubber cap, or a gimbal on the big-game rod
  if (level >= 3) b.add(metal, turned([[0, 0], [0.02, 0], [0.022, 0.03], [0.018, 0.05], [0, 0.05]], 12));
  else b.add(M.satin(k.renderer, '#1a1a1c'), turned([[0, 0], [0.018, 0.002], [0.019, 0.03], [0.016, 0.04], [0, 0.04]], 12));
  b.add(grip, turned([[0.016, 0.04], [0.017, 0.1], [0.016, 0.3], [0.014, 0.32]], 12));
  // the reel seat, and the fore grip above it
  b.add(metal, turned([[0.013, 0.32], [0.015, 0.33], [0.013, 0.34], [0.013, 0.42], [0.015, 0.43], [0.013, 0.44]], 12));
  b.add(grip, turned([[0.013, 0.44], [0.015, 0.47], [0.013, 0.56], [0.009, 0.58]], 12));
  // the blank
  const L = r.len;
  b.add(blank, turned([[0.009, 0.58], [0.0025, L], [0, L + 0.002]], 8));
  // guides: rings on feet, smaller toward the tip, each with a thread wrap
  const n = level >= 2 ? 7 : 5;
  for (let i = 0; i < n; i++) {
    const u = 0.14 + 0.84 * Math.pow(i / (n - 1), 0.85);
    const y = 0.58 + (L - 0.58) * u;
    const rr = (0.022 - 0.014 * u) * (level >= 3 ? 1.2 : 1);
    const rb = 0.009 - 0.0065 * u;
    b.at(wrap, turned([[rb + 0.0012, -0.012], [rb + 0.0012, 0.012]], 8), 0, y, 0);
    b.add(metal, stalk([new Vector3(0, y - 0.01, rb), new Vector3(0, y, rb + rr * 0.9)], 0.0012, 0.0012, 4, 2));
    b.at(metal, new TorusGeometry(rr, 0.0018, 5, 16), 0, y + rr * 0.1, rb + rr * 1.9);
  }
  b.at(metal, new TorusGeometry(0.004, 0.0012, 4, 10), 0, L + 0.004, 0.006);
  const g = b.group();
  if (withReel) {
    const rl = reel(k, Math.min(level, 3));
    rl.position.set(0, 0.38, 0.016);
    rl.rotation.set(0, 0, 0);
    g.add(rl);
  }
  return g;
}

/* ── reels ──────────────────────────────────────────────────────────── */

const REELS = [
  { body: '#4a4e56', trim: '#b8bcc4' },
  { body: '#c8a040', trim: '#2a2a2e' },
  { body: '#1a2a5a', trim: '#c8ccd4' },
  { body: '#c8a040', trim: '#1a1a1e' },
];

/**
 * A reel under a rod, its foot up at the rod (at the origin), hanging toward +z: a spinning reel
 * for the first three, a lever-drag conventional reel on top of the rod for the big-game one.
 */
export function reel(k: Kit, level: number): Group {
  const c = REELS[Math.min(level, REELS.length - 1)];
  const b = new Batch();
  const body = M.metal(k.renderer, c.body, 0.3);
  const trim = M.metal(k.renderer, c.trim, 0.25);
  const knob = M.satin(k.renderer, '#1a1a1e');
  if (level < 2) {
    // spinning reel: foot, stem, a gearbox, the rotor and spool facing up the rod
    b.at(trim, rounded(0.012, 0.004, 0.08, 0.002), 0, 0, 0.004);
    b.add(body, stalk([new Vector3(0, 0, 0.006), new Vector3(0, -0.02, 0.03), new Vector3(0, -0.05, 0.05)], 0.006, 0.008, 6, 6));
    b.at(body, rounded(0.035, 0.05, 0.05, 0.015), 0, -0.07, 0.06);
    // the rotor cup and spool: turned about the rod's axis (y)
    b.at(body, turned([[0.004, 0], [0.028, 0.004], [0.03, 0.03], [0.022, 0.034]], 18), 0, -0.07 + 0.035, 0.06);
    b.at(trim, turned([[0.02, 0.034], [0.022, 0.036], [0.022, 0.07], [0.026, 0.074], [0.016, 0.078]], 18), 0, -0.07 + 0.035, 0.06);
    b.at(M.satin(k.renderer, '#e8e0c0'), turned([[0.0225, 0.04], [0.0232, 0.055], [0.0225, 0.068]], 18), 0, -0.07 + 0.035, 0.06);
    // the bail arm, over the spool
    b.at(trim, new TorusGeometry(0.03, 0.0016, 4, 18, Math.PI), 0, -0.07 + 0.035 + 0.025, 0.06, Math.PI / 2, 0, 0);
    // the handle: an arm and a knob off the side
    b.add(trim, stalk([new Vector3(0.02, -0.075, 0.06), new Vector3(0.045, -0.075, 0.06), new Vector3(0.055, -0.06, 0.09)], 0.003, 0.003, 5, 4));
    b.at(knob, turned([[0, 0], [0.008, 0.002], [0.009, 0.018], [0, 0.02]], 10), 0.055, -0.06, 0.09, 0, 0, -Math.PI / 2);
    b.at(knob, turned([[0, 0], [0.012, 0], [0.012, 0.012], [0, 0.014]], 12), 0, -0.07 + 0.035 + 0.078, 0.06);
  } else {
    // a conventional reel: two side plates round a spool, across the rod, on top of it (−z)
    const W = level >= 3 ? 0.08 : 0.06;
    const R = level >= 3 ? 0.045 : 0.036;
    b.at(trim, rounded(0.012, 0.004, 0.08, 0.002), 0, 0, -0.004);
    b.at(body, rounded(0.02, 0.06, 0.02, 0.004), 0, 0, -0.02);
    const cz = -0.02 - R;
    for (const sx of [-1, 1]) {
      b.at(body, new CylinderGeometry(R, R, 0.012, 24).rotateZ(Math.PI / 2), (sx * W) / 2, 0, cz);
      b.at(trim, new TorusGeometry(R, 0.003, 5, 24).rotateY(Math.PI / 2), (sx * (W + 0.012)) / 2, 0, cz);
    }
    b.at(M.satin(k.renderer, '#e8e0c0'), new CylinderGeometry(R * 0.78, R * 0.78, W - 0.01, 20).rotateZ(Math.PI / 2), 0, 0, cz);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      b.at(trim, new CylinderGeometry(0.003, 0.003, W, 6).rotateZ(Math.PI / 2), 0, Math.cos(a) * R * 0.92, cz + Math.sin(a) * R * 0.92);
    }
    // the handle off the right plate: a power handle with a big knob
    b.add(trim, stalk([new Vector3(W / 2 + 0.01, 0, cz), new Vector3(W / 2 + 0.02, 0.03, cz - 0.02), new Vector3(W / 2 + 0.02, 0.05, cz - 0.03)], 0.004, 0.004, 5, 4));
    b.at(knob, turned([[0, 0], [0.011, 0.002], [0.013, 0.025], [0, 0.028]], 12), W / 2 + 0.02, 0.05, cz - 0.03, 0, 0, -Math.PI / 2);
    // the drag lever over the left plate
    if (level >= 3) {
      b.add(M.metal(k.renderer, '#c02020', 0.3), stalk([new Vector3(-W / 2 - 0.01, 0, cz), new Vector3(-W / 2 - 0.012, 0.02, cz - 0.03), new Vector3(-W / 2 - 0.012, 0.03, cz - 0.05)], 0.004, 0.003, 5, 4));
    } else {
      b.at(knob, turned([[0, 0], [0.012, 0], [0.012, 0.008], [0, 0.01]], 12), -W / 2 - 0.01, 0, cz, 0, 0, Math.PI / 2);
    }
  }
  return b.group();
}

/* ── line ───────────────────────────────────────────────────────────── */

const LINE = ['#e8e0c0', '#f4f4f0', '#3fd66a', '#ff8a3a', '#3fa0ff'];

/** a spool of line, standing on its flange */
export function spool(k: Kit, level: number): Group {
  const b = new Batch();
  const flange = M.gloss(k.renderer, level >= 2 ? '#1a1a1e' : '#f4f4f0');
  b.add(flange, turned([[0.012, 0], [0.06, 0], [0.062, 0.004], [0.06, 0.008], [0.012, 0.008]], 28));
  b.add(flange, turned([[0.012, 0.07], [0.06, 0.07], [0.062, 0.074], [0.06, 0.078], [0.012, 0.078]], 28));
  const R = 0.042 + level * 0.003;
  b.add(M.gloss(k.renderer, LINE[Math.min(level, LINE.length - 1)]), turned([[0.02, 0.008], [R, 0.009], [R + 0.002, 0.04], [R, 0.069], [0.02, 0.07]], 28));
  // a label on the flange
  b.at(M.satin(k.renderer, level >= 3 ? '#c8a040' : '#c02020'), turned([[0.02, 0], [0.04, 0], [0.04, 0.001], [0.02, 0.001]], 20), 0, 0.078, 0);
  return b.group();
}

/* ── hooks ──────────────────────────────────────────────────────────── */

/** a hook: an eye, the shank, the bend, the point with its barb; a circle hook's point turns in */
export function hook(k: Kit, level: number, s = 1): Group {
  const b = new Batch();
  const metal = level === 0 ? M.metal(k.renderer, '#7a5a3a', 0.8) : level === 1 ? M.metal(k.renderer, '#d8dce4', 0.2) : level === 2 ? M.metal(k.renderer, '#a87a3a', 0.35) : M.metal(k.renderer, '#26262c', 0.3);
  const circle = level >= 2;
  const pts: Vector3[] = [];
  // the shank, down from the eye
  pts.push(new Vector3(0, 0.06, 0), new Vector3(0, 0.02, 0));
  // the bend: round, and on a circle hook round further and back in
  const R = 0.018;
  const sweep = circle ? Math.PI * 1.55 : Math.PI;
  for (let i = 1; i <= 10; i++) {
    const a = Math.PI + (sweep * i) / 10;
    pts.push(new Vector3(R + Math.cos(a) * R, 0.02 + Math.sin(a) * R * 1.1, 0));
  }
  const last = pts[pts.length - 1];
  const inward = circle ? new Vector3(-0.8, -0.3, 0) : new Vector3(0, 1, 0);
  const tip = last.clone().addScaledVector(inward.normalize(), circle ? 0.012 : 0.022);
  pts.push(tip);
  const sc = (v: Vector3): Vector3 => v.multiplyScalar(s);
  b.add(metal, stalk(pts.map((p) => sc(p.clone())), 0.0022 * s * (level >= 3 ? 1.4 : 1), 0.0008 * s, 6, 40));
  // the barb
  b.add(metal, stalk([sc(tip.clone().addScaledVector(inward, -0.006)), sc(tip.clone().addScaledVector(inward, -0.004).add(new Vector3(0.004, -0.002, 0)))], 0.001 * s, 0.0004 * s, 4, 2));
  // the eye, and on the big-game hook a crimped wire leader
  b.at(metal, new TorusGeometry(0.005 * s, 0.0016 * s, 5, 12), 0, 0.066 * s, 0, 0, Math.PI / 2, 0);
  if (level >= 3) {
    b.add(M.metal(k.renderer, '#c8ccd4', 0.2), stalk([sc(new Vector3(0, 0.07, 0)), sc(new Vector3(0, 0.1, 0.004)), sc(new Vector3(0.004, 0.14, 0))], 0.0009 * s, 0.0009 * s, 4, 6));
    b.at(M.metal(k.renderer, '#b8bcc4', 0.2), turned([[0.0025 * s, 0], [0.0025 * s, 0.01 * s]], 8), 0, 0.075 * s, 0);
  }
  return b.group();
}

/** a card of hooks, as the shop sells them */
export function hookCard(k: Kit, level: number): Group {
  const g = new Group();
  const b = new Batch();
  b.at(M.painted(k.renderer, `hookcard${level}`, 128, 192, (c, w, h) => {
    c.fillStyle = ['#c8b890', '#e8e8f0', '#e8c870', '#1a1a2e'][level];
    c.fillRect(0, 0, w, h);
    c.fillStyle = level >= 3 ? '#c8a040' : '#2a2a3a';
    c.font = 'bold 20px sans-serif';
    c.textAlign = 'center';
    c.fillText(['J-HOOKS', 'SHARP', 'CIRCLE', 'BIG GAME'][level], w / 2, 26);
    c.fillText(`#${[4, 2, '2/0', '8/0'][level]}`, w / 2, h - 12);
  }, 0.6), rounded(0.08, 0.12, 0.003, 0.002, 1), 0, 0.06, 0);
  g.add(b.group());
  for (const [x, lean] of [[-0.018, 0.1], [0.018, -0.1]] as const) {
    const h = hook(k, level, level >= 3 ? 0.8 : 0.6);
    h.position.set(x - 0.008, 0.03, 0.004);
    h.rotation.z = lean;
    g.add(h);
  }
  return g;
}

/* ── bait ───────────────────────────────────────────────────────────── */

/** a frozen shrimp, curled: segments along a curve, a tail fan, long whiskers */
export function shrimp(k: Kit): Group {
  const b = new Batch();
  const shell = M.gloss(k.renderer, '#f0a890');
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = -0.3 + (i / n) * Math.PI * 1.1;
    const r = 0.022 - i * 0.0018;
    b.at(shell, new SphereGeometry(r, 12, 8).scale(1, 0.85, 1.25), Math.cos(a) * 0.045, Math.sin(a) * 0.045, 0, 0, 0, a);
  }
  const fan = M.petal(k.renderer);
  for (const s of [-1, 0, 1]) b.at(fan, blade({ len: 0.025, width: 0.012, outline: OUTLINE.ovate, segs: 3, across: 1, base: '#e89070', tip: '#c05030' }), Math.cos(Math.PI * 0.8) * 0.045 - 0.004, Math.sin(Math.PI * 0.8) * 0.045 + 0.01, 0, 0, s * 0.5, Math.PI * 0.3);
  const whisker = M.satin(k.renderer, '#d88070');
  for (const s of [-1, 1]) b.add(whisker, stalk([new Vector3(0.04, -0.02, s * 0.004), new Vector3(0.08, -0.03, s * 0.012), new Vector3(0.11, -0.005, s * 0.02)], 0.0008, 0.0004, 3, 6));
  b.at(M.gloss(k.renderer, '#101014'), new SphereGeometry(0.003, 6, 4), 0.045, -0.012, 0.006);
  return b.group();
}

/** a fish off the props (Tidewater's own model), lying on its side, `len` long */
function propFish(k: Kit, species: string, len: number): Object3D {
  const { mesh, uniforms } = k.props.makeFish(species);
  uniforms.uSwim.value = 0.02;
  uniforms.uTime.value = 0.4;
  mesh.scale.setScalar(len);
  // fish-local x its flank: lay it on its side, snout along +x
  mesh.rotation.set(0, Math.PI / 2, Math.PI / 2);
  return mesh;
}

/** a tub of pilchards on ice */
export function pilchards(k: Kit): Group {
  const g = new Group();
  const b = new Batch();
  b.add(M.gloss(k.renderer, '#f4f4f0'), turned([[0, 0], [0.08, 0], [0.09, 0.07], [0.094, 0.075], [0.086, 0.078], [0.082, 0.07]], 24));
  // crushed ice
  for (let i = 0; i < 18; i++) {
    const a = i * 2.4;
    const r = 0.02 + (i % 5) * 0.012;
    b.at(M.glass(k.renderer, '#e8f8ff', 0.6), turned([[0, 0], [0.012, 0.004], [0, 0.012]], 5), Math.cos(a) * r, 0.062, Math.sin(a) * r, i, i * 0.7, 0);
  }
  g.add(b.group());
  for (let i = 0; i < 3; i++) {
    const f = propFish(k, 'silverside', 0.13);
    f.position.set(-0.01 + i * 0.012, 0.075 + i * 0.012, -0.03 + i * 0.03);
    f.rotation.y += 0.3 - i * 0.3;
    g.add(f);
  }
  return g;
}

/** a squid: mantle, fins, arms, big eyes; the glow rig has lights along it */
export function squid(k: Kit, glow = false): Group {
  const b = new Batch();
  // (a live squid is dappled rose-brown; pale enough and it vanished on the bait shop's ice)
  const skin = M.gloss(k.renderer, glow ? '#c890c8' : '#c87888');
  // lying along x: the mantle toward +x, arms trailing to −x
  b.at(skin, turned([[0, 0], [0.018, 0.02], [0.022, 0.07], [0.016, 0.13], [0, 0.16]], 16), 0, 0, 0, 0, 0, -Math.PI / 2);
  const fin = M.petal(k.renderer);
  for (const s of [-1, 1]) b.at(fin, blade({ len: 0.035, width: 0.04, outline: OUTLINE.round, segs: 3, across: 2, base: '#c87888', tip: '#e8a0a8' }), 0.13, 0, s * 0.012, (s * Math.PI) / 2, 0, 0);
  b.at(skin, new SphereGeometry(0.014, 12, 8), -0.005, 0, 0);
  for (const s of [-1, 1]) b.at(M.gloss(k.renderer, '#101014'), new SphereGeometry(0.005, 8, 6), -0.006, 0.004, s * 0.012);
  const arm = M.gloss(k.renderer, '#b86878');
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const cy = Math.cos(a) * 0.008;
    const cz = Math.sin(a) * 0.008;
    const len = i < 2 ? 0.13 : 0.08;
    b.add(arm, stalk([new Vector3(-0.015, cy, cz), new Vector3(-0.015 - len * 0.5, cy * 1.6 + Math.sin(i) * 0.006, cz * 1.6), new Vector3(-0.015 - len, cy * 2 + Math.cos(i * 2) * 0.01, cz * 2.2)], 0.0025, 0.0008, 5, 8));
  }
  const g = b.group();
  if (glow) {
    const lit = new MeshBasicMaterial({ color: 0x5aff9a, toneMapped: false });
    for (let i = 0; i < 4; i++) {
      const m = new Mesh(new SphereGeometry(0.0045, 8, 6), lit);
      m.position.set(0.02 + i * 0.03, 0.02, 0);
      g.add(m);
    }
  }
  return g;
}

/** a live bonito, for the marlin (new) */
export function bonito(k: Kit): Group {
  const g = new Group();
  const f = propFish(k, 'tuna', 0.34);
  f.position.y = 0.04;
  g.add(f);
  return g;
}

/** a bait level's picture */
export function bait(k: Kit, level: number): Object3D {
  switch (level) {
    case 0:
      return shrimp(k);
    case 1:
      return pilchards(k);
    case 2:
      return squid(k);
    case 3:
      return squid(k, true);
    default:
      return bonito(k);
  }
}

/* ── charms ─────────────────────────────────────────────────────────── */

/** a gold doubloon's face: a crowned head in relief, lettering round the rim */
let doubloon: MeshStandardMaterial | null = null;
function doubloonMaterial(k: Kit): MeshStandardMaterial {
  if (doubloon) return doubloon;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#8a8a8a';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(128, 128, 110, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#a0a0a0';
  g.font = 'bold 22px Georgia, serif';
  g.textAlign = 'center';
  const text = 'REX · MARIS · MDCCXV · ';
  for (let i = 0; i < text.length; i++) {
    const a = -Math.PI / 2 + (i / text.length) * Math.PI * 2;
    g.save();
    g.translate(128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92);
    g.rotate(a + Math.PI / 2);
    g.fillText(text[i], 0, 8);
    g.restore();
  }
  // the head in profile, and a trident behind
  g.fillStyle = '#b8b8b8';
  g.beginPath();
  g.ellipse(132, 136, 38, 48, 0.2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#909090';
  g.fillRect(84, 60, 6, 130);
  for (const x of [74, 87, 100]) g.fillRect(x, 58, 5, 26);
  const map = new CanvasTexture(c);
  map.colorSpace = SRGBColorSpace;
  // the relief is in the map's greys, over polished gold
  return (doubloon = new MeshStandardMaterial({ map, color: '#ffc848', roughness: 0.25, metalness: 1, envMap: casinoEnv(k.renderer), envMapIntensity: 1.5 }));
}

export function charm(k: Kit, level: number): Group {
  const b = new Batch();
  const gold = M.gold(k.renderer);
  const cord = M.satin(k.renderer, '#5a3a22');
  const hang = (y: number): void => {
    // the cord or chain it hangs from, in a loop above it
    const pts: Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI / 2 + (i / 24) * Math.PI * 2;
      pts.push(new Vector3(Math.cos(a) * 0.026, y + 0.028 + Math.sin(a) * 0.03, 0));
    }
    b.add(level === 1 ? cord : gold, stalk(pts, level === 1 ? 0.0022 : 0.0014, level === 1 ? 0.0022 : 0.0014, 5, 48));
  };
  switch (level) {
    case 1: {
      // a shark's tooth: a flat serrated triangle, ivory, bound to the cord
      const tooth = turned([[0, 0], [0.018, 0.004], [0.012, 0.03], [0, 0.05]], 3).scale(1, 1, 0.35);
      b.at(M.glaze(k.renderer, '#f4f0e0'), tooth, 0, -0.05, 0, Math.PI, 0, 0);
      b.at(cord, turned([[0.009, -0.004], [0.01, 0], [0.009, 0.004]], 10), 0, -0.004, 0);
      hang(0);
      break;
    }
    case 2: {
      // a black pearl in a gold cup on a fine chain
      b.at(M.gloss(k.renderer, '#1a1a24'), new SphereGeometry(0.022, 20, 14), 0, -0.03, 0);
      b.at(gold, turned([[0, 0], [0.012, 0.002], [0.014, 0.008], [0.004, 0.012], [0, 0.012]], 12), 0, -0.012, 0);
      b.at(gold, new TorusGeometry(0.004, 0.0012, 5, 10), 0, 0.002, 0);
      hang(0.004);
      break;
    }
    case 3: {
      // a mermaid's comb: a gold spine, a scallop shell on it, pearls, fine teeth
      b.at(gold, rounded(0.14, 0.022, 0.006, 0.004), 0, 0, 0);
      for (let i = 0; i < 17; i++) b.at(gold, rounded(0.003, 0.045, 0.003, 0.001, 1), -0.064 + i * 0.008, -0.032, 0);
      const shell = M.petal(k.renderer);
      for (let i = 0; i < 7; i++) {
        const a = -0.9 + (i / 6) * 1.8;
        b.at(shell, blade({ len: 0.035, width: 0.014, outline: OUTLINE.strap, cup: 0.4, segs: 3, across: 1, base: '#e8c060', tip: '#fff0c0' }), 0, 0.008, 0.004, 0, 0, a);
      }
      for (const x of [-0.05, 0.05]) b.at(M.gloss(k.renderer, '#fbf4ee'), new SphereGeometry(0.006, 12, 8), x, 0.004, 0.005);
      // worn in the hair, or hung from a fine chain by its shell
      hang(0.04);
      break;
    }
    default: {
      // the sea king's doubloon: a thick gold coin with a milled edge, on a gold chain
      const coinMat = doubloonMaterial(k);
      b.at(coinMat, new CylinderGeometry(0.03, 0.03, 0.005, 36).rotateX(Math.PI / 2), 0, -0.03, 0);
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        b.at(gold, rounded(0.0015, 0.004, 0.006, 0.0005, 1), Math.cos(a) * 0.0302, -0.03 + Math.sin(a) * 0.0302, 0, 0, 0, a);
      }
      b.at(M.metal(k.renderer, '#e8b030', 0.3), new CylinderGeometry(0.018, 0.018, 0.0062, 24).rotateX(Math.PI / 2), 0, -0.03, 0);
      b.at(gold, new TorusGeometry(0.004, 0.0012, 5, 10), 0, 0.002, 0);
      hang(0.004);
    }
  }
  return b.group();
}
