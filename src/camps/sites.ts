/**
 * THE FIRE DANCERS' CAMPS, as plain data (the bake levels and clears their plots, the runtime
 * builds them there, tools/camps-check.mjs proves they're hidden): FIRE FIGHT 2's beach party,
 * gone off into the wilds of the island in eight little groups, each round its own fire with a
 * chest. Find all eight and a ninth sets up on the main beach (BEACH_CAMP).
 *
 * None of them is on the chart and none can be seen from the start: every one is tucked behind a
 * ridge or down a hollow the pier, the boardwalk and the beach can't see into (the check casts
 * sight lines from there to the tops of the flames). You find them by going to look, or by the
 * drums, which carry a little further than the firelight.
 */

export interface CampSite {
  id: string;
  name: string;
  /** the fire (world x, z) */
  x: number;
  z: number;
  /** which way from the fire the chest stands (radians, from +x toward +z) */
  chestAt: number;
  /** how many dance round the fire */
  dancers: number;
  /** what the chest tends to hold: habitat weights for the fish, and how many logs */
  sea: Partial<Record<'shallows' | 'reef' | 'pier' | 'bay' | 'deep', number>>;
  logs: [number, number];
  /** the best tier a fish in this chest can be (0 Common .. 3 Legendary) */
  bestTier: number;
  /** the beach party: out in the open, only once every hidden camp's been found; its chest
   *  fills with a couple of nice fish and a stack of logs every day */
  beach?: boolean;
}

/** the levelled plot round each fire (m), and how far its edge blends back into the hill */
export const CAMP_PLOT = 7.5;
export const CAMP_BLEND = 9;
/** how far below the plot's mean the hollow is dug (m): a little more cover */
export const CAMP_SINK = 0.8;
/** the chest's distance from the fire (m) */
export const CHEST_R = 4.9;

export const CAMPS: CampSite[] = [
  // west, behind the headland: the only hollow on that side the bay can't see into
  { id: 'west', name: 'Lantern Hollow', x: -240, z: -82, chestAt: 2.6, dancers: 7, sea: { reef: 1, shallows: 0.6 }, logs: [8, 14], bestTier: 1 },
  // east, over the ridge behind the east woodlot: a valley running down to the far shore
  { id: 'valley', name: 'Ember Valley', x: 352, z: -162, chestAt: 3.6, dancers: 9, sea: { deep: 1, bay: 0.5 }, logs: [10, 18], bestTier: 2 },
  // the island's far east shore, round the corner from the bay
  { id: 'shore', name: 'Driftwood Shore', x: 352, z: 14, chestAt: 4.4, dancers: 8, sea: { bay: 1, pier: 0.6, shallows: 0.4 }, logs: [12, 20], bestTier: 1 },
  // out on the bay's east arm, on the far side of its crest
  { id: 'point', name: 'Firefly Point', x: 272, z: 166, chestAt: 1.2, dancers: 8, sea: { deep: 0.8, reef: 0.6, bay: 0.4 }, logs: [8, 16], bestTier: 2 },
  // round the west headland, above the sea on the island's south-west shore
  { id: 'cove', name: 'Moonlit Cove', x: -240, z: 120, chestAt: 5.2, dancers: 7, sea: { shallows: 1, pier: 0.5, bay: 0.3 }, logs: [8, 14], bestTier: 1 },
  // the far west, deep in the trees behind the western hills
  { id: 'glade', name: 'Tiki Glade', x: -370, z: -170, chestAt: 0.4, dancers: 8, sea: { reef: 1, bay: 0.6 }, logs: [12, 20], bestTier: 1 },
  // high in the north-west hills, 130 m up, with the whole back of the island below
  { id: 'ridge', name: 'Skyfire Ridge', x: -330, z: -460, chestAt: 1.9, dancers: 6, sea: { deep: 1, reef: 0.3 }, logs: [6, 12], bestTier: 2 },
  // the far north-east, a basin on the island's back side
  { id: 'basin', name: 'Starfall Basin', x: 360, z: -540, chestAt: 3.1, dancers: 9, sea: { deep: 0.8, bay: 0.8 }, logs: [14, 22], bestTier: 2 },
];

/** the ninth: on the main beach west of the timber yard, once all eight above are found */
export const BEACH_CAMP: CampSite = { id: 'beach', name: 'The Beach Party', x: -16, z: -64, chestAt: 6.08, dancers: 10, sea: { deep: 1, reef: 0.6 }, logs: [8, 14], bestTier: 2, beach: true };

/** every camp, the beach party last */
export const ALL_CAMPS: CampSite[] = [...CAMPS, BEACH_CAMP];

/** how far below the plot's mean each camp's hollow is dug (the beach party's sand is just levelled) */
export function campSink(c: CampSite): number {
  return c.beach ? 0 : CAMP_SINK;
}

/** where a camp's chest stands (x, z) */
export function chestSpot(c: CampSite): [number, number] {
  return [c.x + Math.cos(c.chestAt) * CHEST_R, c.z + Math.sin(c.chestAt) * CHEST_R];
}
