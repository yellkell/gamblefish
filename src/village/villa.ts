/**
 * VILLA MAR: Coral's house (L). She's at home — Tidewater's Rocketbox character Marta
 * (public/models/characters) stands in for her, lit like the room rather than by the sky
 * outside (village/characters.ts), waving when you come in — among her own few
 * things: a sofa under the window, a rug, a sideboard, palms in pots. Everything you buy her at
 * the JEWELLER and the BOUTIQUE (village/homeGoods.ts) is delivered to its own spot here, and
 * the board over the sofa keeps count in hearts, with a word from her for each new one.
 */

import { Group, Mesh, PlaneGeometry, TorusGeometry, type Camera } from 'three';
import type { GameState } from '../fishing/tidewater.ts';
import { font } from '../ui/fonts.ts';
import { INK, Panel, roundRect } from '../ui/panel.ts';
import type { BoxCollider } from '../world/data.ts';
import { Character } from './characters.ts';
import { Batch, M, rounded, turned } from './craft.ts';
import { GOODS, rugPaint, Shack, VILLA_SHOPS, type Kit } from './homeGoods.ts';
import type { Interior } from './interiors.ts';
import { mergeStatic } from './merge.ts';
import { turnedLeg } from './wares/builder.ts';
import { kentia } from './wares/florist.ts';
import { LOVE_INTEREST } from './roles.ts';

/** what she says as the gifts come in (by how many she has) */
const WORDS = [
  'Oh — hello. You’re the one who fishes off the pier?',
  'You didn’t have to. …But I’m glad you did.',
  'People are starting to talk about us, you know.',
  'Stay for a drink? The sunset’s better from here.',
  'I told my mother about you.',
  'You remembered what I said about the sea. Nobody remembers.',
  'You’ve made this place feel like a home.',
  'Stay a little longer tonight?',
  'Nobody’s ever spoiled me like this.',
  'Every time the door opens, I hope it’s you.',
  'Ask me. You know what I’ll say.',
];

const PAGE: [number, number] = [900, 300];

export class Villa {
  private readonly coral: Character;
  private readonly board = new Panel(PAGE, [1.5, 0.5]);
  private readonly gifts: string[];
  private said = -1;

