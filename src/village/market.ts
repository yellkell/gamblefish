/**
 * Joe's fish market, on the plaza stall (village role `stall`) — the casinos in sight of it.
 *
 * Joe (Tidewater's Rocketbox fish buyer) stands behind the counter. At the counter's end is a
 * hanging-dial scale: hold a fish over its pan — straight from your hand, or lifted out of the
 * backpack — and a ghost settles on it with its price. Click: the fish drops on the pan, the dial
 * swings to its weight, the price pops, and it's sold — coins in the bowl, ff2's cash chime (up),
 * the wrist counters roll. Then Joe slides it onto the ice.
 *
 * The board above the counter has SELL ALL (everything in the backpack) and Joe's two cents.
 */

import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Camera,
  type Scene,
} from 'three';
import { MIX, shot } from '../audio/samples.ts';
import { backpackView, type DropTarget } from '../backpack/BackpackSystem.ts';
import type { Piece } from '../backpack/logic.ts';
import { TIERS } from '../backpack/logic.ts';
import type { GameState } from '../fishing/tidewater.ts';
import { font } from '../ui/fonts.ts';
import { INK, roundRect } from '../ui/panel.ts';
import { InteractivePanel, register } from '../ui/pointer.ts';
import { Character } from './characters.ts';
import type { BuildingFrame } from './signs.ts';

const LINES = {
  hello: ["Fresh catch? Put it on the scale.", 'Let me weigh that for you.', "What've you got for me today?"],
  sold: ['Now that is a fish.', "I'll give you a fair price.", 'Good eating, that one.', 'Straight on the ice.'],
  silver: ['Silver! The restaurants love these.'],
  gold: ['Gold? Where do you FIND these?'],
  legendary: ["I... I've never seen one like it."],
  empty: ['Nothing to sell? The fish are biting off the pier.'],
  all: ['The whole lot? Pleasure doing business.'],
};
const pick = (a: string[]): string => a[Math.floor(Math.random() * a.length)];

export class FishMarket {
  readonly group = new Group();
  private readonly joe: Character;
  private readonly panel: InteractivePanel;
  private readonly scalePan = new Group();
  private readonly needle: Mesh;
  private needleAngle = 0;
  private needleTarget = 0;
  private needleVel = 0;
  private readonly target: DropTarget;
  private line = pick(LINES.hello);
  private readonly anims: { t: number; dur: number; step: (k: number) => void; done?: () => void }[] = [];

  constructor(
    scene: Scene,
    stall: BuildingFrame,
    private readonly state: GameState,
  ) {
    const g0 = stall.floorY;
    this.group.position.set(stall.x, 0, stall.z);
    this.group.rotation.y = stall.yaw;
    scene.add(this.group);
    const local = (x: number, y: number, z: number): Vector3 => this.group.localToWorld(new Vector3(x, y, z));
    this.group.updateMatrixWorld(true);

    // Joe behind the counter, facing the path
    const joePos = local(-0.35, g0, -0.15);
    this.joe = new Character(`${import.meta.env.BASE_URL}models/characters/joe.glb`, joePos.x, joePos.y, joePos.z, stall.yaw);
    scene.add(this.joe.group);

    // the scale: a post, a dial, and a pan hanging at counter height
    const steel = new MeshLambertMaterial({ color: 0x9aa0a2 });
    // on its own fish crate just past the counter's end, where nothing crowds the pan
    const crate = new Mesh(new BoxGeometry(0.5, 0.86, 0.45), new MeshLambertMaterial({ color: 0x8a6a48 }));
    crate.position.set(2.0, g0 + 0.43, 0.7);
    this.group.add(crate);
    const scale = new Group();
    scale.position.set(2.0, g0 + 0.88, 0.72);
    const post = new Mesh(new BoxGeometry(0.04, 0.55, 0.04), steel);
    post.position.set(0, 0.3, -0.18);
    const arm = new Mesh(new BoxGeometry(0.04, 0.04, 0.22), steel);
    arm.position.set(0, 0.56, -0.08);
    const dial = new Mesh(new CylinderGeometry(0.11, 0.11, 0.025, 28), new MeshLambertMaterial({ map: dialTexture(), color: 0xffffff }));
    dial.rotation.x = Math.PI / 2;
    dial.position.set(0, 0.42, -0.16);
    this.needle = new Mesh(new BoxGeometry(0.008, 0.09, 0.004), new MeshBasicMaterial({ color: 0xc23b2e }));
    this.needle.geometry.translate(0, 0.04, 0);
    this.needle.position.set(0, 0.42, -0.144);
    const pan = new Mesh(new CylinderGeometry(0.2, 0.16, 0.03, 28), steel);
    this.scalePan.add(pan);
    this.scalePan.position.set(0, 0.06, 0.02);
    scale.add(post, arm, dial, this.needle, this.scalePan);
    this.group.add(scale);

    // the board: Joe's words, what your backpack's worth, SELL ALL
    this.panel = new InteractivePanel([640, 300], [0.9, 0.42]);
    this.panel.mesh.position.set(-0.6, g0 + 1.85, 1.1);
    this.panel.mesh.rotation.x = -0.12;
    this.group.add(this.panel.mesh);
    this.panel.paint = () => this.paint();
    this.panel.onClick = (id) => {
      if (id === 'all') this.sellAll();
    };
    register(this.panel);
    this.paint();

    // the pan takes fish
    this.group.updateMatrixWorld(true);
    this.target = {
      position: this.scalePan.getWorldPosition(new Vector3()),
      radius: 0.4,
      colour: 0xffb000,
      label: (p: Piece) => `SELL · $${p.value}`,
      accept: (p, fish) => this.weighAndSell(p, fish),
    };
    backpackView.targets.add(this.target);
    state.onChange(() => this.paint());
  }

