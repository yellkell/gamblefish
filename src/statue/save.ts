/**
 * The journey's own corner of the save (GameState.journey): how many times you've ridden the
 * helter skelter all the way down, and whether the golden statue has been unveiled on the beach
 * (statue/journey.ts says when it's earned; statue/statue.ts raises it). Plain data, so Node
 * reads it as it is.
 */

export interface JourneySave {
  /** full descents of the helter skelter: all three tiers, to the bottom, no gate clipped */
  rides: number;
  /** the statue's up on the beach (it rose once, with its fanfare; now it just stands there) */
  unveiled: boolean;
}

export const freshJourney = (): JourneySave => ({ rides: 0, unveiled: false });

/** Read it back from a save (a save from before it has none: nothing ridden, nothing unveiled). */
export function readJourney(d: unknown): JourneySave {
  const j = (d as { journey?: Partial<JourneySave> } | null)?.journey;
  const out = freshJourney();
  if (!j || typeof j !== 'object') return out;
  out.rides = Math.max(0, Math.floor(Number(j.rides) || 0));
  out.unveiled = j.unveiled === true;
  return out;
}
