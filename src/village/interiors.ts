/**
 * Walk-in buildings. Tidewater's houses are closed boxes; the ones with a role you visit inside
 * (casinos, counter shops, your shack, Coral's villa) are opened up in place:
 *
 *  - COLLISION: the house's solid body collider is swapped for four walls with a gap at its real
 *    front door, and a walkable floor inside at the house's floor height. The ff2 teleport rules
 *    don't change — you arc through the doorway onto the floor like onto any deck.
 *  - THE ROOM: a lit shell just inside the exterior walls — plank floor (a patterned carpet in
 *    the casinos), painted walls, ceiling, a light flush on the ceiling — so from inside you see the room, not
 *    the backs of Tidewater's walls. Its front wall has the doorway, and through it you see the
 *    island. The light is baked into the room's own textures (a warm pool under the lamp, the
 *    walls glowing toward the middle and falling off to the corners): unlit materials, so the
 *    ceiling light costs nothing on the headset.
 *  - THE DOORWAY is real: the bake cuts it in the house's front wall and leaves the door out
 *    (tools/bake-world.mjs), and the room lines it through the wall. From outside you see into
 *    the lit room; from inside, out to the island.
 *
 * Each interior has a `contents` group in the building's own frame (x across the facade, +z out
 * of the front, y = 0 on the floor) for whatever lives there: tables, counters, people.
 */

