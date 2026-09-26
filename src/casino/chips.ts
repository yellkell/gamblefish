/** The casino's clay chips: one colour per denomination, shared by every table. */

export const CHIP_COLOUR: Record<number, number> = { 1: 0xf2efe6, 5: 0xc23b2e, 10: 0x2f5ac2, 25: 0x2f8a4a, 100: 0x1a1a1e, 500: 0x7a3aa8 };

/** An amount as chips, biggest first (bottom of the stack), at most `max` of them. */
export function breakdown(amount: number, max = 20): number[] {
  const out: number[] = [];
  let left = Math.round(amount);
  for (const v of [500, 100, 25, 10, 5, 1])
    while (left >= v && out.length < max) {
      out.push(v);
      left -= v;
    }
  return out;
}