  private paint(): void {
    const c = this.panel.ctx;
    const inv = this.state.inventory as unknown as Piece[];
    const placed = inv.filter((f) => f.placed);
    const worth = placed.reduce((a, f) => a + f.value, 0);
    this.panel.clear();
    roundRect(c, 4, 4, 632, 292, 22);
    c.fillStyle = 'rgba(24, 18, 12, 0.92)';
    c.fill();
    c.lineWidth = 4;
    c.strokeStyle = '#b89a72';
    c.stroke();
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    c.font = font(700, 40);
    c.fillStyle = '#f6ecd4';
    c.fillText("JOE'S FISH MARKET", 28, 58);
    c.font = font(500, 26);
    c.fillStyle = INK.dim;
    c.fillText(`“${this.line}”`, 28, 102, 584);
    c.font = font(600, 24);
    c.fillStyle = INK.hot;
    c.fillText(placed.length ? `In your backpack: ${placed.length} fish, worth $${worth}` : 'Your backpack is empty.', 28, 150);
    c.font = font(500, 20);
    c.fillStyle = INK.dim;
    c.fillText('Hold a fish over the scale and click to sell it.', 28, 184);
    // SELL ALL
    const on = placed.length > 0;
    const b = { id: 'all', x: 28, y: 206, w: 584, h: 68, enabled: on };
    this.panel.buttons = [b];
    roundRect(c, b.x, b.y, b.w, b.h, 14);
    c.fillStyle = !on ? 'rgba(255,255,255,0.06)' : this.panel.hover === 'all' ? '#ffc640' : INK.amber;
    c.fill();
    c.font = font(700, 32);
    c.textAlign = 'center';
    c.fillStyle = on ? '#1a1206' : INK.dim;
    c.fillText(on ? `SELL ALL  ·  $${worth}` : 'SELL ALL', b.x + b.w / 2, b.y + 45);
    this.panel.commit();
  }

