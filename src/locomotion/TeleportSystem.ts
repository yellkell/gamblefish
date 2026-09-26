/**
 * TeleportSystem — FIRE FIGHT 2's club movement (`src/rave/systems/
 * ClubTeleportSystem.ts`), carried over whole onto the island:
 * teleport-only, no sliding, no smooth turn.
 *
 *  - Push either thumbstick FORWARD and that controller starts aiming: a
 *    ballistic arc curves from it to the ground, ending in an OCTAGON marker
 *    (ff2's platform footprint) with an arrow inside it.
 *  - Move the controller to move the landing spot; roll the thumbstick to
 *    spin the arrow — that's the way you'll be FACING when you arrive.
 *  - Let the stick spring back and you're there.
 *  - An isolated sideways flick (when not aiming) is a snap turn.
 *  - BACK on the stick is a short step backwards, on the spot — never an
 *    arc. Only a forward push can open the arc.
 *
 * Landing spots are the island's floor areas (world/surfaces.ts): the pier,
 * boardwalks, stairs, porches — each at its own height, and the rig lands at
 * it — plus dry, walkable ground. Anywhere else (the sea, the swash, a cliff
 * face) the marker burns hazard-red and release does nothing. Arcs can't cut
 * through walls, rails or posts, until you're standing at or above their top.
 *
 * Active while `locomotion.enabled` (the game will close it while you're at
 * the helm or mid-fight). Unlike the club there's no "platform origin" to go
 * back to — the island IS the world — so closing it just drops the arc.
 *
 * A headset RECENTRE (the reference space's `reset` event) is honoured: the
 * rig folds the new origin in so you stay exactly where you stood (the
 * recentre redefines your NEUTRAL, not your spot).
 */

import { createSystem, InputComponent } from '@iwsdk/core';
import { Quaternion, Vector3 } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { XROrigin } from '@iwsdk/xr-input';
import { GROUND, OCTAGON_VERTICES, TELEPORT, TELEPORT_COLOURS } from './config.ts';
import { TeleportMarker } from './marker.ts';
import * as sfx from '../audio/sfx.ts';
import { simulateArc, type FloorArea, type Surfaces } from '../world/surfaces.ts';
import { introActive } from '../experience/introGate.ts';

const _origin = new Vector3();
const _dir = new Vector3();
const _quat = new Quaternion();
const _head = new Vector3();
const _up = new Vector3(0, 1, 0);
const _n = new Vector3();
const _tilt = new Quaternion();
const _yawQ = new Quaternion();

/**
 * Move the rig so the player's head lands over (x, z) at floor height `y`,
 * facing `yaw` (three.js convention: yaw 0 looks down −z).
 */
export function teleportPlayer(player: XROrigin, x: number, z: number, yaw: number, y = 0): void {
  player.head.getWorldPosition(_head);
  player.head.getWorldQuaternion(_quat);
  _dir.set(0, 0, -1).applyQuaternion(_quat);
  const headYaw = Math.atan2(-_dir.x, -_dir.z);

  const dYaw = yaw - headYaw;
  player.rotation.y += dYaw;
  player.position.y = y;

  // Rotate the head's offset from the rig origin by the turn we just made,
  // then position the rig so the head ends up exactly on target.
  const offX = _head.x - player.position.x;
  const offZ = _head.z - player.position.z;
  const cos = Math.cos(dYaw);
  const sin = Math.sin(dYaw);
  player.position.x = x - (offX * cos + offZ * sin);
  player.position.z = z - (-offX * sin + offZ * cos);
}

/**
 * Snap-turn the rig by `deltaYaw` radians about the player's HEAD, so your
 * physical spot stays put and the world spins around you (rotating about
 * the rig origin would swing your head through an arc).
 */
export function snapTurn(player: XROrigin, deltaYaw: number): void {
  player.head.getWorldPosition(_head);
  const hx = _head.x;
  const hz = _head.z;
  player.rotation.y += deltaYaw;
  const offX = hx - player.position.x;
  const offZ = hz - player.position.z;
  const cos = Math.cos(deltaYaw);
  const sin = Math.sin(deltaYaw);
  player.position.x = hx - (offX * cos + offZ * sin);
  player.position.z = hz - (-offX * sin + offZ * cos);
}