  constructor(
    private readonly room: Interior,
    private readonly state: GameState,
    kit: Kit,
    addCollider: (b: BoxCollider) => void,
  ) {
    this.gifts = GOODS.filter((g) => (VILLA_SHOPS as readonly string[]).includes(g.shop)).map((g) => g.id);
    const d = room.d;
    // her own things: the sofa (a collider in interiors.ts FURNITURE), a rug, a sideboard, palms
    const own = new Group();
    const b = new Batch();
    const r = kit.renderer;
    // the sofa: linen over a deep seat, rolled arms, two cushions in her colours, on turned feet
    const linen = M.cloth(r, '#f2eadb');
    const sz = -d / 2 + 0.5;
    b.at(linen, rounded(2.1, 0.3, 0.84, 0.06, 3), 0, 0.3, sz);
    for (const sx of [-0.5, 0.5]) b.at(linen, rounded(0.98, 0.14, 0.68, 0.06, 3), sx, 0.5, sz + 0.06);
    b.at(linen, rounded(2.1, 0.5, 0.22, 0.08, 3), 0, 0.65, sz - 0.32);
    for (const sx of [-1, 1]) {
      b.at(linen, rounded(0.2, 0.34, 0.84, 0.08, 3), sx * 0.97, 0.55, sz);
      b.at(linen, turned([[0, -0.42], [0.1, -0.41], [0.11, -0.38], [0.11, 0.38], [0.1, 0.41], [0, 0.42]], 18), sx * 0.97, 0.72, sz, Math.PI / 2, 0, 0);
    }
    for (const [x, c] of [[-0.55, '#e8506a'], [0.55, '#3fa8a0']] as const) b.at(M.cloth(r, c, 'velvet'), rounded(0.42, 0.38, 0.13, 0.06, 3), x, 0.72, sz - 0.18, -0.2, 0, 0);
    for (const sx of [-1, 1]) for (const dz of [-1, 1]) b.at(M.wood(r, 'walnut', 0.3), turned(turnedLeg(0.15, 0.03), 10), sx * 0.95, 0, sz + dz * 0.34);
    // the sideboard against the right wall, a blue vase on it
    const side = new Group();
    const sb = new Batch();
    const wood = M.wood(r, 'teak', 0.3);
    sb.at(wood, rounded(1.2, 0.62, 0.4, 0.02), 0, 0.46, 0);
    sb.at(wood, rounded(1.26, 0.04, 0.44, 0.012), 0, 0.79, 0);
    for (const x of [-0.3, 0.3]) {
      sb.at(M.wood(r, 'mahogany', 0.35), rounded(0.54, 0.52, 0.02, 0.01), x, 0.46, 0.2);
      sb.at(M.brass(r), new TorusGeometry(0.018, 0.004, 5, 12), x + (x < 0 ? 0.22 : -0.22), 0.5, 0.22);
    }
    for (const sx of [-1, 1]) for (const dz of [-1, 1]) sb.at(wood, turned(turnedLeg(0.15, 0.025), 10), sx * 0.55, 0, dz * 0.15);
    sb.at(M.glaze(r, '#2f6fa8'), turned([[0, 0], [0.06, 0], [0.09, 0.08], [0.08, 0.18], [0.04, 0.26], [0.045, 0.3], [0.04, 0.3]], 24), -0.35, 0.81, 0);
    side.add(sb.group());
    side.position.set(room.w / 2 - 0.32, 0, 0.2);
    side.rotation.y = -Math.PI / 2;
    own.add(b.group(), side);
    // a kentia palm in each back corner, a size up from the florist's
    for (const [x, z] of [[-room.w / 2 + 0.45, -d / 2 + 0.45], [room.w / 2 - 0.45, -d / 2 + 0.45]]) {
      const palm = kentia(kit);
      palm.scale.setScalar(1.45);
      palm.position.set(x, 0, z);
      palm.rotation.y = x;
      own.add(palm);
    }
    room.contents.add(mergeStatic(own));
    const rug = new Mesh(
      new PlaneGeometry(2.6, 1.7).rotateX(-Math.PI / 2),
      rugPaint(512, 336, (g, w, h) => {
        g.fillStyle = '#f4ead6';
        g.fillRect(0, 0, w, h);
        g.strokeStyle = '#e8506a';
        g.lineWidth = 14;
        g.strokeRect(18, 18, w - 36, h - 36);
        g.strokeStyle = '#3fa8a0';
        g.lineWidth = 6;
        g.strokeRect(40, 40, w - 80, h - 80);
        g.fillStyle = '#e8506a';
        g.font = `${h * 0.4}px serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('♥', w / 2, h / 2);
      }),
    );
    rug.position.set(0, 0.03, -0.75);
    room.contents.add(rug);

    // the gifts, each in its spot
    new Shack(room, state, kit, addCollider, VILLA_SHOPS);

    // Coral herself, by the sofa, facing the door — on the bare boards, clear of the rug (its edge
    // is at x −1.3): the rug is drawn over whatever's just above it, and her shoe sank into it
    const at = room.toWorld(-1.8, 0, -0.95);
    this.coral = new Character(`${import.meta.env.BASE_URL}models/characters/marta.glb`, at.x, at.y, at.z, room.frame.yaw, kit.renderer);
    room.group.parent?.add(this.coral.group);

    // the hearts, over the sofa
    this.board.mesh.position.set(0, 2.35, -d / 2 + 0.03);
    room.contents.add(this.board.mesh);
    this.board.repaintOnFonts(() => this.paint(true));
    state.onChange(() => this.paint());
    this.paint();
  }

  /** how many of the villa's things you've given her */
  private count(): number {
    return this.gifts.filter((id) => this.state.home.includes(id)).length;
  }

  private paint(force = false): void {
    const n = this.count();
    if (n === this.said && !force) return;
    // a new gift: she's pleased to see you (the wave), and says so
    if (this.said >= 0 && n > this.said) this.coral.talking = true;
    this.said = n;
    const c = this.board.ctx;
    const [W, H] = PAGE;
    this.board.clear();
    roundRect(c, 6, 6, W - 12, H - 12, 24);
    c.fillStyle = 'rgba(40, 14, 22, 0.9)';
    c.fill();
    c.lineWidth = 5;
    c.strokeStyle = '#e8506a';
    c.stroke();
    c.textBaseline = 'alphabetic';
    c.textAlign = 'center';
    c.font = font(700, 40);
    c.fillStyle = '#ffd8de';
    c.fillText(`${LOVE_INTEREST.name.toUpperCase()}’S HEART`, W / 2, 62);
    const total = this.gifts.length;
    c.font = font(700, 56);
    const hearts = Array.from({ length: total }, (_, i) => (i < n ? '♥' : '♡')).join(' ');
    c.fillStyle = '#e8506a';
    c.fillText(hearts, W / 2, 140, W - 60);
    c.font = font(600, 28);
    c.fillStyle = INK.hot;
    c.fillText(`“${WORDS[Math.min(n, WORDS.length - 1)]}”`, W / 2, 206, W - 60);
    c.font = font(500, 22);
    c.fillStyle = INK.dim;
    c.fillText(n < total ? 'the JEWELLER and the BOUTIQUE deliver here' : 'every gift given', W / 2, 256);
    this.board.commit();
  }

  /** per frame, while the villa can be seen */
  update(dt: number, camera: Camera): void {
    this.coral.group.visible = this.room.group.visible;
    if (!this.room.group.visible) return;
    this.coral.update(dt, camera);
    if (this.coral.talking && !this.room.inside(camera.matrixWorld.elements[12], camera.matrixWorld.elements[14])) this.coral.talking = false;
  }
}
