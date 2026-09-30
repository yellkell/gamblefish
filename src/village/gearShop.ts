/**
 * THE GEAR SHOPS: the village's fishing upgrades, on Tidewater's upgrade tracks (fishing/gear.ts).
 *
 *   TACKLE SHOP (S3)     rods, reels and line: how far you cast, how fast you reel, what the
 *                        line will hold. A rack of rods by the wall, reels and spools on the
 *                        counter.
 *   BAIT SHOP (S2)       bait: bites come sooner, and the trophy fish take it. Bait tanks and
 *                        buckets.
 *   ISLAND ENGINEER (N)  gadgets: the trophy fish bite more often. A workbench with a vice, a
 *                        sonar screen and a work lamp; pegboards of tools, a blueprint pinned up.
 *
 * Like the home shops (village/homeGoods.ts): a counter with the goods on it and a board behind.
 * Point at BUY: it's paid from the wallet (Tidewater's GameState.buy), or the board says how
 * much more you need. The board says what each level does for you, in numbers against what you
 * have (fishing/gear.ts gearEffect), and which trophy fish need it.
 *
 * At the bait shop every bait you've bought (and the frozen shrimp you started with) has a USE
 * button: that's the one that goes on your hook and hangs under the float, and the fish that like
 * it best bite it more often (fishing/favouriteBait.ts; the field guide says which). At the tackle
 * shop a board by the rack of rods does the same for the rod in your hand and the reel on it.
 * What you use is what you fish with (fishing/gear.ts usedGear): the bites come as fast as that
 * bait brings them, the trophy fish look at what's on your line, you cast as far as that rod and
 * reel in as fast as that reel.
 */

import { CircleGeometry, DoubleSide, Group, MeshBasicMaterial, SphereGeometry, TorusGeometry, Vector3, type Object3D } from 'three';
import { uiClick, uiDeny, winFanfare } from '../audio/sfx.ts';
import { gearEffect, GEAR_SHOPS, LOOK_TRACKS, shownLevel } from '../fishing/gear.ts';
import { FISH, UPGRADES, type GameState } from '../fishing/tidewater.ts';
import { TROPHY } from '../fishing/trophyFish.ts';
import { InteractivePanel, register } from '../ui/pointer.ts';
import { thumbnail } from '../ui/thumbnail.ts';
import { Lettering, lookFor, mount, type InkName } from '../ui/boards.ts';
import { Batch, M, rng, rounded, stalk, turned, type Kit } from './craft.ts';
import { shopCounter, WORKBENCH, WORKBENCH_SIZE, type Interior } from './interiors.ts';
import { mergeStatic } from './merge.ts';
import { ROLES } from './roles.ts';
import { bait, gadget, hook, hookCard, reel, rod, spool } from './wares/tackle.ts';

const BW = 1200;
const BH = 700;

/** the trophy fish a track's level opens (the ones needing exactly that level) */
function opens(track: string, level: number): string[] {
  return Object.entries(TROPHY)
    .filter(([, t]) => (t.needs as Record<string, number>)[track] === level)
    .map(([id]) => FISH[id].name);
}

/* ── what's on show ─────────────────────────────────────────────────────── */

/** a thing placed at x, y, z, turned by ry (and tipped by rx, rz) */
function put(g: Group, o: Object3D, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, s = 1): void {
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  o.scale.setScalar(s);
  g.add(o);
}

function tackleDecor(k: Kit, room: Interior, top: number, cz: number): Group {
  const g = new Group();
  // the rack by the left wall: a rail top and bottom, a rod of every grade standing in it
  const rack = new Group();
  const b = new Batch();
  const wood = M.wood(k.renderer, 'teak', 0.4);
  b.at(wood, rounded(0.1, 0.05, 1.5, 0.012), 0, 0.95, 0);
  b.at(wood, rounded(0.14, 0.06, 1.5, 0.012), 0, 0.05, 0);
  for (const z of [-0.72, 0.72]) b.at(wood, rounded(0.05, 1.0, 0.05, 0.01), -0.03, 0.5, z);
  for (let i = 0; i < 4; i++) b.at(M.satin(k.renderer, '#2a2a2e'), new TorusGeometry(0.022, 0.006, 5, 12).rotateX(Math.PI / 2), 0.04, 0.95, -0.54 + i * 0.36);
  rack.add(b.group());
  for (let i = 0; i < 4; i++) put(rack, rod(k, i), 0.04, 0.08, -0.54 + i * 0.36, Math.PI / 2, 0, -0.05);
  rack.position.set(-room.w / 2 + 0.16, 0, -0.1);
  g.add(rack);
  // on the counter: the three reels on little stands, spools of line, cards of hooks
  const c = new Batch();
  for (let i = 1; i <= 3; i++) {
    const x = -0.95 + (i - 1) * 0.3;
    c.at(M.wood(k.renderer, 'walnut', 0.3), rounded(0.12, 0.02, 0.1, 0.006), x, top + 0.01, cz);
    c.at(M.metal(k.renderer, '#b8bcc4', 0.25), turned([[0.006, 0], [0.006, 0.12]], 8), x, top + 0.02, cz - 0.03);
    put(g, reel(k, i), x, top + 0.13, cz - 0.03, 0.4, Math.PI, 0);
  }
  for (let i = 1; i <= 4; i++) put(g, spool(k, i), 0.1 + (i - 1) * 0.15, top, cz + 0.05, 0.3);
  for (let i = 0; i < 4; i++) put(g, hookCard(k, i), 0.72 + i * 0.12, top, cz - 0.12, -0.1, -0.15);
  g.add(c.group());
  // a sailfish's bill over the door, the way tackle shops have them
  const bill = new Batch();
  bill.add(M.gloss(k.renderer, '#1a2a5a'), stalk([new Vector3(-0.45, room.h - 0.45, room.d / 2 - 0.05), new Vector3(0.4, room.h - 0.42, room.d / 2 - 0.05), new Vector3(0.45, room.h - 0.43, room.d / 2 - 0.05)], 0.03, 0.003, 8, 8));
  bill.at(M.wood(k.renderer, 'walnut', 0.3), rounded(0.2, 0.14, 0.02, 0.01), -0.45, room.h - 0.45, room.d / 2 - 0.03);
  g.add(bill.group());
  return g;
}

