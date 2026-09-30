/**
 * THE GEAR SHOPS' goods (village/gearShop.ts): rods, reels, line and hooks at the TACKLE SHOP,
 * bait at the BAIT SHOP, gadgets at the ISLAND ENGINEER. Each level of each track is its own
 * thing, for its picture on the board and its place on the counter.
 */

import { Group, Mesh, MeshBasicMaterial, SphereGeometry, TorusGeometry, Vector3, type MeshStandardMaterial, type Object3D } from 'three';
import { Batch, blade, M, OUTLINE, rounded, stalk, turned, type Kit } from '../craft.ts';
import { conventionalReel } from '../../fishing/conventionalReel.ts';
import { isConventional, LINE, REEL_KNOB, REEL_LEVER, REELS, RODS } from '../../fishing/rodLook.ts';
import { goopTub } from './goop.ts';

/* ── rods ───────────────────────────────────────────────────────────── */

/**
 * a rod standing up: butt cap, grip, reel seat, fore grip, a tapering blank with its guides, and
 * the reel of its level: a spinning reel hangs on the guides' side (+z), a conventional reel
 * sits on the other (−z), so the guides turn round to that side to run its line
 */
export function rod(k: Kit, level: number, withReel = true): Group {
  const r = RODS[Math.min(level, RODS.length - 1)];
  const reelLevel = Math.min(level, REELS.length - 1);
  const side = withReel && isConventional(reelLevel) ? -1 : 1;
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
    b.add(metal, stalk([new Vector3(0, y - 0.01, side * rb), new Vector3(0, y, side * (rb + rr * 0.9))], 0.0012, 0.0012, 4, 2));
    b.at(metal, new TorusGeometry(rr, 0.0018, 5, 16), 0, y + rr * 0.1, side * (rb + rr * 1.9));
  }
  b.at(metal, new TorusGeometry(0.004, 0.0012, 4, 10), 0, L + 0.004, side * 0.006);
  const g = b.group();
  if (withReel) {
    const rl = reel(k, reelLevel);
    // its foot on the seat: a spinning reel's stands off on +z, a conventional reel's on −z
    rl.position.set(0, 0.38, side > 0 ? 0.016 : -0.011);
    g.add(rl);
  }
  return g;
}

/* ── reels ──────────────────────────────────────────────────────────── */

/**
 * A reel on a rod, its foot on the rod (at the origin): a spinning reel hanging toward +z for the
 * first two, a conventional reel on top of the rod (−z) for the last two (fishing/conventionalReel.ts,
 * the same build as the one on the rod in your hand).
 */
export function reel(k: Kit, level: number): Group {
  const c = REELS[Math.min(level, REELS.length - 1)];
  const b = new Batch();
  const body = M.metal(k.renderer, c.body, 0.3);
  const trim = M.metal(k.renderer, c.trim, 0.25);
  const knob = M.satin(k.renderer, REEL_KNOB);
  if (c.kind === 'spinning') {
    // spinning reel: foot, stem, a gearbox, the rotor and spool facing up the rod
    b.at(trim, rounded(0.012, 0.08, 0.004, 0.0015), 0, 0, 0.004);
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
    const paint = { body, trim, knob, line: M.satin(k.renderer, '#e8e0c0'), lever: M.metal(k.renderer, REEL_LEVER, 0.3) };
    for (const p of conventionalReel(level).pieces) b.add(paint[p.paint], p.g);
  }
  return b.group();
}

/* ── line ───────────────────────────────────────────────────────────── */

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
  b.add(M.gloss(k.renderer, '#f4f4f0'), turned([[0, 0], [0.08, 0], [0.09, 0.07], [0.094, 0.075], [0.086, 0.078], [0.082, 0.07], [0.074, 0.006], [0, 0.006]], 24));
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

/** a little waxed-paper tub, for the goop bait */
function goopCup(k: Kit): Group {
  const b = new Batch();
  b.add(M.satin(k.renderer, '#e8e2d0'), turned([[0, 0], [0.042, 0], [0.05, 0.05], [0.053, 0.052], [0.049, 0.05], [0.041, 0.004], [0, 0.004]], 20));
  // its rim painted goop green
  b.at(M.gloss(k.renderer, '#3cc860'), new TorusGeometry(0.0515, 0.0035, 5, 24).rotateX(Math.PI / 2), 0, 0.051, 0);
  return b.group();
}

/** a bait level's picture */
export function bait(k: Kit, level: number): Object3D {
  switch (level) {
    case 0:
      return shrimp(k);
    case 1:
      return goopTub(k, goopCup);
    case 2:
      return pilchards(k);
    case 3:
      return squid(k);
    case 4:
      return squid(k, true);
    default:
      return bonito(k);
  }
}

/* ── the engineer's gadgets ─────────────────────────────────────────── */

/** things lit from within: the lure light's tube, the sea-caller's lamp */
const lit = (colour: number): MeshBasicMaterial => new MeshBasicMaterial({ color: colour, toneMapped: false });

