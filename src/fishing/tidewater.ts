/**
 * Tidewater's fishing rules (vendor/tidewater/src/game, MIT), used as-is: the 18 species and
 * what they're worth, where they live and when they bite, the line-tension fight, the gear
 * tracks and the save. Pure JavaScript — no renderer in any of it — so the island's fish
 * behave exactly as they do in Tidewater. This file only gives them TypeScript shapes.
 */

import * as Table from '../../vendor/tidewater/src/game/FishTable.js';
import * as BitesJs from '../../vendor/tidewater/src/game/Bites.js';
import { CatchMinigame as CatchMinigameJs } from '../../vendor/tidewater/src/game/CatchMinigame.js';
import { GameState as GameStateJs } from '../../vendor/tidewater/src/game/GameState.js';
import * as GearJs from '../../vendor/tidewater/src/game/Gear.js';
import { baitShift, registerGear, usedGear } from './gear.ts';
import { baitOdds } from './favouriteBait.ts';
import { biting, registerTimedFish } from './timedFish.ts';
import { registerTrophyFish, trophyOdds, type Rig } from './trophyFish.ts';
import type { CampSave, ChestFish } from '../camps/stock.ts';
import { registerSharkFish, sharkOdds, sharkUnlocked } from './shark.ts';
import { freshGems, readGems, type GemSave } from '../mining/gems.ts';
import { freshJourney, readJourney, type JourneySave } from '../statue/save.ts';
import { readMarketTip, type MarketTip } from '../backpack/marketTip.ts';

export interface FishInfo {
  name: string;
  sci: string;
  model: string;
  habitat: Partial<Record<HabitatKey, number>>;
  kg: [number, number];
  price: number;
  fight: number;
  stamina: number;
  time: 'day' | 'dawnDusk' | 'night' | 'any';
  rarity: number;
}

export type HabitatKey = 'shallows' | 'reef' | 'pier' | 'bay' | 'deep';
export type Habitat = Record<HabitatKey, number>;

// the fish that keep their own hours, and the trophy fish, join Tidewater's table before anything
// reads it; the village's gear joins its upgrade tracks before any save is made or loaded
registerTimedFish(Table.FISH as Record<string, unknown>, Table.FISH_IDS as string[]);
registerTrophyFish(Table.FISH as Record<string, unknown>, Table.FISH_IDS as string[]);
// the great white, last in the table (fishing/shark.ts)
registerSharkFish(Table.FISH as Record<string, unknown>, Table.FISH_IDS as string[]);
registerGear(GearJs.UPGRADES as unknown as Parameters<typeof registerGear>[0]);

export const FISH = Table.FISH as unknown as Record<string, FishInfo>;
export const FISH_IDS = Table.FISH_IDS as string[];
export const fishValue = Table.fishValue as (id: string, kg: number) => number;
export const fishLengthCm = Table.fishLengthCm as (id: string, kg: number) => number;

const tidewaterHabitatAt = BitesJs.habitatAt as (w: { depth: number; reefDist: number; pierDist: number }) => Habitat;
/**
 * Tidewater's water types at the bobber (Bites.js habitatAt), with "deep" moved to this island's
 * drop-off. Tidewater's deep starts at 16 m and is only full at 28 m, and no cast from our pier
 * or walks reaches that (the deep walk's platform stands over 14 m): the mahi-mahi and blackfin
 * tuna live nowhere else, so they never bit at all. Here the deep fades in from 9 m, past the
 * drop-off, and is full by 15 m, off the end of the deep walk.
 */
export function habitatAt(w: { depth: number; reefDist: number; pierDist: number }): Habitat {
  const h = tidewaterHabitatAt(w);
  if (w.depth >= 0.25) h.deep = smooth(DEEP_FROM, DEEP_FULL, w.depth);
  return h;
}
/** metres of water where the deep starts, and where it's all deep */
export const DEEP_FROM = 9;
export const DEEP_FULL = 15;
function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
const activity = BitesJs.activity as (pref: string, hour: number) => number;
/**
 * Tidewater's weighted pick of what bites here (Bites.js pickSpecies), with the timed fish kept
 * to their hours (fishing/timedFish.ts), the trophy fish to the rigs that can take them
 * (fishing/trophyFish.ts: no rig, no trophies), the shark to a full field guide and deep
 * water (fishing/shark.ts), and each fish keener with its favourite bait on the hook
 * (fishing/favouriteBait.ts).
 */