function baitDecor(k: Kit, room: Interior, top: number, cz: number): Group {
  const g = new Group();
  // the live-bait tank by the right wall: blue water in glass, a school of baitfish, a bubbler
  const tank = new Group();
  const b = new Batch();
  b.at(M.metal(k.renderer, '#5a5e66', 0.5), rounded(0.74, 0.62, 0.5, 0.02), 0, 0.31, 0);
  b.at(M.gloss(k.renderer, '#1e6a8a'), rounded(0.68, 0.34, 0.44, 0.01), 0, 0.8, 0);
  b.at(M.glass(k.renderer, '#cfefff', 0.18), rounded(0.72, 0.42, 0.48, 0.008), 0, 0.84, 0);
  b.at(M.metal(k.renderer, '#5a5e66', 0.5), rounded(0.74, 0.03, 0.5, 0.008), 0, 1.06, 0);
  for (let i = 0; i < 10; i++) b.at(M.glass(k.renderer, '#ffffff', 0.5), new SphereGeometry(0.006 + (i % 3) * 0.003, 8, 6), 0.28, 0.66 + i * 0.03, 0.15 + Math.sin(i) * 0.01);
  tank.add(b.group());
  const r = rng(12);
  for (let i = 0; i < 7; i++) {
    const { mesh, uniforms } = k.props.makeFish('silverside');
    uniforms.uSwim.value = 0.05;
    uniforms.uTime.value = r() * 5;
    put(tank, mesh, -0.22 + r() * 0.44, 0.72 + r() * 0.16, -0.14 + r() * 0.28, (r() - 0.5) * 0.8 + Math.PI / 2, 0, 0, 0.1 + r() * 0.03);
  }
  tank.position.set(room.w / 2 - 0.45, 0, 0.35);
  tank.rotation.y = -Math.PI / 2;
  g.add(tank);
  // buckets and a cooler by the counter (each bucket out over its rolled rim and down inside to
  // its floor, clear of the room's floor: a wall with no inside is see-through from above)
  const c = new Batch();
  for (const [x, col] of [[-1.25, '#3f7f55'], [-0.95, '#c23b2e']] as const) {
    c.at(M.gloss(k.renderer, col), turned([[0, 0], [0.12, 0], [0.14, 0.3], [0.146, 0.303], [0.145, 0.31], [0.136, 0.306], [0.134, 0.3], [0.115, 0.03], [0, 0.03]], 20), x, 0, cz + 0.55);
    c.at(M.metal(k.renderer, '#c8ccd0', 0.3), new TorusGeometry(0.14, 0.004, 4, 16, Math.PI), x, 0.3, cz + 0.55, 0, 0.4, 0);
  }
  c.at(M.gloss(k.renderer, '#f4f4f0'), rounded(0.52, 0.3, 0.34, 0.03), 1.0, 0.15, cz + 0.6);
  c.at(M.gloss(k.renderer, '#2f6fa8'), rounded(0.54, 0.05, 0.36, 0.02), 1.0, 0.32, cz + 0.6);
  // a tray of ice along the counter for the bait on show
  c.at(M.metal(k.renderer, '#c8ccd0', 0.25), rounded(1.9, 0.03, 0.3, 0.01), 0, top + 0.015, cz);
  c.at(M.glaze(k.renderer, '#a8c4d0'), rounded(1.84, 0.012, 0.26, 0.006), 0, top + 0.03, cz);
  g.add(c.group());
  for (let lv = 0; lv < 6; lv++) put(g, bait(k, lv), -0.8 + lv * 0.32, top + 0.036, cz, -0.3, 0, 0, lv === 5 ? 0.7 : 1);
  return g;
}

