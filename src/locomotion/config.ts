/**
 * Teleport locomotion tuning — FIRE FIGHT 2's club system, carried over
 * whole. Every number here is ff2's (`src/rave/club/config.ts` TELEPORT,
 * `src/rave/config.ts` OCTAGON_VERTICES / PALETTE.danger, the club's
 * DECOR.brass) so the island moves exactly like the club floor does:
 * the same engage/release points on the stick, the same arc throw and
 * reach, the same 35° snap and the same half-metre shuffle back.
 *
 * The only numbers that are NEW are in `GROUND` below — the club was built
 * from flat floor rectangles, the island also has a heightfield and a sea,
 * and those need their own rules for where a landing is allowed.
 */

import type { Vector2Tuple } from 'three';

/* ── teleport-only locomotion (the FIRE FIGHT club's system, carried over
 *    whole: arc + octagon marker + thumbstick-rolled facing + snap turn) ── */
export const TELEPORT = {
  engage: 0.5, // thumbstick magnitude that starts aiming
  release: 0.35, // …and below this on the way back, you go
  launchSpeed: 7.5, // m/s along the controller ray
  gravity: 9.8,
  arcPoints: 48,
  arcStep: 0.035, // seconds of simulated flight per arc sample
  snapAngle: (35 * Math.PI) / 180,
  snapEngage: 0.7,
  snapReset: 0.3,
  /** BACK on the stick is a short shuffle away from whatever you're facing,
   *  not a teleport arc. Aiming an arc behind your own feet meant turning
   *  round, throwing it, and turning back — three moves for the one thing
   *  you actually want at a bar, which is to be half a metre further off it.
   *  Probed at decreasing lengths so you can back right up against a wall
   *  instead of the flick doing nothing. */
  stepBack: [0.5, 0.34, 0.2],
} as const;

/** The marker + arc colours. The club's galvanised steel (DECOR.brass) went
 *  grey against the island's sand and sea, so a good landing glows sea-glass
 *  (the landing page's teal); the club's hazard red still marks a refusal. */
export const TELEPORT_COLOURS = {
  ok: 0x5ee8d8,
  refused: 0xe8352a,
} as const;

/* ── ff2's platform octagon (the marker is this silhouette at 0.42×) ── */
const OCTAGON_HALF_WIDTH = 0.86;
const OCTAGON_HALF_DEPTH = 0.75;
const EDGE_HALF = 0.375;
const CHAMFER = 0.375;

export const OCTAGON_VERTICES: Vector2Tuple[] = [
  [-EDGE_HALF, -OCTAGON_HALF_DEPTH],
  [EDGE_HALF, -OCTAGON_HALF_DEPTH],
  [OCTAGON_HALF_WIDTH, -CHAMFER],
  [OCTAGON_HALF_WIDTH, CHAMFER],
  [EDGE_HALF, OCTAGON_HALF_DEPTH],
  [-EDGE_HALF, OCTAGON_HALF_DEPTH],
  [-OCTAGON_HALF_WIDTH, CHAMFER],
  [-OCTAGON_HALF_WIDTH, -CHAMFER],
];

/**
 * Where the island lets you land. The club only ever had flat floor
 * rectangles (every one hand-placed, so "standable" was a list); the island
 * adds natural ground and open water, which need the rules a list got for
 * free.
 */
export const GROUND = {
  /** Sea level. The arc treats the water surface as solid — you see it land
   *  there — but a landing on water is always refused. */
  waterY: 0,
  /** Sand this close to the tide line is swash: waves run over it. Refused. */
  dryMargin: 0.25,
  /** Steepest natural ground you may land on (cos of the angle from up). */
  minNormalY: Math.cos((38 * Math.PI) / 180),
  /** Stepping back on natural ground: how much the terrain may rise or fall
   *  under a half-metre shuffle and still count as "your level". Decks keep
   *  the club's own 5 cm (see TeleportSystem.stepBack). */
  groundLevelTolerance: 0.35,
  /** An obstacle whose underside is this far above the hop's floor is
   *  overhead (an arch beam, an awning) and doesn't block the hop. */
  headroom: 2.0,
} as const;