  /** The fish drops on the pan, the dial swings to its weight, the price pops: sold. */
  private weighAndSell(p: Piece, fish: Mesh): void {
    const from = fish.position.clone();
    const to = this.scalePan.getWorldPosition(new Vector3()).add(new Vector3(0, 0.05, 0));
    const len = Math.min(0.9, p.cm / 100) * 0.8;
    const s0 = fish.scale.x;
    this.joe.talking = true;
    this.anims.push({
      t: 0,
      dur: 0.3,
      step: (k) => {
        const e = 1 - Math.pow(1 - k, 3);
        fish.position.lerpVectors(from, to, e);
        fish.position.y += Math.sin(k * Math.PI) * 0.08;
        fish.scale.setScalar(s0 + (len - s0) * e);
      },
      done: () => {
        shot('fish_flop', MIX.fishFlop + 2, { rate: 1.05, slice: 1 });
        this.needleTarget = Math.min(1, p.kg / 20) * Math.PI * 1.6;
        this.needleVel = 6;
        window.setTimeout(() => {
          const r = this.state.sell([p.id]);
          shot('coins', MIX.coins, { rate: 1 });
          this.line = p.tier === 3 ? pick(LINES.legendary) : p.tier === 2 ? pick(LINES.gold) : p.tier === 1 ? pick(LINES.silver) : pick(LINES.sold);
          this.pop(`+$${r.total}${p.tier ? `  ${TIERS[p.tier].toUpperCase()}` : ''}`, to);
          this.paint();
          // onto the ice
          window.setTimeout(() => {
            this.needleTarget = 0;
            this.anims.push({
              t: 0,
              dur: 0.45,
              step: (k) => {
                fish.position.x = to.x - k * 0.9;
                fish.scale.setScalar(len * (1 - k));
              },
              done: () => {
                fish.parent?.remove(fish);
                this.joe.talking = false;
              },
            });
          }, 700);
        }, 450);
      },
    });
  }

  private sellAll(): void {
    const inv = this.state.inventory as unknown as Piece[];
    const ids = inv.filter((f) => f.placed).map((f) => f.id);
    if (!ids.length) {
      this.line = pick(LINES.empty);
      this.paint();
      return;
    }
    const r = this.state.sell(ids);
    shot('coins', MIX.coins + 2, { rate: 0.95 });
    shot('coins', MIX.coins - 2, { rate: 1.1, delay: 0.25 });
    this.line = pick(LINES.all);
    this.pop(`+$${r.total}`, this.scalePan.getWorldPosition(new Vector3()));
    this.joe.talking = true;
    window.setTimeout(() => (this.joe.talking = false), 2500);
    this.paint();
  }

  private pop(text: string, at: Vector3): void {
    const s = priceTag(text);
    s.position.copy(at).y += 0.15;
    this.group.parent?.add(s);
    this.anims.push({
      t: 0,
      dur: 1.6,
      step: (k) => {
        s.position.y = at.y + 0.15 + k * 0.25;
        const sc = k < 0.15 ? k / 0.15 : 1;
        s.scale.set(0.34 * sc, 0.085 * sc, 1);
        (s.material as SpriteMaterial).opacity = 1 - Math.max(0, k - 0.6) / 0.4;
      },
      done: () => s.parent?.remove(s),
    });
  }

  update(dt: number, camera: Camera): void {
    this.joe.update(dt, camera);
    // the dial: a spring toward the weight, overshooting a little like a real one
    this.needleVel += ((this.needleTarget - this.needleAngle) * 60 - this.needleVel * 7) * dt;
    this.needleAngle += this.needleVel * dt;
    this.needle.rotation.z = -this.needleAngle;
    for (const a of [...this.anims]) {
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      a.step(k);
      if (k >= 1) {
        this.anims.splice(this.anims.indexOf(a), 1);
        a.done?.();
      }
    }
  }
}

function dialTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2efe6';
  g.beginPath();
  g.arc(128, 128, 124, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#202020';
  g.lineWidth = 3;
  for (let i = 0; i <= 20; i++) {
    const a = -Math.PI / 2 + (i / 20) * Math.PI * 1.6 - Math.PI * 0.8 + Math.PI / 2;
    g.beginPath();
    g.moveTo(128 + Math.sin(a) * 100, 128 - Math.cos(a) * 100);
    g.lineTo(128 + Math.sin(a) * (i % 5 ? 110 : 116), 128 - Math.cos(a) * (i % 5 ? 110 : 116));
    g.stroke();
  }
  g.font = 'bold 28px sans-serif';
  g.fillStyle = '#c23b2e';
  g.textAlign = 'center';
  g.fillText('kg', 128, 190);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function priceTag(text: string): Sprite {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.font = font(700, 64);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 12;
  g.strokeStyle = 'rgba(0,0,0,0.8)';
  g.strokeText(text, 256, 64, 490);
  g.shadowColor = '#ffb000';
  g.shadowBlur = 20;
  g.fillStyle = '#ffd24a';
  g.fillText(text, 256, 64, 490);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  const s = new Sprite(new SpriteMaterial({ map: t, transparent: true, depthTest: false, toneMapped: false }));
  s.renderOrder = 35;
  s.scale.set(0.01, 0.01, 1);
  return s;
}