function engineerDecor(k: Kit, room: Interior, top: number, cz: number): Group {
  const g = new Group();
  const b = new Batch();
  const [bx, bz] = WORKBENCH;
  const [hx, hz, bh] = WORKBENCH_SIZE;
  const frame = M.metal(k.renderer, '#3e5566', 0.5);
  const steel = M.metal(k.renderer, '#b8bcc4', 0.3);
  const iron = M.iron(k.renderer);
  const rubber = M.satin(k.renderer, '#1c1c20');
  // the workbench against the right-hand wall: a thick timber top on a welded frame, a shelf under
  b.at(M.wood(k.renderer, 'teak', 0.55), rounded(hx * 2, 0.06, hz * 2, 0.01), bx, bh - 0.03, bz);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.at(frame, rounded(0.05, bh - 0.06, 0.05, 0.006), bx + sx * (hx - 0.05), (bh - 0.06) / 2, bz + sz * (hz - 0.05));
  b.at(M.wood(k.renderer, 'teak', 0.7), rounded(hx * 2 - 0.08, 0.03, hz * 2 - 0.08, 0.006), bx, 0.2, bz);
  for (const sx of [-1, 1]) b.at(frame, rounded(0.04, 0.04, hz * 2 - 0.1, 0.005), bx + sx * (hx - 0.05), 0.165, bz);
  // on the shelf: a red toolbox and a coil of hose
  b.at(M.gloss(k.renderer, '#c23b2e'), rounded(0.42, 0.18, 0.24, 0.012), bx, 0.305, bz - 0.35);
  b.at(M.satin(k.renderer, '#8a2418'), rounded(0.43, 0.01, 0.25, 0.004), bx, 0.34, bz - 0.35);
  b.at(M.satin(k.renderer, '#2f6a8a'), new TorusGeometry(0.13, 0.018, 8, 24).rotateX(Math.PI / 2), bx, 0.235, bz + 0.3);
  b.at(M.satin(k.renderer, '#2f6a8a'), new TorusGeometry(0.11, 0.018, 8, 24).rotateX(Math.PI / 2), bx, 0.27, bz + 0.3);
  // a vice bolted to the bench's front corner, its jaws out over the edge
  const vx = bx - hx + 0.08;
  const vz = bz + hz - 0.14;
  b.at(frame, rounded(0.12, 0.03, 0.12, 0.006), vx, bh + 0.015, vz);
  b.at(frame, rounded(0.1, 0.07, 0.08, 0.01), vx, bh + 0.065, vz);
  for (const dx of [-0.07, -0.13]) b.at(iron, rounded(0.03, 0.06, 0.12, 0.004), vx + dx, bh + 0.08, vz);
  b.at(steel, turned([[0.008, 0], [0.008, 0.2]], 10), vx + 0.04, bh + 0.07, vz, 0, 0, Math.PI / 2);
  b.at(steel, turned([[0.004, 0], [0.004, 0.16]], 8), vx - 0.17, bh + 0.07 - 0.08, vz);
  for (const y of [-0.08, 0.08]) b.at(steel, new SphereGeometry(0.009, 10, 8), vx - 0.17, bh + 0.07 + y, vz);
  // the sonar screen: a grey cabinet on the bench, its round screen toward the room
  const sz0 = bz - 0.35;
  b.at(M.satin(k.renderer, '#5a6a64'), rounded(0.24, 0.22, 0.26, 0.02), bx + 0.12, bh + 0.11, sz0);
  b.at(rubber, turned([[0.085, 0], [0.085, 0.012], [0, 0.012]], 28), bx, bh + 0.12, sz0, 0, 0, Math.PI / 2);
  for (const dz of [-0.07, 0.07]) b.at(M.satin(k.renderer, '#e8e0c0'), turned([[0.012, 0], [0.012, 0.012], [0, 0.014]], 12), bx, bh + 0.03, sz0 + dz, 0, 0, Math.PI / 2);
  // a spool of copper wire, a soldering iron in its coil stand, a tin of screws
  b.at(M.copper(k.renderer), turned([[0.03, 0], [0.045, 0], [0.045, 0.06], [0.03, 0.06]], 20), bx - 0.2, bh, bz + 0.1);
  b.at(M.satin(k.renderer, '#2a2a2e'), turned([[0.05, 0], [0.052, 0.004], [0.05, 0.008], [0.028, 0.008], [0.028, 0.06], [0.05, 0.062], [0.05, 0.066]], 20), bx - 0.2, bh, bz + 0.1);
  b.at(steel, turned([[0, 0], [0.04, 0], [0.04, 0.01], [0, 0.01]], 16), bx + 0.15, bh, bz + 0.45);
  const coil: Vector3[] = [];
  for (let i = 0; i <= 40; i++) coil.push(new Vector3(bx + 0.15 + Math.cos(i * 0.9) * 0.018, bh + 0.02 + i * 0.0018, bz + 0.45 + Math.sin(i * 0.9) * 0.018));
  b.add(steel, stalk(coil, 0.0015, 0.0015, 4, 120));
  b.add(M.satin(k.renderer, '#2a5a8a'), stalk([new Vector3(bx + 0.15, bh + 0.06, bz + 0.45), new Vector3(bx + 0.02, bh + 0.1, bz + 0.52)], 0.011, 0.009, 10, 2));
  b.add(steel, stalk([new Vector3(bx + 0.02, bh + 0.1, bz + 0.52), new Vector3(bx - 0.06, bh + 0.125, bz + 0.565)], 0.003, 0.0012, 6, 2));
  b.at(M.metal(k.renderer, '#8a9098', 0.4), turned([[0, 0], [0.04, 0], [0.04, 0.05], [0, 0.05]], 18), bx - 0.25, bh, bz - 0.12);
  // the work lamp: a weighted foot, an arm up and over, a shade looking down at the bench
  const lx = bx + 0.28;
  const lz = bz + 0.2;
  b.at(frame, turned([[0, 0], [0.07, 0], [0.07, 0.02], [0.02, 0.03], [0, 0.03]], 20), lx, bh, lz);
  b.add(frame, stalk([new Vector3(lx, bh + 0.03, lz), new Vector3(lx - 0.05, bh + 0.35, lz), new Vector3(lx - 0.25, bh + 0.45, lz)], 0.008, 0.008, 6, 12));
  b.at(frame, turned([[0.07, 0], [0.05, 0.04], [0.02, 0.1], [0, 0.11]], 20), lx - 0.28, bh + 0.35, lz);
  // THE PEGBOARD over the bench, and one on the left-hand wall: hardboard drilled all over,
  // spanners in their sizes, screwdrivers, a hammer, pliers
  const peg = M.painted(k.renderer, 'pegboard', 256, 256, (c, w, h) => {
    c.fillStyle = '#b8966a';
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(40, 24, 10, 0.75)';
    for (let y = 8; y < h; y += 16) for (let x = 8; x < w; x += 16) {
      c.beginPath();
      c.arc(x, y, 2.4, 0, Math.PI * 2);
      c.fill();
    }
  });
  const handles = ['#c23b2e', '#e8b830', '#2f6a8a', '#3f7f55'];
  const board = (wx: number, face: number, z0: number, len: number): void => {
    // face: which way the board looks into the room (+1: toward +x)
    const x = wx + face * 0.012;
    b.at(peg, rounded(0.012, 0.9, len, 0.003), x, 1.55, z0);
    const tx = x + face * 0.02;
    // five spanners, smallest at the left, each hung by its ring end with its jaw below
    for (let i = 0; i < 5; i++) {
      const L = 0.13 + i * 0.03;
      const z = z0 - len / 2 + 0.12 + i * 0.07;
      const y = 1.88 - L / 2;
      b.at(steel, rounded(0.006, L, 0.016 + i * 0.002, 0.002), tx, y, z);
      b.at(steel, new TorusGeometry(0.014 + i * 0.002, 0.005, 6, 14), tx, y + L / 2, z, 0, Math.PI / 2, 0);
      b.at(steel, new TorusGeometry(0.016 + i * 0.002, 0.005, 6, 14, Math.PI * 1.3), tx, y - L / 2, z, (-Math.PI / 2) - 0.2, Math.PI / 2, 0);
    }
    // four screwdrivers, points down
    for (let i = 0; i < 4; i++) {
      const z = z0 - len / 2 + 0.52 + i * 0.06;
      b.at(M.gloss(k.renderer, handles[i]), turned([[0, 0], [0.013, 0.004], [0.014, 0.09], [0.01, 0.1], [0, 0.1]], 10), tx, 1.8, z);
      b.at(steel, turned([[0.0025, 0], [0.0035, 0.004], [0.0035, 0.15]], 6), tx, 1.65, z);
    }
    // a claw hammer, and a pair of pliers
    const hz0 = z0 + len / 2 - 0.2;
    b.at(M.wood(k.renderer, 'teak', 0.4), rounded(0.02, 0.3, 0.028, 0.008), tx, 1.5, hz0);
    b.at(iron, rounded(0.03, 0.03, 0.14, 0.008), tx, 1.66, hz0 + 0.02);
    const pz = z0 + len / 2 - 0.08;
    for (const s of [-1, 1]) {
      b.add(M.gloss(k.renderer, '#c23b2e'), stalk([new Vector3(tx, 1.72, pz), new Vector3(tx, 1.6, pz + s * 0.018), new Vector3(tx, 1.5, pz + s * 0.026)], 0.007, 0.007, 6, 8));
      b.add(steel, stalk([new Vector3(tx, 1.72, pz), new Vector3(tx, 1.79, pz + s * 0.006), new Vector3(tx, 1.82, pz)], 0.006, 0.003, 6, 6));
    }
  };
  board(room.w / 2, -1, bz, hz * 2);
  board(-room.w / 2, 1, 1.0, 1.1);
  // a blueprint pinned up on the left-hand wall: the sea-caller, drawn out
  const print = M.painted(k.renderer, 'blueprint', 384, 256, (c, w, h) => {
    c.fillStyle = '#1f5694';
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(210, 230, 255, 0.12)';
    for (let x = 0; x < w; x += 12) c.fillRect(x, 0, 1, h);
    for (let y = 0; y < h; y += 12) c.fillRect(0, y, w, 1);
    c.strokeStyle = 'rgba(240, 248, 255, 0.9)';
    c.lineWidth = 2;
    c.strokeRect(8, 8, w - 16, h - 16);
    // the case, its handle and dial; the cable's coil; the speaker's bell
    c.strokeRect(40, 90, 150, 95);
    c.beginPath();
    c.moveTo(75, 90);
    c.bezierCurveTo(75, 60, 155, 60, 155, 90);
    c.moveTo(100, 140);
    c.arc(85, 140, 18, 0, Math.PI * 2);
    for (let i = 0; i < 7; i++) {
      c.moveTo(190 + i * 12, 150);
      c.arc(196 + i * 12, 150, 6, Math.PI, Math.PI * 3);
    }
    c.moveTo(280, 185);
    c.lineTo(290, 140);
    c.lineTo(320, 128);
    c.lineTo(350, 140);
    c.lineTo(360, 185);
    c.stroke();
    // dimension lines, and the title
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(40, 205);
    c.lineTo(190, 205);
    c.moveTo(40, 200);
    c.lineTo(40, 210);
    c.moveTo(190, 200);
    c.lineTo(190, 210);
    c.stroke();
    c.fillStyle = 'rgba(240, 248, 255, 0.9)';
    c.font = '700 22px sans-serif';
    c.fillText('SONIC SEA-CALLER  MK IV', 40, 40);
    c.font = '14px sans-serif';
    c.fillText('160 mm', 95, 225);
    c.fillText('SHEET 1 OF 3', w - 110, h - 20);
  }, 0.9);
  const px = -room.w / 2 + 0.012;
  b.at(print, rounded(0.004, 0.66, 1.0, 0.001), px, 1.55, -0.45);
  for (const dy of [-0.3, 0.3]) for (const dz of [-0.47, 0.47]) b.at(M.gloss(k.renderer, '#d83a2a'), new SphereGeometry(0.01, 8, 6), px + 0.006, 1.55 + dy, -0.45 + dz);
  // on the counter: a rubber mat for the gadgets, a red toolbox at one end, an oil can at the other
  b.at(rubber, rounded(1.7, 0.006, 0.34, 0.002), 0, top + 0.003, cz);
  b.at(M.gloss(k.renderer, '#c23b2e'), rounded(0.3, 0.13, 0.17, 0.012), -1.02, top + 0.065, cz - 0.02);
  b.at(M.satin(k.renderer, '#8a2418'), rounded(0.31, 0.008, 0.18, 0.003), -1.02, top + 0.1, cz - 0.02);
  b.add(steel, stalk([new Vector3(-1.1, top + 0.13, cz - 0.02), new Vector3(-1.08, top + 0.17, cz - 0.02), new Vector3(-0.96, top + 0.17, cz - 0.02), new Vector3(-0.94, top + 0.13, cz - 0.02)], 0.006, 0.006, 6, 12));
  b.at(M.gloss(k.renderer, '#2f6a3a'), turned([[0, 0], [0.05, 0], [0.052, 0.006], [0.05, 0.06], [0.03, 0.08], [0.008, 0.09], [0, 0.09]], 20), 1.04, top, cz);
  b.add(M.brass(k.renderer), stalk([new Vector3(1.04, top + 0.085, cz), new Vector3(1.0, top + 0.14, cz + 0.02), new Vector3(0.92, top + 0.19, cz + 0.05)], 0.006, 0.002, 6, 8));
  g.add(b.group());
  // the gadgets on the mat, left to right, and a half-built sea-caller on the workbench
  const shown: [number, number, number][] = [
    [-0.66, -0.2, 1.8],
    [-0.28, -0.2, 1.4],
    [0.12, 0.3, 1.3],
    [0.55, -0.3, 1],
  ];
  shown.forEach(([x, ry, sc], i) => put(g, gadget(k, i + 1), x, top + 0.006, cz, ry, 0, 0, sc));
  put(g, gadget(k, 4), bx - 0.1, bh, bz + 0.05, -Math.PI / 2 - 0.3);
  // lit from within: the sonar screen and its sweep, the lamp's bulb
  const lights = new Batch();
  // (the screen sits just proud of its rubber bezel, which stands 12 mm off the cabinet)
  lights.at(new MeshBasicMaterial({ color: 0x1f7a4a, toneMapped: false, side: DoubleSide }), new CircleGeometry(0.075, 28), bx - 0.0125, bh + 0.12, sz0, 0, -Math.PI / 2, 0);
  const bright = new MeshBasicMaterial({ color: 0x7affa8, toneMapped: false });
  lights.at(bright, rounded(0.002, 0.004, 0.07, 0.001), bx - 0.014, bh + 0.12 + 0.024, sz0 + 0.024, Math.PI / 4, 0, 0);
  for (const [dy, dz] of [[0.03, -0.02], [-0.02, 0.035], [0.045, 0.03]]) lights.at(bright, new SphereGeometry(0.005, 8, 6), bx - 0.014, bh + 0.12 + dy, sz0 + dz);
  lights.at(new MeshBasicMaterial({ color: 0xfff0c0, toneMapped: false }), new SphereGeometry(0.03, 14, 10), lx - 0.28, bh + 0.35, lz);
  g.add(lights.group());
  return g;
}

