/**
 * The backpack as a thing you can hold: a wooden tackle-box tray with a grid of slots, that
 * comes up in front of you at waist height, tilted toward you, when you press A.
 *
 * Tray-local frame: X across (columns), Y out of the tray (up at you), Z down the tray toward
 * you (rows). Cell (c, r) is centred at ((c + ½ − C/2)·CELL, 0, (r + ½ − R/2)·CELL).
 */

import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Vector3,
  type Camera,
} from 'three';
import { bounds, cellsOf, rotate, type Piece } from './logic.ts';

/** One slot's size (m). A 6×4 backpack is 0.66 × 0.44 m. */
export const CELL = 0.11;
const RIM = 0.035;
const DEPTH = 0.045;
const TILT = (35 * Math.PI) / 180;

const UP = new Vector3(0, 1, 0);
/** a fish's snout at each quarter turn: rot 0 toward +X, each turn swinging it toward +Z */
const HEADS = [new Vector3(1, 0, 0), new Vector3(0, 0, 1), new Vector3(-1, 0, 0), new Vector3(0, 0, -1)];
const _c = new Vector3();
const _s = new Vector3();
const _y = new Vector3();

const WOOD = 0x7a5a3a;
const WOOD_DARK = 0x4a3422;
const FELT = 0x1d3a34;

/** What the box is lined with, and the light it holds whatever the sky's doing (0 none). */
export interface TrayLook {
  lining: number;
  /** each part's own colour, this much of it, lit from outside the sky (Lambert emissive) */
  glow: number;
}
/** the backpack's: green felt, lit only by the day */
const TACKLE_BOX: TrayLook = { lining: FELT, glow: 0 };

export class Tray {
  readonly group = new Group();
  cols = 0;
  rows = 0;
  private body = new Group();
  /** per-cell highlight tiles (the ghost's footprint, tier frames) */
  readonly tiles: InstancedMesh;
  private readonly tileColour = new Color();