/** The island's walkable model; set once the world has loaded. `onTeleport` hears every move
 *  the system makes (head positions before and after), e.g. to blink through a doorway. */
export const locomotion: {
  surfaces: Surfaces | null;
  enabled: boolean;
  onTeleport: ((from: Vector3, to: Vector3) => void)[];
} = {
  surfaces: null,
  enabled: true,
  onTeleport: [],
};

/** Tell the listeners the head moved from `from` to wherever it is now. */
function moved(player: XROrigin, from: Vector3): void {
  if (!locomotion.onTeleport.length) return;
  const to = player.head.getWorldPosition(new Vector3());
  for (const fn of locomotion.onTeleport) fn(from, to);
}

/** Dev window on the moves that resolve without an arc — no thumbstick
 *  exists off-device, so this is the only way to exercise them headlessly.
 *  (`__fish.move`.) */
export const teleportView: {
  stepBack?: () => void;
  snapTurn?: (dir: -1 | 1) => void;
  to?: (x: number, z: number, yaw: number) => void;
} = {};

export class TeleportSystem extends createSystem({}) {
  private aimingHand: 'left' | 'right' | null = null;
  private arc!: Line2;
  private arcGeo!: LineGeometry;
  private arcMat!: LineMaterial;
  private arcBuf = new Array<number>(TELEPORT.arcPoints * 3).fill(0);
  private marker!: TeleportMarker;
  private landing = new Vector3();
  private landingArea: FloorArea | null = null;
  private landingYaw = 0;
  private valid = false;
  /** Snap turn fires once per flick: armed again after the stick recentres. */
  private snapArmed = true;
  /** The reference space we're watching for `reset` (headset recentre). */
  private refSpace: XRReferenceSpace | null = null;
  /** A recentre happened; fold it in on the next tick (see onRecenter). */
  private recentered = false;
  private recenterPose = { x: 0, z: 0, yaw: 0, y: 0 };

  /**
   * A headset recentre fires `reset` BETWEEN frames, before any pose uses
   * the moved origin — so the head still holds where the player stands in
   * the world RIGHT NOW. Bank that pose; the next update re-plants on it.
   */
  private onRecenter = (): void => {
    this.player.head.getWorldPosition(_head);
    this.player.head.getWorldQuaternion(_quat);
    _dir.set(0, 0, -1).applyQuaternion(_quat);
    this.recenterPose.x = _head.x;
    this.recenterPose.z = _head.z;
    this.recenterPose.yaw = Math.atan2(-_dir.x, -_dir.z);
    this.recenterPose.y = this.player.position.y;
    this.recentered = true;
  };

