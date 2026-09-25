/**
 * Blackjack's rules as pure code, so tools/casino-check.mjs can play millions of hands with the
 * table's own logic.
 *
 *   six decks, shuffled fairly (crypto Fisher–Yates), reshuffled once the cut card (75%) is out
 *   dealer peeks for blackjack under an ace or a ten; stands on all 17s (soft 17 too)
 *   blackjack pays 3 to 2; double on any first two cards; split a pair once
 *   split aces take one card each, and 21 on a split hand is 21, not blackjack
 *   no insurance, no surrender
 *
 * Played by basic strategy that comes to a house edge of about 0.4%.
 */

export interface Card {
  rank: number; // 1 = ace … 11 J, 12 Q, 13 K
  suit: number; // 0 ♠ 1 ♥ 2 ♦ 3 ♣
}

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUITS = ['♠', '♥', '♦', '♣'];

export const cardValue = (c: Card): number => (c.rank === 1 ? 11 : Math.min(10, c.rank));

/** A hand's best total, and whether an ace is still counting 11. */
export function total(cards: Card[]): { total: number; soft: boolean } {
  let t = 0;
  let aces = 0;
  for (const c of cards) {
    t += cardValue(c);
    if (c.rank === 1) aces++;
  }
  while (t > 21 && aces > 0) {
    t -= 10;
    aces--;
  }
  return { total: t, soft: aces > 0 };
}

export const isNatural = (cards: Card[]): boolean => cards.length === 2 && total(cards).total === 21;

export class Shoe {
  cards: Card[] = [];
  readonly decks: number;
  private readonly rng: () => number;
  private cut = 0;

  constructor(decks = 6, rng: () => number = fairRandom) {
    this.decks = decks;
    this.rng = rng;
    this.shuffle();
  }

  shuffle(): void {
    this.cards = [];
    for (let d = 0; d < this.decks; d++) for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) this.cards.push({ rank: r, suit: s });
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
    this.cut = Math.floor(this.cards.length * 0.25);
  }

  /** Past the cut card: shuffle before the next round. */
  get due(): boolean {
    return this.cards.length <= this.cut;
  }

  draw(): Card {
    if (!this.cards.length) this.shuffle();
    return this.cards.pop()!;
  }
}

export interface Hand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  split: boolean; // came from a split (no blackjack; split aces take one card)
  done: boolean;
}

export type Action = 'hit' | 'stand' | 'double' | 'split';
export type Outcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';

/**
 * One round at the table. Money is the caller's business: `start` is told the bet, and each
 * double or split says how much more stake it needs (`extra`), which the caller takes first.
 */
export class Round {
  hands: Hand[] = [];
  dealer: Card[] = [];
  active = 0;
  phase: 'player' | 'dealer' | 'done' = 'player';
  /** the cards in the order they came out of the shoe, with where they went (for animation) */
  readonly dealt: { card: Card; to: 'dealer' | number; faceDown: boolean }[] = [];

  private readonly shoe: Shoe;

  constructor(shoe: Shoe) {
    this.shoe = shoe;
  }

  private give(to: 'dealer' | number, faceDown = false): Card {
    const c = this.shoe.draw();
    if (to === 'dealer') this.dealer.push(c);
    else this.hands[to].cards.push(c);
    this.dealt.push({ card: c, to, faceDown });
    return c;
  }

  start(bet: number): void {
    this.hands = [{ cards: [], bet, doubled: false, split: false, done: false }];
    this.give(0);
    this.give('dealer');
    this.give(0);
    this.give('dealer', true);
    // the dealer peeks under an ace or a ten; a natural on either side ends it now
    const peek = cardValue(this.dealer[0]) >= 10;
    if (isNatural(this.hands[0].cards) || (peek && isNatural(this.dealer))) {
      this.hands[0].done = true;
      this.phase = 'done';
    }
  }

  get hand(): Hand {
    return this.hands[this.active];
  }

  /** What the active hand may do now. */
  can(a: Action): boolean {
    if (this.phase !== 'player') return false;
    const h = this.hand;
    if (a === 'hit' || a === 'stand') return true;
    if (a === 'double') return h.cards.length === 2 && !(h.split && h.cards[0].rank === 1);
    return this.hands.length === 1 && h.cards.length === 2 && cardValue(h.cards[0]) === cardValue(h.cards[1]);
  }