/* ── pictures for the board: each level of each track ────────────────── */

/** the thing a level of a track is, for its picture on the board */
function gearIcon(k: Kit, track: string, level: number): Object3D {
  const g = new Group();
  switch (track) {
    case 'rod':
      put(g, rod(k, level), 0, 0, 0, 0.3, 0, -0.95);
      break;
    case 'reel':
      put(g, reel(k, level), 0, 0, 0, 0.6 + (level >= 2 ? Math.PI / 2 : 0), Math.PI, 0);
      break;
    case 'line':
      put(g, spool(k, level), 0, 0, 0, 0, 1.1);
      break;
    case 'hooks':
      put(g, hook(k, level, 2.4), 0, 0, 0, 0.2);
      break;
    case 'bait':
      put(g, bait(k, level), 0, 0, 0, 0.4);
      break;
    case 'charm':
      put(g, gadget(k, level), 0, 0, 0, 0.3);
      break;
  }
  return g;
}

const DECOR: Record<string, (k: Kit, room: Interior, top: number, cz: number) => Group> = { S3: tackleDecor, S2: baitDecor, N: engineerDecor };

/* ── the counter and the board ─────────────────────────────────────────── */

interface Row {
  track: string;
  level: number;
}

export class GearShopCounter {
  private readonly board: InteractivePanel;
  private readonly letters: Lettering;
  private readonly tracks: string[];
  private note = '';
  private noteColour: InkName = 'dim';
  /** a picture of every level of every track this shop sells */
  private readonly pics = new Map<string, HTMLCanvasElement>();

