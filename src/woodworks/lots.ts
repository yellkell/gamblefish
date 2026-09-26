/**
 * Where the woodworks stand on the island, as plain data (the chart in the field guide marks
 * them too: backpack/chart.ts).
 *
 *   TIMBER YARD   the stall on the beach west of the pier foot (its counter's front faces +x),
 *                 with the west woodlot's six almond trees on the sand behind it.
 *   EAST WOODLOT  six more on the far side of the village, past the boatyard: just the trees, a
 *                 log pile and a chopping block (no stall: the wood is yours for the chopping).
 */

export const YARD: [number, number] = [26, -61];

export const WEST_TREES: [number, number][] = [
  [4, -61],
  [9.5, -57],
  [14, -63],
  [6, -67],
  [12, -69],
  [18, -56.5],
];

/** the east woodlot's log pile and chopping block (x, z), and its trees */
export const EAST_PILE: [number, number] = [111.5, -80.5];
export const EAST_TREES: [number, number][] = [
  [116.5, -84.5],
  [122, -81],
  [124.5, -88.5],
  [118, -91.5],
  [112, -88],
  [128.5, -84],
];
