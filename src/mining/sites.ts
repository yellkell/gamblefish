/**
 * WHERE THE GEM ROCKS STAND, as plain data (the bake clears the plants and Tidewater's own rocks
 * round each, the runtime builds them there, tools/mining-check.mjs proves each is dry, standable
 * and reachable on foot).
 *
 * Sixteen big rocks out in the wilds, four on each kind of ground, well away from the village:
 * a couple of each close enough for an afternoon, the rest a proper walk. None is on the chart:
 * you find them by going to look (the glowing veins give them away, even at night).
 *
 *   THE SHORE        down on the far beaches, a stone's throw from the sea
 *   THE FOREST       in among the trees, 10–45 m up
 *   THE HIGH GROUND  on the shoulders of the hills, 55–90 m up
 *   THE PEAKS        up top, 120 m and more
 */

import type { Ground } from './gems.ts';

export interface RockSite {
  id: string;
  x: number;
  z: number;
  ground: Ground;
  /** its turn about the vertical, and how big it is (1 ≈ 1.9 m across) */
  yaw: number;
  size: number;
}

export const ROCK_SITES: RockSite[] = [
  // the shore
  { id: 'shore-west', x: -110, z: -76, ground: 'shore', yaw: 0.4, size: 1 },
  { id: 'shore-east', x: 172, z: -70, ground: 'shore', yaw: 2.1, size: 0.95 },
  { id: 'shore-arm', x: 196, z: 50, ground: 'shore', yaw: 4.0, size: 1.05 },
  { id: 'shore-cove', x: -224, z: 152, ground: 'shore', yaw: 5.3, size: 1 },
  // the forest
  { id: 'forest-back', x: -98, z: -202, ground: 'forest', yaw: 1.2, size: 1.05 },
  { id: 'forest-west', x: -206, z: -112, ground: 'forest', yaw: 3.3, size: 1 },
  { id: 'forest-east', x: 280, z: -58, ground: 'forest', yaw: 0.9, size: 1.1 },
  { id: 'forest-north', x: 76, z: -694, ground: 'forest', yaw: 2.7, size: 1 },
  // the high ground
  { id: 'high-west', x: -188, z: -268, ground: 'high', yaw: 0.2, size: 1.1 },
  { id: 'high-east', x: 268, z: -208, ground: 'high', yaw: 4.4, size: 1.05 },
  { id: 'high-north', x: 154, z: -628, ground: 'high', yaw: 1.7, size: 1.1 },
  { id: 'high-far', x: -464, z: -364, ground: 'high', yaw: 3.9, size: 1 },
  // the peaks
  { id: 'peak-south', x: 226, z: -406, ground: 'peak', yaw: 2.3, size: 1.15 },
  { id: 'peak-north', x: 208, z: -568, ground: 'peak', yaw: 0.7, size: 1.1 },
  { id: 'peak-east', x: 298, z: -400, ground: 'peak', yaw: 5.0, size: 1.05 },
  { id: 'peak-west', x: -368, z: -430, ground: 'peak', yaw: 1.4, size: 1.1 },
];

/** a rock's footprint radius at size 1 (m), and its height */
export const ROCK_R = 0.95;
export const ROCK_H = 1.35;
/** the bake keeps the plants this far off each rock (trees and palms further, crowns and all) */
export const ROCK_CLEAR = 3.5;
export const ROCK_CLEAR_TREES = 6;
