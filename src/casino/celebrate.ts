/**
 * What a win looks like, shared by every game in the casinos. The bigger the win, the more
 * of it there is.
 *
 *  tier 1  a small win: a flash of light, a ring across the table, a scatter of confetti and
 *          glints, the amount rising in gold ("+$40"), one buzz in each hand.
 *  tier 2  a good win: more confetti, a wider ring, a run of glitter bells, a double buzz.
 *  tier 3  a big one: a confetti cannon, a banner ("BLACKJACK!", "STRAIGHT UP!") with a shine
 *          sweeping across its letters and light rays turning behind it, a fountain of gold coins
 *          that ring down and settle, a rolling rumble in both hands.
 *
 * A win can be HELD (`hold`, seconds): the banner and its rays stay up and fresh bursts keep popping
 * round the spot until it's over, so a long pay-out (a jackpot's count) is a party all the way
 * through. A TALLY is a big gold number rolling up in the air while a win is counted; when it lands
 * it slams, bursts and floats away.
 *
 * Each game owns one, parented to its own group, so every position here is in that game's frame
 * (floor at y = 0). Confetti settles on whatever `restAt` says is under it (a table top or the
 * floor) and fades there.
 *
 * Draw cost while it plays: confetti, glints and coins are one instanced draw each, plus a sprite
 * or three.
 * All of it is hidden when nothing is playing.
 */

import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Camera,
} from 'three';
import { bigWinHit, winShimmer } from '../audio/sfx.ts';
import { pulseHand } from '../input/haptics.ts';
import { font } from '../ui/fonts.ts';
import { roundRect } from '../ui/panel.ts';

export type Tier = 1 | 2 | 3;

const TAU = Math.PI * 2;
const MAX_CONFETTI = 240;
const MAX_GLINTS = 96;
const MAX_COINS = 90;
const CONFETTI_COLOURS = [0xffd24a, 0xffe9a0, 0xff4fa3, 0x3fe0d0, 0xff8a2a, 0xffffff, 0x8a6cff];

interface Flake {
  p: Vector3;
  v: Vector3;
  rot: Vector3;
  spin: Vector3;
  age: number;
  life: number;
  resting: boolean;
  flutter: number;
  colour: number;
  size: number;
}

interface Glint {
  p: Vector3;
  v: Vector3;
  age: number;
  life: number;
  size: number;
}

interface Coin {
  p: Vector3;
  v: Vector3;
  rot: Vector3;
  spin: Vector3;
  age: number;
  life: number;
  bounced: boolean;
  resting: boolean;
  size: number;
}

/** A win being counted up: the number rolls, then slams and floats off (Celebration.tally). */
export interface Tally {
  /** show this much (it redraws when the dollars change, at most 20 times a second) */
  set(value: number): void;
  /** the count is done: slam, burst, float away */
  land(value: number): void;
}

interface TallyState {
  sprite: Sprite;
  canvas: HTMLCanvasElement;
  tex: CanvasTexture;
  at: Vector3;
  tier: Tier;
  size: number;
  shown: number;
  /** when it last redrew (it rolls at 20 frames a second: a texture upload each) */
  drawnAt: number;
  t: number;
  /** seconds since it landed, or −1 while it's still counting */
  landed: number;
}

interface Riser {
  sprite: Sprite;
  from: Vector3;
  t: number;
  size: number;
  /** how far it floats up (m) */
  lift: number;
}

type SessionFn = () => XRSession | null | undefined;

export class Celebration {
  readonly group = new Group();
  private readonly confetti: InstancedMesh;
  private readonly glints: InstancedMesh;
  private readonly flash: Sprite;
  private readonly ring: Mesh;
  private readonly banner: Sprite;
  private readonly rays: Sprite;
  private readonly coins: InstancedMesh;
  private readonly shine = { value: -1 };
  private flakes: Flake[] = [];
  private coinList: Coin[] = [];
  private tallies: TallyState[] = [];
  private sparks: Glint[] = [];
  private risers: Riser[] = [];
  private flashT = -1;
  private flashSize = 1;
  private ringT = -1;
  private ringSize = 1;
  private bannerT = -1;
  private bannerW = 0.7;
  private bannerHold = 2.55;
  private raysOn = false;
  // a held win: fresh bursts round `holdAt` until `holdT` runs out
  private holdT = 0;
  private holdAt = new Vector3();
  private holdTier: Tier = 1;
  private holdK = 1;
  private nextPop = 0;

