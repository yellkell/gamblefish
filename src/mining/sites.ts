/**
 * WHERE THE GEM ROCKS STAND, as plain data (the bake clears the plants and Tidewater's own rocks
 * round each, the runtime builds them there, tools/mining-check.mjs proves each is dry, standable
 * and reachable on foot).
 *
 * Forty big rocks out in the wilds, at least eight on each kind of ground, well away from the
 * village: a couple of each close enough for an afternoon, the rest a proper walk (and a good few
 * in the big forest behind the village, off to the left as you look up from the pier, and out on
 * the far right, the island's east side), and a handful more on the way from one dancers' camp to
 * the next, so there's something to break on the walk between them. None is on the
 * chart: you find them by going to look (the glowing veins give them away, even at night). Each
 * breaks once, for good (mining/MiningSystem.ts).
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
  { id: 'shore-headland', x: -362, z: -15, ground: 'shore', yaw: 2.6, size: 1.05 },
  { id: 'shore-far-east', x: 380, z: 116, ground: 'shore', yaw: 0.8, size: 1 },
  { id: 'shore-east-cape', x: 556, z: -500, ground: 'shore', yaw: 3.5, size: 1.05 },
  { id: 'shore-point', x: 250, z: 190, ground: 'shore', yaw: 1.3, size: 0.95 },
  // the forest
  { id: 'forest-back', x: -98, z: -202, ground: 'forest', yaw: 1.2, size: 1.05 },
  { id: 'forest-west', x: -206, z: -112, ground: 'forest', yaw: 3.3, size: 1 },
  { id: 'forest-east', x: 280, z: -58, ground: 'forest', yaw: 0.9, size: 1.1 },
  { id: 'forest-north', x: 76, z: -694, ground: 'forest', yaw: 2.7, size: 1 },
  { id: 'forest-glen', x: -326, z: -206, ground: 'forest', yaw: 4.6, size: 1.05 },
  { id: 'forest-ridge', x: -219, z: -192, ground: 'forest', yaw: 1.9, size: 1 },
  { id: 'forest-east-coast', x: 520, z: -302, ground: 'forest', yaw: 5.6, size: 1.05 },
  { id: 'forest-east-dell', x: 382, z: -290, ground: 'forest', yaw: 2.2, size: 1 },
  // the high ground
  { id: 'high-west', x: -188, z: -268, ground: 'high', yaw: 0.2, size: 1.1 },
  { id: 'high-east', x: 268, z: -208, ground: 'high', yaw: 4.4, size: 1.05 },
  { id: 'high-north', x: 154, z: -628, ground: 'high', yaw: 1.7, size: 1.1 },
  { id: 'high-far', x: -464, z: -364, ground: 'high', yaw: 3.9, size: 1 },
  { id: 'high-glade', x: -340, z: -272, ground: 'high', yaw: 0.5, size: 1.05 },
  { id: 'high-behind', x: -250, z: -356, ground: 'high', yaw: 3.0, size: 1.1 },
  { id: 'high-east-ridge', x: 412, z: -578, ground: 'high', yaw: 1.1, size: 1.05 },
  { id: 'high-north-east', x: 292, z: -680, ground: 'high', yaw: 4.8, size: 1.1 },
  // the peaks
  { id: 'peak-south', x: 226, z: -406, ground: 'peak', yaw: 2.3, size: 1.15 },
  { id: 'peak-north', x: 208, z: -568, ground: 'peak', yaw: 0.7, size: 1.1 },
  { id: 'peak-east', x: 298, z: -400, ground: 'peak', yaw: 5.0, size: 1.05 },
  { id: 'peak-west', x: -368, z: -430, ground: 'peak', yaw: 1.4, size: 1.1 },
  { id: 'peak-behind', x: -150, z: -478, ground: 'peak', yaw: 4.2, size: 1.1 },
  { id: 'peak-crown', x: 25, z: -375, ground: 'peak', yaw: 2.0, size: 1.15 },
  { id: 'peak-east-shoulder', x: 268, z: -494, ground: 'peak', yaw: 3.7, size: 1.1 },
  { id: 'peak-east-spur', x: 256, z: -350, ground: 'peak', yaw: 0.3, size: 1.05 },
  // on the way between the dancers' camps (camps/sites.ts), roughly halfway along each walk
  { id: 'between-lantern-fernlight', x: -294, z: -145, ground: 'forest', yaw: 2.4, size: 1 },
  { id: 'between-ember-tidecrest', x: 393, z: -231, ground: 'forest', yaw: 0.6, size: 1.05 },
  { id: 'between-driftwood-firefly', x: 308, z: 88, ground: 'forest', yaw: 4.1, size: 1 },
  { id: 'between-canopy-skyfire', x: -402, z: -357, ground: 'high', yaw: 5.2, size: 1.05 },
  { id: 'between-starfall-sunrise', x: 417, z: -477, ground: 'high', yaw: 1.5, size: 1.1 },
  { id: 'between-fernlight-skyfire', x: -313, z: -377, ground: 'peak', yaw: 3.2, size: 1.05 },
  { id: 'between-skyfire-starfall', x: 52, z: -480, ground: 'peak', yaw: 0.9, size: 1.1 },
  { id: 'between-lantern-moonlit', x: -186, z: -11, ground: 'shore', yaw: 2.8, size: 1 },
];

/** a rock's footprint radius at size 1 (m), and its height */
export const ROCK_R = 0.95;
export const ROCK_H = 1.35;
/** the bake keeps the plants this far off each rock (trees and palms further, crowns and all) */
export const ROCK_CLEAR = 3.5;
export const ROCK_CLEAR_TREES = 6;
