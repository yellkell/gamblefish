/**
 * YOUR SHACK, CORAL'S VILLA, AND THE SHOPS THAT FURNISH THEM.
 *
 * The hut on the beach with HOME over the door (S1) is yours. Four of the village's shops sell
 * things for it — the BUILDER furniture, the FLORIST plants, the TAXIDERMIST trophy fish on
 * plaques, the PAWN SHOP curios. Each shop has its goods on a counter and a board behind it:
 * point at BUY and it's paid for out of your wallet and delivered — it's standing in its own
 * spot in your shack straight away, and every time you come back (the save's `home` list,
 * local and in the cloud save).
 *
 * Two more shops furnish Coral's house, Villa Mar (L), the same way: the JEWELLER sells the
 * sparkle (a crystal chandelier, a vanity with a jewellery box, pearls on a velvet bust, a ring
 * under a glass cloche, a mermaid's tiara) and the BOUTIQUE the finer things (a chaise longue,
 * a gilded mirror, silk drapes, a baby grand, a painted silk screen). What you buy there is
 * delivered to her villa (village/villa.ts), and she notices.
 *
 * The things themselves are modelled in village/wares/, one file per shop, with the maker's kit
 * (village/craft.ts), in the room's frame (x across the facade, +z out of the front, y = 0 on
 * the floor). Each spot in the shack keeps the doorway and the middle of the floor clear; the
 * big pieces are furniture you can't teleport into.
 */

import { CanvasTexture, Group, MeshBasicMaterial, SRGBColorSpace, Vector3, Box3, type Object3D } from 'three';
import { uiDeny, winFanfare } from '../audio/sfx.ts';
import type { GameState } from '../fishing/tidewater.ts';
import { font } from '../ui/fonts.ts';
import { INK, roundRect } from '../ui/panel.ts';
import { InteractivePanel, register } from '../ui/pointer.ts';
import { drawThumb, thumbnail } from '../ui/thumbnail.ts';
import type { BoxCollider } from '../world/data.ts';
import { Batch, M, rounded, stalk, turned, type Kit } from './craft.ts';
import { HOME_SHOPS as HOME_SHOP_LIST, shopCounter, VILLA_SHOPS, type HomeShop, type Interior } from './interiors.ts';
import { mergeStatic } from './merge.ts';
import { ROLES } from './roles.ts';
import { bed, bookshelf, rug, seaChest, tableChairs } from './wares/builder.ts';
import { chaise, chevalMirror, drapes, piano, screen } from './wares/boutique.ts';
import { fern, hibiscus, kentia, monstera, orchid } from './wares/florist.ts';
import { chandelier, pearlBust, ringCloche, tiara, vanity } from './wares/jeweller.ts';
import { divingHelmet, globe, painting, shipInBottle } from './wares/pawn.ts';
import { mahiMount, sailfishMount, snapperMount, tarponMount } from './wares/taxidermist.ts';

export { HOME, HOME_SHOPS, VILLA, VILLA_SHOPS } from './interiors.ts';
export type { Kit } from './craft.ts';

/** is this shop's stock for Coral's villa (not your shack)? */
const forVilla = (shop: string): boolean => (VILLA_SHOPS as readonly string[]).includes(shop);

interface HomeItem {
  id: string;
  shop: HomeShop;
  name: string;
  blurb: string;
  price: number;
  /** where it stands in the shack: room frame x, y, z and its turn about y */
  at: [number, number, number, number];
  /** a piece you can't stand in: its footprint (half-width, half-depth, before the turn) and height */
  solid?: [number, number, number];
  /** it hangs from the ceiling (on the counter it hangs from a little display gallows) */
  hangs?: boolean;
  build(k: Kit): Object3D;
}

/**
 * A rug's paint. Lit like the room's floor (its light is in its colours: unlit, so the sky
 * outside doesn't turn it navy at night), lifted clear of the floor and pulled toward the eye
 * in depth too, so it never fights the floor (or Tidewater's under it) at a glance.
 */