  constructor(
    parent: Object3D,
    /** the height confetti settles at over (x, z), in the parent's frame */
    private readonly restAt: (x: number, z: number) => number = () => 0,
    private readonly session: SessionFn = () => null,
  ) {
    parent.add(this.group);
    const glow = glowTexture();

    this.confetti = new InstancedMesh(new PlaneGeometry(0.02, 0.011), new MeshBasicMaterial({ side: DoubleSide, toneMapped: false }), MAX_CONFETTI);
    this.confetti.count = 0;
    this.confetti.frustumCulled = false;
    this.confetti.setColorAt(0, _c.setHex(0xffffff)); // allocates the colour buffer

    this.glints = new InstancedMesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({ map: glow, color: 0xfff0b0, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
      MAX_GLINTS,
    );
    this.glints.count = 0;
    this.glints.frustumCulled = false;
    this.glints.renderOrder = 21;

    this.flash = new Sprite(new SpriteMaterial({ map: glow, color: 0xffe08a, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.flash.visible = false;
    this.flash.renderOrder = 19;

    this.ring = new Mesh(
      new RingGeometry(0.86, 1, 64).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: 0xffd24a, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
    );
    this.ring.visible = false;

    const bannerMat = new SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, toneMapped: false });
    // a band of white light sweeping across the lettering (and only the lettering)
    bannerMat.onBeforeCompile = (sh) => {
      sh.uniforms.uShine = this.shine;
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', 'uniform float uShine;\nvoid main() {')
        .replace(
          '#include <opaque_fragment>',
          `float sd = vMapUv.x + (vMapUv.y - 0.5) * 0.4 - uShine;
          outgoingLight += vec3(1.0, 0.97, 0.85) * exp(-sd * sd * 260.0) * smoothstep(0.35, 0.9, diffuseColor.a) * 0.9;
          #include <opaque_fragment>`,
        );
    };
    this.banner = new Sprite(bannerMat);
    this.banner.visible = false;
    this.banner.renderOrder = 26;

    // light rays turning slowly behind a big banner
    this.rays = new Sprite(new SpriteMaterial({ map: raysTexture(), color: 0xffc640, transparent: true, blending: AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false }));
    this.rays.visible = false;
    this.rays.renderOrder = 24;

    // gold coins: thrown up in a fountain, ringing down and settling
    this.coins = new InstancedMesh(
      new CylinderGeometry(0.016, 0.016, 0.0028, 18),
      new MeshPhongMaterial({ color: 0xffc83a, emissive: 0x8a5800, specular: 0xfff4c0, shininess: 70 }),
      MAX_COINS,
    );
    this.coins.count = 0;
    this.coins.frustumCulled = false;
    this.coins.visible = false;

    this.group.add(this.confetti, this.glints, this.coins, this.flash, this.ring, this.rays, this.banner);
  }

  /**
   * A win at `at` (where the eye should go: the winning hand, the reels, the number).
   * `amount` rises from there in gold if given; `banner` is shown over it for tier 3 (or any
   * tier, if given). `scale` grows all of it for a win seen from further off (a shark alongside).
   * `coins: false` leaves the coins out, for a party that isn't about money (a walk opening).
   * `tint` colours the flash and the ring (a case's grade colour) instead of gold.
   */
  win(opts: { at: Vector3; tier: Tier; amount?: number; banner?: string; bannerAt?: Vector3; quiet?: boolean; scale?: number; hold?: number; coins?: boolean; tint?: number }): void {
    const { at, tier } = opts;
    const k = opts.scale ?? 1;
    this.burst(at, tier, k, opts.coins ?? true, opts.tint);
    if (opts.amount) this.rise(at, opts.amount, tier, k);
    if (opts.banner) this.showBanner(opts.banner, opts.bannerAt ?? at.clone().add(new Vector3(0, 0.34 * k, 0)), k, tier === 3, opts.hold);
    if (opts.hold) this.hold(at, tier, opts.hold, k);
    if (!opts.quiet) {
      winShimmer(tier);
      if (tier === 3) bigWinHit();
    }
    this.buzz(tier);
  }

  /** The light and the confetti on their own (no amount, no sound). */
  burst(at: Vector3, tier: Tier, k = 1, coins = true, tint?: number): void {
    this.flash.material.color.setHex(tint ?? 0xffe08a);
    (this.ring.material as MeshBasicMaterial).color.setHex(tint ?? 0xffd24a);
    // a flash of light where it happened
    this.flashT = 0;
    this.flashSize = [0, 0.5, 0.8, 1.2][tier] * k;
    this.flash.position.copy(at);
    // a ring racing out across the surface below it
    this.ringT = 0;
    this.ringSize = [0, 0.45, 0.8, 1.3][tier] * k;
    this.ring.position.set(at.x, this.restAt(at.x, at.z) + 0.004, at.z);
    // confetti thrown up and out, glints with it, and for the bigger wins a fountain of coins
    const power = [0, 1.3, 1.8, 2.5][tier] * Math.sqrt(k);
    this.spray(at, [0, 26, 70, 150][tier], [0, 14, 30, 60][tier], power, k);
    if (coins) this.fountain(at, [0, 0, 14, 48][tier], k);
  }

  /** Keep the party going round `at` for `seconds`: a fresh pop of confetti and glints every so often. */
  hold(at: Vector3, tier: Tier, seconds: number, k = 1): void {
    this.holdAt.copy(at);
    this.holdTier = tier;
    this.holdT = Math.max(this.holdT, seconds);
    this.holdK = k;
    this.nextPop = 0.45;
  }

  /** Confetti and glints from `at`. */
  private spray(at: Vector3, n: number, g: number, power: number, k: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const out = (0.25 + Math.random() * 0.75) * power * 0.55;
      this.flakes.push({
        p: at.clone().add(new Vector3((Math.random() - 0.5) * 0.08, 0, (Math.random() - 0.5) * 0.08)),
        v: new Vector3(Math.cos(a) * out, power * (0.6 + Math.random() * 0.6), Math.sin(a) * out),
        rot: new Vector3(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU),
        spin: new Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 14),
        age: 0,
        life: 2.4 + Math.random() * 1.4,
        resting: false,
        flutter: Math.random() * TAU,
        colour: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
        size: Math.sqrt(k),
      });
    }
    if (this.flakes.length > MAX_CONFETTI) this.flakes.splice(0, this.flakes.length - MAX_CONFETTI);
    for (let i = 0; i < g; i++) {
      const a = Math.random() * TAU;
      const e = Math.random() * 0.9 + 0.2;
      const s = (0.4 + Math.random() * 0.9) * power * 0.6;
      this.sparks.push({
        p: at.clone(),
        v: new Vector3(Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 0.3, Math.sin(a) * Math.cos(e) * s),
        age: 0,
        life: 0.6 + Math.random() * 0.7,
        size: (0.025 + Math.random() * 0.03) * k,
      });
    }
    if (this.sparks.length > MAX_GLINTS) this.sparks.splice(0, this.sparks.length - MAX_GLINTS);
  }

  /** Gold coins flung up from `at`, tumbling. */
  fountain(at: Vector3, n: number, k = 1): void {
    const up = Math.sqrt(k);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const out = (0.25 + Math.random() * 0.7) * up;
      this.coinList.push({
        p: at.clone(),
        v: new Vector3(Math.cos(a) * out, (2.0 + Math.random() * 1.4) * up, Math.sin(a) * out),
        rot: new Vector3(Math.random() * TAU, Math.random() * TAU, 0),
        spin: new Vector3(8 + Math.random() * 14, (Math.random() - 0.5) * 6, 0),
        age: 0,
        life: 3.2 + Math.random() * 1.2,
        bounced: false,
        resting: false,
        size: k * (0.85 + Math.random() * 0.3),
      });
    }
    if (this.coinList.length > MAX_COINS) this.coinList.splice(0, this.coinList.length - MAX_COINS);
  }