/** a swivel: two rings and the barrel between them, along x from x0 (toward −x) */
function swivel(b: Batch, metal: MeshStandardMaterial, x0: number, y: number, s = 1): void {
  b.at(metal, new TorusGeometry(0.004 * s, 0.0012 * s, 5, 12), x0 - 0.004 * s, y, 0);
  b.at(metal, turned([[0.0022 * s, 0], [0.003 * s, 0.003 * s], [0.0022 * s, 0.008 * s]], 10), x0 - 0.008 * s, y, 0, 0, 0, Math.PI / 2);
  b.at(metal, new TorusGeometry(0.004 * s, 0.0012 * s, 5, 12), x0 - 0.02 * s, y, 0, Math.PI / 2, 0, 0);
}

/**
 * THE ISLAND ENGINEER's gadgets (village/gearShop.ts), built to bring the big ones in: the trophy
 * fish bite more often. Each lies or stands on the counter, its foot at the origin.
 *
 *   1  a brass line rattle: a capsule on the line with two steel balls in a clear window that
 *      click as it works
 *   2  a deep-drop lure light: a battery tube that glows green down where the sun doesn't reach
 *   3  a clockwork flasher: a wound brass drum that spins a spread of mirror spoons
 *   4  a sonic sea-caller: a yellow case of valves and a dial, and on its coiled cable an
 *      underwater speaker that plays a baitfish shoal at the deep
 */