export function rugPaint(w: number, h: number, paint: (g: CanvasRenderingContext2D, w: number, h: number) => void): MeshBasicMaterial {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!, w, h);
  const map = new CanvasTexture(c);
  map.colorSpace = SRGBColorSpace;
  return new MeshBasicMaterial({ map, color: 0xe8e8e8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
}

/* ── the catalogue ─────────────────────────────────────────────────────── */

// Each thing's model is in village/wares/ (one file per shop), built with the maker's kit
// (village/craft.ts). Its spot: the shack is 3.66 × 3.86 m inside (x ±1.83, z ±1.93, the door
// in the middle of the front wall), Coral's villa 7.06 × 5.26 m (x ±3.53, z ±2.63).

export const GOODS: HomeItem[] = [
  // ── the builder: furniture ──
  { id: 'bed', shop: 'F', name: 'Driftwood bed', blurb: 'a patchwork quilt, two plump pillows', price: 400, at: [-1.28, 0, -0.9, 0], solid: [0.5, 1.0, 0.6], build: bed },
  { id: 'table', shop: 'F', name: 'Table & two chairs', blurb: 'for when Coral comes round', price: 260, at: [1.12, 0, -0.55, 0], solid: [0.55, 0.75, 0.75], build: tableChairs },
  { id: 'rug', shop: 'F', name: 'Kilim rug', blurb: 'hand-woven, sand stays outside', price: 90, at: [-0.05, 0.03, 0.1, 0], build: (k) => rug(k, rugPaint) },
  { id: 'shelf', shop: 'F', name: 'Bookshelf', blurb: 'tide tables, paperbacks, a conch', price: 220, at: [0.22, 0, -1.73, 0], solid: [0.46, 0.16, 1.7], build: bookshelf },
  { id: 'chest', shop: 'F', name: 'Sea chest', blurb: 'iron-bound, for the foot of the bed', price: 180, at: [-1.28, 0, 0.42, 0], solid: [0.43, 0.25, 0.5], build: seaChest },

  // ── the florist: plants ──
  { id: 'palm', shop: 'D', name: 'Kentia palm', blurb: 'a bit of the island indoors', price: 60, at: [1.5, 0, 1.45, 0], build: kentia },
  { id: 'flowers', shop: 'D', name: 'Hibiscus in bloom', blurb: 'fresh flowers every morning', price: 45, at: [-1.48, 0, 1.48, 0.6], build: hibiscus },
  // up out of your eyeline: its ring just under the ceiling, the fronds hanging to about 1.75 m
  { id: 'fern', shop: 'D', name: 'Boston fern', blurb: 'in a macramé hanger, loves the sea air', price: 55, at: [-0.95, 2.2, 1.25, 0], hangs: true, build: fern },
  { id: 'orchid', shop: 'D', name: 'Moth orchid', blurb: 'on a bamboo stand · Coral’s favourite', price: 75, at: [1.58, 0, 0.55, -Math.PI / 2], build: orchid },
  { id: 'monstera', shop: 'D', name: 'Monstera', blurb: 'the swiss cheese plant, in a basket', price: 85, at: [-0.5, 0, -1.58, 0.3], build: monstera },

  // ── the taxidermist: trophies ──
  // over the bed, clear of the bookshelf (its plaque runs x −1.77 to −0.27; the shelf starts at −0.23)
  { id: 'tarpon', shop: 'K', name: 'Tarpon on a plaque', blurb: 'the silver king, over the bed', price: 600, at: [-1.02, 1.85, -1.9, 0], build: tarponMount },
  { id: 'mahi', shop: 'K', name: 'Mahi-mahi on a plaque', blurb: 'all the colours of the sea', price: 320, at: [1.81, 1.7, 0.45, -Math.PI / 2], build: mahiMount },
  { id: 'snapper', shop: 'K', name: 'Red snapper on a plaque', blurb: 'your first good one', price: 150, at: [-1.81, 1.7, 0.65, Math.PI / 2], build: snapperMount },
  { id: 'sailfish', shop: 'K', name: 'Sailfish, leaping', blurb: 'sail up, over the bed', price: 900, at: [-1.81, 1.8, -0.85, Math.PI / 2], build: sailfishMount },

  // ── the pawn shop: curios ──
  { id: 'bottle', shop: 'J', name: 'Ship in a bottle', blurb: 'a three-master, on an old rum barrel', price: 140, at: [-1.55, 0, 0.95, 0.3], solid: [0.24, 0.24, 0.6], build: shipInBottle },
  { id: 'globe', shop: 'J', name: 'Mariner’s globe', blurb: 'the island isn’t on it', price: 180, at: [0.85, 0, 0.95, 0.4], solid: [0.26, 0.26, 1.1], build: globe },
  { id: 'painting', shop: 'J', name: 'Painting of the bay', blurb: 'sunset from the pier, signed illegibly', price: 210, at: [1.81, 1.55, -1.25, -Math.PI / 2], build: painting },
  { id: 'helmet', shop: 'J', name: 'Brass diving helmet', blurb: 'on the salvage crate it came up in', price: 350, at: [1.5, 0, -1.62, -0.5], solid: [0.24, 0.24, 0.85], build: divingHelmet },

  // ── the jeweller: sparkle for Coral's villa ──
  { id: 'chandelier', shop: 'A', name: 'Crystal chandelier', blurb: 'for the hall of Villa Mar', price: 1500, at: [0, 3.35, -0.5, 0], hangs: true, build: chandelier },
  { id: 'vanity', shop: 'A', name: 'Vanity & jewellery box', blurb: 'mother-of-pearl, lined in velvet', price: 650, at: [-3.18, 0, -1.3, Math.PI / 2], solid: [0.6, 0.28, 0.78], build: vanity },
  { id: 'pearls', shop: 'A', name: 'Pearls on a velvet bust', blurb: 'three strands, from the deep reef', price: 900, at: [-3.05, 0, 0.6, Math.PI / 2], solid: [0.22, 0.22, 1.45], build: pearlBust },
  { id: 'ring', shop: 'A', name: 'Diamond ring under glass', blurb: 'for when you’re ready to ask', price: 2500, at: [3.05, 0, 1.75, -Math.PI / 2], solid: [0.2, 0.2, 1.3], build: ringCloche },
  { id: 'tiara', shop: 'A', name: 'Mermaid’s tiara', blurb: 'silver waves and aquamarines', price: 1200, at: [-2.35, 0, 1.55, 0.5], solid: [0.26, 0.26, 0.9], build: tiara },

  // ── the boutique: the finer things for Coral's villa ──
  { id: 'chaise', shop: 'E', name: 'Velvet chaise longue', blurb: 'for long afternoons by the window', price: 700, at: [2.05, 0, -2.2, -Math.PI / 2], solid: [0.4, 0.9, 0.7], build: chaise },
  { id: 'mirror', shop: 'E', name: 'Gilded cheval mirror', blurb: 'she says it flatters the light', price: 450, at: [-1.95, 0, -2.35, 0], solid: [0.55, 0.25, 2.0], build: chevalMirror },
  { id: 'drapes', shop: 'E', name: 'Silk drapes', blurb: 'rose silk, floor to ceiling', price: 380, at: [-3.45, 0, 1.75, Math.PI / 2], build: drapes },
  { id: 'piano', shop: 'E', name: 'Baby grand piano', blurb: 'she plays. of course she plays', price: 2000, at: [1.3, 0, 0.25, -0.35], solid: [0.75, 1.15, 1.0], build: piano },
  { id: 'screen', shop: 'E', name: 'Painted silk screen', blurb: 'birds of paradise in blossom', price: 550, at: [2.45, 0, 2.3, Math.PI], solid: [0.7, 0.2, 1.8], build: screen },
];

/* ── the shack ─────────────────────────────────────────────────────────── */

/** Your shack, or Coral's villa: everything bought for it is standing in its spot. */
export class Shack {
  private readonly placed = new Set<string>();
  /** told when something new arrives (Coral's villa: she notices) */
  onDelivered: ((item: HomeItem) => void) | null = null;

  constructor(
    private readonly room: Interior,
    private readonly state: GameState,
    private readonly kit: Kit,
    private readonly addCollider: (b: BoxCollider) => void,
    /** the shops whose goods live here */
    private readonly shops: readonly string[] = HOME_SHOP_LIST,
  ) {
    this.sync();
    state.onChange(() => this.sync());
  }

  /** Everything you own is in its spot (and the big pieces can't be stood in). */
  sync(): void {
    for (const id of this.state.home) {
      if (this.placed.has(id)) continue;
      const item = GOODS.find((g) => g.id === id);
      if (!item || !this.shops.includes(item.shop)) continue;
      this.placed.add(id);
      this.onDelivered?.(item);
      const o = mergeStatic(item.build(this.kit));
      const [x, y, z, ry] = item.at;
      o.position.set(x, y, z);
      o.rotation.y = ry;
      this.room.contents.add(o);
      if (item.solid) {
        const [hx, hz, top] = item.solid;
        const p = this.room.toWorld(x, 0, z);
        const f = this.room.frame;
        this.addCollider({ tag: 'furniture', walkable: false, solid: true, cx: p.x, cz: p.z, hx, hz, rotY: f.yaw + ry, top: f.floorY + top, bottom: f.floorY - 0.2 });
      }
    }
  }
}

/* ── the shops ─────────────────────────────────────────────────────────── */

const BW = 1200;
const BH = 800;
/** each thing on the counter fits in a cube this big (m) */
const SHOW = 0.44;

/** the bounds of a thing as built (its parts that stay out of pictures left out too) */
function boundsOf(o: Object3D): Box3 {
  o.updateMatrixWorld(true);
  return new Box3().setFromObject(o);
}

/** the parts of a thing only its room needs (a chandelier's chain to the ceiling) */
function dropExtras(o: Object3D): Object3D {
  const skip: Object3D[] = [];
  o.traverse((c) => c.userData.noThumb && skip.push(c));
  for (const c of skip) c.removeFromParent();
  return o;
}

/**
 * How a thing is shown on the counter: shrunk to fit its place, standing on the counter top.
 * A wall piece leans back on a little easel; a hanging one hangs from a gallows.
 */
function onShow(k: Kit, item: HomeItem): Group {
  const g = new Group();
  const o = dropExtras(item.build(k));
  const wall = item.at[1] > 1 && !item.hangs;
  let bb = boundsOf(o);
  const size = bb.getSize(new Vector3());
  const s = Math.min(1, SHOW / Math.max(size.x, size.y, size.z, 1e-3));
  o.scale.setScalar(s);
  if (wall) o.rotation.x = -0.22;
  bb = boundsOf(o);
  const c = bb.getCenter(new Vector3());
  const b = new Batch();
  const wood = M.wood(k.renderer, 'walnut', 0.4);
  if (item.hangs) {
    // the gallows: a turned post at the back, an arm over, a hook; the thing hangs clear of the top
    const H = bb.max.y - bb.min.y + 0.1;
    o.position.set(-c.x, H - bb.max.y + 0.02, -c.z);
    b.at(wood, rounded(0.2, 0.02, 0.14, 0.006), 0, 0.01, -0.16);
    b.at(wood, turned([[0.014, 0], [0.012, H + 0.06], [0, H + 0.07]], 10), 0, 0.02, -0.16);
    b.at(wood, rounded(0.02, 0.02, 0.2, 0.006), 0, H + 0.06, -0.07);
    b.add(M.brass(k.renderer), stalk([new Vector3(0, H + 0.05, 0), new Vector3(0, H + 0.02, 0)], 0.003, 0.003, 5, 2));
  } else if (wall) {
    // a little easel behind it
    o.position.set(-c.x, 0.03 - bb.min.y + 0.02, -c.z);
    const top = bb.max.y - bb.min.y + 0.05;
    for (const sx of [-1, 1]) b.at(wood, rounded(0.018, top, 0.018, 0.005), sx * 0.1, top / 2, -0.04, 0.2, 0, sx * 0.08);
    b.at(wood, rounded(0.018, top * 0.9, 0.018, 0.005), 0, top * 0.44, -0.16, -0.35, 0, 0);
    b.at(wood, rounded(0.3, 0.02, 0.05, 0.005), 0, 0.03, 0.01);
  } else {
    o.position.set(-c.x, -bb.min.y, -c.z);
  }
  g.add(o, b.group());
  return g;
}

export class HomeShopCounter {
  private readonly board: InteractivePanel;
  private readonly goods: HomeItem[];
  private note = '';
  private noteColour: string = INK.dim;
  /** does this shop deliver to Coral's villa (not your shack)? */
  private villa = false;
  /** a picture of each thing, for its row on the board */
  private readonly pics = new Map<string, HTMLCanvasElement>();

  constructor(
    room: Interior,
    private readonly state: GameState,
    kit: Kit,
  ) {
    const shop = room.name as HomeShop;
    this.goods = GOODS.filter((g) => g.shop === shop);
    const [cx, cz, hx, hz, top] = shopCounter(room.d);

    // the counter, and the goods standing on it (shrunk to a maker's model), baked into one
    // draw per material
    const display = new Group();
    const counter = new Batch();
    const wood = M.wood(kit.renderer, 'walnut', 0.45);
    counter.at(wood, rounded(hx * 2, top - 0.05, hz * 2, 0.02), cx, (top - 0.05) / 2, cz);
    counter.at(M.wood(kit.renderer, 'mahogany', 0.25), rounded(hx * 2 + 0.08, 0.05, hz * 2 + 0.08, 0.015), cx, top - 0.025, cz);
    // panels on its front, and a brass kick rail
    for (let i = 0; i < 4; i++) counter.at(M.wood(kit.renderer, 'mahogany', 0.4), rounded(hx * 0.42, top * 0.62, 0.02, 0.008), cx - hx + (hx * 2 * (i + 0.5)) / 4, top * 0.46, cz + hz + 0.005);
    counter.at(M.brass(kit.renderer), turned([[0.012, -hx], [0.012, hx]], 10), cx, 0.12, cz + hz + 0.05, 0, 0, Math.PI / 2);
    display.add(counter.group());
    const n = this.goods.length;
    this.goods.forEach((g, i) => {
      const o = onShow(kit, g);
      o.position.set(cx - hx + ((i + 0.5) * hx * 2) / n, top, cz - 0.02);
      display.add(o);
    });
    room.contents.add(mergeStatic(display));
    this.villa = forVilla(shop);
    for (const g of this.goods) this.pics.set(g.id, thumbnail(kit.renderer, g.build(kit)));

    // the board behind: what they sell, what it costs, BUY
    this.board = new InteractivePanel([BW, BH], [1.6, (1.6 * BH) / BW]);
    this.board.mesh.position.set(cx, top + 1.05, -room.d / 2 + 0.02);
    room.contents.add(this.board.mesh);
    this.board.paint = () => this.paint();
    this.board.onClick = (id) => this.click(id);
    this.board.repaintOnFonts(() => this.paint());
    register(this.board);
    state.onChange(() => this.paint());
    this.paint();
  }

  click(id: string): void {
    const item = this.goods.find((g) => `buy:${g.id}` === id);
    if (!item || this.state.home.includes(item.id)) return;
    if (this.state.money < item.price) {
      uiDeny();
      this.note = `You need $${Math.ceil(item.price - this.state.money)} more for the ${item.name.toLowerCase()}.`;
      this.noteColour = INK.danger;
      this.paint();
      return;
    }
    // home first: spend() saves and tells everyone (the shack, the wallet, this board)
    this.state.home.push(item.id);
    if (!this.state.spend(item.price)) {
      this.state.home.pop();
      return;
    }
    winFanfare(1);
    this.note = this.villa ? `Sold! The ${item.name.toLowerCase()} is on its way to Coral at Villa Mar.` : `Sold! The ${item.name.toLowerCase()} is on its way to your shack on the beach.`;
    this.noteColour = INK.good;
    this.paint();
  }

  private paint(): void {
    const b = this.board;
    const c = b.ctx;
    const role = ROLES[this.goods[0]?.shop ?? 'F'];
    b.clear();
    roundRect(c, 6, 6, BW - 12, BH - 12, 26);
    c.fillStyle = 'rgba(24, 18, 12, 0.94)';
    c.fill();
    c.lineWidth = 6;
    c.strokeStyle = role?.colour ?? '#b89a72';
    c.stroke();
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    c.font = font(700, 54);
    c.fillStyle = '#f6ecd4';
    c.fillText(role?.title ?? 'SHOP', 40, 76);
    c.font = font(600, 28);
    c.fillStyle = INK.dim;
    c.fillText(this.villa ? 'for Coral’s Villa Mar  ·  delivered with your compliments' : 'for your shack on the beach  ·  delivered straight away', 40, 116);
    c.textAlign = 'right';
    c.font = font(700, 36);
    c.fillStyle = INK.amber;
    c.fillText(`wallet $${Math.floor(this.state.money).toLocaleString('en-US')}`, BW - 40, 76);

    const buttons: { id: string; x: number; y: number; w: number; h: number; enabled?: boolean }[] = [];
    const rowH = 112;
    this.goods.forEach((g, i) => {
      const y = 140 + i * rowH;
      const owned = this.state.home.includes(g.id);
      drawThumb(c, this.pics.get(g.id), 36, y + 4, rowH - 10);
      c.textAlign = 'left';
      c.font = font(700, 40);
      c.fillStyle = owned ? INK.dim : INK.hot;
      c.fillText(g.name, 160, y + 44, 560);
      c.font = font(500, 26);
      c.fillStyle = INK.dim;
      c.fillText(g.blurb, 160, y + 80, 560);
      c.textAlign = 'right';
      c.font = font(700, 40);
      c.fillStyle = owned ? INK.dim : INK.amber;
      c.fillText(`$${g.price.toLocaleString('en-US')}`, 890, y + 60);
      const bx = 910;
      const bw = 250;
      const bh = 80;
      const id = `buy:${g.id}`;
      if (!owned) buttons.push({ id, x: bx, y: y + 12, w: bw, h: bh });
      roundRect(c, bx, y + 12, bw, bh, 16);
      const afford = this.state.money >= g.price;
      c.fillStyle = owned ? 'rgba(63, 214, 106, 0.18)' : b.hover === id ? '#ffc640' : afford ? INK.amber : 'rgba(255,255,255,0.1)';
      c.fill();
      c.textAlign = 'center';
      c.font = font(700, 36);
      c.fillStyle = owned ? INK.good : afford ? '#1a1206' : INK.dim;
      c.fillText(owned ? (this.villa ? 'CORAL’S ♥' : 'AT HOME ✓') : 'BUY', bx + bw / 2, y + 64);
    });
    b.buttons = buttons;
    if (this.note) {
      c.textAlign = 'left';
      c.font = font(600, 28);
      c.fillStyle = this.noteColour;
      c.fillText(this.note, 40, BH - 32, BW - 80);
    }
    b.commit();
  }
}