export function pickSpecies(h: Habitat, hour: number, rng: () => number = Math.random, rig?: Rig): string | null {
  let total = 0;
  const w: number[] = [];
  const luck = rig ? (gearStats(rig.gear).luck ?? 1) : 1;
  const shark = sharkUnlocked(rig?.log, FISH_IDS);
  for (const id of FISH_IDS) {
    const f = FISH[id];
    let hw = 0;
    for (const k in f.habitat) hw += (f.habitat[k as HabitatKey] ?? 0) * h[k as HabitatKey];
    const x = hw * f.rarity * activity(f.time, hour) * biting(id, hour) * trophyOdds(id, hour, rig, luck) * sharkOdds(id, rig?.depth ?? 0, shark, (rig?.log?.[id]?.count ?? 0) > 0) * baitOdds(id, rig?.bait);
    w.push(x);
    total += x;
  }
  if (total < 1e-4) return null;
  let r = rng() * total;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return FISH_IDS[i];
  }
  return FISH_IDS[FISH_IDS.length - 1];
}
export const rollWeight = BitesJs.rollWeight as (id: string, rng?: () => number) => number;
const tidewaterBiteDelay = BitesJs.biteDelay as (h: Habitat, hour: number, rng?: () => number) => number;
/** Tidewater's wait for a bite (Bites.js), shortened by better bait (fishing/gear.ts). */
export function biteDelay(h: Habitat, hour: number, gear?: Record<string, number>): number {
  return tidewaterBiteDelay(h, hour) * (gear ? (gearStats(gear).biteMul ?? 1) : 1);
}

export type FightState = 'fighting' | 'caught' | 'snapped' | 'escaped';

export interface CatchMinigame {
  species: string;
  kg: number;
  reelSpeed: number;
  tension: number;
  distance: number;
  stamina: number;
  surge: number;
  band: [number, number];
  state: FightState;
  update(dt: number, reeling: boolean): FightState;
}
export const CatchMinigame = CatchMinigameJs as unknown as new (o: {
  species: string;
  kg: number;
  lineKg?: number;
  reelSpeed?: number;
  distance?: number;
  rng?: () => number;
}) => CatchMinigame;

export interface GearStats {
  lineKg: number;
  reelSpeed: number;
  castM: number;
  holdKg: number;
  fuelL: number;
  speedMul: number;
  finder: boolean;
  deckLights: boolean;
  /** the bait shop's bait (fishing/gear.ts): its tier, and how much sooner the bites come */
  baitTier: number;
  biteMul: number;
  /** the island engineer's gadget: how much more often a trophy fish bites */
  luck: number;
  /** the tackle shop's hooks: how much longer the window to strike stays open */
  strikeMul: number;
}

export interface CaughtFish {
  id: number;
  species: string;
  kg: number;
  cm: number;
  value: number;
  caughtAt: number;
  record: boolean;
}

export interface LastCatch {
  species: string;
  kg: number;
  cm: number;
  value: number;
  newSpecies: boolean;
  record: boolean;
  prevBestKg: number;
  prevBestCm: number;
  kept: boolean;
}

export interface GameState {
  money: number;
  inventory: CaughtFish[];
  log: Record<string, { count: number; bestKg: number; bestCm?: number }>;
  lastCatch: LastCatch | null;
  upgrades: Record<string, number>;
  /** what you've bought for your shack (village/homeGoods.ts ids), in the order you bought it */
  home: string[];
  /** the woodworks (woodworks/): logs in your backpack, the axe, how far each walk is built */
  woodworks: Woodworks;
  /** the fire dancers' camps you've found, and what's left in each chest today (camps/stock.ts) */
  camps: Record<string, CampSave>;
  /** Coral (village/coral.ts): the gifts she's thanked you for, and how often you've called */
  coral: CoralSave;
  /** the gems (mining/): the pickaxe, the stones in your pouch, and every kind you've found */
  gems: GemSave;
  /** the journey (statue/): full helter skelter descents, and whether the golden statue is up */
  journey: JourneySave;
  /** the fish market tip (backpack/marketTip.ts): told once your backpack's half full, till you sell */
  marketTip: MarketTip;
  /**
   * The gear you've chosen to fish with, by track (fishing/gear.ts shownLevel): the rod in your
   * hand and the reel on it (the tackle shop's rack board) and the bait on your hook (the bait
   * shop), any level you've bought. A track that isn't here is your best. It's what the gear
   * does, not just its look: `gear` and `stats` go by it.
   */
  looks: Record<string, number>;
  /** the levels you're fishing with (fishing/gear.ts usedGear): your picks, your best of the rest */
  readonly gear: Record<string, number>;
  /** what that gear does (Tidewater's gearStats of `gear`) */
  readonly stats: GearStats;
  readonly holdKg: number;
  readonly holdValue: number;
  fits(kg: number): boolean;
  addFish(species: string, kg: number, timeOfDay?: number): CaughtFish | null;
  sell(ids?: number[] | null): { total: number; count: number };
  release(id: number): void;
  spend(amount: number): boolean;
  buy(key: string): unknown;
  /**
   * told of a change a frame or so later (deliver), with the others in turn; `logs`: of the log
   * count changing too (logs), for the few boards that show it; `fish`: of a catch (addFish),
   * for the few that show what you've caught
   */
  onChange(fn: (s: GameState) => void, opts?: { logs?: boolean; fish?: boolean }): () => void;
  /** told of a change the moment it's made: only for what must hear at once, and is cheap */
  onChangeNow(fn: (s: GameState) => void): () => void;
  emit(): void;
  /**
   * Only the logs you carry changed (woodworks: into your backpack, into a crate): saved, and told
   * to just the onChange listeners that show them, not every board on the island.
   */
  logs(): void;
  /** once a frame: tell the onChange listeners owed news, for up to budgetMs (at least one) */
  deliver(budgetMs?: number): void;
  toJSON(): unknown;
  fromJSON(d: unknown): boolean;
  load(): boolean;
  save(): void;
  reset(): void;
}