  constructor(
    private readonly room: Interior,
    private readonly state: GameState,
    kit: Kit,
  ) {
    this.tracks = GEAR_SHOPS[room.name] ?? [];
    const [cx, cz, hx, hz, top] = shopCounter(room.d);
    const display = new Group();
    const counter = new Batch();
    counter.at(M.wood(kit.renderer, 'walnut', 0.45), rounded(hx * 2, top - 0.05, hz * 2, 0.02), cx, (top - 0.05) / 2, cz);
    counter.at(M.wood(kit.renderer, 'mahogany', 0.25), rounded(hx * 2 + 0.08, 0.05, hz * 2 + 0.08, 0.015), cx, top - 0.025, cz);
    for (let i = 0; i < 4; i++) counter.at(M.wood(kit.renderer, 'mahogany', 0.4), rounded(hx * 0.42, top * 0.62, 0.02, 0.008), cx - hx + (hx * 2 * (i + 0.5)) / 4, top * 0.46, cz + hz + 0.005);
    display.add(counter.group());
    display.add(DECOR[room.name]?.(kit, room, top, cz) ?? new Group());
    room.contents.add(mergeStatic(display));
    for (const t of this.tracks) UPGRADES[t].levels.forEach((_, lv) => (lv > 0 || t === 'bait') && this.pics.set(`${t}:${lv}`, thumbnail(kit.renderer, gearIcon(kit, t, lv))));

    this.board = new InteractivePanel([BW, BH], [1.6, (1.6 * BH) / BW]);
    // a board in the shop's own style, framed, hung on the back wall (ui/boards.ts)
    const look = lookFor(room.name);
    this.letters = new Lettering(this.board, look, room.name.charCodeAt(0) + room.name.length);
    mount(this.board, look, { renderer: kit.renderer });
    this.board.mesh.position.set(cx, top + 1.05, -room.d / 2 + 0.02 + look.frame.d);
    room.contents.add(this.board.mesh);
    this.board.paint = () => this.paint();
    this.board.onClick = (id) => this.click(id);
    this.board.repaintOnFonts(() => this.paint());
    register(this.board);
    state.onChange(() => this.paint());
    this.paint();
  }

