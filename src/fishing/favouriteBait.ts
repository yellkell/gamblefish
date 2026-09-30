/**
 * THE BAIT EACH FISH LIKES: one of the bait shop's baits (fishing/gear.ts, the bait track's level)
 * for every species, from what it eats in the wild: the grazers go for goop, the reef's
 * crab-and-shrimp eaters for frozen shrimp, the hunters for live fish or squid, and the night
 * fish for the glow-lit rig. With its favourite on your hook (the one you USE at the bait shop)
 * a fish bites more often; the field guide says which it is, for the ones you haven't caught.
 * The great white has no favourite: it takes whatever's in deep water.
 * Plain data, so Node runs this file as it is (tools/fish-check.mjs).
 */

/** species → bait level (0 frozen shrimp, 1 goop, 2 live pilchards, 3 live squid, 4 glow-lit squid rig, 5 live bonito) */
export const FAVOURITE_BAIT: Record<string, number> = {
  silverside: 0,
  mullet: 1,
  needlefish: 2,
  sergeant: 0,
  grunt: 0,
  yellowtail: 2,
  chromis: 1,
  tang: 1,
  wrasse: 0,
  parrot: 1,
  angel: 1,
  jack: 2,
  barracuda: 2,
  grouper: 3,
  redSnapper: 3,
  tuna: 2,
  mahi: 3,
  tarpon: 2,
  bonefish: 0,
  trigger: 0,
  permit: 0,
  lookdown: 4,
  glasseye: 4,
  roosterfish: 2,
  opah: 3,
  sailfish: 3,
  swordfish: 4,
  marlin: 5,
};

/** how many times as often a fish bites with its favourite on the hook */
export const FAVOURITE_MUL = 2;

/** A species' weight in the pick for the bait on the hook (none given: no preference). */
export function baitOdds(id: string, onHook: number | undefined): number {
  return onHook !== undefined && FAVOURITE_BAIT[id] === onHook ? FAVOURITE_MUL : 1;
}
