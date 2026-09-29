/**
 * The conventional reels (the reel track's top two levels, fishing/rodLook.ts REELS): one build
 * for the tackle shop's picture of them (village/wares/tackle.ts) and the one on the rod in your
 * hand (fishing/rod.ts), so the reel you fish with is the reel you bought.
 *
 * Two side plates round a spool that turns across the rod, pillars between them, the handle off
 * one plate; on the smaller reel a cast-control knob on the other, on the big-game reel a red
 * drag lever. Built in the shop's frame: the foot at the origin, the reel standing off the rod
 * toward −z, the handle on +x. Each piece says what it's painted and what moves it.
 */

import { CylinderGeometry, TorusGeometry, Vector3, type BufferGeometry } from 'three';
import { rounded, stalk, turned } from '../village/craft.ts';

/** what a piece is painted: the reel's body or trim (REELS), the knobs, the line, the drag lever */
export type ReelPaint = 'body' | 'trim' | 'knob' | 'line' | 'lever';
/**
 * what moves a piece: nothing (the frame), the spool (and the line on it, which also thins as it
 * goes out), the handle, the drag lever. All turn about the spool's axle.
 */
export type ReelMove = 'frame' | 'spool' | 'line' | 'crank' | 'lever';

export interface ReelPiece {
  g: BufferGeometry;
  paint: ReelPaint;
  move: ReelMove;
}

export interface ConventionalReel {
  pieces: ReelPiece[];
  /** the spool's axle: across the rod (x), at this height (y) and this far off it (z) */
  axle: { y: number; z: number };
  /** the line on a full spool, and the spool's core under it (radii) */
  lineR: number;
  coreR: number;
  /** where the handle's knob sits (x, and its y, z at rest) */
  knob: Vector3;
}

const place = (g: BufferGeometry, x: number, y: number, z: number): BufferGeometry => g.translate(x, y, z);

export function conventionalReel(level: number): ConventionalReel {
  const big = level >= 3;
  const W = big ? 0.08 : 0.06;
  const R = big ? 0.045 : 0.036;
  const pieces: ReelPiece[] = [];
  const add = (g: BufferGeometry, paint: ReelPaint, move: ReelMove = 'frame'): void => void pieces.push({ g, paint, move });

  // the foot along the rod, and the frame standing off it
  add(place(rounded(0.012, 0.08, 0.004, 0.0015), 0, 0, -0.004), 'trim');
  add(place(rounded(0.02, 0.06, 0.02, 0.004), 0, 0, -0.02), 'body');
  const cz = -0.02 - R;
  for (const sx of [-1, 1]) {
    add(place(new CylinderGeometry(R, R, 0.012, 24).rotateZ(Math.PI / 2), (sx * W) / 2, 0, cz), 'body');
    add(place(new TorusGeometry(R, 0.003, 5, 24).rotateY(Math.PI / 2), (sx * (W + 0.012)) / 2, 0, cz), 'trim');
  }
  // the spool: its core, the line wound on it
  const lineR = R * 0.78;
  const coreR = R * 0.42;
  add(place(new CylinderGeometry(coreR, coreR, W - 0.008, 16).rotateZ(Math.PI / 2), 0, 0, cz), 'body', 'spool');
  add(place(new CylinderGeometry(lineR, lineR, W - 0.01, 24, 1, true).rotateZ(Math.PI / 2), 0, 0, cz), 'line', 'line');
  // the pillars between the plates
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    add(place(new CylinderGeometry(0.003, 0.003, W, 6).rotateZ(Math.PI / 2), 0, Math.cos(a) * R * 0.92, cz + Math.sin(a) * R * 0.92), 'trim');
  }
  // the handle off the right plate: a power handle with a big knob
  const knob = new Vector3(W / 2 + 0.02, 0.05, cz - 0.03);
  add(stalk([new Vector3(W / 2 + 0.01, 0, cz), new Vector3(W / 2 + 0.02, 0.03, cz - 0.02), knob.clone()], 0.004, 0.004, 5, 4), 'trim', 'crank');
  add(place(turned([[0, 0], [0.011, 0.002], [0.013, 0.025], [0, 0.028]], 12).rotateZ(-Math.PI / 2), knob.x, knob.y, knob.z), 'knob', 'crank');
  if (big) {
    // the drag lever over the left plate
    add(stalk([new Vector3(-W / 2 - 0.01, 0, cz), new Vector3(-W / 2 - 0.012, 0.02, cz - 0.03), new Vector3(-W / 2 - 0.012, 0.03, cz - 0.05)], 0.004, 0.003, 5, 4), 'lever', 'lever');
  } else {
    // the cast control on the left plate
    add(place(turned([[0, 0], [0.012, 0], [0.012, 0.008], [0, 0.01]], 12).rotateZ(Math.PI / 2), -W / 2 - 0.01, 0, cz), 'knob');
  }
  return { pieces, axle: { y: 0, z: cz }, lineR, coreR, knob: knob.clone().add(new Vector3(0.014, 0, 0)) };
}