  /**
   * One row per track (its next level), or, in a one-track shop, one per level (at the bait shop
   * the frozen shrimp you started with too, to go back to).
   */
  private rows(): Row[] {
    const u = this.state.upgrades;
    if (this.tracks.length === 1) {
      const t = this.tracks[0];
      const from = t === 'bait' ? 0 : 1;
      return UPGRADES[t].levels.slice(from).map((_, i) => ({ track: t, level: i + from }));
    }
    return this.tracks.map((t) => ({ track: t, level: Math.min(UPGRADES[t].levels.length - 1, (u[t] | 0) + 1) }));
  }

  click(id: string): void {
    const [act, track, lv] = id.split(':');
    const level = Number(lv);
    if (act === 'use') return this.use(track, level);
    const u = this.state.upgrades;
    const next = UPGRADES[track]?.levels[level];
    if (!next || (u[track] | 0) + 1 !== level) return;
    if (this.state.money < next.cost) {
      uiDeny();
      this.note = `You need $${Math.ceil(next.cost - this.state.money)} more for the ${next.label.toLowerCase()}.`;
      this.noteColour = 'bad';
      this.paint();
      return;
    }
    // new gear goes straight on (a new bait on the hook, a new rod in your hand)
    delete this.state.looks[track];
    // buy() spends, saves and tells everyone (the rod, the wallet, this board)
    if (!this.state.buy(track)) return;
    winFanfare(1);
    const fish = opens(track, level);
    this.note = `Sold! ${gearEffect(UPGRADES[track].levels, track, level, level)} now.` + (fish.length ? ` Needed for ${fish.join(' and ')}.` : '');
    this.noteColour = 'good';
    this.paint();
  }