  /**
   * A big gold number over `at` that the caller rolls up (`set`) while it counts a win, and
   * `land`s at the end: it punches up, throws a burst, and floats away.
   */
  tally(at: Vector3, tier: Tier, k = 1): Tally {
    const canvas = document.createElement('canvas');
    canvas.width = 576;
    canvas.height = 168;
    const map = tex(canvas);
    const sprite = new Sprite(new SpriteMaterial({ map, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
    sprite.renderOrder = 27;
    sprite.position.copy(at);
    sprite.scale.set(0.001, 0.001, 1);
    this.group.add(sprite);
    const st: TallyState = { sprite, canvas, tex: map, at: at.clone(), tier, size: [0, 0.1, 0.13, 0.17][tier] * k, shown: -1, drawnAt: -1, t: 0, landed: -1 };
    this.tallies.push(st);
    const draw = (v: number): void => {
      const d = Math.floor(v);
      if (d === st.shown) return;
      st.shown = d;
      st.drawnAt = st.t;
      const g = canvas.getContext('2d')!;
      g.clearRect(0, 0, 576, 168);
      goldText(g, `$${d.toLocaleString('en-US')}`, 288, 88, 128, 555);
      map.needsUpdate = true;
    };
    draw(0);
    return {
      set: (v) => {
        if (st.landed < 0 && st.t - st.drawnAt >= 0.05) draw(v);
      },
      land: (v) => {
        if (st.landed >= 0) return;
        draw(v);
        st.landed = 0;
        this.burst(st.at, tier, k);
      },
    };
  }

  /** "+$120" in gold, popping in at `at` and floating up. */
  rise(at: Vector3, amount: number, tier: Tier, k = 1): void {
    const sprite = new Sprite(new SpriteMaterial({ map: amountTexture(amount), transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
    sprite.renderOrder = 25;
    this.group.add(sprite);
    this.risers.push({ sprite, from: at.clone(), t: 0, size: [0, 0.075, 0.095, 0.12][tier] * k, lift: 0.2 * k });
  }

  showBanner(text: string, at: Vector3, k = 1, rays = false, hold = 0): void {
    const mat = this.banner.material;
    if (mat.map?.name !== text) {
      mat.map?.dispose();
      mat.map = bannerTexture(text);
      mat.map.name = text;
    }
    this.bannerW = 0.72 * k;
    this.banner.position.copy(at);
    this.rays.position.copy(at);
    this.raysOn = rays;
    this.bannerHold = Math.max(2.55, hold);
    this.bannerT = 0;
  }

  /** The win a hold was up for is over: the pops stop, and the banner stays up for the landing, then goes. */
  endHold(): void {
    this.holdT = 0;
    if (this.bannerT >= 0) this.bannerHold = Math.max(0, this.bannerT - 0.25) + 1.5;
  }

  /** A pattern in both hands: one buzz, a double, or a rolling rumble. */
  private buzz(tier: Tier): void {
    const pattern: [number, number, number][] =
      tier === 1
        ? [[0, 0.45, 60]]
        : tier === 2
          ? [
              [0, 0.6, 70],
              [140, 0.6, 70],
            ]
          : [
              [0, 1, 120],
              [180, 0.5, 50],
              [290, 0.7, 50],
              [400, 0.85, 60],
              [520, 1, 160],
            ];
    for (const [ms, k, dur] of pattern)
      window.setTimeout(() => {
        const s = this.session() ?? undefined;
        pulseHand(s, 'left', k, dur);
        pulseHand(s, 'right', k, dur);
      }, ms);
  }

  get busy(): boolean {
    return this.flakes.length > 0 || this.sparks.length > 0 || this.coinList.length > 0 || this.risers.length > 0 || this.tallies.length > 0 || this.flashT >= 0 || this.ringT >= 0 || this.bannerT >= 0 || this.holdT > 0;
  }

  update(dt: number, camera: Camera): void {
    if (!this.busy) {
      this.confetti.visible = this.glints.visible = this.coins.visible = false;
      return;
    }
    this.updateHold(dt);
    this.updateFlash(dt);
    this.updateConfetti(dt);
    this.updateCoins(dt);
    this.updateTallies(dt);
    this.updateGlints(dt, camera);
    this.updateRisers(dt);
    this.updateBanner(dt);
  }

  private updateHold(dt: number): void {
    if (this.holdT <= 0) return;
    this.holdT -= dt;
    this.nextPop -= dt;
    if (this.nextPop > 0 || this.holdT <= 0) return;
    // a pop somewhere round the win: confetti, glints, and on the big ones a few more coins
    const t = this.holdTier;
    const k = this.holdK;
    this.nextPop = t === 3 ? 0.42 + Math.random() * 0.2 : 0.7 + Math.random() * 0.3;
    const at = _v.copy(this.holdAt).add(new Vector3((Math.random() - 0.5) * 0.5 * k, (Math.random() - 0.3) * 0.25 * k, (Math.random() - 0.5) * 0.1 * k));
    const power = (t === 3 ? 1.6 : 1.2) * Math.sqrt(k);
    this.spray(at, t === 3 ? 30 : 14, t === 3 ? 12 : 6, power, k);
    if (t === 3) this.fountain(this.holdAt, 5, k);
  }

  private updateFlash(dt: number): void {
    if (this.flashT >= 0) {
      this.flashT += dt;
      const k = this.flashT / 0.5;
      this.flash.visible = k < 1;
      this.flash.scale.setScalar(this.flashSize * (0.4 + 0.6 * Math.sqrt(Math.min(1, k))));
      this.flash.material.opacity = 0.95 * (1 - k) * (1 - k);
      if (k >= 1) this.flashT = -1;
    }
    if (this.ringT >= 0) {
      this.ringT += dt;
      const k = this.ringT / 0.9;
      this.ring.visible = k < 1;
      const e = 1 - Math.pow(1 - Math.min(1, k), 3);
      this.ring.scale.setScalar(Math.max(0.001, this.ringSize * e));
      (this.ring.material as MeshBasicMaterial).opacity = 0.8 * (1 - k);
      if (k >= 1) this.ringT = -1;
    }
  }

  private updateConfetti(dt: number): void {
    const m = new Matrix4();
    const o = _o;
    let n = 0;
    this.flakes = this.flakes.filter((f) => f.age < f.life);
    for (const f of this.flakes) {
      f.age += dt;
      if (!f.resting) {
        // paper: light, draggy, fluttering side to side on the way down
        f.v.y -= 5.5 * dt;
        f.v.multiplyScalar(Math.exp(-dt * 2.6));
        f.p.addScaledVector(f.v, dt);
        f.p.x += Math.sin(f.age * 7 + f.flutter) * 0.12 * dt;
        f.p.z += Math.cos(f.age * 6 + f.flutter) * 0.12 * dt;
        f.rot.addScaledVector(f.spin, dt);
        const floor = this.restAt(f.p.x, f.p.z) + 0.003;
        if (f.p.y < floor && f.v.y < 0) {
          f.p.y = floor;
          f.resting = true;
          // lie flat where it fell
          f.rot.set(-Math.PI / 2, 0, f.rot.z);
          f.life = Math.min(f.life, f.age + 1.2);
        }
      }
      o.position.copy(f.p);
      o.rotation.set(f.rot.x, f.rot.y, f.rot.z);
      o.scale.setScalar(Math.max(0.001, Math.min(1, (f.life - f.age) / 0.45)) * f.size);
      o.updateMatrix();
      this.confetti.setMatrixAt(n, m.copy(o.matrix));
      this.confetti.setColorAt(n++, _c.setHex(f.colour));
    }
    this.confetti.count = n;
    this.confetti.visible = n > 0;
    this.confetti.instanceMatrix.needsUpdate = true;
    this.confetti.instanceColor!.needsUpdate = true;
  }

  private updateGlints(dt: number, camera: Camera): void {
    const m = new Matrix4();
    const o = _o;
    // glints face the eye: the camera's turn, taken into this group's frame
    this.group.getWorldQuaternion(_q).invert();
    camera.getWorldQuaternion(_q2);
    _q.multiply(_q2);
    let n = 0;
    this.sparks = this.sparks.filter((s) => s.age < s.life);
    for (const s of this.sparks) {
      s.age += dt;
      s.v.y -= 2.2 * dt;
      s.v.multiplyScalar(Math.exp(-dt * 1.6));
      s.p.addScaledVector(s.v, dt);
      const k = s.age / s.life;
      // twinkle: a quick shimmer on a shrinking glint
      const tw = 0.6 + 0.4 * Math.sin(s.age * 40 + s.size * 900);
      o.position.copy(s.p);
      o.quaternion.copy(_q);
      o.scale.setScalar(Math.max(0.001, s.size * (1 - k) * tw));
      o.updateMatrix();
      this.glints.setMatrixAt(n++, m.copy(o.matrix));
    }
    this.glints.count = n;
    this.glints.visible = n > 0;
    this.glints.instanceMatrix.needsUpdate = true;
  }

  private updateCoins(dt: number): void {
    const m = new Matrix4();
    const o = _o;
    let n = 0;
    this.coinList = this.coinList.filter((c) => c.age < c.life);
    for (const c of this.coinList) {
      c.age += dt;
      if (!c.resting) {
        c.v.y -= 9.8 * dt;
        c.v.multiplyScalar(Math.exp(-dt * 0.4));
        c.p.addScaledVector(c.v, dt);
        c.rot.addScaledVector(c.spin, dt);
        const floor = this.restAt(c.p.x, c.p.z) + 0.0016 * c.size;
        if (c.p.y < floor && c.v.y < 0) {
          c.p.y = floor;
          if (!c.bounced && c.v.y < -1) {
            // one ring off the surface, then it lies down
            c.bounced = true;
            c.v.set(c.v.x * 0.4, -c.v.y * 0.28, c.v.z * 0.4);
            c.spin.multiplyScalar(0.5);
          } else {
            c.resting = true;
            c.rot.set(0, c.rot.y, 0);
            c.life = Math.min(c.life, c.age + 1.4);
          }
        }
      }
      o.position.copy(c.p);
      o.rotation.set(c.rot.x, c.rot.y, c.rot.z);
      o.scale.setScalar(Math.max(0.001, Math.min(1, (c.life - c.age) / 0.4)) * c.size);
      o.updateMatrix();
      this.coins.setMatrixAt(n++, m.copy(o.matrix));
    }
    this.coins.count = n;
    this.coins.visible = n > 0;
    this.coins.instanceMatrix.needsUpdate = true;
  }

  private updateTallies(dt: number): void {
    this.tallies = this.tallies.filter((st) => {
      st.t += dt;
      const s = st.sprite;
      let k: number;
      let y = st.at.y;
      if (st.landed < 0) {
        // it pops in, then swells a little as the count climbs, with a heartbeat throb
        k = (st.t < 0.3 ? easeOutBack(st.t / 0.3) : 1) * (0.85 + 0.15 * Math.min(1, st.t / 4)) * (1 + 0.03 * Math.sin(st.t * 14));
      } else {
        st.landed += dt;
        const l = st.landed;
        // slam: up past size and back, hold, then off upward and out
        k = l < 0.35 ? 1 + 0.35 * Math.sin((l / 0.35) * Math.PI) : 1;
        if (l > 2.2) {
          const f = Math.min(1, (l - 2.2) / 0.8);
          y += 0.25 * st.size * 3 * f * f;
          s.material.opacity = 1 - f;
          if (f >= 1) {
            this.group.remove(s);
            st.tex.dispose();
            s.material.dispose();
            return false;
          }
        }
      }
      s.position.set(st.at.x, y, st.at.z);
      s.scale.set(st.size * (576 / 168) * k, st.size * k, 1);
      return true;
    });
  }

  private updateRisers(dt: number): void {
    this.risers = this.risers.filter((r) => {
      r.t += dt;
      const t = r.t;
      const LIFE = 2.4;
      if (t >= LIFE) {
        this.group.remove(r.sprite);
        r.sprite.material.map?.dispose();
        r.sprite.material.dispose();
        return false;
      }
      const pop = t < 0.3 ? easeOutBack(t / 0.3) : 1;
      const rise = 0.3 * r.lift + r.lift * (1 - Math.pow(1 - Math.min(1, t / LIFE), 2));
      r.sprite.position.set(r.from.x, r.from.y + rise, r.from.z);
      r.sprite.scale.set(r.size * 3.2 * pop, r.size * pop, 1);
      r.sprite.material.opacity = t > LIFE - 0.6 ? (LIFE - t) / 0.6 : 1;
      return true;
    });
  }

  private updateBanner(dt: number): void {
    if (this.bannerT < 0) {
      this.banner.visible = false;
      return;
    }
    this.bannerT += dt;
    const s = this.bannerT;
    const end = 0.25 + this.bannerHold;
    // punch in, hold with a throb, shrink away
    const k = s < 0.25 ? easeOutBack(s / 0.25) : s < end ? 1 + 0.05 * Math.sin(s * 10) : Math.max(0, 1 - (s - end) / 0.3);
    this.banner.visible = k > 0.001;
    this.banner.scale.set(this.bannerW * k, (this.bannerW / 3) * k, 1);
    // the shine crosses the letters every 1.4 s
    this.shine.value = s < 0.2 ? -1 : -0.3 + (((s - 0.2) % 1.4) / 1.0) * 1.6;
    // the rays open out behind it and turn
    this.rays.visible = this.raysOn && this.banner.visible;
    if (this.rays.visible) {
      const r = this.bannerW * 1.5 * Math.min(1, k * 1.1);
      this.rays.scale.set(r, r, 1);
      this.rays.material.rotation = s * 0.35;
      this.rays.material.opacity = 0.55 * Math.min(1, s / 0.4) * Math.min(1, k) * (0.85 + 0.15 * Math.sin(s * 3));
    }
    if (s > end + 0.3) {
      this.bannerT = -1;
      this.banner.visible = this.rays.visible = false;
    }
  }
}

function easeOutBack(x: number): number {
  const c1 = 2.2;
  return 1 + (c1 + 1) * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

const _o = new Object3D();
const _v = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _c = new Color();

/* ── art ──────────────────────────────────────────────────────────── */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

let glow: CanvasTexture | null = null;
function glowTexture(): CanvasTexture {
  if (glow) return glow;
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glow = tex(c);
  return glow;
}

/** Gold lettering with a dark outline and a warm glow. */
function goldText(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, maxW: number): void {
  const grad = g.createLinearGradient(0, y - size * 0.55, 0, y + size * 0.45);
  grad.addColorStop(0, '#fff8c8');
  grad.addColorStop(0.5, '#ffc93a');
  grad.addColorStop(1, '#e0700f');
  g.font = font(700, size);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = size * 0.14;
  g.strokeStyle = '#3a1004';
  g.strokeText(text, x, y, maxW);
  g.shadowColor = '#ffb000';
  g.shadowBlur = size * 0.2;
  g.fillStyle = grad;
  g.fillText(text, x, y, maxW);
  g.shadowBlur = 0;
}

function amountTexture(amount: number): CanvasTexture {
  const [c, g] = canvas(512, 160);
  goldText(g, `+$${Math.round(amount).toLocaleString('en-US')}`, 256, 84, 118, 490);
  return tex(c);
}

function bannerTexture(text: string): CanvasTexture {
  const [c, g] = canvas(768, 256);
  goldText(g, text, 384, 136, 150, 740);
  return tex(c);
}

let rays: CanvasTexture | null = null;
/** Sixteen soft rays from the middle, fading out toward the edge (white: tint it with the material). */
export function raysTexture(): CanvasTexture {
  if (rays) return rays;
  const [c, g] = canvas(256, 256);
  g.translate(128, 128);
  for (let i = 0; i < 16; i++) {
    g.rotate(TAU / 16);
    const w = i % 2 ? 0.07 : 0.12;
    const grad = g.createLinearGradient(0, 0, 128, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(128, -128 * w);
    g.lineTo(128, 128 * w);
    g.closePath();
    g.fill();
  }
  // a soft core, so the middle glows behind the lettering
  const core = g.createRadialGradient(0, 0, 0, 0, 0, 70);
  core.addColorStop(0, 'rgba(255,255,255,0.6)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = core;
  g.fillRect(-128, -128, 256, 256);
  rays = tex(c);
  return rays;
}

let plate: CanvasTexture | null = null;
/** A soft light for a winning spot or hand, laid flat on the felt: bright through the middle, feathered at the edges. */
export function glowPlate(): CanvasTexture {
  if (plate) return plate;
  const [c, g] = canvas(128, 128);
  g.filter = 'blur(10px)';
  g.fillStyle = '#ffffff';
  roundRect(g, 22, 22, 84, 84, 14);
  g.fill();
  g.filter = 'none';
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 5;
  roundRect(g, 24, 24, 80, 80, 12);
  g.stroke();
  plate = tex(c);
  return plate;
}
