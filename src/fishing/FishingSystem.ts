/**
 * FishingSystem — How to Fish's loop, played with your hands, on Tidewater's rules.
 *
 *  ROD OUT / AWAY   B (right hand) or Y (left hand): the rod goes into that hand, or away.
 *  CAST             Hold the TRIGGER — your finger on the line, the bail open — swing the rod
 *                   and let go. The bobber leaves the tip at the speed the tip was really moving
 *                   (a lazy lob drops at your feet, a full overhead swing sends it the rod's
 *                   whole range). Where it lands decides what can bite: sand, the shallows, the
 *                   pier piles, the reef, the bay, the deep (Tidewater's habitats).
 *  WAIT             A few nibbles — the bobber bobs and the rod ticks in your hand — then the
 *                   take: the bobber is pulled under and the rod buzzes hard.
 *  STRIKE           Yank the rod back (or pull the trigger) while it's under. Too early, while
 *                   it's only nibbling, and nothing happens but a hint; too late and it's gone.
 *  FIGHT            Tidewater's line-tension fight. Reel with the TRIGGER (pressure = speed), or
 *                   grab the reel's handle with your OTHER hand (grip) and crank it round. Keep
 *                   the tension in the green; ease off when it runs, or the line snaps. The rod
 *                   bows and the controller shakes with every surge. Teleport is closed until
 *                   it's over.
 *  LAND             The fish swings up out of the water and hangs off your rod tip, thrashing,
 *                   with its card beside it; it goes in the cooler (trigger or B/Y, or wait).
 *  REEL IN          With nothing biting, reel (trigger or crank) to skim the bobber back. Let go
 *                   and it sits where it is and fish can find it again.
 *
 * Teleporting with the line out brings it in.
 */

import { createSystem, InputComponent } from '@iwsdk/core';
import { Euler, Matrix4, Mesh, Quaternion, Vector2, Vector3, type Object3D } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { Bed, loadSamples, MIX, setListener, shot, surfaceThrash, waterEntrySmall, waterExitFish, waterExitSmall } from '../audio/samples.ts';
import { catchSting } from '../audio/sfx.ts';
import type { WaterFx } from '../fx/water.ts';
import { backpackView } from '../backpack/BackpackSystem.ts';
import { pointerView } from '../ui/pointer.ts';
import { fill, GRID_SIZES, type Piece } from '../backpack/logic.ts';
import { pulseHand } from '../input/haptics.ts';
import { locomotion } from '../locomotion/TeleportSystem.ts';
import { INK } from '../ui/panel.ts';
import type { WristWallet } from '../ui/wallet.ts';
import type { WorldJson } from '../world/data.ts';
import type { Heightfield } from '../world/heightfield.ts';
import type { Ocean } from '../world/ocean.ts';
import type { Surfaces } from '../world/surfaces.ts';
import { CatchCard, RodGauge, Toast } from './hud.ts';
import type { FishUniforms, Props } from './props.ts';
import { LINE_PER_CRANK, Rod } from './rod.ts';
import {
  biteDelay,
  CatchMinigame,
  FISH,
  habitatAt,
  pickSpecies,
  rollWeight,
  type GameState,
  type Habitat,
} from './tidewater.ts';

type Hand = 'left' | 'right';
type RodState = 'stowed' | 'idle' | 'windup' | 'flying' | 'floating' | 'retrieving' | 'fighting' | 'landing';

/** VR tuning (everything else is Tidewater's). */
export const FISHING = {
  /** time of day for the bites when there's no island clock (fishingDeps.hour) */
  hour: 16,
  /** trigger past this holds the line / reels; below `triggerOff` lets go */
  triggerOn: 0.55,
  triggerOff: 0.25,
  /** bobber on a short drop below the tip while you're not casting */
  dangle: 0.45,
  /** cast: tip speed → bobber speed, and the top speed (at the base rod's 22 m) */
  castGain: 1.0,
  castMaxSpeed: 20,
  /** cast assist: launch elevation pulled this fraction of the way to `castElev`, floor `castMinElev` */
  castElev: (30 * Math.PI) / 180,
  castElevAssist: 0.6,
  castMinElev: (10 * Math.PI) / 180,
  /** strike: tip speed back toward you / up (m/s) that sets the hook */
  strikeSpeed: 2.2,
  /** your other hand has to be this close to the crank axis to take hold of the handle */
  crankReach: 0.13,
  /** crank turns / s that count as reeling flat out */
  crankFull: 1.4,
  /** landing: the fish hangs this far below the tip */
  landLine: 0.28,
  /** the catch card stays up this long unless dismissed (s) */
  cardSeconds: 9,
  /** a teleport this far (m) with the line out brings the line in */
  teleportReel: 1.0,
} as const;

/** Everything the system needs from the world; set by main before registration. */
export const fishingDeps: {
  props: Props | null;
  state: GameState | null;
  ocean: Ocean | null;
  terrain: Heightfield | null;
  surfaces: Surfaces | null;
  layout: WorldJson['layout'] | null;
  wallet: WristWallet | null;
  fx: WaterFx | null;
  /** is the player standing inside a building? (the rod goes away indoors and comes back out) */
  indoors: (() => boolean) | null;
  /** the island's hour (world/sky.ts): what bites, and when */
  hour: (() => number) | null;
} = { props: null, state: null, ocean: null, terrain: null, surfaces: null, layout: null, wallet: null, fx: null, indoors: null, hour: null };

