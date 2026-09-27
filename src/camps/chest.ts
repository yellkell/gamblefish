/**
 * The dancers' chest: the carpenter's iron-bound sea chest (village/wares/builder.ts, the one
 * for the foot of your bed), built in two so its barrel lid swings up on its hinge. Inside it's
 * hollow and lined in red velvet, with the chest's logs lying in the bottom (setLogs); open, a
 * soft warm glow comes up out of it.
 *
 * Chest-local frame: the front faces +z. A touch bigger than the shack's, about 0.94 m wide.
 */

import { AdditiveBlending, CanvasTexture, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import type { Kit } from '../village/craft.ts';
import { SEA_CHEST, SEA_CHEST_FLOOR, SEA_CHEST_WALL, seaChestParts } from '../village/wares/builder.ts';

/** the camp chests beside the shack's */
const SCALE = 1.15;
/** how far the lid swings open (radians) */
const OPEN = 1.95;
/** the most logs drawn lying in the bottom */
const MAX_LOGS = 5;
let logMat: MeshLambertMaterial | null = null;
let cutMat: MeshLambertMaterial | null = null;
let glowMap: CanvasTexture | null = null;

/** A soft warm light, brightest in the middle, gone at the edges (not a flat sheet of colour). */
function glowTexture(): CanvasTexture {
  if (glowMap) return glowMap;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255, 196, 110, 1)');
  grad.addColorStop(0.45, 'rgba(255, 150, 60, 0.45)');
  grad.addColorStop(1, 'rgba(255, 120, 40, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowMap = new CanvasTexture(c);
  glowMap.colorSpace = SRGBColorSpace;
  return glowMap;
}

/** the chest's height with its lid down (m), for whatever stands over it */
export const CHEST_H = (SEA_CHEST.H + SEA_CHEST.D * 0.21) * SCALE;

export class Chest {
  readonly group = new Group();
  /** the lid, pivoting on the hinge */
  private readonly lid = new Group();
  private readonly glow: Mesh;
  /** the logs lying in the bottom */
  private readonly logs: Mesh[] = [];
  /** 0 shut .. 1 open, and where it's heading */
  private k = 0;
  private want = 0;

  constructor(kit: Kit) {
    this.group.name = 'camp-chest';
    const { W, D, H } = SEA_CHEST;
    const inner = new Group();
    inner.scale.setScalar(SCALE);
    this.group.add(inner);
    const parts = seaChestParts(kit);
    inner.add(parts.body);
    this.lid.position.copy(parts.hinge);
    this.lid.add(parts.lid);
    inner.add(this.lid);
    // the glow off what's inside, rising out of it
    this.glow = new Mesh(
      new PlaneGeometry(W * 0.95, D * 1.5).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.glow.position.y = H - 0.05;
    this.glow.renderOrder = 3;
    inner.add(this.glow);
    // the logs, lying across the floor on the velvet, the top ones on the bottom ones
    logMat ??= new MeshLambertMaterial({ color: 0x8a6440 });
    cutMat ??= new MeshLambertMaterial({ color: 0xd8b88a });
    const len = W - SEA_CHEST_WALL * 2 - 0.03;
    const r = 0.036;
    const logGeo = new CylinderGeometry(r, r * 1.05, len, 9).rotateZ(Math.PI / 2);
    const lie: [number, number][] = [
      [-0.1, 0],
      [0, 0],
      [0.1, 0],
      [-0.05, 1],
      [0.05, 1],
    ];
    for (let i = 0; i < MAX_LOGS; i++) {
      const [z, row] = lie[i];
      const m = new Mesh(logGeo, [logMat, cutMat, cutMat]);
      m.position.set((i % 2 ? 1 : -1) * 0.012, SEA_CHEST_FLOOR + r + row * r * 1.75, z);
      m.rotation.x = i * 1.7;
      m.visible = false;
      inner.add(m);
      this.logs.push(m);
    }
  }

  /** How many logs are in it (up to a handful shown). */
  setLogs(n: number): void {
    const shown = n <= 0 ? 0 : Math.min(MAX_LOGS, 1 + Math.floor(n / 4));
    this.logs.forEach((m, i) => (m.visible = i < shown));
  }

  get open(): boolean {
    return this.want > 0;
  }

  set open(on: boolean) {
    this.want = on ? 1 : 0;
  }

  /** the lid's travel, 0 shut .. 1 open */
  get amount(): number {
    return this.k;
  }

  update(dt: number, time: number): void {
    // up with a swing, a little bounce at the top; down with a clap
    const speed = this.want > this.k ? 3.2 : 4.5;
    this.k += Math.sign(this.want - this.k) * Math.min(Math.abs(this.want - this.k), dt * speed);
    const e = this.want > 0 ? 1 - Math.pow(1 - this.k, 3) + Math.sin(this.k * Math.PI) * 0.04 : this.k * this.k;
    this.lid.rotation.x = -OPEN * e;
    (this.glow.material as MeshBasicMaterial).opacity = this.k * (0.5 + 0.12 * Math.sin(time * 5.1) * Math.sin(time * 3.3));
  }
}