  init(): void {
    teleportView.stepBack = () => this.stepBack();
    teleportView.snapTurn = (dir) => snapTurn(this.player, dir > 0 ? -TELEPORT.snapAngle : TELEPORT.snapAngle);
    teleportView.to = (x, z, yaw) => {
      const s = locomotion.surfaces;
      teleportPlayer(this.player, x, z, yaw, s ? s.floorYAt(x, z, this.player.position.y) : 0);
    };
    // Arc line — a fat world-unit ribbon in galvanised steel (hazard-red
    // when the landing is refused), LineBasicMaterial ignores width so Line2
    // it is.
    this.arcGeo = new LineGeometry();
    this.arcGeo.setPositions(this.arcBuf);
    this.arcMat = new LineMaterial({
      color: TELEPORT_COLOURS.ok,
      linewidth: 0.014,
      worldUnits: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.arc = new Line2(this.arcGeo, this.arcMat);
    this.arc.frustumCulled = false;
    this.arc.visible = false;
    this.scene.add(this.arc);

    // Octagon landing marker — the platform silhouette, drawn in light, with
    // chevrons for the facing (see marker.ts).
    this.marker = new TeleportMarker(OCTAGON_VERTICES, TELEPORT_COLOURS);
    this.scene.add(this.marker.group);
  }

  update(delta: number): void {
    this.watchRecenter();
    this.marker.update(delta);

    // A recentre moved the reference-space origin under our feet: re-plant
    // the rig on the banked pose so you stay exactly where you stood.
    if (this.recentered) {
      this.recentered = false;
      const p = this.recenterPose;
      teleportPlayer(this.player, p.x, p.z, p.yaw, p.y);
    }

    if (!locomotion.enabled || !locomotion.surfaces || introActive()) {
      this.hide();
      return;
    }

    // Not mid-aim? A sideways flick is a snap turn and a BACKWARD flick is a
    // step back; only forward opens the teleport arc. (Sideways WHILE aiming
    // steers the landing's facing instead — see traceArc.)
    if (!this.aimingHand && this.tryFlick()) return;

    let axes: { x: number; y: number } | null = null;
    if (this.aimingHand) {
      const a = this.input.xr.gamepads[this.aimingHand]?.getAxesValues(InputComponent.Thumbstick);
      axes = a ?? null;
    } else {
      for (const hand of ['left', 'right'] as const) {
        const a = this.input.xr.gamepads[hand]?.getAxesValues(InputComponent.Thumbstick);
        // FORWARD opens the arc (−y is forward on a thumbstick); back is the
        // step's, and sideways the snap turn's — neither ever throws a ray.
        if (a && a.y <= -TELEPORT.engage && Math.abs(a.y) >= Math.abs(a.x)) {
          this.aimingHand = hand;
          axes = a;
          break;
        }
      }
    }

    if (!this.aimingHand || !axes) {
      this.hide();
      return;
    }

    const mag = Math.hypot(axes.x, axes.y);
    if (mag < TELEPORT.release) {
      // Stick sprung back — go (if the marker was on valid ground).
      if (this.valid) {
        const from = this.player.head.getWorldPosition(new Vector3());
        teleportPlayer(this.player, this.landing.x, this.landing.z, this.landingYaw, this.landingArea?.y ?? 0);
        sfx.uiClick();
        moved(this.player, from);
      }
      this.hide();
      return;
    }

    this.traceArc(axes, locomotion.surfaces);
  }

  private traceArc(axes: { x: number; y: number }, surfaces: Surfaces): void {
    const ray = this.player.raySpaces[this.aimingHand!];
    ray.getWorldPosition(_origin);
    ray.getWorldQuaternion(_quat);
    _dir.set(0, 0, -1).applyQuaternion(_quat);

    // Ballistic arc from the controller, landing where it meets the ground,
    // the sea, or a raised floor area it falls onto from above.
    const { landed, area, landing } = simulateArc(surfaces, _origin, _dir, this.arcBuf);
    this.landing.set(landing.x, landing.y, landing.z);
    this.landingArea = area;
    this.arcGeo.setPositions(this.arcBuf);

    // Valid only on a standable floor, with no wall between you and it. The
    // hop is judged at the higher of the two ends: stepping UP onto the pier
    // and stepping back DOWN off it are both hops made at deck height.
    this.player.head.getWorldPosition(_head);
    const fromY = surfaces.floorYAt(_head.x, _head.z, this.player.position.y);
    const hopY = Math.max(fromY, this.landingArea?.y ?? 0);
    this.valid =
      landed &&
      surfaces.standable(this.landingArea, this.landing.x, this.landing.z) &&
      !surfaces.crossesWall(_head.x, _head.z, this.landing.x, this.landing.z, hopY);

    // Facing: thumbstick angle relative to where the controller points.
    const ctrlYaw = Math.atan2(-_dir.x, -_dir.z);
    const stickAngle = Math.atan2(axes.x, -axes.y); // 0 = pushed forward
    this.landingYaw = ctrlYaw - stickAngle;

    this.arcMat.color.set(this.valid ? TELEPORT_COLOURS.ok : TELEPORT_COLOURS.refused);
    const marker = this.marker.group;
    marker.position.set(this.landing.x, this.landing.y + 0.012, this.landing.z);
    // Club floors were all flat; natural ground isn't, so on it the puck
    // lies along the slope instead of half-burying itself in it.
    _yawQ.setFromAxisAngle(_up, this.landingYaw);
    if (this.landingArea?.kind === 'ground') {
      const n = surfaces.terrain.normalAt(this.landing.x, this.landing.z, _n);
      _tilt.setFromUnitVectors(_up, _n.set(n.x, n.y, n.z));
      marker.quaternion.multiplyQuaternions(_tilt, _yawQ);
    } else {
      marker.quaternion.copy(_yawQ);
    }
    this.marker.show(this.valid);
    this.arc.visible = true;
  }

  /**
   * The two flicks that resolve on the spot rather than opening an arc: a
   * left/right push yaws the rig by snapAngle, a BACKWARD push shuffles you
   * half a metre away from what you're looking at.
   *
   * One action per flick — the stick has to spring back below snapReset to
   * re-arm — so holding it doesn't spin you or walk you across the island,
   * and a diagonal can't fire both.
   */
  private tryFlick(): boolean {
    let sx = 0;
    let sy = 0;
    let mag = 0;
    for (const hand of ['left', 'right'] as const) {
      const a = this.input.xr.gamepads[hand]?.getAxesValues(InputComponent.Thumbstick);
      if (!a) continue;
      const m = Math.hypot(a.x, a.y);
      if (m > mag) {
        mag = m;
        sx = a.x;
        sy = a.y;
      }
    }
    if (mag < TELEPORT.snapReset) {
      this.snapArmed = true;
      return false;
    }
    if (!this.snapArmed) return false;
    // A clear sideways flick past the threshold — turn the way it's pushed
    // (stick right yaws you right: a NEGATIVE rotation about +y).
    if (Math.abs(sx) >= TELEPORT.snapEngage && Math.abs(sx) > Math.abs(sy)) {
      this.snapArmed = false;
      snapTurn(this.player, sx > 0 ? -TELEPORT.snapAngle : TELEPORT.snapAngle);
      sfx.uiClick();
      return true;
    }
    // …and a clear BACKWARD one steps back. (Forward is −y on a thumbstick,
    // so back is positive.) It engages where the arc would — the same push
    // that opens a ray forwards steps you backwards — and consumes the
    // flick either way it lands: a push that finds a wall behind you must
    // not fall through to anything else.
    if (sy >= TELEPORT.engage && sy > Math.abs(sx)) {
      this.snapArmed = false;
      this.stepBack();
      return true;
    }
    return false;
  }

  /**
   * Half a metre backwards, away from where the HEAD is looking — the body
   * can be facing anywhere, but "back" means back from what you can see.
   *
   * Judged the way the arc's landing is judged — standable floor under it,
   * no wall crossed on the way — plus one rule the arc doesn't need: it must
   * stay on YOUR level. Half a step back off the pier rail must not drop you
   * to the sand, and half a step back from a porch must not lift you onto
   * it. Climbing is what the arc is for. (Decks keep the club's 5 cm; natural
   * ground isn't flat, so it gets the slope's worth of a step.)
   *
   * Shorter steps are tried in turn so backing up against something stops you
   * short instead of refusing outright.
   */
  private stepBack(): void {
    const surfaces = locomotion.surfaces;
    if (!surfaces) return;
    this.player.head.getWorldPosition(_head);
    this.player.head.getWorldQuaternion(_quat);
    _dir.set(0, 0, -1).applyQuaternion(_quat);
    const flat = Math.hypot(_dir.x, _dir.z);
    if (flat < 1e-4) return; // staring at your boots or the sky
    const bx = -_dir.x / flat;
    const bz = -_dir.z / flat;
    const from = surfaces.areaNear(_head.x, _head.z, this.player.position.y);
    for (const step of TELEPORT.stepBack) {
      const x = _head.x + bx * step;
      const z = _head.z + bz * step;
      const area = surfaces.areaNear(x, z, from.y);
      if (!surfaces.standable(area, x, z)) continue;
      const tolerance = from.kind === 'ground' && area.kind === 'ground' ? GROUND.groundLevelTolerance : 0.05;
      if (Math.abs(area.y - from.y) > tolerance) continue; // your level, or nothing
      if (surfaces.crossesWall(_head.x, _head.z, x, z, Math.max(from.y, area.y))) continue;
      const was = this.player.head.getWorldPosition(new Vector3());
      teleportPlayer(this.player, x, z, Math.atan2(-_dir.x, -_dir.z), area.y);
      sfx.uiClick();
      moved(this.player, was);
      return;
    }
  }

  /**
   * Keep a `reset` listener on the session's live reference space (it only
   * exists once a session is up, and each new session mints a new one).
   */
  private watchRecenter(): void {
    const space = this.renderer.xr.getReferenceSpace();
    if (space === this.refSpace) return;
    this.refSpace?.removeEventListener('reset', this.onRecenter);
    this.refSpace = space;
    space?.addEventListener('reset', this.onRecenter);
  }

  private hide(): void {
    this.aimingHand = null;
    this.valid = false;
    this.arc.visible = false;
    this.marker.hide();
  }
}
