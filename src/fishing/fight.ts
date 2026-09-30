/**
 * The fight for every fish but the great white: Tidewater's line-tension fight (CatchMinigame),
 * with two things it leaves out, because in Tidewater you cast from a boat and the fish starts a
 * long cast away. Off the pier you can drop the bait straight down, and a fish hooked three
 * metres under the rod tip was landed in a couple of seconds, whatever its size.
 *
 *  - THE FIRST RUN  Hooked, it runs: it takes line off the reel (the drag slips) as far as it's
 *                   big and strong, from a couple of metres for a silverside to a dozen and more
 *                   for a jack or a tarpon. Reeling doesn't stop it; the line stays tight.
 *  - NOT YET        It only comes to the rod once it's tired (LAND_AT). Reel a fresh fish right
 *                   in and it bolts again, shorter the more worn out it is.
 *  - EASE OFF       Let go of the reel and it swims for it: it takes line against the drag,
 *                   faster the stronger and fresher it is, and keeps going while you wait. Give
 *                   it too long and it takes all your line.
 */

import { CatchMinigame as CatchMinigameJs } from '../../vendor/tidewater/src/game/CatchMinigame.js';
import { FISH, type CatchMinigame, type FightState } from './tidewater.ts';

/** how worn out (stamina, 1 fresh .. 0 spent) a fish must be before it lets you land it */
export const LAND_AT = 0.35;
/** where Tidewater lands a fish (the rod's reach) */
const LANDED = 1.2;

interface Opts {
  species: string;
  kg: number;
  lineKg?: number;
  reelSpeed?: number;
  distance?: number;
  rng?: () => number;
}

const Base = CatchMinigameJs as unknown as new (o: Opts) => CatchMinigame;

export class FishFight extends Base {
  /** how hard this fish fights for its size: 0 (a silverside) .. 1 (a big tarpon) */
  readonly vigor: number;
  /** metres of line it has yet to take on the run it's on (0: not running) */
  run: number;
  /** how many times it's bolted from the rod */
  bolts = 0;
  /** 0 .. 1: how hard it's swimming off while you're not reeling */
  flee = 0;
  private readonly rand: () => number;

  constructor(o: Opts) {
    super(o);
    const f = FISH[o.species];
    this.rand = o.rng ?? Math.random;
    this.vigor = Math.min(1, f.fight * Math.pow(Math.max(o.kg / f.kg[1], 0.15), 0.35));
    this.run = (2 + 15 * this.vigor) * (0.8 + 0.4 * this.rand());
  }

  /** the speed it runs at (m/s) */
  get runSpeed(): number {
    return 2 + 5 * this.vigor;
  }

  /** it got away by taking all the line off the reel (not by throwing the hook) */
  get spooled(): boolean {
    return this.state === 'escaped' && this.distance > (this as unknown as { maxDistance: number }).maxDistance;
  }

  /** the speed it swims off at when you ease off the reel (m/s): a fresh jack far faster than a tired silverside */
  get fleeSpeed(): number {
    return (0.6 + 2.4 * this.vigor) * (0.35 + 0.65 * this.stamina);
  }

  update(dt: number, reeling: boolean): FightState {
    const st = super.update(dt, reeling);
    if (st === 'caught' && this.stamina > LAND_AT) {
      // it sees the rod (or the pier) and it's still got fight: off it goes again
      this.state = 'fighting';
      this.distance = Math.max(this.distance, LANDED + 0.3);
      this.run = (1.5 + 8 * this.vigor) * this.stamina * (0.8 + 0.4 * this.rand());
      this.bolts++;
    }
    if (this.state !== 'fighting') return this.state;
    // ease off and it swims for it (a moment to turn, then away); reel and it's checked at once
    this.flee += ((reeling || this.run > 0 ? 0 : 1) - this.flee) * (1 - Math.exp(-dt * (reeling ? 8 : 2.5)));
    if (this.flee > 0.01) {
      this.distance += this.fleeSpeed * this.flee * dt;
      // it's pulling against the drag: the line stays tight enough that the hook holds
      this.tension = Math.max(this.tension, (0.2 + 0.12 * this.vigor) * this.flee);
    }
    if (this.run <= 0) return this.state;
    // on the run: it takes line against the drag, which holds the line tight in the green (it
    // tires there), whether you're reeling or not
    const take = Math.min(this.run, this.runSpeed * dt);
    this.run -= take;
    this.distance += take;
    this.tension = Math.max(this.tension, 0.45 + 0.3 * this.vigor);
    return this.state;
  }
}