/** Our own save slot, so a Tidewater save in the same browser is never touched. */
const PREFIX = 'vrfish.';
function prefixedStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return {
      getItem: (k) => localStorage.getItem(PREFIX + k),
      setItem: (k, v) => localStorage.setItem(PREFIX + k, v),
    };
  } catch {
    return null;
  }
}

export interface Woodworks {
  wood: number;
  axe: boolean;
  /** steps laid on each walk (woodworks/gates.ts WALKS) */
  built: Record<string, number>;
}

const freshWoodworks = (): Woodworks => ({ wood: 0, axe: false, built: {} });

export interface CoralSave {
  /** villa gifts (village/homeGoods.ts ids) she's thanked you for in person */
  thanked: string[];
  /** times you've come in to see her */
  visits: number;
}

/**
 * Read Coral's save back. A save from before she spoke has none: everything already in her
 * villa counts as thanked (she took it all in on the board), so she doesn't reel off the lot.
 */
function readCoral(d: unknown, home: string[]): CoralSave {
  const c = (d as { coral?: Partial<CoralSave> }).coral;
  if (!c || typeof c !== 'object') return { thanked: [...home], visits: home.length ? 1 : 0 };
  return {
    thanked: Array.isArray(c.thanked) ? c.thanked.filter((x): x is string => typeof x === 'string') : [...home],
    visits: Math.max(0, Math.floor(Number(c.visits) || 0)),
  };
}

function readWoodworks(d: unknown): Woodworks {
  const w = (d as { woodworks?: Partial<Woodworks> }).woodworks;
  const out = freshWoodworks();
  if (!w || typeof w !== 'object') return out;
  out.wood = Math.max(0, Math.floor(Number(w.wood) || 0));
  out.axe = w.axe === true;
  if (w.built && typeof w.built === 'object') for (const [k, v] of Object.entries(w.built)) out.built[k] = Math.max(0, Math.floor(Number(v) || 0));
  return out;
}

/** Read the camps' saves back (anything malformed is dropped: that chest just fills afresh). */
function readCamps(d: unknown): Record<string, CampSave> {
  const out: Record<string, CampSave> = {};
  const src = (d as { camps?: unknown }).camps;
  if (!src || typeof src !== 'object') return out;
  for (const [id, v] of Object.entries(src as Record<string, unknown>)) {
    const e = v as Partial<CampSave> | null;
    if (!e || typeof e !== 'object') continue;
    const fish = Array.isArray(e.fish)
      ? e.fish.filter((f: ChestFish): f is ChestFish => !!f && typeof f.species === 'string' && !!FISH[f.species] && Array.isArray(f.shape) && Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.value))
      : [];
    out[id] = { day: Math.floor(Number(e.day) || 0), fish, logs: Math.max(0, Math.floor(Number(e.logs) || 0)), found: e.found === true };
  }
  return out;
}

/** Read the looks back: only a level of a track you've got (anything else shows your best). */
function readLooks(d: unknown, upgrades: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  const src = (d as { looks?: unknown }).looks;
  if (!src || typeof src !== 'object') return out;
  for (const [k, v] of Object.entries(src as Record<string, unknown>)) if (Number.isInteger(v) && (v as number) >= 0 && (v as number) < (upgrades[k] | 0)) out[k] = v as number;
  return out;
}