/** the hour the fish go by: the island's clock, or FISHING.hour without one */
const hourNow = (): number => fishingDeps.hour?.() ?? FISHING.hour;

/** Dev window (`__fish.fishing`). */
export const fishingView: { state?: () => RodState; bite?: () => unknown; fight?: () => unknown; system?: FishingSystem } = {};

interface Bite {
  phase: 'wait' | 'nibble' | 'take';
  t: number;
  species?: string;
  kg?: number;
  nibbles?: number;
  pulse?: number;
}

const _v = new Vector3();
const _w = new Vector3();
const _x = new Vector3();
const _h = new Vector3();
const _up = new Vector3(0, 1, 0);
const _q = new Quaternion();
const LINE_N = 40;

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export class FishingSystem extends createSystem({}) {
  private rod!: Rod;
  private hand: Hand = 'right';
  private state: RodState = 'stowed';
  private t = 0; // time in state

  private bobber!: Mesh;
  private readonly bob = new Vector3();
  private readonly bobVel = new Vector3();
  private dip = 0;
  private lineOut = 0;

  private line!: Line2;
  private lineGeo!: LineGeometry;
  private lineMat!: LineMaterial;
  private readonly lineBuf = new Float32Array((LINE_N + 1) * 3);

  private bite: Bite | null = null;
  private fight: CatchMinigame | null = null;
  private readonly fishPos = new Vector3();
  private wander = 0;
  private lastDist = 0;
  private splashed = false;
  private hapticT = 0;
  private hintT = 0;

  private landing: { species: string; kg: number; mesh: Mesh; u: FishUniforms; len: number; from: Vector3 } | null = null;

  // the other hand on the crank
  private cranking = false;
  private crankA = 0;
  private handCrankRate = 0;
  private crankTick = 0;

  private triggerHeld = false;
  private autoEquipped = false;
  private readonly lastRig = new Vector3();

  private gauge!: RodGauge;
  private toast!: Toast;
  private card!: CatchCard;
  private readonly beds = { wind: new Bed('reel_wind', MIX.reelWind), drag: new Bed('reel_drag', MIX.reelDrag), strain: new Bed('line_strain', MIX.lineStrain) };
  private readonly res = new Vector2();

  init(): void {
    const props = fishingDeps.props!;
    this.rod = new Rod(props);
    this.scene.add(this.rod.mesh);
    this.bobber = props.makeBobber();
    this.bobber.visible = false;
    this.scene.add(this.bobber);

    this.lineGeo = new LineGeometry();
    this.lineGeo.setPositions(this.lineBuf);
    this.lineMat = new LineMaterial({ color: 0xd8e2c4, linewidth: 1.6, worldUnits: false, transparent: true, opacity: 0.85 });
    this.line = new Line2(this.lineGeo, this.lineMat);
    this.line.frustumCulled = false;
    this.line.visible = false;
    this.scene.add(this.line);

    this.gauge = new RodGauge();
    this.gauge.panel.mesh.visible = false;
    this.scene.add(this.gauge.panel.mesh);
    this.toast = new Toast();
    this.toast.panel.mesh.visible = false;
    this.scene.add(this.toast.panel.mesh);
    this.card = new CatchCard();
    this.scene.add(this.card.group);

    fishingView.state = () => this.state;
    fishingView.bite = () => this.bite;
    fishingView.fight = () => this.fight;
    fishingView.system = this;
    this.lastRig.copy(this.player.position);
  }

  /* ── input ───────────────────────────────────────────────────────────── */

  private pad(h: Hand) {
    return this.input.xr.gamepads[h];
  }
  private trigger(h: Hand): number {
    return this.pad(h)?.getButtonValue(InputComponent.Trigger) ?? 0;
  }
  private squeeze(h: Hand): number {
    return this.pad(h)?.getButtonValue(InputComponent.Squeeze) ?? 0;
  }
  /** B on the right hand, Y on the left: the rod button. */
  private rodButton(h: Hand): boolean {
    return this.pad(h)?.getButtonDown(h === 'right' ? InputComponent.B_Button : InputComponent.Y_Button) ?? false;
  }
  private other(h: Hand): Hand {
    return h === 'right' ? 'left' : 'right';
  }
  private buzz(h: Hand, intensity: number, ms: number): void {
    pulseHand(this.renderer.xr.getSession() ?? undefined, h, Math.min(1, intensity), ms);
  }
  private grip(h: Hand): Object3D {
    return this.player.gripSpaces[h];
  }

  private setState(s: RodState): void {
    this.state = s;
    this.t = 0;
  }

  /* ── frame ───────────────────────────────────────────────────────────── */

  update(delta: number, time: number): void {
    const dt = Math.min(delta, 0.05);
    const deps = fishingDeps;
    if (!deps.state || !deps.ocean) return;
    this.t += dt;
    void loadSamples();

    // the ear follows the head
    this.camera.getWorldPosition(_v);
    this.camera.getWorldDirection(_w);
    _x.set(0, 1, 0).applyQuaternion(this.camera.getWorldQuaternion(_q));
    setListener(_v, _w, _x);

    // first time a controller turns up, the rod is already in your right hand
    if (!this.autoEquipped && this.pad('right')) {
      this.autoEquipped = true;
      this.equip('right');
    }

    // rod button: out into this hand, away, or across to the other hand
    for (const h of ['left', 'right'] as const) {
      if (!this.rodButton(h) || backpackView.open) continue;
      if (this.state === 'landing') this.endLanding();
      else if (this.state === 'fighting') continue;
      else if (this.state === 'stowed') this.equip(h);
      else if (h === this.hand) this.stow();
      else this.equip(h);
    }

    // through a door the rod goes over your shoulder; back outside it's in your hand again
    const inside = deps.indoors?.() ?? false;
    if (inside && !this.wasInside && this.state !== 'landing' && this.state !== 'fighting') {
      this.rodWasOut = this.state !== 'stowed';
      if (this.rodWasOut) this.stow();
    } else if (!inside && this.wasInside && this.rodWasOut && this.state === 'stowed') this.equip(this.hand);
    this.wasInside = inside;

    // a teleport with the line out brings it in
    const moved = this.player.position.distanceTo(this.lastRig);
    this.lastRig.copy(this.player.position);
    if (moved > FISHING.teleportReel && (this.state === 'floating' || this.state === 'flying' || this.state === 'retrieving')) {
      this.reelInNow();
    }

    // the backpack has the trigger while it's open
    const held = backpackView.open || pointerView.claimed[this.hand] ? 0 : this.trigger(this.hand);
    const down = !this.triggerHeld && held > FISHING.triggerOn;
    const up = this.triggerHeld && held < FISHING.triggerOff;
    if (down) this.triggerHeld = true;
    if (up) this.triggerHeld = false;

    this.updateCrankHand(dt);
    const reelIn = Math.max(held > FISHING.triggerOff ? held : 0, Math.min(1.3, this.handCrankRate / FISHING.crankFull));

    switch (this.state) {
      case 'idle':
        if (down) {
          this.setState('windup');
          shot('bail_click', MIX.bail, { rate: 1.08 + Math.random() * 0.06 });
        }
        break;
      case 'windup':
        if (up) this.cast();
        break;
      case 'floating':
        this.updateBite(dt);
        if (this.bite?.phase === 'take' && (down || this.yanked())) this.strike();
        else if (this.bite?.phase === 'nibble' && this.yanked() && this.hintT <= 0) {
          this.toast.show('Not yet — wait for it to go under', 1.6, INK.dim);
          this.hintT = 2;
        } else if (reelIn > 0.15 && this.bite?.phase !== 'take') {
          this.bite = null;
          this.setState('retrieving');
        }
        break;
      case 'retrieving':
        if (reelIn <= 0.15 && this.onWater()) {
          // let go: it sits where it is, and something may find it
          this.setState('floating');
          this.bite = { phase: 'wait', t: biteDelay(this.habitat(), hourNow()) };
        }
        break;
      case 'fighting':
        this.updateFight(dt, reelIn);
        break;
      case 'landing': {
        // take it off the hook: grip it with your free hand (or the rod's trigger / the card timing out)
        const free = this.other(this.hand);
        const grabbed = this.squeeze(free) > 0.6 && this.landing && this.grip(free).getWorldPosition(_h).distanceTo(this.landing.mesh.position) < 0.45;
        if (grabbed || (this.t > 1 && down) || this.t > FISHING.cardSeconds) this.endLanding(free);
        break;
      }
    }
    this.hintT -= dt;

    this.updateRod(dt, time);
    this.updateBobber(dt, reelIn);
    this.updateLanding(dt, time);
    this.updateLine();
    this.updateSound(dt);
    this.updateGauge();
    this.toast.update(dt, this.camera);
    deps.wallet?.update(dt);
    deps.fx?.update(dt);

    locomotion.enabled = this.state !== 'fighting' && this.state !== 'landing';
  }

  /* ── rod out / away ──────────────────────────────────────────────────── */

  private equip(h: Hand): void {
    if (this.state !== 'stowed' && this.state !== 'idle') this.reelInNow();
    this.hand = h;
    this.rod.resetMotion();
    this.setState('idle');
    this.rod.mesh.visible = true;
    this.bob.copy(this.rod.tip).y -= FISHING.dangle;
    this.bobVel.set(0, 0, 0);
    this.buzz(h, 0.3, 40);
    shot('bail_click', MIX.bail, { rate: 0.95 });
  }

  private wasInside = false;
  private rodWasOut = false;

  private stow(): void {
    this.reelInNow();
    this.setState('stowed');
    this.rod.mesh.visible = false;
  }

  private reelInNow(): void {
    this.bite = null;
    this.fight = null;
    this.cranking = false;
    if (this.state !== 'stowed') this.setState('idle');
    this.bob.copy(this.rod.tip).y -= FISHING.dangle;
    this.bobVel.set(0, 0, 0);
  }

  /* ── cast ────────────────────────────────────────────────────────────── */

  private cast(): void {
    const castM = fishingDeps.state!.stats.castM;
    const vmax = FISHING.castMaxSpeed * Math.sqrt(castM / 22);
    this.rod.peakTipVelocity(_v).multiplyScalar(FISHING.castGain);
    const speed = _v.length();
    if (speed > vmax) _v.multiplyScalar(vmax / speed);
    this.castAssist(_v);
    this.bob.copy(this.rod.tip);
    this.bobVel.copy(_v);
    this.setState('flying');
    const power = Math.min(1, speed / vmax);
    this.buzz(this.hand, 0.3 + power * 0.45, 45 + power * 40);
    shot('bail_click', MIX.bail + 2, { rate: 0.92 + Math.random() * 0.06 });
    if (power > 0.15) {
      shot('rod_swish', MIX.rodSwish - (1 - power) * 9, { rate: 0.9 + power * 0.2 + Math.random() * 0.06 });
      shot('line_out', MIX.lineOut - (1 - power) * 6, { rate: 1.25 - power * 0.35 });
    }
  }

  /**
   * Cast assist: the speed and the heading are yours, the release timing is forgiven. Nearly
   * everyone lets go late in VR (the tip is already moving down), so the launch elevation is
   * pulled most of the way toward a good casting angle and never lower than a flat lob.
   */
  private castAssist(v: Vector3): void {
    const speed = v.length();
    const flat = Math.hypot(v.x, v.z);
    if (speed < 0.5 || flat < 1e-3) return;
    const elev = Math.atan2(v.y, flat);
    const want = Math.max(FISHING.castMinElev, elev + (FISHING.castElev - elev) * FISHING.castElevAssist);
    const k = (Math.cos(want) * speed) / flat;
    v.set(v.x * k, Math.sin(want) * speed, v.z * k);
  }

  /** A sharp pull back on the rod: the tip moving toward you and/or up, fast. */
  private yanked(): boolean {
    _w.copy(this.rod.tip).sub(this.bob).setY(0);
    if (_w.lengthSq() < 1e-6) return false;
    _w.normalize().add(_up).normalize();
    return this.rod.tipVel.dot(_w) > FISHING.strikeSpeed;
  }

  /* ── bites (Tidewater Game.updateBite, with haptics for the cues) ────── */

  private habitat(): Habitat {
    const L = fishingDeps.layout!;
    const b = this.bob;
    const depth = Math.max(0, -fishingDeps.terrain!.heightAt(b.x, b.z));
    const reefDist = Math.hypot(b.x - L.reef.x, b.z - L.reef.z) - L.reef.radius;
    const P = L.pier;
    const rect = (x0: number, x1: number, z0: number, z1: number): number =>
      Math.hypot(Math.max(x0 - b.x, 0, b.x - x1), Math.max(z0 - b.z, 0, b.z - z1));
    const walk = rect(P.x - P.width / 2, P.x + P.width / 2, P.zStart, P.zEnd);
    const head = rect(P.x - P.headWidth / 2, P.x + P.headWidth / 2, P.zEnd - P.headDepth, P.zEnd);
    return habitatAt({ depth, reefDist, pierDist: Math.min(walk, head) });
  }

  private onLanded(onWater: boolean): void {
    if (!onWater) {
      this.toast.show('Landed on dry ground', 1.4, INK.dim);
      this.setState('retrieving');
      return;
    }
    this.setState('floating');
    waterEntrySmall(this.bob);
    fishingDeps.fx?.splash(this.bob, 0.22);
    this.buzz(this.hand, 0.18, 35);
    this.rippleT = 1.2;
    const h = this.habitat();
    this.bite = { phase: 'wait', t: biteDelay(h, hourNow()) };
    if (!Number.isFinite(this.bite.t)) this.toast.show('Too shallow — nothing lives here', 2, INK.dim);
  }

  private updateBite(dt: number): void {
    const b = this.bite;
    if (!b) return;
    b.t -= dt;
    if (b.phase === 'nibble') this.dip = Math.max(0, Math.sin(Math.min(1, b.pulse ?? 0) * Math.PI) * 0.45);
    else if (b.phase === 'take') this.dip += (1.4 - this.dip) * (1 - Math.exp(-dt * 14));
    else this.dip = Math.max(0, this.dip - dt * 3);
    if (b.phase === 'nibble') b.pulse = (b.pulse ?? 0) + dt * 3.2;
    if (b.phase === 'take') {
      // the rod buzzes hard for as long as it's under
      this.hapticT -= dt;
      if (this.hapticT <= 0) {
        this.hapticT = 0.22;
        this.buzz(this.hand, 0.85, 160);
      }
    }
    if (b.t > 0) return;
    if (b.phase === 'wait') {
      const species = pickSpecies(this.habitat(), hourNow());
      if (!species) {
        b.t = 8;
        return;
      }
      b.species = species;
      b.kg = rollWeight(species);
      b.phase = 'nibble';
      b.nibbles = 1 + Math.floor(Math.random() * 3);
      b.t = 0.7 + Math.random() * 0.8;
      b.pulse = 0;
      this.buzz(this.hand, 0.22, 45);
      fishingDeps.fx?.ripple(this.bob, 0.55, 0, 1.0);
    } else if (b.phase === 'nibble') {
      b.nibbles = (b.nibbles ?? 1) - 1;
      b.pulse = 0;
      if (b.nibbles > 0) {
        b.t = 0.6 + Math.random() * 1.0;
        this.buzz(this.hand, 0.22, 45);
        fishingDeps.fx?.ripple(this.bob, 0.55, 0, 1.0);
      } else {
        b.phase = 'take';
        // big, strong fish give a (slightly) shorter window
        b.t = 2.4 - FISH[b.species!].fight * 0.5;
        this.hapticT = 0;
        surfaceThrash(this.bob, 0.35);
        fishingDeps.fx?.splash(this.bob, 0.35);
      }
    } else {
      this.toast.show('It took the bait and ran', 1.8, INK.dim);
      this.bite = { phase: 'wait', t: biteDelay(this.habitat(), hourNow()) };
    }
  }

  private strike(): void {
    const b = this.bite!;
    const g = fishingDeps.state!.stats;
    this.fight = new CatchMinigame({ species: b.species!, kg: b.kg!, lineKg: g.lineKg, reelSpeed: g.reelSpeed, distance: Math.max(3, this.lineOut) });
    this.bite = null;
    this.fishPos.copy(this.bob);
    this.lastDist = this.fight.distance;
    this.setState('fighting');
    this.toast.show('Fish on!', 1.2, INK.amber);
    this.buzz(this.hand, 1, 220);
  }

  /* ── the fight (Tidewater Game.updateFight + FishingRod's fish motion) ── */

  private updateFight(dt: number, reelIn: number): void {
    const f = this.fight!;
    const base = fishingDeps.state!.stats.reelSpeed;
    const reeling = reelIn > 0.15;
    f.reelSpeed = base * Math.min(1.25, Math.max(0.4, 0.4 + 0.8 * reelIn));
    const st = f.update(dt, reeling);

    // line speed → the crank (unless your hand is on it) and the drag slipping
    const dOut = f.distance - this.lastDist;
    this.lastDist = f.distance;
    if (!this.cranking && dOut < 0) this.rod.turnCrank(-dOut / LINE_PER_CRANK, dt);
    if (dOut > 0) this.rod.spoolAng -= Math.min(dOut, 0.5) / 0.023;
    const rateT = dOut < 0 ? Math.min(1.6, -dOut / dt / LINE_PER_CRANK) : 0;
    this.rod.crankRate += (Math.max(rateT, this.cranking ? this.handCrankRate : 0) - this.rod.crankRate) * (1 - Math.exp(-dt * 10));
    this.dragSpeed = dOut > 0 ? dOut / dt : 0;

    // the fish thrashes at the surface as each run starts
    if (f.surge > 0.6 && !this.splashed) {
      const strength = Math.min(1, 0.3 + f.kg / 8);
      surfaceThrash(this.bob, strength);
      fishingDeps.fx?.splash(this.bob, 0.35 + strength * 0.6);
      this.buzz(this.hand, 1, 260);
    }
    this.splashed = f.surge > 0.6 ? true : f.surge < 0.3 ? false : this.splashed;

    // the pull, in your hand
    this.hapticT -= dt;
    if (this.hapticT <= 0) {
      this.hapticT = 0.1;
      const k = f.tension > 1 ? 1 : 0.06 + 0.55 * Math.min(1, f.tension) + 0.2 * f.surge;
      this.buzz(this.hand, k, 110);
    }

    if (st === 'fighting') return;
    this.fight = null;
    this.dip = 0;
    this.dragSpeed = 0;
    const name = FISH[f.species].name;
    if (st === 'caught') {
      const state = fishingDeps.state!;
      this.caughtId = state.addFish(f.species, f.kg, hourNow())?.id ?? null;
      waterExitFish(this.bob, f.kg);
      fishingDeps.fx?.splash(this.bob, 0.7 + Math.min(1, f.kg / 8) * 0.6);
      shot('fish_flop', MIX.fishFlop, { rate: 0.9 + Math.random() * 0.2, delay: 0.35 });
      this.buzz(this.hand, 1, 240);
      const info = state.lastCatch;
      window.setTimeout(() => catchSting(!!info && (info.newSpecies || info.record)), 450);
      this.startLanding(f.species, f.kg);
    } else if (st === 'snapped') {
      this.toast.show('Snap! The line broke', 2.4, INK.danger);
      shot('line_snap', MIX.lineSnap, { rate: 0.95 + Math.random() * 0.1 });
      this.buzz(this.hand, 1, 80);
      this.reelInNow();
    } else {
      this.toast.show(`The ${name.toLowerCase()} threw the hook`, 2, INK.dim);
      this.setState(this.lineOut > 3 ? 'retrieving' : 'idle');
    }
  }
  private dragSpeed = 0;
  /** the save entry of the fish on the line, handed to the backpack when the card goes */
  private caughtId: number | null = null;
  private rippleT = 0;

  /** Your other hand on the reel's handle: grip near it, then wind it round. */
  private updateCrankHand(dt: number): void {
    const off = this.other(this.hand);
    const g = this.grip(off);
    g.getWorldPosition(_h);
    const canCrank = this.state !== 'stowed' && this.state !== 'landing' && backpackView.hand !== off;
    const near = this.rod.crankCentre(_v).distanceTo(_h) < FISHING.crankReach;
    const holding = this.squeeze(off) > 0.5;
    if (!this.cranking && canCrank && holding && near) {
      this.cranking = true;
      this.crankA = this.rod.crankAngleOf(_h);
      this.buzz(off, 0.3, 30);
    } else if (this.cranking && (!holding || !canCrank || this.rod.crankCentre(_v).distanceTo(_h) > FISHING.crankReach * 2)) {
      this.cranking = false;
    }
    let rate = 0;
    if (this.cranking) {
      const a = this.rod.crankAngleOf(_h);
      let da = a - this.crankA;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      this.crankA = a;
      // anti-reverse: the handle only turns forward
      if (da > 0) {
        const turns = da / (Math.PI * 2);
        this.rod.turnCrank(turns, dt);
        rate = turns / Math.max(dt, 1e-3);
        this.crankTick += turns * 4;
        if (this.crankTick >= 1) {
          this.crankTick -= 1;
          this.buzz(off, 0.12, 18);
        }
      }
    }
    this.handCrankRate += (rate - this.handCrankRate) * (1 - Math.exp(-dt * 8));
    if (!this.cranking) this.handCrankRate *= Math.exp(-dt * 10);
  }

  /* ── landing ─────────────────────────────────────────────────────────── */

  private startLanding(species: string, kg: number): void {
    const props = fishingDeps.props!;
    const { mesh, uniforms } = props.makeFish(species);
    const cm = fishingDeps.state!.lastCatch?.cm ?? 30;
    const len = cm / 100;
    mesh.scale.setScalar(len);
    this.scene.add(mesh);
    this.landing = { species, kg, mesh, u: uniforms, len, from: this.bob.clone() };
    this.setState('landing');
    this.bobVel.set(0, 0, 0);
    const info = fishingDeps.state!.lastCatch;
    if (info) this.card.show(info);
  }

  private updateLanding(dt: number, time: number): void {
    const L = this.landing;
    if (!L || this.state !== 'landing') return;
    // swung in for 0.6 s, then it hangs and swings off the tip on a short line
    const k = Math.min(1, this.t / 0.6);
    const e = k * k * (3 - 2 * k);
    const hang = _v.copy(this.rod.tip);
    hang.y -= FISHING.landLine;
    if (k < 1) {
      this.bob.lerpVectors(L.from, hang, e);
      this.bob.y += Math.sin(e * Math.PI) * 0.8;
      this.bobVel.set(0, 0, 0);
    } else {
      this.dangle(this.bob, this.bobVel, this.rod.tip, FISHING.landLine, dt);
    }
    // the fish hangs head-up by the mouth, thrashing, slowly turning so both flanks show
    L.mesh.position.copy(this.bob).y -= L.len * 0.5;
    this.camera.getWorldPosition(_w);
    const yaw = Math.atan2(_w.x - this.bob.x, _w.z - this.bob.z) + Math.PI / 2 + Math.sin(this.t * 0.7) * 0.6;
    L.mesh.rotation.set(-Math.PI / 2, 0, 0);
    L.mesh.rotation.order = 'YXZ';
    L.mesh.rotation.y = yaw;
    const thrash = Math.max(0.03, 0.12 * Math.exp(-this.t * 0.35)) * (1 + 0.5 * Math.sin(time * 1.7));
    L.u.uSwim.value = thrash;
    L.u.uFreq.value = 2.2 + thrash * 10;
    L.u.uTime.value = time;
    if (Math.random() < dt * 0.5 * Math.exp(-this.t * 0.3)) shot('fish_flop', MIX.fishFlop - 4, { rate: 0.9 + Math.random() * 0.2 });
    // water streams off it, then drips, then stops
    const wet = 30 * Math.exp(-this.t * 0.55);
    if (fishingDeps.fx && Math.random() < wet * dt * 4) {
      _v.copy(L.mesh.position);
      _v.y -= L.len * (0.1 + Math.random() * 0.4);
      fishingDeps.fx.drip(_v, 1 + Math.floor(Math.random() * 2), L.len * 0.25);
    }

    // the card beside it, toward your right, facing you
    _x.copy(_w).sub(this.bob).setY(0).normalize();
    this.card.group.position.copy(this.bob).addScaledVector(_h.set(-_x.z, 0, _x.x), -0.32);
    this.card.group.position.y = this.bob.y - L.len * 0.35;
    this.card.group.lookAt(_w);
  }

  private endLanding(into: Hand | null = null): void {
    const L = this.landing;
    if (L) {
      this.scene.remove(L.mesh);
      (L.mesh.material as { dispose(): void }).dispose();
    }
    this.landing = null;
    this.card.hide();
    if (this.state === 'landing') this.reelInNow();
    // off the hook and into your free hand; A brings up the backpack to put it away
    if (this.caughtId !== null) {
      const id = this.caughtId;
      this.caughtId = null;
      backpackView.takeInHand?.(id, into ?? this.other(this.hand));
    }
  }

  /* ── rod, bobber, line ───────────────────────────────────────────────── */

  private updateRod(dt: number, time: number): void {
    if (this.state === 'stowed') {
      this.rod.mesh.visible = false;
      return;
    }
    this.rod.mesh.visible = true;
    const f = this.fight;
    let bendT = 0.012;
    let loadT = 0.15;
    let towards: Vector3 | null = null;
    switch (this.state) {
      case 'fighting':
        if (f) {
          bendT = 0.06 + 0.3 * Math.min(f.tension, 1.1) + 0.05 * f.surge;
          loadT = Math.min(1, f.tension * 1.1);
        }
        towards = this.bob;
        break;
      case 'retrieving':
        bendT = 0.035;
        towards = this.bob;
        break;
      case 'windup':
        bendT = 0.02;
        break;
      case 'floating':
        bendT = 0.012 + this.dip * 0.07;
        towards = this.bob;
        break;
      case 'landing':
        bendT = 0.1 + (this.landing ? Math.min(0.12, this.landing.kg * 0.02) : 0);
        loadT = 0.5;
        break;
      case 'flying':
        towards = this.bob;
        break;
    }
    const bailOpen = this.state === 'windup' || this.state === 'flying';
    this.rod.lineFill = 1 - Math.min(1, this.lineOut / 220) * 0.5;
    this.rod.update(dt, time, this.grip(this.hand), this.player.raySpaces[this.hand], { bendT, loadT, towards, bailOpen });
    if (this.state !== 'fighting') {
      const rateT = this.state === 'retrieving' ? Math.min(1.6, this.retrieveSpeed / LINE_PER_CRANK) : 0;
      if (!this.cranking && rateT > 0) this.rod.turnCrank(rateT * dt, dt);
      this.rod.crankRate += (Math.max(rateT, this.cranking ? this.handCrankRate : 0) - this.rod.crankRate) * (1 - Math.exp(-dt * 10));
    }
  }
  private retrieveSpeed = 0;

  /** The bobber is sitting ON the sea (not on a deck or the sand above it). */
  private onWater(): boolean {
    const b = this.bob;
    return fishingDeps.terrain!.heightAt(b.x, b.z) < -0.05 && b.y < fishingDeps.ocean!.heightAt(b.x, b.z) + 0.3;
  }

  /** A weight on a short line under an anchor: gravity, a little air drag, the line's length. */
  private dangle(p: Vector3, v: Vector3, anchor: Vector3, len: number, dt: number): void {
    const n = 2;
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      v.y -= 9.81 * h;
      v.multiplyScalar(Math.exp(-h * 1.1));
      p.addScaledVector(v, h);
      _x.copy(p).sub(anchor);
      const d = _x.length();
      if (d > len) {
        _x.divideScalar(d);
        p.copy(anchor).addScaledVector(_x, len);
        const vr = v.dot(_x);
        if (vr > 0) v.addScaledVector(_x, -vr);
      }
    }
  }

  private updateBobber(dt: number, reelIn: number): void {
    const ocean = fishingDeps.ocean!;
    const terrain = fishingDeps.terrain!;
    const tip = this.rod.tip;
    this.retrieveSpeed = 0;
    switch (this.state) {
      case 'idle':
      case 'windup':
        this.dangle(this.bob, this.bobVel, tip, FISHING.dangle, dt);
        break;
      case 'flying': {
        // ballistic with a little drag, capped by the rod's casting range (Tidewater)
        const prevY = this.bob.y;
        this.bobVel.y -= 9.81 * dt;
        this.bobVel.multiplyScalar(Math.exp(-dt * 0.25));
        this.bob.addScaledVector(this.bobVel, dt);
        const range = Math.hypot(this.bob.x - tip.x, this.bob.z - tip.z);
        if (range > fishingDeps.state!.stats.castM) {
          this.bobVel.x *= 0.5;
          this.bobVel.z *= 0.5;
        }
        const water = ocean.heightAt(this.bob.x, this.bob.z);
        const ground = terrain.heightAt(this.bob.x, this.bob.z);
        const deck = fishingDeps.surfaces?.catchArc(this.bob.x, this.bob.y, this.bob.z, prevY, this.bobVel.y < 0);
        const onDeck = deck?.kind === 'deck';
        if (onDeck || this.bob.y <= Math.max(water, ground)) {
          const wet = !onDeck && water > ground + 0.05;
          this.bob.y = onDeck ? deck!.y : Math.max(water, ground);
          this.bobVel.set(0, 0, 0);
          this.onLanded(wet);
        }
        break;
      }
      case 'floating': {
        this.rippleT -= dt;
        if (this.rippleT <= 0) {
          this.rippleT = 1.6 + Math.random() * 1.2;
          fishingDeps.fx?.ripple(this.bob, 0.35, 0, 1.6);
        }
        const bob = Math.sin(this.t * 2.1) * 0.008;
        const yT = ocean.heightAt(this.bob.x, this.bob.z) + 0.012 + bob - this.dip * 0.09;
        this.bob.y += (yT - this.bob.y) * (1 - Math.exp(-dt * 12));
        break;
      }
      case 'retrieving': {
        // an empty line skims back as you reel
        _v.copy(tip).sub(this.bob).setY(0);
        const d = _v.length();
        const speed = (3 + fishingDeps.state!.stats.reelSpeed * 3) * Math.min(1, reelIn);
        this.retrieveSpeed = speed;
        const step = Math.min(d, speed * dt);
        if (d > 1e-3) this.bob.addScaledVector(_v.multiplyScalar(1 / d), step);
        const ground = terrain.heightAt(this.bob.x, this.bob.z);
        const surf = Math.max(ocean.heightAt(this.bob.x, this.bob.z) + 0.02, ground);
        this.bob.y += (surf - this.bob.y) * (1 - Math.exp(-dt * 10));
        if (d < 2.2) {
          if (this.onWater()) {
            waterExitSmall(this.bob);
            fishingDeps.fx?.splash(this.bob, 0.1, false);
            fishingDeps.fx?.ripple(this.bob, 0.7, 0, 1.2);
          }
          this.setState('idle');
          this.bobVel.set(0, 0, 0);
        }
        break;
      }
      case 'fighting': {
        const f = this.fight;
        if (!f) break;
        // the fish runs about at the fight's distance, the bobber dragged under near it
        this.wander += dt * (0.4 + f.surge * 1.5);
        _v.copy(this.fishPos).sub(tip).setY(0);
        const d0 = _v.length() || 1;
        _v.multiplyScalar(1 / d0);
        const side = _x.set(-_v.z, 0, _v.x).multiplyScalar(Math.sin(this.wander) * 0.9 * dt * (1 + f.surge));
        const dist = Math.max(1, f.distance);
        this.fishPos.set(tip.x + _v.x * dist, 0, tip.z + _v.z * dist).add(side);
        const k = 1 - Math.exp(-dt * 6);
        this.bob.x += (this.fishPos.x - this.bob.x) * k;
        this.bob.z += (this.fishPos.z - this.bob.z) * k;
        const water = ocean.heightAt(this.bob.x, this.bob.z);
        this.bob.y += (water - 0.05 - 0.2 * f.surge - this.bob.y) * (1 - Math.exp(-dt * 8));
        break;
      }
    }
    const out = this.state !== 'stowed';
    this.lineOut = out ? tip.distanceTo(this.bob) : 0;
    this.bobber.visible = out && this.state !== 'landing';
    this.bobber.position.copy(this.bob);
    // a real float is a few pixels at casting range: grow it with distance so it stays readable
    this.camera.getWorldPosition(_w);
    this.bobber.scale.setScalar(Math.max(1, this.bob.distanceTo(_w) / 7));
    this.bobber.rotation.set(this.dip * 0.4, 0, 0);
  }

  private updateLine(): void {
    const show = this.state !== 'stowed';
    this.line.visible = show;
    if (!show) return;
    const a = this.rod.tip;
    const b = this.bob;
    const f = this.fight;
    const taut = this.state === 'fighting' ? Math.min(1, (f ? f.tension : 0) * 1.5) : this.state === 'retrieving' ? 0.6 : 0;
    const slack = this.state === 'idle' || this.state === 'windup' || this.state === 'landing' ? 0 : 1;
    const sag = (this.lineOut * (this.state === 'flying' ? 0.03 : 0.07) * (1 - taut) + 0.02) * slack;
    _v.copy(a).lerp(b, 0.5);
    _v.y -= sag;
    for (let i = 0; i <= LINE_N; i++) {
      const t = i / LINE_N;
      const u = 1 - t;
      this.lineBuf[i * 3] = u * u * a.x + 2 * u * t * _v.x + t * t * b.x;
      this.lineBuf[i * 3 + 1] = u * u * a.y + 2 * u * t * _v.y + t * t * b.y;
      this.lineBuf[i * 3 + 2] = u * u * a.z + 2 * u * t * _v.z + t * t * b.z;
    }
    this.lineGeo.setPositions(this.lineBuf);
    // screen-space width needs the eye buffer's size (it differs in and out of the headset)
    const xr = this.renderer.xr;
    if (xr.isPresenting) {
      const vp = (xr.getCamera().cameras[0] as unknown as { viewport?: { z: number; w: number } }).viewport;
      if (vp) this.res.set(vp.z, vp.w);
    } else this.renderer.getDrawingBufferSize(this.res);
    this.lineMat.resolution.copy(this.res);
  }

  private updateSound(dt: number): void {
    const crank = this.state === 'stowed' ? 0 : this.rod.crankRate;
    this.beds.wind.set(smooth(0.05, 0.35, crank) * (0.8 + 0.2 * Math.min(1, crank)), Math.min(1.3, Math.max(0.45, crank / 1.4)));
    this.beds.drag.set(this.state === 'fighting' ? smooth(0.05, 0.7, this.dragSpeed) : 0, Math.min(1.25, Math.max(0.7, 0.7 + this.dragSpeed * 0.25)));
    const strain = this.fight ? smooth(0.7, 1.0, this.fight.tension) : 0;
    this.beds.strain.set(strain, 0.9 + 0.2 * strain);
    void dt;
  }

  private updateGauge(): void {
    const m = this.gauge.panel.mesh;
    const show = this.state !== 'stowed';
    m.visible = show;
    if (!show) return;
    // clipped to the rod just ahead of the fore grip, lying along the blank, facing up at you
    m.matrix.copy(this.rod.mesh.matrix).multiply(GAUGE_MOUNT);
    m.matrixAutoUpdate = false;
    m.matrixWorldNeedsUpdate = true;
    const s = fishingDeps.state!;
    const f = this.fight;
    const b = this.bite;
    let label = 'READY';
    let colour: string = INK.hot;
    switch (this.state) {
      case 'idle':
        label = 'READY TO CAST';
        colour = INK.dim;
        break;
      case 'windup':
        label = 'SWING & LET GO';
        colour = INK.amber;
        break;
      case 'flying':
        label = '…';
        break;
      case 'floating':
        if (b?.phase === 'take') {
          label = 'STRIKE!';
          colour = INK.danger;
        } else if (b?.phase === 'nibble') {
          label = 'NIBBLING…';
          colour = INK.amber;
        } else {
          label = 'WAITING';
          colour = INK.dim;
        }
        break;
      case 'retrieving':
        label = 'REELING IN';
        break;
      case 'fighting':
        if (f && f.tension > f.band[1]) {
          label = 'EASE OFF!';
          colour = INK.danger;
        } else {
          label = 'REEL!';
          colour = INK.good;
        }
        break;
      case 'landing':
        label = 'LANDED';
        colour = INK.amber;
        break;
    }
    const size = GRID_SIZES[Math.max(0, Math.min(GRID_SIZES.length - 1, s.upgrades.hold | 0))];
    const bag = fill(s.inventory as unknown as Piece[], size[0], size[1]);
    this.gauge.paint({
      label,
      labelColour: colour,
      tension: f ? f.tension : null,
      band: f ? f.band : [0.3, 0.85],
      lineOut: this.lineOut,
      holdKg: bag.used,
      holdMax: bag.total,
    });
  }
}

/** The gauge plate on the rod: just ahead of the fore grip, 4.5 cm above the blank, its text
 *  running up the rod and the plate tipped back ~50° to face the angler behind it. */
const GAUGE_MOUNT = new Matrix4().compose(
  new Vector3(0, 0.66, 0.045),
  new Quaternion().setFromEuler(new Euler(0.9, 0, 0)),
  new Vector3(1, 1, 1),
);
