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
import { registerGear } from './gear.ts';
import { biting, registerTimedFish } from './timedFish.ts';
import { registerTrophyFish, trophyOdds, type Rig } from './trophyFish.ts';
import { registerSharkFish, sharkOdds, sharkUnlocked } from './shark.ts';

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

export const habitatAt = BitesJs.habitatAt as (w: { depth: number; reefDist: number; pierDist: number }) => Habitat;
const activity = BitesJs.activity as (pref: string, hour: number) => number;
/**
 * Tidewater's weighted pick of what bites here (Bites.js pickSpecies), with the timed fish kept
 * to their hours (fishing/timedFish.ts), the trophy fish to the rigs that can take them
 * (fishing/trophyFish.ts: no rig, no trophies) and the shark to a full field guide and deep
 * water (fishing/shark.ts).
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
    const x = hw * f.rarity * activity(f.time, hour) * biting(id, hour) * trophyOdds(id, hour, rig, luck) * sharkOdds(id, rig?.depth ?? 0, shark, (rig?.log?.[id]?.count ?? 0) > 0);
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
  /** the fortune teller's charm: how much more often a trophy fish bites */
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
  readonly stats: GearStats;
  readonly holdKg: number;
  readonly holdValue: number;
  fits(kg: number): boolean;
  addFish(species: string, kg: number, timeOfDay?: number): CaughtFish | null;
  sell(ids?: number[] | null): { total: number; count: number };
  release(id: number): void;
  spend(amount: number): boolean;
  buy(key: string): unknown;
  onChange(fn: (s: GameState) => void): () => void;
  emit(): void;
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

function readWoodworks(d: unknown): Woodworks {
  const w = (d as { woodworks?: Partial<Woodworks> }).woodworks;
  const out = freshWoodworks();
  if (!w || typeof w !== 'object') return out;
  out.wood = Math.max(0, Math.floor(Number(w.wood) || 0));
  out.axe = w.axe === true;
  if (w.built && typeof w.built === 'object') for (const [k, v] of Object.entries(w.built)) out.built[k] = Math.max(0, Math.floor(Number(v) || 0));
  return out;
}

export function createGameState(): GameState {
  const s = new (GameStateJs as unknown as new (storage: unknown) => GameState)(prefixedStorage());
  // our own field on Tidewater's save: the shack's things ride along in the same JSON (local and
  // cloud), and a save from before them just has none
  s.home = [];
  s.woodworks = freshWoodworks();
  const toJSON = s.toJSON.bind(s);
  const fromJSON = s.fromJSON.bind(s);
  const reset = s.reset.bind(s);
  s.toJSON = () => ({ ...(toJSON() as object), home: s.home, woodworks: s.woodworks });
  s.fromJSON = (d: unknown) => {
    if (!fromJSON(d)) return false;
    const home = (d as { home?: unknown }).home;
    s.home = Array.isArray(home) ? home.filter((x): x is string => typeof x === 'string') : [];
    s.woodworks = readWoodworks(d);
    return true;
  };
  s.reset = () => {
    s.home = []; // first: Tidewater's reset saves and emits
    s.woodworks = freshWoodworks();
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
