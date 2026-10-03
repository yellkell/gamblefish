/**
 * The fish market tip (GameState.marketTip): the first time your backpack's half full, you're
 * told you can sell your fish at the fish market to empty it, and the fish market's marker and its
 * line of the key on the field guide's chart pulse (backpack/fieldGuide.ts) until you've made a
 * sale (fishing/tidewater.ts sell) or gone there off the chart (backpack/BackpackSystem.ts).
 * Plain data, so Node reads it as it is.
 *
 *   waiting    not half full yet
 *   beckoning  told: the chart's fish market pulses
 *   done       sold, or gone to the market off the chart: never again
 */

export type MarketTip = 'waiting' | 'beckoning' | 'done';

/** how full the backpack (its cells) is when you're told */
export const TIP_FILL = 0.5;

/**
 * Read it back from a save. A save from before the tip has none: if it's earned money or bought
 * gear you've been to the market already, so it's done; a new-ish one still gets told.
 */
export function readMarketTip(d: unknown): MarketTip {
  const v = (d as { marketTip?: unknown } | null)?.marketTip;
  if (v === 'waiting' || v === 'beckoning' || v === 'done') return v;
  const s = d as { money?: unknown; upgrades?: Record<string, unknown> } | null;
  const earned = Number(s?.money) > 0 || Object.values(s?.upgrades ?? {}).some((x) => Number(x) > 0);
  return earned ? 'done' : 'waiting';
}
