/**
 * What a win looks like, shared by every game in the casinos. The bigger the win, the more
 * of it there is.
 *
 *  tier 1  a small win: a flash of light, a ring across the table, a scatter of confetti and
 *          glints, the amount rising in gold ("+$40"), one buzz in each hand.
 *  tier 2  a good win: more confetti, a wider ring, a run of glitter bells, a double buzz.
 *  tier 3  a big one: a confetti cannon, a banner ("BLACKJACK!", "STRAIGHT UP!"), a rolling
 *          rumble in both hands.
 *
 * Each game owns one, parented to its own group, so every position here is in that game's frame
 * (floor at y = 0). Confetti settles on whatever `restAt` says is under it (a table top or the
 * floor) and fades there.
 *
 * Draw cost while it plays: confetti and glints are one instanced draw each, plus a sprite or two.
 * All of it is hidden when nothing is playing.
 */

import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
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

export type Tier = 1 | 2 | 3;

const TAU = Math.PI * 2;
const MAX_CONFETTI = 240;
const MAX_GLINTS = 96;
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
  private flakes: Flake[] = [];
  private sparks: Glint[] = [];
  private risers: Riser[] = [];
  private flashT = -1;
  private flashSize = 1;
  private ringT = -1;
  private ringSize = 1;
  private bannerT = -1;
  private bannerW = 0.7;

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

    this.banner = new Sprite(new SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
    this.banner.visible = false;
    this.banner.renderOrder = 26;

    this.group.add(this.confetti, this.glints, this.flash, this.ring, this.banner);
  }

  /**
   * A win at `at` (where the eye should go: the winning hand, the reels, the number).
   * `amount` rises from there in gold if given; `banner` is shown over it for tier 3 (or any
   * tier, if given). `scale` grows all of it for a win seen from further off (a shark alongside).
   */
  win(opts: { at: Vector3; tier: Tier; amount?: number; banner?: string; bannerAt?: Vector3; quiet?: boolean; scale?: number }): void {
    const { at, tier } = opts;
    const k = opts.scale ?? 1;
    this.burst(at, tier, k);
    if (opts.amount) this.rise(at, opts.amount, tier, k);
    if (opts.banner) this.showBanner(opts.banner, opts.bannerAt ?? at.clone().add(new Vector3(0, 0.34 * k, 0)), k);
    if (!opts.quiet) {
      winShimmer(tier);
      if (tier === 3) bigWinHit();
    }
    this.buzz(tier);
  }

  /** The light and the confetti on their own (no amount, no sound). */
  burst(at: Vector3, tier: Tier, k = 1): void {
    // a flash of light where it happened
    this.flashT = 0;
    this.flashSize = [0, 0.5, 0.8, 1.2][tier] * k;
    this.flash.position.copy(at);
    // a ring racing out across the surface below it
    this.ringT = 0;
    this.ringSize = [0, 0.45, 0.8, 1.3][tier] * k;
    this.ring.position.set(at.x, this.restAt(at.x, at.z) + 0.004, at.z);
    // confetti thrown up and out, glints with it
    const n = [0, 26, 70, 150][tier];
    const power = [0, 1.3, 1.8, 2.5][tier] * Math.sqrt(k);
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
    const g = [0, 14, 30, 60][tier];
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

  /** "+$120" in gold, popping in at `at` and floating up. */
  rise(at: Vector3, amount: number, tier: Tier, k = 1): void {
    const sprite = new Sprite(new SpriteMaterial({ map: amountTexture(amount), transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
    sprite.renderOrder = 25;
    this.group.add(sprite);
    this.risers.push({ sprite, from: at.clone(), t: 0, size: [0, 0.075, 0.095, 0.12][tier] * k, lift: 0.2 * k });
  }

  showBanner(text: string, at: Vector3, k = 1): void {
    const mat = this.banner.material;
    if (mat.map?.name !== text) {
      mat.map?.dispose();
      mat.map = bannerTexture(text);
      mat.map.name = text;
    }
    this.bannerW = 0.72 * k;
    this.banner.position.copy(at);
    this.bannerT = 0;
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
    return this.flakes.length > 0 || this.sparks.length > 0 || this.risers.length > 0 || this.flashT >= 0 || this.ringT >= 0 || this.bannerT >= 0;
  }

  update(dt: number, camera: Camera): void {
    if (!this.busy) {
      this.confetti.visible = this.glints.visible = false;
      return;
    }
    this.updateFlash(dt);
    this.updateConfetti(dt);
    this.updateGlints(dt, camera);
    this.updateRisers(dt);
    this.updateBanner(dt);
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
    // punch in, hold with a throb, shrink away
    const k = s < 0.25 ? easeOutBack(s / 0.25) : s < 2.8 ? 1 + 0.05 * Math.sin(s * 10) : Math.max(0, 1 - (s - 2.8) / 0.3);
    this.banner.visible = k > 0.001;
    this.banner.scale.set(this.bannerW * k, (this.bannerW / 3) * k, 1);
    if (s > 3.1) this.bannerT = -1;
  }
}

function easeOutBack(x: number): number {
  const c1 = 2.2;
  return 1 + (c1 + 1) * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

const _o = new Object3D();
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