  /** The stake an action adds (double and split match the hand's bet). */
  extra(a: Action): number {
    return a === 'double' || a === 'split' ? this.hand.bet : 0;
  }

  act(a: Action): void {
    if (!this.can(a)) return;
    const h = this.hand;
    switch (a) {
      case 'hit':
        this.give(this.active);
        if (total(h.cards).total >= 21) this.next();
        break;
      case 'stand':
        this.next();
        break;
      case 'double':
        h.bet *= 2;
        h.doubled = true;
        this.give(this.active);
        this.next();
        break;
      case 'split': {
        const second: Hand = { cards: [h.cards.pop()!], bet: h.bet, doubled: false, split: true, done: false };
        h.split = true;
        this.hands.push(second);
        this.give(0);
        this.give(1);
        // split aces: one card each and that's all
        if (h.cards[0].rank === 1) {
          h.done = second.done = true;
          this.active = 1;
          this.next();
        } else if (total(h.cards).total === 21) this.next();
        break;
      }
    }
  }

  private next(): void {
    this.hand.done = true;
    while (this.active < this.hands.length && this.hands[this.active].done) this.active++;
    if (this.active < this.hands.length) {
      if (total(this.hand.cards).total === 21) this.next();
      return;
    }
    this.active = this.hands.length - 1;
    this.phase = 'dealer';
    this.dealerPlays();
  }

  /** The dealer turns the hole card and draws to 17 (unless every hand is already bust). */
  private dealerPlays(): void {
    const live = this.hands.some((h) => total(h.cards).total <= 21);
    if (live) while (total(this.dealer).total < 17) this.give('dealer');
    this.phase = 'done';
  }

  /** Each hand's outcome and what it gives back (stake included). */
  settle(): { outcome: Outcome; returned: number }[] {
    const d = total(this.dealer).total;
    const dealerBJ = isNatural(this.dealer);
    return this.hands.map((h) => {
      const p = total(h.cards).total;
      const bj = !h.split && isNatural(h.cards);
      if (p > 21) return { outcome: 'bust', returned: 0 };
      if (bj && !dealerBJ) return { outcome: 'blackjack', returned: h.bet + Math.ceil((h.bet * 3) / 2) }; // odd chips round up, in your favour
      if (dealerBJ) return bj ? { outcome: 'push', returned: h.bet } : { outcome: 'lose', returned: 0 };
      if (d > 21 || p > d) return { outcome: 'win', returned: h.bet * 2 };
      if (p === d) return { outcome: 'push', returned: h.bet };
      return { outcome: 'lose', returned: 0 };
    });
  }
}

/**
 * Basic strategy for these rules (6 decks, S17, DAS, no surrender) — the table's hint button
 * and the check tool's player.
 */
export function basic(round: Round): Action {
  const h = round.hand;
  const up = cardValue(round.dealer[0]);
  const { total: t, soft } = total(h.cards);
  const can = (a: Action): boolean => round.can(a);
  if (can('split')) {
    const v = cardValue(h.cards[0]);
    const split =
      v === 11 || v === 8 || (v === 9 && ![7, 10, 11].includes(up)) || ((v === 2 || v === 3 || v === 7) && up <= 7) || (v === 6 && up <= 6) || (v === 4 && (up === 5 || up === 6));
    if (split) return 'split';
  }
  if (soft) {
    if (t >= 19) return t === 19 && up === 6 && can('double') ? 'double' : 'stand';
    if (t === 18) {
      if (up >= 3 && up <= 6 && can('double')) return 'double';
      return up >= 9 ? 'hit' : 'stand';
    }
    const dbl = (t === 17 && up >= 3 && up <= 6) || ((t === 15 || t === 16) && up >= 4 && up <= 6) || ((t === 13 || t === 14) && up >= 5 && up <= 6);
    return dbl && can('double') ? 'double' : 'hit';
  }
  if (t >= 17) return 'stand';
  if (t >= 13) return up <= 6 ? 'stand' : 'hit';
  if (t === 12) return up >= 4 && up <= 6 ? 'stand' : 'hit';
  if (t === 11) return can('double') ? 'double' : 'hit';
  if (t === 10) return up <= 9 && can('double') ? 'double' : 'hit';
  if (t === 9) return up >= 3 && up <= 6 && can('double') ? 'double' : 'hit';
  return 'hit';
}

function fairRandom(): number {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) {
    const a = new Uint32Array(1);
    c.getRandomValues(a);
    return a[0] / 4294967296;
  }
  return Math.random();
}
