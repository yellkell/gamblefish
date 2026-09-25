/**
 * Money at the tables. Placing a chip moves money QUIETLY (the chip's own clack, no cash chime):
 * the wallet's chime is for buying, selling and winning. Winnings are paid loudly — the chime
 * pitched up, the wrist counters rolling.
 */

import type { GameState } from '../fishing/tidewater.ts';
import { walletQuiet } from '../ui/wallet.ts';

/** Take a stake off the wallet without the chime. False if you can't cover it. */
export function stake(state: GameState, amount: number): boolean {
  if (amount <= 0 || amount > state.money) return false;
  walletQuiet.next = true;
  state.money -= amount;
  state.save();
  state.emit();
  return true;
}

/** Hand stakes back (a cleared bet) without the chime. */
export function refund(state: GameState, amount: number): void {
  if (amount <= 0) return;
  walletQuiet.next = true;
  state.money += amount;
  state.save();
  state.emit();
}

/** Pay out a win: the chime rings (pitched up), the counters roll. */
export function payOut(state: GameState, amount: number): void {
  if (amount <= 0) return;
  state.money += amount;
  state.save();
  state.emit();
}
