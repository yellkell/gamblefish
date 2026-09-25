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

export const FISH = Table.FISH as unknown as Record<string, FishInfo>;
export const FISH_IDS = Table.FISH_IDS as string[];
export const fishValue = Table.fishValue as (id: string, kg: number) => number;
export const fishLengthCm = Table.fishLengthCm as (id: string, kg: number) => number;

export const habitatAt = BitesJs.habitatAt as (w: { depth: number; reefDist: number; pierDist: number }) => Habitat;
export const pickSpecies = BitesJs.pickSpecies as (h: Habitat, hour: number, rng?: () => number) => string | null;
export const rollWeight = BitesJs.rollWeight as (id: string, rng?: () => number) => number;
export const biteDelay = BitesJs.biteDelay as (h: Habitat, hour: number, rng?: () => number) => number;

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

export function createGameState(): GameState {
  const s = new (GameStateJs as unknown as new (storage: unknown) => GameState)(prefixedStorage());
  s.load();
  return s;
}

export const UPGRADES = GearJs.UPGRADES as unknown as Record<
  string,
  { name: string; levels: ({ cost: number; label: string } & Record<string, unknown>)[] }
>;
