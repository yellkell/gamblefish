/**
 * The helter skelter's tuning: HELTER SKELTER's (github.com/yellkell/helter, src/constants.ts),
 * carried over whole. One gigantic seaside helter skelter: you start on the balcony at the top of
 * a 300 m striped tower and ride the slide that spirals round it in three tiers (300 m → 200 m →
 * 100 m → the ground), stopping on a landing bay between tiers to catch your breath before the
 * next drop launches.
 *
 * The sliding is DOWN's: eased launch, constant speed along the slide, lean left / right between
 * the gates, a hard stop with a shockwave at every landing. Heights here are over the plinth's
 * foot (the tower stands on its plot: skelter/site.ts).
 */

/** Slide heights: the top of each tier, then the ground landing. */
export const TIER_HEIGHTS = [300, 200, 100];
/** the top of the low plinth the tower stands on */
export const PLINTH_TOP = 0.6;
/** The exit bay: the slide's last stretch lies on the plinth, a board's thickness over it. (Laid
 * in the plinth's top face, the two z-fought: the track flickered where it met the floor.) */
export const GROUND_LANDING_Y = PLINTH_TOP + 0.05;
export const TOTAL_TIERS = TIER_HEIGHTS.length;

/** Total vertical descent, balcony to exit (the end board's stat). */
export const TOTAL_DESCENT = Math.round(TIER_HEIGHTS[0] - GROUND_LANDING_Y);

/** The helix the rig rides: centreline radius and how steeply it drops. */
export const SLIDE_RADIUS = 18; // metres from the tower axis to the middle of the slide
export const SLIDE_PITCH = 26 * (Math.PI / 180); // slope along the slide's own arc
export const SLIDE_SPEED = 16; // m/s along the slide (DOWN ran 20 — the spiral wants a touch less)
export const SLIDE_ACCEL_TIME = 1.2; // ease-in seconds for comfort

/** Flat run-up at the start of every tier, and a flat arrival strip at its end. */
export const BAY_RUN = 7;
export const BAY_ARRIVAL = 2.5;

/** Seconds standing on a landing before the next tier launches (3-2-1). */
export const LANDING_HOLD = 3.4;

/** The slide trough: bed width and lip heights. */
export const TRACK_WIDTH = 2.4;
export const OUTER_LIP = 0.95;
export const INNER_LIP = 0.42;

/** The tower the slide wraps. Its wall sits just inside the slide's inner edge. */
export const TOWER_RADIUS = SLIDE_RADIUS - TRACK_WIDTH / 2 - 0.4;
export const TOWER_TOP = TIER_HEIGHTS[0] + 16; // wall continues above the balcony
export const ROOF_HEIGHT = 34;
/** the plinth under it all */
export const PLINTH_RADIUS = SLIDE_RADIUS + 5.6;

/**
 * Gates ("barriers"): lane offsets across the 3-lane slide. Lanes are spread to ±0.5 m so the
 * boards still leave a clear gap to lean into.
 */
export const LANE_X = [-0.5, 0, 0.5];
export const BARRIER_SIZE = { w: 0.42, h: 2.6, d: 0.22 };
export const BARRIER_SPACING = [16, 13, 11]; // per tier — tightens on the way down

export const HEAD_RADIUS = 0.12;

/** Seaside palette. */
export const PAINT = {
  red: 0xe8322e,
  darkRed: 0xa5201d,
  cream: 0xfff4e0,
  gold: 0xf4c542,
  sea: 0x1e6f9e,
  ink: 0x1a1614,
  mint: 0x7fd1b9,
  sky: 0x5fb3e6,
};

export const GATE_COLORS = [PAINT.red, PAINT.sea, PAINT.gold, PAINT.mint];

/** what a coin and a gem are worth in the wallet */
export const COIN_VALUE = 1;
export const GEM_VALUE = 5;
