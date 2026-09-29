/**
 * THE JEWELLER'S WINDOWS (A): a second counter down the right-hand wall, a teller's screen of
 * glass and brass bars along it with two windows cut in it, and a board behind each.
 *
 *   THE PROSPECTOR'S WINDOW   sells the PICKAXE (one of them lies on the counter under it till
 *                             it's yours), and nothing else: where the rocks are and what's in
 *                             them is yours to find out.
 *   WE BUY GEMS               the other window. Every kind in your pouch, how many and what
 *                             they're worth, a SELL for each, and SELL ALL. On a velvet pad under
 *                             it lies one of each kind you've ever found.
 *
 * The main counter at the back still sells the sparkle for Coral's villa (village/homeGoods.ts).
 */

import { Group, Vector3 } from 'three';
import { uiDeny, winFanfare } from '../audio/sfx.ts';
import type { GameState } from '../fishing/tidewater.ts';
import { gemMesh, twinkles } from '../mining/gemMesh.ts';
import { GEM_IDS, GEMS, sellGems } from '../mining/gems.ts';
import { buildPickaxe } from '../mining/rock.ts';
import { casinoEnv } from '../casino/look.ts';
import { Lettering, LOOKS, mount, type InkName } from '../ui/boards.ts';
import { InteractivePanel, register } from '../ui/pointer.ts';
import { silhouette, thumbnail } from '../ui/thumbnail.ts';
import { Batch, M, rounded, turned, type Kit } from './craft.ts';
import { gemCounter, type Interior } from './interiors.ts';
import { mergeStatic } from './merge.ts';

/** what the pickaxe costs */
export const PICKAXE_PRICE = 250;

const PX: [number, number] = [1000, 760];
const SIZE: [number, number] = [0.98, 0.745];

export class GemWindows {
  private readonly pickBoard: InteractivePanel;
  private readonly buyBoard: InteractivePanel;
  private readonly pickLetters: Lettering;
  private readonly buyLetters: Lettering;
  private readonly pics = new Map<string, HTMLCanvasElement>();
  private readonly shadows = new Map<string, HTMLCanvasElement>();
  private pickPic: HTMLCanvasElement | undefined;
  private readonly shownPick: Group;
  /** the pad of stones under the buying window: one of each kind you've found */
  private readonly pad = new Map<string, Group>();
  private pickNote = '';
  private pickNoteInk: InkName = 'dim';
  private buyNote = '';
  private buyNoteInk: InkName = 'dim';