  /** Put a bait you've bought on the hook. */
  private use(track: string, level: number): void {
    if (track !== 'bait' || !pickLook(this.state, track, level)) return;
    const lv = UPGRADES.bait.levels;
    this.note = `On your hook: ${lv[level].label.toLowerCase()}. The fish that like it bite more often.`;
    this.noteColour = 'good';
    this.paint();
  }

  private paint(): void {
    const L = this.letters;
    const role = ROLES[this.room.name];
    const u = this.state.upgrades;
    L.begin();
    L.title(role?.title ?? 'SHOP', 44, 82, 56, 'left', 620);
    const single = this.tracks.length === 1;
    const t0 = this.tracks[0];
    const onHook = t0 === 'bait' ? shownLevel(u, this.state.looks, 'bait') : -1;
    const sub = !single
      ? 'the big ones need big-game tackle'
      : t0 === 'bait'
        ? `on your hook: ${UPGRADES.bait.levels[onHook].label}`
        : `yours now: ${UPGRADES[t0].levels[u[t0] | 0].label}`;
    L.text(sub, 44, 122, 28, 'dim', 'left', 600, 700);
    L.text(`wallet $${Math.floor(this.state.money).toLocaleString('en-US')}`, BW - 44, 80, 34, 'accent', 'right', 700);
    const rows = this.rows();
    const rowH = Math.min(150, 470 / rows.length);
    // (laid out for rows 94 high; more rows than that, and it all shrinks to fit)
    const k = Math.min(1, rowH / 94);
    rows.forEach(({ track, level }, i) => {
      const y = 148 + i * rowH;
      const have = u[track] | 0;
      const lv = UPGRADES[track].levels[level];
      const owned = have >= level;
      const next = have + 1 === level;
      const maxed = !single && have >= UPGRADES[track].levels.length - 1;
      const pic = Math.min(rowH - 12, 124);
      L.thumb(this.pics.get(`${track}:${level}`), 40, y + 4, pic, !owned && !next && !maxed);
      const tx = 40 + pic + 20;
      if (!single) L.text(UPGRADES[track].name.toUpperCase(), tx, y + 22, 24, 'accent', 'left', 600);
      const on = level === onHook;
      L.text(lv.label, tx, y + (single ? 44 * k : 60), Math.round(38 * k), on ? 'ink' : owned || maxed ? 'dim' : next ? 'ink' : 'dim', 'left', 700, 700 - tx);
      const fish = opens(track, level);
      // what it does for you, in numbers, and which trophy fish need it
      const does = [gearEffect(UPGRADES[track].levels, track, level, have), fish.length ? `needed for ${fish.join(', ')}` : ''].filter(Boolean).join('  ·  ');
      L.text(maxed ? 'Fully upgraded' : does, tx, y + (single ? 80 * k : 94), Math.round(24 * k), 'dim', 'left', 500, 750 - tx);
      if (!maxed && lv.cost > 0) L.text(`$${lv.cost.toLocaleString('en-US')}`, 880, y + 58 * k, Math.round(40 * k), owned ? 'dim' : 'accent', 'right', 700);
      const bh = 80 * k;
      if (track === 'bait' && owned) {
        // a bait you've got: put it on the hook
        L.button(`use:${track}:${level}`, on ? 'ON HOOK ✓' : 'USE', 906, y + 14 * k, 250, bh, on ? 'done' : 'go', Math.round((on ? 30 : 36) * k));
        return;
      }
      const afford = this.state.money >= lv.cost;
      const st = owned || maxed ? 'done' : !next ? 'off' : afford ? 'go' : 'off';
      L.button(`buy:${track}:${level}`, owned || maxed ? 'YOURS ✓' : next ? 'BUY' : 'NEXT', 906, y + 14 * k, 250, bh, st, Math.round((owned || maxed || !next ? 30 : 36) * k));
    });
    if (this.note) L.text(this.note, 44, BH - 38, 28, this.noteColour, 'left', 600, BW - 88);
    L.end();
  }
}