  constructor(private readonly look: TrayLook = TACKLE_BOX) {
    this.group.name = 'backpack-tray';
    this.group.visible = false;
    this.group.add(this.body);
    this.tiles = new InstancedMesh(new PlaneGeometry(CELL * 0.92, CELL * 0.92).rotateX(-Math.PI / 2), new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), 64);
    this.tiles.count = 0;
    this.tiles.frustumCulled = false;
    this.tiles.renderOrder = 3;
    this.group.add(this.tiles);
  }

  get width(): number {
    return this.cols * CELL;
  }
  get height(): number {
    return this.rows * CELL;
  }

  /** Show or hide the box and its slots (the field guide lies in their place while it's out). */
  showGrid(on: boolean): void {
    this.gridShown = on;
    this.body.visible = on;
    this.tiles.visible = on;
  }
  private gridShown = true;

  /** (Re)build the box for a cols×rows grid (the backpack grows with the hold upgrade). */
  build(cols: number, rows: number): void {
    if (cols === this.cols && rows === this.rows) return;
    this.cols = cols;
    this.rows = rows;
    this.group.remove(this.body);
    this.body = new Group();
    this.body.visible = this.gridShown;
    const w = this.width;
    const h = this.height;
    const { lining, glow } = this.look;
    const lit = (c: number): MeshLambertMaterial => new MeshLambertMaterial({ color: c, emissive: new Color(c).multiplyScalar(glow) });
    const wood = lit(WOOD);
    const dark = lit(WOOD_DARK);
    // the floor of the box: its lining
    const floor = new Mesh(new BoxGeometry(w, 0.01, h), lit(lining));
    floor.position.y = -0.005;
    this.body.add(floor);
    // the outer walls
    const wall = (x: number, z: number, sx: number, sz: number): void => {
      const m = new Mesh(new BoxGeometry(sx, DEPTH, sz), wood);
      m.position.set(x, DEPTH / 2 - 0.01, z);
      this.body.add(m);
    };
    wall(0, -h / 2 - RIM / 2, w + RIM * 2, RIM);
    wall(0, h / 2 + RIM / 2, w + RIM * 2, RIM);
    wall(-w / 2 - RIM / 2, 0, RIM, h);
    wall(w / 2 + RIM / 2, 0, RIM, h);
    // slot dividers: thin, low
    for (let c = 1; c < cols; c++) {
      const m = new Mesh(new BoxGeometry(0.004, 0.012, h), dark);
      m.position.set(-w / 2 + c * CELL, 0.004, 0);
      this.body.add(m);
    }
    for (let r = 1; r < rows; r++) {
      const m = new Mesh(new BoxGeometry(w, 0.012, 0.004), dark);
      m.position.set(0, 0.004, -h / 2 + r * CELL);
      this.body.add(m);
    }
    // a bottom under it all
    const base = new Mesh(new BoxGeometry(w + RIM * 2, 0.02, h + RIM * 2), dark);
    base.position.y = -0.02;
    this.body.add(base);
    this.group.add(this.body);
  }

  /** Stand the tray up in front of the viewer: waist height, tipped toward them. */
  present(camera: Camera): void {
    const head = camera.getWorldPosition(new Vector3());
    const d = camera.getWorldDirection(new Vector3());
    d.y = 0;
    d.normalize();
    const up = new Vector3(0, 1, 0);
    const X = new Vector3().crossVectors(d, up).normalize();
    const Y = up.clone().multiplyScalar(Math.cos(TILT)).addScaledVector(d, -Math.sin(TILT));
    const Z = new Vector3().crossVectors(X, Y);
    const pos = head.clone().addScaledVector(d, 0.42 + this.height * 0.2);
    pos.y -= 0.5;
    this.group.matrixAutoUpdate = true;
    this.group.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(X, Y, Z));
    this.group.position.copy(pos);
    this.group.updateMatrixWorld(true);
  }

  /** Tray-local position of a cell's centre. */
  cellCentre(c: number, r: number, out: Vector3, lift = 0): Vector3 {
    return out.set((c + 0.5 - this.cols / 2) * CELL, lift, (r + 0.5 - this.rows / 2) * CELL);
  }

  /** Where a piece's fish lies in the tray: on its side, along its length, head per rotation. */
  slotMatrix(p: Pick<Piece, 'x' | 'y' | 'rot' | 'shape'>, out: Matrix4, lift = 0.012): Matrix4 {
    const cells = cellsOf(p);
    const minC = Math.min(...cells.map((k) => k[0]));
    const maxC = Math.max(...cells.map((k) => k[0]));
    const minR = Math.min(...cells.map((k) => k[1]));
    const maxR = Math.max(...cells.map((k) => k[1]));
    const centre = this.cellCentre((minC + maxC) / 2, (minR + maxR) / 2, _c, lift);
    const b0 = bounds(rotate(p.shape, 0));
    const len = b0.w * CELL * 0.96;
    // a two-row piece: the fish drawn a little deeper, so it fills its footprint
    const deep = b0.h > 1 ? 1.4 : 1;
    // rot 0: head toward +X (the tail cell is column 0); each quarter turn swings it toward +Z
    const H = HEADS[p.rot];
    const Y = _y.crossVectors(H, UP);
    // fish-local x (its side) faces up out of the tray, y (its back) across, z (its snout) along H
    out.makeBasis(UP, Y, H).scale(_s.set(len, len * deep, len)).setPosition(centre.x, centre.y + len * 0.05, centre.z);
    return out;
  }

  /** Fractional cell coordinates of a tray-local point. */
  cellAt(local: Vector3): { c: number; r: number } {
    return { c: local.x / CELL + this.cols / 2, r: local.z / CELL + this.rows / 2 };
  }

  /** Paint the highlight tiles: [col, row, colour hex, alpha 0..1][] */
  paintTiles(list: [number, number, number, number][]): void {
    const m = new Matrix4();
    const p = new Vector3();
    let n = 0;
    for (const [c, r, hex, a] of list) {
      if (c < 0 || r < 0 || c >= this.cols || r >= this.rows || n >= 64) continue;
      this.cellCentre(c, r, p, 0.003);
      this.tiles.setMatrixAt(n, m.makeTranslation(p.x, p.y, p.z));
      this.tiles.setColorAt(n, this.tileColour.setHex(hex).multiplyScalar(a));
      n++;
    }
    this.tiles.count = n;
    this.tiles.instanceMatrix.needsUpdate = true;
    if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
  }
}
