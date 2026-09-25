/**
 * Point-and-click panels in the world: shop counters, bet buttons, the bank, Coral's words.
 *
 * Any system can make an `InteractivePanel` (a canvas panel with button rectangles), add it to
 * the scene and `register` it. Each frame the PointerSystem casts both controllers' rays at the
 * visible panels; the nearest hit gets a cursor and a beam, the button under it lights, and a
 * trigger pull clicks it — with ff2's hover and click sounds and a tick in the hand.
 *
 * A hand whose ray is on a button CLAIMS its trigger for that frame (`pointerView.claimed`), so
 * pointing at a shop never also casts the rod or drops a fish.
 */

import { createSystem, InputComponent } from '@iwsdk/core';
import { BufferGeometry, Float32BufferAttribute, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, Plane, Quaternion, Ray, SphereGeometry, Vector3 } from 'three';
import { uiClick, uiHover } from '../audio/sfx.ts';
import { pulseHand } from '../input/haptics.ts';
import { Panel } from './panel.ts';

type Hand = 'left' | 'right';

export interface Button {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  enabled?: boolean;
}

export class InteractivePanel extends Panel {
  buttons: Button[] = [];
  hover: string | null = null;
  /** metres per canvas pixel, for hit-testing */
  readonly size: [number, number];
  readonly px: [number, number];
  onClick: (id: string, hand: Hand) => void = () => {};
  /** repaint hook, called whenever the hover changes (and by owners when state changes) */
  paint: () => void = () => {};

  constructor(px: [number, number], m: [number, number]) {
    super(px, m, { depthTest: true });
    this.px = px;
    this.size = m;
  }

  /** The button at canvas (x, y). */
  at(x: number, y: number): Button | null {
    for (const b of this.buttons) if (b.enabled !== false && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    return null;
  }
}

const panels = new Set<InteractivePanel>();

export function register(p: InteractivePanel): void {
  panels.add(p);
}
export function unregister(p: InteractivePanel): void {
  panels.delete(p);
}

/** Which hands' triggers the UI took this frame. */
export const pointerView: { claimed: Record<Hand, boolean> } = { claimed: { left: false, right: false } };

const _o = new Vector3();
const _d = new Vector3();
const _n = new Vector3();
const _hit = new Vector3();
const _best = new Vector3();
const _q = new Quaternion();

export class PointerSystem extends createSystem({}) {
  private cursors!: Record<Hand, { dot: Mesh; beam: Line }>;
  private readonly trig: Record<Hand, boolean> = { left: false, right: false };
  private readonly ray = new Ray();
  private readonly plane = new Plane();

  init(): void {
    const mk = (): { dot: Mesh; beam: Line } => {
      const dot = new Mesh(new SphereGeometry(0.007, 10, 8), new MeshBasicMaterial({ color: 0xffb000, depthTest: false, toneMapped: false }));
      dot.renderOrder = 40;
      dot.visible = false;
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, 0, -1], 3));
      const beam = new Line(g, new LineBasicMaterial({ color: 0xffb000, transparent: true, opacity: 0.55, depthTest: false }));
      beam.frustumCulled = false;
      beam.visible = false;
      beam.renderOrder = 39;
      this.scene.add(dot, beam);
      return { dot, beam };
    };
    this.cursors = { left: mk(), right: mk() };
  }

  update(): void {
    const hovered = new Map<InteractivePanel, string | null>();
    for (const hand of ['left', 'right'] as const) {
      const cur = this.cursors[hand];
      pointerView.claimed[hand] = false;
      const pad = this.input.xr.gamepads[hand];
      const t = pad?.getButtonValue(InputComponent.Trigger) ?? 0;
      const down = !this.trig[hand] && t > 0.6;
      if (t > 0.6) this.trig[hand] = true;
      else if (t < 0.3) this.trig[hand] = false;

      // nearest visible panel along this hand's ray
      const rs = this.player.raySpaces[hand];
      rs.getWorldPosition(_o);
      rs.getWorldQuaternion(_q);
      _d.set(0, 0, -1).applyQuaternion(_q);
      this.ray.set(_o, _d);
      let best: { p: InteractivePanel; x: number; y: number; dist: number } | null = null;
      for (const p of panels) {
        if (!visible(p.mesh)) continue;
        p.mesh.updateMatrixWorld();
        _n.set(0, 0, 1).transformDirection(p.mesh.matrixWorld);
        this.plane.setFromNormalAndCoplanarPoint(_n, p.mesh.getWorldPosition(_hit));
        const hit = this.ray.intersectPlane(this.plane, _hit);
        if (!hit) continue;
        const dist = hit.distanceTo(_o);
        if (dist > 6 || (best && dist > best.dist)) continue;
        const local = p.mesh.worldToLocal(hit.clone());
        const u = local.x / p.size[0] + 0.5;
        const v = 0.5 - local.y / p.size[1];
        if (u < 0 || u > 1 || v < 0 || v > 1) continue;
        best = { p, x: u * p.px[0], y: v * p.px[1], dist };
        _best.copy(hit);
      }
      if (!best) {
        cur.dot.visible = false;
        cur.beam.visible = false;
        continue;
      }
      cur.dot.visible = true;
      cur.dot.position.copy(_best);
      cur.beam.visible = true;
      const pos = cur.beam.geometry.attributes.position as Float32BufferAttribute;
      pos.setXYZ(0, _o.x, _o.y, _o.z);
      pos.setXYZ(1, _best.x, _best.y, _best.z);
      pos.needsUpdate = true;
      const b = best.p.at(best.x, best.y);
      if (b) {
        pointerView.claimed[hand] = true;
        hovered.set(best.p, b.id);
        if (down) {
          uiClick();
          pulseHand(this.renderer.xr.getSession() ?? undefined, hand, 0.35, 30);
          best.p.onClick(b.id, hand);
        }
      } else if (!hovered.has(best.p)) hovered.set(best.p, null);
    }
    // hover changes repaint (with the soft hover tick)
    for (const p of panels) {
      const h = hovered.get(p) ?? null;
      if (h !== p.hover) {
        if (h) uiHover();
        p.hover = h;
        p.paint();
      }
    }
  }
}


function visible(o: { visible: boolean; parent: unknown }): boolean {
  let n: { visible: boolean; parent: unknown } | null = o;
  while (n) {
    if (!n.visible) return false;
    n = n.parent as typeof n;
  }
  return true;
}
