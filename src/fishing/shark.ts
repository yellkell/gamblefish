/**
 * THE GREAT WHITE: the last thing you catch.
 *
 * It isn't there until every other fish in the field guide has been landed. After that it
 * patrols the deep water past the drop-off (6 m or more under the bobber) and takes a bait
 * there often.
 *
 * The fight is its own (SharkFight). It's no fish you reel in against the drag:
 *  - between runs it cruises, and you work it closer on the reel, keeping the tension green;
 *  - every few seconds it makes a RUN: first it breaks the surface (fishing/FishingSystem.ts
 *    breaches it), then it tears away. The prompt says so: grab the rod's foregrip with your
 *    OTHER hand as well and HOLD ON. Two hands hold it: the run stalls, the rod bows to the
 *    cork, and when you've held it long enough the run is broken and it tires;
 *  - one hand doesn't. It strips line off the reel, and reeling against a run snaps the line.
 *    Let it take all the line and it's gone;
 *  - break three runs and it's beaten. Reel it in alongside the pier.
 *
 * Its body is made Tidewater's way (like the trophy fish): an anatomy fed to its own fish
 * builder, a fusiform body with a conical snout, a tall triangular first dorsal, long sickle
 * pectorals, a near-symmetric crescent tail and a tiny second dorsal and anal fin. The skin is
 * pattern 21 in fishing/fishSkin.ts. Plain data plus a class, so Node runs this file as it is.
 */

export const SHARK_ID = 'shark';

/** how many runs you must hold through to beat it */
export const RUNS = 3;

/** metres of water under the bobber it needs */
export const SHARK_DEPTH = 6;

export const SHARK_ROW = {
  name: 'Great white shark',
  sci: 'Carcharodon carcharias',
  lw: [0.0052, 3.1] as [number, number],
  model: SHARK_ID,
  habitat: { deep: 1, bay: 0.3 },
  kg: [520, 900] as [number, number],
  price: 12,
  fight: 1,
  stamina: 40,
  time: 'any',
  rarity: 3,
};

/** Every species but the shark in the log: the book is full, and the shark comes. */
export function sharkUnlocked(log: Record<string, { count: number }> | undefined, ids: string[]): boolean {
  if (!log) return false;
  return ids.every((id) => id === SHARK_ID || (log[id]?.count ?? 0) > 0);
}

/**
 * 1 for anything else; for the shark 0 until it's unlocked and the bobber is over deep water,
 * then often, and once it's been caught, now and then (it's still out there).
 */
export function sharkOdds(id: string, depth: number, unlocked: boolean, caught = false): number {
  if (id !== SHARK_ID) return 1;
  if (!unlocked || depth < SHARK_DEPTH) return 0;
  return caught ? 0.08 : 1;
}

/** Add it to Tidewater's table (the fish object and the id list, last). Idempotent. */
export function registerSharkFish(fish: Record<string, unknown>, ids: string[]): void {
  if (fish[SHARK_ID]) return;
  fish[SHARK_ID] = { ...SHARK_ROW };
  ids.push(SHARK_ID);
}

type Curve = [number, number][];
const soft = (from: number, to: number, rays: number, h: Curve, rake: [number, number], notch = 0) => ({ from, to, rays, spiny: false, h, rake, notch });

/** Its anatomy and skin, next to Tidewater's (for the bake). Idempotent. */
export function registerSharkModel(species: Record<string, unknown>, skin: Record<string, unknown>): void {
  if (species[SHARK_ID]) return;
  species[SHARK_ID] = {
    pattern: 21,
    body: 0.8,
    sec: 2.1,
    // a great white is girthy: deepest a third of the way back, tapering hard to a slim tail stalk
    top: [[0, 0.005], [0.03, 0.024], [0.08, 0.055], [0.16, 0.092], [0.28, 0.124], [0.4, 0.132], [0.52, 0.122], [0.64, 0.096], [0.76, 0.064], [0.88, 0.034], [0.96, 0.02], [1, 0.018]],
    bot: [[0, 0.004], [0.03, 0.015], [0.08, 0.038], [0.16, 0.072], [0.28, 0.104], [0.4, 0.114], [0.52, 0.104], [0.64, 0.08], [0.76, 0.052], [0.88, 0.027], [0.96, 0.016], [1, 0.015]],
    wid: [[0, 0.005], [0.04, 0.036], [0.12, 0.072], [0.25, 0.1], [0.4, 0.108], [0.55, 0.095], [0.7, 0.068], [0.85, 0.038], [0.95, 0.024], [1, 0.022]],
    // underslung: the snout overhangs a wide mouth set well back
    mouth: { corner: 0.17, y: -0.05, tip: -0.022, protrude: 0 },
    eye: { u: 0.085, y: 0.022, r: 0.011 },
    opercle: 0.2,
    scales: 0,
    scaleVis: 0,
    lateral: 0.3,
    arch: 0,
    dorsal: [
      soft(0.36, 0.5, 8, [[0, 0.14], [0.3, 0.13], [0.7, 0.07], [1, 0.012]], [0.35, 1.2]),
      soft(0.82, 0.86, 4, [[0, 0.022], [1, 0.005]], [0.6, 1.0]),
    ],
    anal: [soft(0.84, 0.88, 4, [[0, 0.018], [1, 0.005]], [0.6, 1.0])],
    pectoral: { u: 0.32, y: -0.04, len: 0.2, base: 0.045, rays: 8, shape: 'falcate', spread: 0.25 },
    pelvic: { u: 0.62, len: 0.05, rays: 5 },
    // a broad crescent, the lobes nearly equal (a mackerel shark's tail)
    caudal: { shape: 'lunate', len: 0.19, span: 0.15, fork: 0.45, rays: 12 },
    iris: 0x050505,
    irid: 0,
    metal: 0,
  };
  skin[SHARK_ID] = { back: 0x3e4850, flank: 0x6a767e, belly: 0xf0efea, fin: 0x4a545b, edge: 0x262c32, rough: 0.55 };
}