/**
 * Fish with a level of a track you've bought (fishing/gear.ts LOOK_TRACKS). Your best clears the
 * pick, so the next one you buy is the one you use. Saved and told if it changed.
 */
function pickLook(state: GameState, track: string, level: number): boolean {
  const best = state.upgrades[track] | 0;
  if (!LOOK_TRACKS.includes(track) || !Number.isInteger(level) || level < 0 || level > best) return false;
  const was = shownLevel(state.upgrades, state.looks, track);
  if (level === best) delete state.looks[track];
  else state.looks[track] = level;
  if (level !== was) {
    uiClick();
    state.save();
    state.emit();
  }
  return true;
}

/* ── the tackle shop's rod rack: which rod's in your hand ─────────────── */

const RW = 1240;
const RH = 560;

/** the board's two columns: what each track's pick is called, and what its number is */
const RACK: { track: 'rod' | 'reel'; on: string; stat: (lv: Record<string, unknown>) => string }[] = [
  { track: 'rod', on: 'IN HAND ✓', stat: (lv) => `casts ${lv.castM} m` },
  { track: 'reel', on: 'ON ROD ✓', stat: (lv) => `reels in ${lv.reelSpeed} m/s` },
];

/**
 * A board on the wall by the rack of rods: every rod and every reel, the ones you've bought with
 * a USE button, the ones you fish with ticked. You cast as far as the rod you use and reel in as
 * fast as the reel on it.
 */
export class RodRackBoard {
  private readonly board: InteractivePanel;
  private readonly letters: Lettering;
  private readonly pics = new Map<string, HTMLCanvasElement>();
  private note = '';

  constructor(
    room: Interior,
    private readonly state: GameState,
    kit: Kit,
  ) {
    for (const { track } of RACK) UPGRADES[track].levels.forEach((_, lv) => this.pics.set(`${track}:${lv}`, thumbnail(kit.renderer, gearIcon(kit, track, lv))));
    const W = 1.0;
    this.board = new InteractivePanel([RW, RH], [W, (W * RH) / RW]);
    const look = lookFor(room.name);
    this.letters = new Lettering(this.board, look, room.name.charCodeAt(0) * 3 + 1);
    mount(this.board, look, { renderer: kit.renderer });
    // on the left wall, between the rack and the door, facing into the room
    this.board.mesh.position.set(-room.w / 2 + 0.02 + look.frame.d, 1.4, Math.min(room.d / 2 - W / 2 - 0.12, 1.15));
    this.board.mesh.rotation.y = Math.PI / 2;
    room.contents.add(this.board.mesh);
    this.board.paint = () => this.paint();
    this.board.onClick = (id) => this.click(id);
    this.board.repaintOnFonts(() => this.paint());
    register(this.board);
    state.onChange(() => this.paint());
    this.paint();
  }

  click(id: string): void {
    const [act, track, lv] = id.split(':');
    const level = Number(lv);
    const col = RACK.find((c) => c.track === track);
    if (act !== 'use' || !col || !pickLook(this.state, track, level)) return;
    const lvs = UPGRADES[track].levels;
    this.note = `${track === 'rod' ? 'In your hand' : 'On your rod'}: the ${lvs[level].label.toLowerCase()}. It ${col.stat(lvs[level])}.`;
    this.paint();
  }

  private paint(): void {
    const L = this.letters;
    const u = this.state.upgrades;
    L.begin();
    L.title('YOUR ROD AND REEL', 36, 70, 48, 'left', RW - 72);
    L.text('pick the ones you fish with: they cast and reel as they say', 36, 108, 24, 'dim', 'left', 600, RW - 72);
    const rowH = 90;
    RACK.forEach((c, k) => {
      const x0 = 32 + k * 604;
      const best = u[c.track] | 0;
      const shown = shownLevel(u, this.state.looks, c.track);
      UPGRADES[c.track].levels.forEach((lv, i) => {
        const y = 124 + i * rowH;
        const owned = i <= best;
        const on = i === shown;
        L.thumb(this.pics.get(`${c.track}:${i}`), x0, y + 6, rowH - 14, !owned);
        L.text(lv.label, x0 + 94, y + 40, 28, on ? 'ink' : 'dim', 'left', 700, 300);
        L.text(owned ? c.stat(lv) : `$${lv.cost.toLocaleString('en-US')} at the counter`, x0 + 94, y + 70, 22, 'dim', 'left', 500, 300);
        if (owned) L.button(`use:${c.track}:${i}`, on ? c.on : 'USE', x0 + 404, y + 12, 164, 64, on ? 'done' : 'go', on ? 22 : 30);
      });
    });
    if (this.note) L.text(this.note, 36, RH - 36, 20, 'good', 'left', 600, RW - 72);
    L.end();
  }
}