export function gadget(k: Kit, level: number): Group {
  const b = new Batch();
  const brass = M.brass(k.renderer);
  const steel = M.metal(k.renderer, '#c8ccd4', 0.2);
  const rubber = M.satin(k.renderer, '#1c1c20');
  const g = new Group();
  switch (level) {
    case 1: {
      // lying along x: a brass cap each end, the window between, the balls in it
      const R = 0.009;
      const y = R;
      const cap = turned([[0, 0], [0.005, 0.001], [R, 0.008], [R, 0.024], [0, 0.024]], 16);
      b.at(brass, cap, -0.036, y, 0, 0, 0, -Math.PI / 2);
      b.at(brass, cap, 0.036, y, 0, 0, 0, Math.PI / 2);
      b.at(M.glass(k.renderer, '#e8f4ff', 0.35), turned([[R * 0.95, 0], [R * 0.95, 0.024]], 16), -0.012, y, 0, 0, 0, -Math.PI / 2);
      for (const x of [-0.004, 0.006]) b.at(steel, new SphereGeometry(0.004, 10, 8), x, 0.0045, 0);
      swivel(b, steel, -0.036, y);
      // a snap on the other end, to clip it to the line
      b.add(steel, stalk([new Vector3(0.036, y, 0), new Vector3(0.05, y + 0.004, 0), new Vector3(0.062, y, 0), new Vector3(0.05, y - 0.004, 0), new Vector3(0.042, y, 0)], 0.0009, 0.0009, 4, 16));
      break;
    }
    case 2: {
      // lying along x: a rubber cap, the green tube, an alloy collar with its swivel
      const R = 0.014;
      const y = R;
      b.at(rubber, turned([[0, 0], [R * 0.8, 0.002], [R + 0.001, 0.008], [R + 0.001, 0.02], [0, 0.02]], 18), 0.06, y, 0, 0, 0, Math.PI / 2);
      b.at(M.glass(k.renderer, '#9affc0', 0.4), turned([[R, 0], [R, 0.1]], 18), -0.04, y, 0, 0, 0, -Math.PI / 2);
      b.at(lit(0x5aff9a), turned([[0, 0], [R * 0.6, 0.004], [R * 0.6, 0.092], [0, 0.096]], 12), -0.038, y, 0, 0, 0, -Math.PI / 2);
      b.at(M.metal(k.renderer, '#8a9098', 0.3), turned([[0, 0], [R + 0.001, 0], [R + 0.001, 0.016], [0.006, 0.022], [0, 0.022]], 18), -0.04, y, 0, 0, 0, Math.PI / 2);
      swivel(b, steel, -0.062, y, 1.3);
      break;
    }
    case 3: {
      // a little stand, the wound drum on it (its axis along x), the key on the left, the spoons
      // on their shaft to the right
      const wood = M.wood(k.renderer, 'teak', 0.4);
      b.at(wood, rounded(0.1, 0.014, 0.06, 0.004), 0, 0.007, 0);
      b.at(brass, turned([[0.004, 0], [0.004, 0.05]], 8), -0.02, 0.014, 0);
      const y = 0.08;
      b.at(brass, turned([[0, 0], [0.024, 0], [0.028, 0.004], [0.028, 0.036], [0.024, 0.04], [0, 0.04]], 24), -0.04, y, 0, 0, 0, -Math.PI / 2);
      // rivets round the drum's seam
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        b.at(M.copper(k.renderer), new SphereGeometry(0.0022, 6, 4), -0.02, y + Math.cos(a) * 0.028, Math.sin(a) * 0.028);
      }
      // the winding key: a stem and a bow
      b.at(steel, turned([[0.003, 0], [0.003, 0.014]], 8), -0.04, y, 0, 0, 0, Math.PI / 2);
      b.at(steel, rounded(0.004, 0.036, 0.01, 0.003), -0.058, y, 0);
      for (const s of [-1, 1]) b.at(steel, new TorusGeometry(0.008, 0.0025, 6, 14), -0.058, y + s * 0.018, 0, 0, Math.PI / 2, 0);
      // the shaft, and three mirror spoons round it, each a flat oval out on a wire
      b.at(steel, turned([[0.002, 0], [0.002, 0.1]], 6), 0, y, 0, 0, 0, -Math.PI / 2);
      const mirror = M.metal(k.renderer, '#f0f4f8', 0.05);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        const x = 0.03 + i * 0.028;
        const cy = Math.cos(a) * 0.026;
        const cz = Math.sin(a) * 0.026;
        b.add(steel, stalk([new Vector3(x, y, 0), new Vector3(x, y + cy * 0.6, cz * 0.6)], 0.0008, 0.0008, 4, 2));
        b.at(mirror, new SphereGeometry(0.018, 16, 10).scale(1, 0.55, 0.14), x, y + cy, cz, a, 0, 0);
      }
      b.at(M.gloss(k.renderer, '#d83a2a'), new SphereGeometry(0.006, 10, 8), 0.1, y, 0);
      break;
    }
    default: {
      // the case: yellow, latched, a handle on top; on its face the dial, two switches, the lamp
      const W = 0.16;
      const H = 0.1;
      const D = 0.09;
      const x0 = -0.08;
      b.at(M.gloss(k.renderer, '#e8b820'), rounded(W, H, D, 0.012, 2), x0, H / 2, 0);
      b.at(M.satin(k.renderer, '#2a2a2e'), rounded(W + 0.004, 0.008, D + 0.004, 0.003), x0, H * 0.72, 0);
      for (const s of [-1, 1]) b.at(steel, rounded(0.018, 0.024, 0.006, 0.002), x0 + s * 0.05, H * 0.72, D / 2 + 0.003);
      b.add(rubber, stalk([new Vector3(x0 - 0.04, H, 0), new Vector3(x0 - 0.036, H + 0.028, 0), new Vector3(x0 + 0.036, H + 0.028, 0), new Vector3(x0 + 0.04, H, 0)], 0.006, 0.006, 8, 16));
      const face = D / 2 + 0.002;
      b.at(M.satin(k.renderer, '#f4f0e0'), turned([[0, 0], [0.02, 0], [0.02, 0.003], [0, 0.003]], 20), x0 - 0.035, H * 0.38, face, Math.PI / 2, 0, 0);
      b.at(brass, new TorusGeometry(0.021, 0.0025, 6, 24), x0 - 0.035, H * 0.38, face + 0.003);
      b.at(M.gloss(k.renderer, '#c02020'), rounded(0.0016, 0.016, 0.001, 0.0005), x0 - 0.031, H * 0.38 + 0.006, face + 0.004, 0, 0, -0.5);
      for (const x of [0.01, 0.03]) {
        b.at(steel, turned([[0.004, 0], [0.004, 0.004]], 10), x0 + x, H * 0.3, face, Math.PI / 2, 0, 0);
        b.at(steel, turned([[0.0015, 0], [0.0015, 0.014], [0.0025, 0.016], [0, 0.018]], 8), x0 + x, H * 0.3, face + 0.003, Math.PI / 2 - 0.5, 0, 0);
      }
      b.at(lit(0xff4a3a), new SphereGeometry(0.005, 10, 8), x0 + 0.03, H * 0.55, face);
      // the cable, coiled, from the case's side to the speaker
      const coil: Vector3[] = [];
      for (let i = 0; i <= 60; i++) {
        const t = i / 60;
        const a = t * Math.PI * 2 * 5;
        coil.push(new Vector3(0.004 + t * 0.07, 0.03 + Math.sin(a) * 0.012 - t * 0.012, Math.cos(a) * 0.012));
      }
      b.add(rubber, stalk(coil, 0.0022, 0.0022, 5, 180));
      // the speaker: a dark bell, mouth down, a ring of grille round its rim and a lifting eye on top
      const sx = 0.11;
      b.at(M.satin(k.renderer, '#2e3238'), turned([[0.042, 0], [0.044, 0.004], [0.04, 0.02], [0.022, 0.04], [0.012, 0.046], [0, 0.047]], 28), sx, 0, 0);
      for (let i = 0; i < 3; i++) b.at(steel, new TorusGeometry(0.043 - i * 0.004, 0.0014, 5, 28).rotateX(Math.PI / 2), sx, 0.004 + i * 0.005, 0);
      b.at(steel, new TorusGeometry(0.007, 0.0018, 6, 14), sx, 0.054, 0);
    }
  }
  g.add(b.group());
  return g;
}
