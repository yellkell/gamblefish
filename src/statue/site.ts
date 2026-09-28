/**
 * Where the golden statue stands, as plain data: the world bake (tools/bake-world.mjs) keeps the
 * plants, the grass and Tidewater's rocks off its plot, and the runtime (statue/statue.ts) raises
 * it there once the journey's done (statue/journey.ts).
 *
 *   THE PLOT   on the open sand just west of the pier foot, between the timber yard and the pier,
 *              where you come down off the boardwalk: its plaque faces you as you come, the
 *              sailfish leaping toward the sea.
 */

export const STATUE = {
  /** the plinth's centre (world x, z) */
  x: 42,
  z: -56.5,
  /** its turn about y: the plaque (the statue's +z) faces up the beach toward the pier foot */
  yaw: 2.57,
  /** the plot kept clear round it (m) */
  radius: 5.5,
  /** how big it's cast: the statue is modelled at 1, stood up at this (a 5.5 m fish, 7.7 m to the tip of its sail) */
  scale: 1.25,
  /** the plinth's first step (x across the plaque, z front to back), as modelled */
  step: [3.6, 3.0] as [number, number],
  /** the plinth's top, as modelled (above the highest sand under it) */
  top: 2.18,
};

/** where you stand to read the plaque (and where the chart takes you): a few paces in front of it */
export const STATUE_STAND: [number, number] = [STATUE.x + Math.sin(STATUE.yaw) * 6.2, STATUE.z + Math.cos(STATUE.yaw) * 6.2];