  constructor(
    room: Interior,
    private readonly state: GameState,
    kit: Kit,
  ) {
    const r = kit.renderer;
    const [cx, cz, hx, hz, top] = gemCounter(room.w, room.d);
    const wallX = room.w / 2;
    const g = new Group();
    room.contents.add(g);

    // the counter: panelled walnut, a mahogany top, a brass kick rail on the customers' side
    const b = new Batch();
    const wood = M.wood(r, 'walnut', 0.45);
    const dark = M.wood(r, 'mahogany', 0.3);
    const brass = M.brass(r);
    b.at(wood, rounded(hx * 2, top - 0.05, hz * 2, 0.02), cx, (top - 0.05) / 2, cz);
    b.at(dark, rounded(hx * 2 + 0.08, 0.05, hz * 2 + 0.08, 0.015), cx, top - 0.025, cz);
    for (let i = 0; i < 4; i++) b.at(dark, rounded(0.02, top * 0.62, hz * 0.42, 0.008), cx - hx - 0.005, top * 0.46, cz - hz + (hz * 2 * (i + 0.5)) / 4);
    b.at(brass, turned([[0.012, -hz], [0.012, hz]], 10), cx - hx - 0.05, 0.12, cz, Math.PI / 2, 0, 0);
    // the screen along its front edge: glass between brass bars, two windows cut in it, a lintel
    const sx = cx - hx + 0.06;
    // (low enough that the boards above it read clear over its lintel)
    const sh = 0.46;
    const win: [number, number][] = [
      [cz - hz / 2, 0.44],
      [cz + hz / 2, 0.44],
    ];
    const open = (z: number): boolean => win.some(([wz, ww]) => Math.abs(z - wz) < ww / 2);
    for (let z = cz - hz + 0.02; z <= cz + hz - 0.02; z += 0.075) {
      if (open(z)) continue;
      b.at(brass, turned([[0.006, 0], [0.006, sh]], 8), sx, top, z);
    }
    b.at(brass, rounded(0.05, 0.06, hz * 2, 0.015), sx, top + sh + 0.03, cz);
    b.at(brass, rounded(0.04, 0.03, hz * 2, 0.01), sx, top + 0.015, cz);
    // an arch over each window
    for (const [wz, ww] of win) {
      for (const s of [-1, 1]) b.at(brass, rounded(0.03, sh, 0.03, 0.008), sx, top + sh / 2, wz + (s * ww) / 2);
      b.at(brass, rounded(0.035, 0.035, ww + 0.03, 0.01), sx, top + sh * 0.72, wz);
    }
    // the glass itself, between the bars, either side of each window
    const glass = M.glass(r, '#e8f6ff', 0.12);
    const edges = [cz - hz, win[0][0] - win[0][1] / 2, win[0][0] + win[0][1] / 2, win[1][0] - win[1][1] / 2, win[1][0] + win[1][1] / 2, cz + hz];
    for (let i = 0; i < edges.length; i += 2) {
      const len = edges[i + 1] - edges[i];
      if (len > 0.02) b.at(glass, rounded(0.006, sh - 0.02, len - 0.02, 0.002), sx, top + sh / 2, (edges[i] + edges[i + 1]) / 2);
    }
    // the velvet pad for the stones under the buying window, and a little brass lamp
    const velvet = M.cloth(r, '#1a0c22', 'velvet');
    b.at(velvet, rounded(0.28, 0.02, 0.36, 0.01), cx + 0.02, top + 0.01, win[1][0]);
    b.at(brass, turned([[0.05, 0], [0.05, 0.01], [0.012, 0.02], [0.01, 0.3], [0.02, 0.32], [0, 0.33]], 14), cx + 0.18, top, win[1][0] + win[1][1] / 2 + 0.12);
    b.at(M.glaze(r, '#2a6a4a'), turned([[0, 0], [0.09, 0], [0.07, 0.07], [0, 0.08]], 20), cx + 0.18, top + 0.3, win[1][0] + win[1][1] / 2 + 0.12);
    g.add(mergeStatic(b.group()));

    // the pickaxe lying on the counter under its window, till it's yours
    this.shownPick = buildPickaxe(casinoEnv(r));
    // (lying on its side along the counter, the haft toward the room's back, the point toward you)
    this.shownPick.position.set(cx + 0.02, top + 0.02, win[0][0] + 0.25);
    this.shownPick.rotation.set(0, 0, -Math.PI / 2);
    this.shownPick.scale.setScalar(0.8);
    g.add(this.shownPick);
    const pic = buildPickaxe(casinoEnv(r));
    // side on, the haft running up to the head, diagonal across the picture
    pic.rotation.set(0.75, 0, 0);
    this.pickPic = thumbnail(r, pic, { dir: new Vector3(1, 0.12, 0.08).normalize() });

    // each gem's picture, and its shadow for the ones you've not found
    for (const id of GEM_IDS) {
      const m = gemMesh(id, 0.1, 'thumb');
      m.rotation.set(0.75, 0.5, 0);
      const pic = thumbnail(r, m);
      this.pics.set(id, pic);
      this.shadows.set(id, silhouette(pic, 'rgba(240, 220, 255, 0.18)'));
    }

    // the boards on the wall behind, one over each window, facing the room
    const mk = (z: number, seed: number): [InteractivePanel, Lettering] => {
      const p = new InteractivePanel(PX, SIZE);
      const L = new Lettering(p, LOOKS.velvet, seed);
      mount(p, LOOKS.velvet, { renderer: r });
      p.mesh.position.set(wallX - 0.02 - LOOKS.velvet.frame.d, top + 1.02, z);
      p.mesh.rotation.y = -Math.PI / 2;
      room.contents.add(p.mesh);
      register(p);
      return [p, L];
    };
    [this.pickBoard, this.pickLetters] = mk(win[0][0], 41);
    [this.buyBoard, this.buyLetters] = mk(win[1][0], 43);
    this.pickBoard.paint = () => this.paintPick();
    this.buyBoard.paint = () => this.paintBuy();
    this.pickBoard.onClick = (id) => this.clickPick(id);
    this.buyBoard.onClick = (id) => this.clickBuy(id);
    // (once both boards exist: this can run straight away)
    this.buyBoard.repaintOnFonts(() => this.paint());

    // the pad's stones: one of each kind you've found, in two rows
    GEM_IDS.forEach((id, i) => {
      const holder = new Group();
      holder.add(gemMesh(id, 0.05));
      holder.add(twinkles(2, 0.022, GEMS[id].colour, i + 5, 0.7));
      holder.position.set(cx + 0.02 + ((i % 2) - 0.5) * 0.12, top + 0.045, win[1][0] + (Math.floor(i / 2) - 1.5) * 0.08);
      holder.rotation.set(-0.35, i, 0);
      holder.visible = false;
      g.add(holder);
      this.pad.set(id, holder);
    });

    state.onChange(() => this.paint());
    this.paint();
  }

  private paint(): void {
    this.shownPick.visible = !this.state.gems.pick;
    for (const [id, h] of this.pad) h.visible = !!this.state.gems.log[id];
    this.paintPick();
    this.paintBuy();
  }

  /* ── the prospector's window ─────────────────────────────────────── */