import {
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { BoxCollider } from '../world/data.ts';
import { ROLES, type BuildingRole } from './roles.ts';
import type { BuildingFrame } from './signs.ts';

/** storey height (Tidewater Buildings.js) */
const STOREY = 2.75;
/** the inner shell sits this far inside the exterior walls */
const INSET = 0.17;
/** Tidewater's wall thickness (Buildings.js: the walls are 0.14 m boxes inside the front face) */
const WALL_T = 0.14;
/** the gap left in the walls' colliders at the door (a little wider than you see: forgiving aim) */
const DOOR_W = 1.1;
/**
 * The doorway itself: Tidewater's door size (Buildings.js doorUnit dw × dh). The bake cuts this
 * opening in the house's front wall and leaves the door out (tools/bake-world.mjs); the room's
 * shell has the same opening, lined through the wall.
 */
export const DOOR_OPENING = { w: 0.92, h: 2.08 };

export interface Interior {
  name: string;
  frame: BuildingFrame;
  role: BuildingRole;
  /** world-placed group at the building (rotated with it); `contents` is on its floor */
  group: Group;
  contents: Group;
  /** the ceiling light (a room's fittings may move it out of the way) */
  lamp: Group;
  /** inner size (m): across the facade, front to back, floor to ceiling */
  w: number;
  d: number;
  h: number;
  /** is the world point (x, z) inside the room? */
  inside(x: number, z: number): boolean;
  /** world position of a point in the room's frame (floor at y = 0) */
  toWorld(lx: number, ly: number, lz: number, out?: Vector3): Vector3;
  /**
   * Could an eye at (x, z) see anything of the room? Only from inside it, or through the doorway:
   * from in front of the house, and not from across the village. (Its windows are Tidewater's
   * glass over the room's walls, so the doorway is the only way in for the eye.)
   */
  seenFrom(x: number, z: number): boolean;
}

/** how far off you can still make out a room through its doorway (m) */
const SEEN_WITHIN = 24;

/**
 * Furniture you can't stand in (tables, counters), per building, in the room's floor frame:
 * [x, z, half-width, half-depth, height]. The games place their meshes to match.
 */
export const FURNITURE: Record<string, [number, number, number, number, number][]> = {
  C: [[0.03, -0.6, 1.72, 0.55, 0.95]], // the roulette table and wheel (casino/RouletteTable TABLE, at z −0.6)
  B: [[0, -1.8, 2.05, 0.33, 1.9]], // three slot machines along the back wall
  G: [[0, -0.74, 1.06, 0.52, 0.95]], // the blackjack table (half-round, dealer's edge at z −1.25)
  H: [[0, -0.55, 1.74, 0.33, 1.07]], // the teller's counter (village/bank.ts)
  L: [[0, -2.12, 1.05, 0.42, 0.9]], // Coral's sofa against the back wall (village/villa.ts)
};

/** the shops that sell things for your shack (village/homeGoods.ts), and your shack */
export const HOME_SHOPS = ['F', 'D', 'K', 'J'] as const;
/** the shops that sell things for Coral's villa (village/homeGoods.ts), and the villa */
export const VILLA_SHOPS = ['A', 'E'] as const;
export type HomeShop = (typeof HOME_SHOPS)[number] | (typeof VILLA_SHOPS)[number];
export const HOME = 'S1';
export const VILLA = 'L';
/** the shops that sell gear (village/gearShop.ts, fishing/gear.ts GEAR_SHOPS) */
export const GEAR_COUNTERS = ['S3', 'S2', 'N'] as const;
/** every shop with a counter across the back and a board behind it */
export const COUNTER_SHOPS: readonly string[] = [...HOME_SHOPS, ...VILLA_SHOPS, ...GEAR_COUNTERS];

/** a home shop's counter in its room's frame, from the room's inner depth: [x, z, half-w, half-d, height] */
export function shopCounter(innerD: number): [number, number, number, number, number] {
  return [0, -innerD / 2 + 0.75, 1.2, 0.3, 0.95];
}

/** Roles you go inside. */
export function hasInterior(name: string): boolean {
  const r = ROLES[name];
  if (!r) return false;
  if (name === 'stall' || name === 'boathouse') return false;
  return r.role === 'casino' || r.role === 'shop' || r.role === 'home' || r.role === 'love';
}

function frameToWorld(b: BuildingFrame, lx: number, ly: number, lz: number, out = new Vector3()): Vector3 {
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  return out.set(b.x + lx * c + lz * s, ly, b.z - lx * s + lz * c);
}

/**
 * Open the walk-in buildings in the collision world: their solid body goes, walls with a door
 * gap and a floor come in. Mutates and returns the box list.
 */
export function openColliders(boxes: BoxCollider[], frames: BuildingFrame[]): BoxCollider[] {
  const out = boxes.slice();
  for (const b of frames) {
    if (!hasInterior(b.name)) continue;
    // Tidewater's main body collider: tag 'house', centred on the building
    const i = out.findIndex((k) => k.tag === 'house' && Math.hypot(k.cx - b.x, k.cz - b.z) < 0.6);
    if (i < 0) continue;
    const body = out[i];
    out.splice(i, 1);
    const top = body.top;
    const bottom = b.floorY - 0.2;
    const hw = b.w / 2;
    const hd = b.d / 2;
    const t = 0.08;
    const wall = (lx: number, lz: number, hx: number, hz: number, tag = 'wall'): void => {
      const p = frameToWorld(b, lx, 0, lz);
      out.push({ tag, walkable: false, solid: true, cx: p.x, cz: p.z, hx, hz, rotY: b.yaw, top, bottom });
    };
    wall(0, -hd, hw, t); // back
    wall(-hw, 0, t, hd); // sides
    wall(hw, 0, t, hd);
    // the front, either side of the door
    const d0 = b.doorX - DOOR_W / 2;
    const d1 = b.doorX + DOOR_W / 2;
    if (d0 > -hw) wall((-hw + d0) / 2, hd, (d0 + hw) / 2, t);
    if (d1 < hw) wall((d1 + hw) / 2, hd, (hw - d1) / 2, t);
    // the floor you land on
    const f = frameToWorld(b, 0, 0, 0);
    const furniture = [...(FURNITURE[b.name] ?? [])];
    if (COUNTER_SHOPS.includes(b.name)) furniture.push(shopCounter(b.d - INSET * 2));
    for (const [x, z, hx, hz, top] of furniture) {
      const p = frameToWorld(b, x, 0, z);
      out.push({ tag: 'furniture', walkable: false, solid: true, cx: p.x, cz: p.z, hx, hz, rotY: b.yaw, top: b.floorY + top, bottom: b.floorY - 0.2 });
    }
    out.push({ tag: 'interior', walkable: true, solid: true, cx: f.x, cz: f.z, hx: hw + 0.02, hz: hd + 0.02, rotY: b.yaw, top: b.floorY + 0.02, bottom: b.floorY - 8 }); // out under the walls (no gap at the threshold) and into the ground: no crawling under a house (surfaces.ts catchArc)
  }
  return out;
}

/* ── painted surfaces ─────────────────────────────────────────────────── */

function planks(base: string, seed: number): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  let s = seed;
  const rnd = (): number => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 8; i++) {
    const y = i * 32;
    g.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.12})`;
    g.fillRect(0, y, 256, 32);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, y + 30, 256, 2);
    // butt joints and grain
    const jx = rnd() * 256;
    g.fillRect(jx, y, 2, 32);
    g.strokeStyle = 'rgba(0,0,0,0.08)';
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      const gy = y + 5 + k * 6;
      g.moveTo(0, gy);
      g.bezierCurveTo(80, gy + 2, 170, gy - 2, 256, gy + 1);
      g.stroke();
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** Overlay a light falloff on a canvas: bright where `lit(u, v)` says, darker elsewhere. */
function bakeLight(c: HTMLCanvasElement, lit: (u: number, v: number) => number, warm = true): void {
  const g = c.getContext('2d')!;
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const k = lit(x / c.width, y / c.height);
      const i = (y * c.width + x) * 4;
      d[i] = Math.min(255, d[i] * k * (warm ? 1.08 : 1));
      d[i + 1] = Math.min(255, d[i + 1] * k);
      d[i + 2] = Math.min(255, d[i + 2] * k * (warm ? 0.9 : 1));
    }
  }
  g.putImageData(img, 0, 0);
}

/** A room surface: a painted base, then its light baked in. */
function surface(paint: (g: CanvasRenderingContext2D, w: number, h: number) => void, lit: (u: number, v: number) => number, px = 512): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d')!;
  paint(g, px, px);
  bakeLight(c, lit);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** A soft round glow, bright in the middle and gone at the edge (shared by every ceiling light). */
let glowTex: CanvasTexture | null = null;
function glowTexture(): CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new CanvasTexture(c);
  glowTex.colorSpace = SRGBColorSpace;
  return glowTex;
}

/** Casino carpet: a deep ground with a repeating gold lattice and little diamonds. */
function carpet(g: CanvasRenderingContext2D, w: number, h: number, ground: string): void {
  g.fillStyle = ground;
  g.fillRect(0, 0, w, h);
  const n = 12;
  const s = w / n;
  g.strokeStyle = 'rgba(214, 170, 70, 0.55)';
  g.lineWidth = 2;
  for (let i = -n; i <= n * 2; i++) {
    g.beginPath();
    g.moveTo(i * s, 0);
    g.lineTo(i * s + h, h);
    g.stroke();
    g.beginPath();
    g.moveTo(i * s, 0);
    g.lineTo(i * s - h, h);
    g.stroke();
  }
  g.fillStyle = 'rgba(230, 60, 70, 0.8)';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const cx = (x + 0.5) * s;
      const cy = (y + 0.5) * s;
      g.beginPath();
      g.moveTo(cx, cy - s * 0.18);
      g.lineTo(cx + s * 0.12, cy);
      g.lineTo(cx, cy + s * 0.18);
      g.lineTo(cx - s * 0.12, cy);
      g.closePath();
      g.fill();
    }
  }
}

/** Wall paint per role: casinos dark and plush, shops bright, home bare boards. */
function wallColour(r: BuildingRole): string {
  switch (r.role) {
    case 'casino':
      return '#3a1e2a';
    case 'home':
      return '#8a7458';
    case 'love':
      return '#e8d8c8';
    default:
      return '#d8cbb0';
  }
}

export function buildInteriors(frames: BuildingFrame[]): Interior[] {
  const list: Interior[] = [];
  const floorTex = planks('#8a6a48', 7);
  for (const b of frames) {
    if (!hasInterior(b.name)) continue;
    const role = ROLES[b.name];
    const w = b.w - INSET * 2;
    const d = b.d - INSET * 2;
    const h = STOREY * Math.max(1, b.stories) - 0.1;
    const group = new Group();
    group.name = `interior-${b.name}`;
    group.position.copy(frameToWorld(b, 0, b.floorY, 0));
    group.rotation.y = b.yaw;
    const contents = new Group();
    group.add(contents);

    // walls: painted planks, lit toward the middle of the room and up from a dark skirting
    const wallCanvas = planks(wallColour(role), b.name.charCodeAt(0)).image as HTMLCanvasElement;
    const wallLit = (u: number, v: number): number => {
      const across = 1 - Math.pow(Math.abs(u - 0.5) * 2, 2) * 0.45;
      const up = v < 0.1 ? 0.55 + v * 3 : 1 - Math.pow(Math.max(0, (0.35 - v) / 0.35), 2) * 0.35;
      return (0.72 + 0.5 * across) * up;
    };
    const wallTex = surface((g, w0, h0) => g.drawImage(wallCanvas, 0, 0, w0, h0), wallLit, 256);
    const wallMat = new MeshBasicMaterial({ map: wallTex, side: DoubleSide });
    // floor: carpet in the casinos, planks elsewhere; a warm pool of light under the lamp
    const floorLit = (u: number, v: number): number => 0.55 + 0.75 * Math.exp(-(((u - 0.5) ** 2 + (v - 0.5) ** 2) / 0.09));
    const ftex = surface(
      (g, w0, h0) => {
        if (role.role === 'casino') carpet(g, w0, h0, role.title === "CAPTAIN'S TABLE" ? '#1a2a1e' : '#3a0e18');
        else g.drawImage(floorTex.image as HTMLCanvasElement, 0, 0, w0, h0);
      },
      floorLit,
      512,
    );
    // pulled toward the eye in depth as well as lifted: it lies just over Tidewater's own floor,
    // and at a glance across the room the two used to fight (the casinos' carpet shimmered)
    const floor = new Mesh(new PlaneGeometry(w, d).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: ftex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    floor.position.y = 0.012;
    const ceil = new Mesh(
      new PlaneGeometry(w, d).rotateX(Math.PI / 2),
      new MeshBasicMaterial({ map: surface((g, w0, h0) => ((g.fillStyle = '#4a3a2a'), g.fillRect(0, 0, w0, h0)), floorLit, 128) }),
    );
    ceil.position.y = h;
    group.add(floor, ceil);
    const panel = (pw: number, ph: number, x: number, y: number, z: number, ry: number): void => {
      const m = new Mesh(new PlaneGeometry(pw, ph), wallMat);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      group.add(m);
    };
    panel(w, h, 0, h / 2, -d / 2, 0); // back, facing in (+z)
    panel(d, h, -w / 2, h / 2, 0, Math.PI / 2);
    panel(d, h, w / 2, h / 2, 0, -Math.PI / 2);
    // front wall with the doorway (facing in: −z), the same opening as the one the bake cuts in
    // the house's wall
    const OW = DOOR_OPENING.w;
    const OH = DOOR_OPENING.h;
    const dx = Math.max(-w / 2 + OW / 2, Math.min(w / 2 - OW / 2, b.doorX));
    const l0 = -w / 2;
    const l1 = dx - OW / 2;
    const r0 = dx + OW / 2;
    const r1 = w / 2;
    if (l1 > l0) panel(l1 - l0, h, (l0 + l1) / 2, h / 2, d / 2, Math.PI);
    if (r1 > r0) panel(r1 - r0, h, (r0 + r1) / 2, h / 2, d / 2, Math.PI);
    panel(OW, h - OH, dx, OH + (h - OH) / 2, d / 2, Math.PI);
    // the doorway lined from the room's shell out to the house's wall: jambs and head in the
    // trim's wood over the gap between them, the threshold in the floor's planks. Through the
    // wall itself the bake's cut wall faces are the lining — a plane over them fought them in
    // depth, and the doorframes flickered.
    const gap = INSET - WALL_T;
    const rz = d / 2 + gap / 2;
    const jambMat = new MeshLambertMaterial({ color: 0xd8d0c0, side: DoubleSide });
    for (const [x, ry] of [[l1, Math.PI / 2], [r0, -Math.PI / 2]] as const) {
      const j = new Mesh(new PlaneGeometry(gap, OH), jambMat);
      j.position.set(x, OH / 2, rz);
      j.rotation.y = ry;
      group.add(j);
    }
    const head = new Mesh(new PlaneGeometry(OW, gap).rotateX(Math.PI / 2), jambMat);
    head.position.set(dx, OH, rz);
    const reveal = INSET + 0.005;
    const sill = new Mesh(new PlaneGeometry(OW, reveal).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: floorTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    sill.position.set(dx, 0.012, d / 2 + reveal / 2);
    group.add(head, sill);
    // the light: flush on the ceiling — a frosted dome in a brass rim, a warm glow on the ceiling
    // round it. (It used to hang on a flex, and its glow came down to eye height in the middle
    // of every room.)
    const lamp = new Group();
    const dome = new Mesh(new SphereGeometry(0.2, 16, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1, 0.35, 1), new MeshBasicMaterial({ color: 0xfff0c8, toneMapped: false }));
    const rim = new Mesh(new CylinderGeometry(0.215, 0.215, 0.025, 20, 1, true), new MeshLambertMaterial({ color: 0xb08d4a, side: DoubleSide }));
    rim.position.y = -0.012;
    const glow = new Mesh(
      new CircleGeometry(0.6, 24).rotateX(Math.PI / 2),
      new MeshBasicMaterial({ map: glowTexture(), color: 0xffd9a0, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    glow.position.y = -0.004;
    lamp.add(glow, rim, dome);
    // (in a counter shop, toward the door: in the middle it was in front of the price board)
    lamp.position.set(0, h - 0.005, COUNTER_SHOPS.includes(b.name) ? d * 0.22 : 0);
    group.add(lamp);

    const c = Math.cos(b.yaw);
    const s = Math.sin(b.yaw);
    const cx = frameToWorld(b, 0, 0, 0);
    list.push({
      name: b.name,
      frame: b,
      role,
      group,
      contents,
      lamp,
      w,
      d,
      h,
      inside: (x, z) => {
        const ddx = x - cx.x;
        const ddz = z - cx.z;
        const lx = ddx * c - ddz * s;
        const lz = ddx * s + ddz * c;
        return Math.abs(lx) < w / 2 && Math.abs(lz) < d / 2;
      },
      toWorld: (lx, ly, lz, out = new Vector3()) => frameToWorld(b, lx, b.floorY + ly, lz, out),
      seenFrom: (x, z) => {
        const ddx = x - cx.x;
        const ddz = z - cx.z;
        const lx = ddx * c - ddz * s;
        const lz = ddx * s + ddz * c;
        if (Math.abs(lx) < b.w / 2 + 0.3 && Math.abs(lz) < b.d / 2 + 0.3) return true; // in it (or in the doorway)
        return lz > b.d / 2 - 0.2 && Math.hypot(lx, lz) < SEEN_WITHIN;
      },
    });
  }
  return list;
}

/** The interior (if any) you're standing in. */
export function interiorAt(list: Interior[], x: number, z: number): Interior | null {
  for (const i of list) if (i.inside(x, z)) return i;
  return null;
}