export type SharkPhase = 'cruise' | 'warn' | 'run' | 'beaten';

/**
 * The shark's fight. Same face as Tidewater's CatchMinigame (the gauge, the rod bend, the
 * haptics and the line all read tension, distance, surge and stamina), plus the runs.
 */
export class SharkFight {
  readonly species = SHARK_ID;
  reelSpeed = 1.1;
  tension = 0.3;
  distance: number;
  stamina = 1;
  surge = 0;
  readonly band: [number, number] = [0.3, 0.85];
  state: 'fighting' | 'caught' | 'snapped' | 'escaped' = 'fighting';

  phase: SharkPhase = 'cruise';
  /** runs held and broken so far */
  broken = 0;
  /** seconds held in this run, and how long a run must be held */
  held = 0;
  readonly holdFor = 2.6;
  /** seconds into the current phase */
  t = 0;
  /** set on the frame a run begins (the breach) and ends (broken or not); read and cleared by the rod */
  events: ('warn' | 'breach' | 'broken' | 'lost' | 'beaten')[] = [];
  private readonly maxDistance: number;
  private overload = 0;
  private slack = 0;
  private nextRun = 3.5;

  readonly kg: number;
  private readonly rng: () => number;

  constructor(kg: number, distance: number, rng: () => number = Math.random) {
    this.kg = kg;
    this.rng = rng;
    this.distance = Math.max(8, distance);
    this.maxDistance = this.distance + 70;
  }

  /** How close the hold is to breaking the run (0..1). */
  get holdProgress(): number {
    return Math.min(1, this.held / this.holdFor);
  }

  update(dt: number, reeling: boolean, holding = false): 'fighting' | 'caught' | 'snapped' | 'escaped' {
    if (this.state !== 'fighting') return this.state;
    this.t += dt;
    const tired = this.broken / RUNS;
    let pull = 0;
    let pinned = false;
    switch (this.phase) {
      case 'cruise': {
        // it swims heavy and slow; reeling gains line, steadily
        this.surge += (0 - this.surge) * (1 - Math.exp(-dt * 4));
        pull = 0.55 * (1 - tired * 0.4) + 0.08 * Math.sin(this.t * 1.3);
        this.nextRun -= dt;
        if (this.nextRun <= 0) this.to('warn');
        break;
      }
      case 'warn':
        // it turns: a beat to get your hand on the rod before it goes
        pull = 0.65;
        this.surge += (0.5 - this.surge) * (1 - Math.exp(-dt * 6));
        if (this.t >= 1.1) this.to('run');
        break;
      case 'run': {
        this.surge += (1 - this.surge) * (1 - Math.exp(-dt * 8));
        if (holding) {
          // both hands on it: the run stalls against the rod, hard in the top of the green
          pull = 0.95;
          pinned = true;
          this.held += dt;
          this.distance += 0.6 * dt;
          if (this.held >= this.holdFor) {
            this.broken++;
            this.stamina = Math.max(0, 1 - this.broken / RUNS);
            this.events.push(this.broken >= RUNS ? 'beaten' : 'broken');
            this.to(this.broken >= RUNS ? 'beaten' : 'cruise');
            this.nextRun = 6 + this.rng() * 3;
            break;
          }
        } else {
          // one hand: it strips line, and the drag screams
          pull = 1.25;
          this.held = Math.max(0, this.held - dt * 0.8);
          this.distance += 7 * dt;
        }
        if (this.t >= 6.5) {
          // it gave up this run on its own: no ground gained either way
          this.events.push('lost');
          this.to('cruise');
          this.nextRun = 4 + this.rng() * 3;
        }
        break;
      }
      case 'beaten':
        this.surge += (0 - this.surge) * (1 - Math.exp(-dt * 3));
        pull = 0.3;
        break;
    }

    // the tension: reeling adds to the pull; against a one-handed run it goes over the top
    const target = pinned ? 0.84 + 0.04 * Math.sin(this.t * 9) : reeling ? 0.2 + pull * 0.9 : pull * 0.62;
    this.tension += (target - this.tension) * (1 - Math.exp(-dt * (reeling ? 2.6 : 3.2)));
    if (reeling && this.phase !== 'run') {
      const k = this.phase === 'beaten' ? 1.6 : 0.85;
      this.distance -= this.reelSpeed * k * dt;
    }
    this.distance = Math.max(0, this.distance);

    this.overload = this.tension > 1.05 ? this.overload + dt : Math.max(0, this.overload - dt * 2);
    if (this.overload > 0.7) this.state = 'snapped';
    else {
      this.slack = this.tension < 0.1 ? this.slack + dt : Math.max(0, this.slack - dt * 2);
      if (this.distance > this.maxDistance || this.slack > 6) this.state = 'escaped';
      else if (this.phase === 'beaten' && this.distance < 2.5) this.state = 'caught';
    }
    return this.state;
  }

  private to(p: SharkPhase): void {
    if (p === 'warn') this.events.push('warn');
    if (p === 'run') this.events.push('breach');
    this.phase = p;
    this.t = 0;
    if (p === 'run') this.held = 0;
  }
}
