#!/usr/bin/env node
/**
 * THE CASINO — headless. Drives the games' rule files (Node strips the types): every bet spot's
 * winning numbers, the payouts, settlement, and that the wheel is fair (each pocket about 1/37,
 * house edge 1/37 on every bet).
 *
 *   node tools/casino-check.mjs
 */

import { WHEEL, REDS, colourOf, wins, odds, settle, spin, fairRandom } from '../src/casino/roulette.ts';
import { REELS, STOPS, SYMBOLS, THREE, line, pays, pull } from '../src/casino/slots.ts';
import { Shoe, Round, basic, total, isNatural } from '../src/casino/blackjack.ts';

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? ` — ${detail}` : ''}`);
};
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const winning = (spot) => range(0, 36).filter((n) => wins(spot, n));

console.log('\nroulette: the wheel');
check('37 pockets, each number once', WHEEL.length === 37 && new Set(WHEEL).size === 37 && WHEEL.every((n) => n >= 0 && n <= 36));
check('18 reds, 18 blacks, one green', REDS.size === 18 && range(1, 36).filter((n) => colourOf(n) === 'black').length === 18 && colourOf(0) === 'green');
check('the wheel alternates red and black after the zero', WHEEL.slice(1).every((n, i, a) => i === 0 || colourOf(n) !== colourOf(a[i - 1])));

console.log('\nroulette: bet spots');
const spots = {
  red: 18, black: 18, odd: 18, even: 18, low: 18, high: 18,
  dozen1: 12, dozen2: 12, dozen3: 12, col1: 12, col2: 12, col3: 12,
};
for (const [s, n] of Object.entries(spots)) check(`${s} covers ${n} numbers, never 0`, winning(s).length === n && !wins(s, 0), winning(s).join(','));
check('every number 0–36 is a straight bet on itself only', range(0, 36).every((n) => winning(`n${n}`).join() === String(n)));
check('dozens split 1–12 / 13–24 / 25–36', winning('dozen1').at(-1) === 12 && winning('dozen2')[0] === 13 && winning('dozen3')[0] === 25);
check('column 1 is 1, 4, 7 … 34', winning('col1').join() === range(0, 11).map((k) => 1 + 3 * k).join());
check('columns and dozens each partition 1–36', ['col', 'dozen'].every((p) => [1, 2, 3].flatMap((k) => winning(`${p}${k}`)).sort((a, b) => a - b).join() === range(1, 36).join()));

console.log('\nroulette: payouts');
check('straight pays 35 to 1, dozens and columns 2 to 1, the rest evens', odds('n17') === 35 && odds('dozen2') === 2 && odds('col3') === 2 && odds('red') === 1);
const all = [...Object.keys(spots), ...range(0, 36).map((n) => `n${n}`)];
const edges = all.map((s) => {
  // expected return per unit over the 37 pockets
  let back = 0;
  for (const n of WHEEL) back += settle(new Map([[s, 1]]), n).returned;
  return back / 37;
});
check('every bet returns 36/37 of the stake on average (house edge 2.7%)', edges.every((e) => Math.abs(e - 36 / 37) < 1e-9), `${(36 / 37).toFixed(4)}`);
const table = new Map([['red', 10], ['n17', 2], ['dozen2', 25], ['col1', 5]]);
const r13 = settle(table, 13);
check('13 black: dozen 2 and column 1 win — $90 back, $60 won', r13.returned === 90 && r13.won === 60 && r13.winners.join() === 'dozen2,col1', JSON.stringify(r13));
const r0 = settle(table, 0);
check('zero takes everything off the outside', r0.returned === 0 && r0.winners.length === 0);
const r17 = settle(table, 17);
check('17 black: the straight up pays 35 to 1 (+ its column and dozen)', r17.returned === 2 * 36 + 25 * 3 + 0 && r17.winners.includes('n17'), JSON.stringify(r17));

console.log('\nroulette: fairness');
const counts = new Array(37).fill(0);
const N = 370000;
for (let i = 0; i < N; i++) counts[spin()]++;
const chi = counts.reduce((a, c) => a + (c - N / 37) ** 2 / (N / 37), 0);
// 36 degrees of freedom: 99.9% of fair wheels come in under 67.98
check('370,000 crypto spins: every pocket about 1/37 (χ² < 68)', chi < 68, `χ² ${chi.toFixed(1)}, min ${Math.min(...counts)}, max ${Math.max(...counts)}`);
check('fairRandom stays in [0, 1)', Array.from({ length: 10000 }, fairRandom).every((x) => x >= 0 && x < 1));
check('spin() maps the whole range to a pocket', spin(() => 0) === 0 && spin(() => 0.999999999) === 36);

console.log('\nslots: the reels');
check('three reels of 24 stops, every symbol on every reel', REELS.length === 3 && REELS.every((r) => r.length === STOPS && SYMBOLS.every((s) => r.includes(s))));
check('every reel carries the same mix (6 worm, 5 shell, 4 hook, 4 anchor, 3 marlin, 2 chest)', REELS.every((r) => [6, 5, 4, 4, 3, 2].every((n, k) => r.filter((s) => s === SYMBOLS[k]).length === n)));
check('the payline reads the stopped symbols, wrapping round', line([0, 0, 0]).join() === REELS.map((r) => r[0]).join() && line([24, -1, 25]).join() === [REELS[0][0], REELS[1][23], REELS[2][1]].join());

console.log('\nslots: the paytable');
check('three of a kind pays its line', SYMBOLS.every((s) => pays([s, s, s]).mult === THREE[s]));
check('two worms from the left pay 3, one pays 1, a worm elsewhere nothing', pays(['worm', 'worm', 'hook']).mult === 3 && pays(['worm', 'shell', 'worm']).mult === 1 && pays(['shell', 'worm', 'worm']).mult === 0);
check('a mixed line pays nothing', pays(['chest', 'chest', 'marlin']).mult === 0);
let back = 0;
let hits = 0;
for (let a = 0; a < STOPS; a++) for (let b = 0; b < STOPS; b++) for (let c = 0; c < STOPS; c++) {
  const m = pays(line([a, b, c])).mult;
  back += m;
  if (m) hits++;
}
const rtp = back / STOPS ** 3;
check('every one of the 13,824 stops enumerated: returns 94.85% (the topper says 94.8%)', Math.abs(rtp - 0.9485) < 0.0001, `${(rtp * 100).toFixed(2)}%, pays on ${((hits / STOPS ** 3) * 100).toFixed(1)}% of pulls`);
const tally = [0, 0, 0].map(() => new Array(STOPS).fill(0));
for (let i = 0; i < 240000; i++) pull().forEach((s, r) => tally[r][s]++);
const chiS = tally.map((t) => t.reduce((a, c) => a + (c - 10000) ** 2 / 10000, 0));
// 23 degrees of freedom: 99.9% of fair reels come in under 49.7
check('240,000 crypto pulls: each reel stops evenly (χ² < 50)', chiS.every((x) => x < 50), chiS.map((x) => x.toFixed(1)).join(', '));

console.log('\nblackjack: hands');
const C = (s) => s.split(' ').map((x) => ({ rank: { A: 1, J: 11, Q: 12, K: 13 }[x] ?? Number(x), suit: 0 }));
check('A K is a natural 21', isNatural(C('A K')) && total(C('A K')).total === 21);
check('A A 9 is soft 21; K Q 5 is 25', total(C('A A 9')).total === 21 && total(C('A A 9')).soft && total(C('K Q 5')).total === 25);
check('A 6 is soft 17; A 6 K is hard 17', total(C('A 6')).soft && total(C('A 6')).total === 17 && !total(C('A 6 K')).soft && total(C('A 6 K')).total === 17);
// a stacked shoe: cards listed in the order they come out (you, dealer, you, dealer, then draws)
const stacked = (order) => {
  const shoe = new Shoe(6);
  shoe.cards = C(order).reverse();
  return shoe;
};
const play = (order, bet, moves = []) => {
  const r = new Round(stacked(order));
  r.start(bet);
  for (const m of moves) if (r.phase === 'player') r.act(m);
  while (r.phase === 'player') r.act('stand');
  return r;
};
let r = play('A 9 K 7', 2);
check('a natural pays 3 to 2 without the dealer playing', r.settle()[0].outcome === 'blackjack' && r.settle()[0].returned === 5 && r.dealer.length === 2);
check('an odd chip rounds the 3:2 up for you ($5 natural → $13 back)', play('A 9 K 7', 5).settle()[0].returned === 13);
r = play('A A K K', 10);
check('natural against natural is a push', r.settle()[0].outcome === 'push' && r.settle()[0].returned === 10);
r = play('10 A 9 K', 10);
check('the dealer peeks under an ace: a dealer natural ends it before you play', r.phase === 'done' && r.settle()[0].outcome === 'lose');
r = play('10 6 9 A 5', 10);
check('the dealer stands on soft 17', r.dealer.length === 2 && total(r.dealer).total === 17 && r.settle()[0].outcome === 'win');
r = play('10 6 8 10 9', 10);
check('the dealer draws on 16 (and busts with 25: you win)', r.dealer.length === 3 && r.settle()[0].outcome === 'win');
r = play('10 6 5 10 K', 10, ['hit']);
check('you bust at 25 and lose even when the dealer would have busted', r.settle()[0].outcome === 'bust' && r.dealer.length === 2);
r = play('5 6 6 10 K 2', 10, ['double']);
check('double: twice the bet, exactly one card', r.hands[0].bet === 20 && r.hands[0].cards.length === 3 && r.settle()[0].returned === 40);
r = play('8 6 8 10 3 10 5 K', 10, ['split', 'double', 'stand']);
check('split 8s: two hands, double after split, each settled on its own', r.hands.length === 2 && r.hands[0].bet === 20 && r.settle().every((s) => s.outcome === 'win') && r.settle().reduce((a, s) => a + s.returned, 0) === 60, r.hands.map((h) => h.cards.map((c) => c.rank).join('-')).join(' / '));
r = play('A 6 A 10 K 9 K', 10, ['split']); // the dealer's 16 draws the last K and busts (an empty shoe would reshuffle: a random card)
check('split aces take one card each and a 21 there is not a blackjack', r.hands.every((h) => h.cards.length === 2 && h.done) && r.settle()[0].outcome === 'win' && r.settle()[0].returned === 20);
check('no second split', (() => { const q = new Round(stacked('8 6 8 10 8 3')); q.start(10); q.act('split'); return !q.can('split'); })());

console.log('\nblackjack: the shoe and the edge');
const shoe6 = new Shoe(6);
const seen = new Map();
for (const c of shoe6.cards) seen.set(`${c.rank}${c.suit}`, (seen.get(`${c.rank}${c.suit}`) ?? 0) + 1);
check('six decks: 312 cards, every card exactly six times', shoe6.cards.length === 312 && seen.size === 52 && [...seen.values()].every((n) => n === 6));
let drawn = 0;
while (!shoe6.due) (shoe6.draw(), drawn++);
check('the cut card comes out three-quarters of the way through', drawn === 234, `${drawn} cards`);
const firstCard = new Array(13).fill(0);
for (let i = 0; i < 26000; i++) firstCard[new Shoe(1).draw().rank - 1]++;
const chiB = firstCard.reduce((a, c) => a + (c - 2000) ** 2 / 2000, 0);
check('26,000 shuffles: the top card is any rank evenly (χ² < 33)', chiB < 33, `χ² ${chiB.toFixed(1)}`);
const sim = new Shoe(6);
let bjStaked = 0;
let bjBack = 0;
const HANDS = 1_000_000;
for (let i = 0; i < HANDS; i++) {
  if (sim.due) sim.shuffle();
  const q = new Round(sim);
  q.start(2);
  bjStaked += 2;
  while (q.phase === 'player') {
    const a = basic(q);
    bjStaked += q.extra(a);
    q.act(a);
  }
  for (const s of q.settle()) bjBack += s.returned;
}
const edgePerHand = (bjStaked - bjBack) / (HANDS * 2);
check('a million hands of basic strategy: house edge 0.1–0.7% of the bet', edgePerHand > 0.001 && edgePerHand < 0.007, `${(edgePerHand * 100).toFixed(2)}% per hand`);

const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