  private clickPick(id: string): void {
    if (id !== 'pick') return;
    const s = this.state;
    if (s.gems.pick) return;
    if (s.money < PICKAXE_PRICE) {
      uiDeny();
      this.pickNote = `You need $${Math.ceil(PICKAXE_PRICE - s.money)} more for the pickaxe.`;
      this.pickNoteInk = 'bad';
      this.paintPick();
      return;
    }
    s.gems.pick = true;
    if (!s.spend(PICKAXE_PRICE)) {
      s.gems.pick = false;
      return;
    }
    winFanfare(5);
    this.pickNote = 'It’s yours! Your field guide has gem pages now.';
    this.pickNoteInk = 'good';
    this.paint();
  }

  private paintPick(): void {
    const L = this.pickLetters;
    const s = this.state;
    const [W, H] = PX;
    const own = s.gems.pick;
    L.begin();
    // just the pick: where to use it is yours to find out
    L.title('PROSPECTOR’S WINDOW', W / 2, 96, 54, 'center', W - 88);
    L.thumb(this.pickPic, 60, 150, 300);
    L.text('Pickaxe', 400, 236, 50, own ? 'dim' : 'ink', 'left', 700, 540);
    L.text('forged steel on hickory', 400, 280, 26, 'dim', 'left', 500, 540);
    L.text(`$${PICKAXE_PRICE}`, 400, 356, 58, own ? 'dim' : 'accent', 'left', 700);
    L.button('pick', own ? 'YOURS ✓' : 'BUY', 400, 392, 540, 100, own ? 'done' : s.money >= PICKAXE_PRICE ? 'go' : 'off', 48);
    L.text('For the big rocks out in the wilds.', W / 2, 580, 28, 'ink', 'center', 600, W - 88);
    if (this.pickNote) L.text(this.pickNote, W / 2, H - 60, 26, this.pickNoteInk, 'center', 600, W - 88);
    L.end();
  }

  /* ── we buy gems ─────────────────────────────────────────────────── */

  private clickBuy(id: string): void {
    const s = this.state;
    const kind = id === 'all' ? null : id.startsWith('sell:') ? id.slice(5) : undefined;
    if (kind === undefined) return;
    const { count, total } = sellGems(s.gems, kind);
    if (!count) {
      uiDeny();
      return;
    }
    s.money += total;
    s.save();
    s.emit();
    winFanfare(total > 400 ? 30 : total > 100 ? 5 : 1);
    this.buyNote = `Sold ${count} stone${count === 1 ? '' : 's'} for $${total.toLocaleString('en-US')}. Beautiful.`;
    this.buyNoteInk = 'good';
    this.paintBuy();
  }

  private paintBuy(): void {
    const L = this.buyLetters;
    const s = this.state;
    const [W, H] = PX;
    const pouch = s.gems.pouch;
    const total = pouch.reduce((a, g) => a + g.value, 0);
    L.begin();
    L.title('WE BUY GEMS', 44, 86, 54, 'left', 520);
    L.text(`by the carat · wallet $${Math.floor(s.money).toLocaleString('en-US')}`, W - 44, 82, 24, 'accent', 'right', 700, 400);
    // two columns of four, a card for each kind
    const cw = (W - 88 - 20) / 2;
    const ch = 118;
    GEM_IDS.forEach((id, i) => {
      const x = 44 + (i % 2) * (cw + 20);
      const y = 118 + Math.floor(i / 2) * (ch + 8);
      const mine = pouch.filter((g) => g.id === id);
      // a kind you've dug out yourself, or one in your pouch (from the case wall: it doesn't go in
      // your book, but it's no mystery once it's in your hand)
      const found = !!s.gems.log[id] || mine.length > 0;
      const worth = mine.reduce((a, g) => a + g.value, 0);
      L.thumb(found ? this.pics.get(id) : this.shadows.get(id), x, y + 6, ch - 12, !mine.length && found);
      L.text(found ? GEMS[id].name : '? ? ?', x + ch + 4, y + 42, 27, found ? 'ink' : 'dim', 'left', 700, cw - ch - 10);
      L.text(mine.length ? `×${mine.length} · $${worth.toLocaleString('en-US')}` : found ? 'none in your pouch' : 'not yet found', x + ch + 4, y + 72, 21, mine.length ? 'accent' : 'dim', 'left', 600, cw - ch - 10);
      if (mine.length) L.button(`sell:${id}`, 'SELL', x + ch + 4, y + 82, 120, 34, 'go', 22);
    });
    L.button('all', pouch.length ? `SELL ALL ${pouch.length} · $${total.toLocaleString('en-US')}` : 'YOUR POUCH IS EMPTY', 44, H - 132, W - 88, 70, pouch.length ? 'go' : 'off', 34);
    if (this.buyNote) L.text(this.buyNote, 44, H - 30, 23, this.buyNoteInk, 'left', 600, W - 88);
    L.end();
  }
}
