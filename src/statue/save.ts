/**
 * The journey's own corner of the save (GameState.journey): how many times you've ridden the
 * helter skelter all the way down, and whether the golden statue has been unveiled on the beach
 * (statue/journey.ts says when it's earned; statue/statue.ts raises it), and the game clock: how
 * long you've played, and what it read the moment the statue went up (the field guide's title
 * page shows it then, for the speedrunners). Plain data, so Node reads it as it is.
 */

export interface JourneySave {
  /** full descents of the helter skelter: all three tiers, to the bottom, no gate clipped */
  rides: number;
  /** the statue's up on the beach (it rose once, with its fanfare; now it just stands there) */
  unveiled: boolean;
  /** seconds played on this save, all told (in the headset: not the menus, not the page asleep) */
  played: number;
  /** what the clock read the moment the last leg was done (null: not yet, or done before the clock) */
  time: number | null;
}

export const freshJourney = (): JourneySave => ({ rides: 0, unveiled: false, played: 0, time: null });

/** Read it back from a save (a save from before it has none: nothing ridden, nothing unveiled). */
export function readJourney(d: unknown): JourneySave {
  const j = (d as { journey?: Partial<JourneySave> } | null)?.journey;
  const out = freshJourney();
  if (!j || typeof j !== 'object') return out;
  out.rides = Math.max(0, Math.floor(Number(j.rides) || 0));
  out.unveiled = j.unveiled === true;
  out.played = Math.max(0, Number(j.played) || 0);
  out.time = Number.isFinite(j.time) && (j.time as number) >= 0 ? (j.time as number) : null;
  return out;
}

/** The clock as a speedrunner reads it: 1:02:03.4 (or 2:03.4 under the hour). */
export function clock(s: number): string {
  const t = Math.floor(Math.max(0, s) * 10);
  const h = Math.floor(t / 36000);
  const m = Math.floor(t / 600) % 60;
  const sec = Math.floor(t / 10) % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return `${h ? `${h}:${two(m)}` : m}:${two(sec)}.${t % 10}`;
}