export function createGameState(): GameState {
  const s = new (GameStateJs as unknown as new (storage: unknown) => GameState)(prefixedStorage());
  // our own field on Tidewater's save: the shack's things ride along in the same JSON (local and
  // cloud), and a save from before them just has none
  s.home = [];
  s.woodworks = freshWoodworks();
  s.camps = {};
  s.coral = { thanked: [], visits: 0 };
  s.gems = freshGems();
  s.journey = freshJourney();
  s.marketTip = 'waiting';
  s.looks = {};
  // the gear in your hand, not the best you've bought: Tidewater's stats read the upgrades
  Object.defineProperty(s, 'gear', { get: () => usedGear(s.upgrades, s.looks) });
  Object.defineProperty(s, 'stats', { get: () => gearStats(s.gear) });
  const toJSON = s.toJSON.bind(s);
  const fromJSON = s.fromJSON.bind(s);
  const reset = s.reset.bind(s);
  // (baitGoop: this save's bait levels count goop bait: fishing/gear.ts baitShift)
  s.toJSON = () => ({ ...(toJSON() as object), home: s.home, woodworks: s.woodworks, camps: s.camps, coral: s.coral, gems: s.gems, journey: s.journey, marketTip: s.marketTip, looks: s.looks, baitGoop: true });
  s.fromJSON = (d: unknown) => {
    if (!fromJSON(d)) return false;
    s.upgrades.bait = (s.upgrades.bait | 0) + baitShift(d as Parameters<typeof baitShift>[0]);
    const home = (d as { home?: unknown }).home;
    s.home = Array.isArray(home) ? home.filter((x): x is string => typeof x === 'string') : [];
    s.woodworks = readWoodworks(d);
    s.camps = readCamps(d);
    s.coral = readCoral(d, s.home);
    s.gems = readGems(d);
    s.journey = readJourney(d);
    s.marketTip = readMarketTip(d);
    s.looks = readLooks(d, s.upgrades);
    return true;
  };
  // ~Two dozen boards round the island (the casino tables, the shop signs, the bank, the
  // woodworks…) listen for changes, each repainting a canvas that then goes up to the GPU. All
  // told at once, in the frame a fish came out of the water (or a chip went down), that was a
  // hitch you could see. So they're told in turn, as many a frame as fit in a couple of
  // milliseconds (deliver, from main.ts), in the order they asked; news that comes again before a
  // board has heard is just the one repaint.
  const now = new Set<(s: GameState) => void>();
  const later = new Set<(s: GameState) => void>();
  const owed = new Set<(s: GameState) => void>();
  // (logs coming in off a felled tree, or going out into a crate, were telling all of them, one
  // repaint round the island a log: just the log count's boards hear of those)
  const logs = new Set<(s: GameState) => void>();
  // (and a catch told them all too: two dozen boards repainting, and going up to the GPU, as the
  // fish came out of the water, though a catch changes nothing most of them show. Just the ones
  // that show your catches hear of it)
  const fish = new Set<(s: GameState) => void>();
  let catching = false;
  s.onChange = (fn, opts) => {
    later.add(fn);
    if (opts?.logs) logs.add(fn);
    if (opts?.fish) fish.add(fn);
    return () => {
      later.delete(fn);
      logs.delete(fn);
      fish.delete(fn);
      owed.delete(fn);
    };
  };
  s.onChangeNow = (fn) => {
    now.add(fn);
    return () => now.delete(fn);
  };
  s.emit = () => {
    for (const fn of now) fn(s);
    for (const fn of catching ? fish : later) owed.add(fn);
  };
  const addFish = s.addFish.bind(s);
  s.addFish = (species, kg, timeOfDay) => {
    catching = true;
    try {
      return addFish(species, kg, timeOfDay);
    } finally {
      catching = false;
    }
  };
  // a first sale at the fish market: the tip's done with (the chart stops pulsing)
  const sell = s.sell.bind(s);
  s.sell = (ids) => {
    const r = sell(ids);
    if (r.count && s.marketTip !== 'done') {
      s.marketTip = 'done';
      s.save();
    }
    return r;
  };
  s.logs = () => {
    s.save();
    for (const fn of logs) owed.add(fn);
  };
  s.deliver = (budgetMs = 2) => {
    const t0 = performance.now();
    for (const fn of owed) {
      owed.delete(fn);
      fn(s);
      if (performance.now() - t0 >= budgetMs) break;
    }
  };
  s.reset = () => {
    s.home = []; // first: Tidewater's reset saves and emits
    s.woodworks = freshWoodworks();
    s.camps = {};
    s.coral = { thanked: [], visits: 0 };
    s.gems = freshGems();
    s.journey = freshJourney();
    s.marketTip = 'waiting';
    s.looks = {};
    reset();
  };
  s.load();
  return s;
}

export const gearStats = GearJs.gearStats as (upgrades: Record<string, number>) => GearStats;
export const nextLevel = GearJs.nextLevel as (upgrades: Record<string, number>, key: string) => ({ index: number; cost: number; label: string } & Record<string, unknown>) | null;

export const UPGRADES = GearJs.UPGRADES as unknown as Record<
  string,
  { name: string; levels: ({ cost: number; label: string } & Record<string, unknown>)[] }
>;
