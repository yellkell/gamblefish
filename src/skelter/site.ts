/**
 * Where the helter skelter goes up, as plain data: the world bake (tools/bake-world.mjs) levels
 * its plot and clears the scrub off it, and the runtime (skelter/SkelterSystem.ts) raises it there.
 *
 *   THE PLOT   at the back left of the village as the chart draws it (north up): past the
 *              taxidermist, on the flat ground under the hills. 500 logs raise the tower once the
 *              deep walk is finished.
 */

export const SKELTER = {
  /** the tower's axis (world x, z) */
  x: -40,
  z: -172,
  /** the levelled plot's radius (the plinth is 23.6 m; the build crate stands at its edge) */
  radius: 28,
  /** logs to raise it */
  cost: 500,
};

/** which way the village is from the plot (the ride lets out facing it, and the crate stands there) */
export const TOWARD_VILLAGE: [number, number] = (() => {
  const dx = 40 - SKELTER.x;
  const dz = -118 - SKELTER.z;
  const l = Math.hypot(dx, dz);
  return [dx / l, dz / l];
})();
