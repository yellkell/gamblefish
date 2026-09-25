/**
 * THE FIELD GUIDE: the backpack's second tab, a book of the island's marine fauna that fills
 * itself in as you fish.
 *
 * It lies open in the tray (the tray's slots and fish put away while it's out), two pages at a
 * time: a title page with how many you've found, then two species to a page — and the big,
 * rare ones (the tarpon and the trophy fish) a page each, at the back. A species you haven't
 * caught is a shadow and a hint of where and when to look; the first one you land fills its
 * entry in: its picture (Tidewater's own model, photographed once), its names, where it lives
 * and when it bites, how many you've had and your best. Point at the arrows in the page corners
 * to turn.
 */

import { Group, Mesh, MeshLambertMaterial, BoxGeometry, Vector3 } from 'three';
import type { WebGLRenderer } from 'three';
import { uiClick } from '../audio/sfx.ts';
import type { Props } from '../fishing/props.ts';
import { FISH, FISH_IDS, fishLengthCm, type GameState, type HabitatKey } from '../fishing/tidewater.ts';
import { TIMED } from '../fishing/timedFish.ts';
import { TROPHY } from '../fishing/trophyFish.ts';
import { font } from '../ui/fonts.ts';
import { InteractivePanel, register } from '../ui/pointer.ts';
import { silhouette, thumbnail } from '../ui/thumbnail.ts';

/** a line or two about each one, in the book's voice */
const NOTES: Record<string, string> = {
  silverside: 'Schools of them flash under the pier. Bait for everything else in the bay.',
  mullet: 'Leaps clear of the water for no reason anyone has found. Grazes the sandy shallows.',
  needlefish: 'All beak and teeth; skitters along the surface when hooked.',
  sergeant: 'Bold little damselfish, barred like a sergeant’s sleeve. Guards its eggs on the piles.',
  grunt: 'Grunts when you lift it out, grinding its throat teeth. Crowds the shade under the pier.',
  yellowtail: 'A yellow stripe nose to tail. Feeds at first and last light over the reef.',
  chromis: 'An electric-blue speck over the coral. Hardly a mouthful.',
  tang: 'Blue as the lagoon, with a scalpel hidden by its tail. Handle with care.',
  wrasse: 'The hogfish roots in the sand with its snout. Prized at the market.',
  parrot: 'Chews coral with its beak and makes the island’s white sand.',
  angel: 'Queen of the reef, blue and gold, with a crown spot on its brow.',
  jack: 'A brute for its size. Runs hard and never quits.',
  barracuda: 'Rows of fangs, and curious: it will follow your bobber in.',
  grouper: 'A heavy, patient ambusher of the reef’s caves.',
  redSnapper: 'Deep-water red, and the best eating on the island.',
  tuna: 'Built like a torpedo. Far out in the blue.',
  mahi: 'Green and gold in the water; it fades once landed.',
  tarpon: 'The silver king: scales like dinner plates, and it leaps again and again when it feels the hook. Rolls at the surface under the pier lamps after dark. Only the strongest line holds one for long.',
  bonefish: 'The grey ghost of the flats. Only about at dawn.',
  trigger: 'Paints its own face blue. Comes up for the midday sun.',
  permit: 'Wary and shy; the sunset makes it bold.',
  lookdown: 'Flat as a coin, and it stares down its nose at you. Night, under the pier lamps.',
  glasseye: 'Huge red eyes for the small hours. Hides by day.',
  roosterfish: 'Raises a comb of long dark spines when it hunts, like a rooster’s crest. Crashes live bait in the surf, and takes 30 lb braid to hold.',
  opah: 'Round as the moon and rose-red, with scarlet fins, and warm-blooded — the only fish that is. Out past the drop-off, for live squid on a surf rod.',
  sailfish: 'The fastest fish in the sea. Raises its cobalt sail to herd baitfish, then slashes through them with its bill. Needs the big-game rod to reach it.',
  swordfish: 'Comes up from the deep only at night, hunting by the light of the squid. Its broad flat sword is a third of its length.',
  marlin: 'The king of the sea. Cobalt back, silver belly, a spear for a bill, and weights you can hardly believe. Everything at the top, and a little luck.',
};

const WHERE: Record<HabitatKey, string> = { shallows: 'the shallows', reef: 'the reef', pier: 'round the pier', bay: 'the open bay', deep: 'deep water' };
const WHEN: Record<string, string> = { day: 'by day', dawnDusk: 'at dawn and dusk', night: 'at night', any: 'any time' };

/** the big rare ones get a page each */
const BIG = ['tarpon', ...Object.keys(TROPHY)];

type Page = { kind: 'title' } | { kind: 'pair'; ids: string[] } | { kind: 'big'; id: string };

const PX: [number, number] = [900, 1170];
const SIZE: [number, number] = [0.3, 0.39];
const PAPER = '#f2e6cc';
const INK_BROWN = '#2e2214';
const INK_FADED = 'rgba(46, 34, 20, 0.55)';

export class FieldGuide {
  readonly group = new Group();
  private readonly pages: Page[];
  private readonly left: InteractivePanel;
  private readonly right: InteractivePanel;
  private spread = 0;
  private readonly pics = new Map<string, HTMLCanvasElement>();
  private readonly shadows = new Map<string, HTMLCanvasElement>();
  private dirty = true;

  constructor(
    private readonly state: GameState,
    props: Props,
    renderer: WebGLRenderer,
  ) {
    const regular = FISH_IDS.filter((id) => !BIG.includes(id));
    this.pages = [{ kind: 'title' }];
    for (let i = 0; i < regular.length; i += 2) this.pages.push({ kind: 'pair', ids: regular.slice(i, i + 2) });
    for (const id of BIG) if (FISH[id]) this.pages.push({ kind: 'big', id });
    if (this.pages.length % 2) this.pages.push({ kind: 'pair', ids: [] });

    // each species photographed side on (snout to +x, flank to the camera), and its shadow
    for (const id of FISH_IDS) {
      const { mesh, uniforms } = props.makeFish(id);
      uniforms.uSwim.value = 0;
      mesh.rotation.y = Math.PI / 2;
      const pic = thumbnail(renderer, mesh, { w: 480, h: 200, dir: new Vector3(0.12, 0.18, 1).normalize() });
      this.pics.set(id, pic);
      this.shadows.set(id, silhouette(pic, 'rgba(70, 52, 32, 0.5)'));
    }

    // the book: a leather board, and the two pages lying on it
    const board = new Mesh(new BoxGeometry(SIZE[0] * 2 + 0.03, 0.012, SIZE[1] + 0.03), new MeshLambertMaterial({ color: 0x5a2e1a }));
    board.position.y = -0.008;
    this.group.add(board);
    this.left = this.page(-SIZE[0] / 2 - 0.002);
    this.right = this.page(SIZE[0] / 2 + 0.002);
    this.left.onClick = () => this.turn(-1);
    this.right.onClick = () => this.turn(1);
    // (once both pages exist: this can run straight away)
    this.right.repaintOnFonts(() => (this.dirty = true));
    this.group.visible = false;
    state.onChange(() => (this.dirty = true));
  }

  private page(x: number): InteractivePanel {
    const p = new InteractivePanel(PX, SIZE);
    p.mesh.rotation.x = -Math.PI / 2;
    p.mesh.position.set(x, 0.001, 0);
    p.paint = () => this.paint();
    register(p);
    this.group.add(p.mesh);
    return p;
  }

  get open(): boolean {
    return this.group.visible;
  }

  show(on: boolean): void {
    this.group.visible = on;
    if (on) this.paint();
  }

  /** per frame while open: repaint when a catch has filled something in */
  update(): void {
    if (this.open && this.dirty) this.paint();
  }

  private turn(d: number): void {
    const n = this.pages.length / 2;
    const s = Math.max(0, Math.min(n - 1, this.spread + d));
    if (s === this.spread) return;
    this.spread = s;
    uiClick();
    this.paint();
  }

  private paint(): void {
    this.dirty = false;
    this.paintPage(this.left, this.spread * 2, 'left');
    this.paintPage(this.right, this.spread * 2 + 1, 'right');
  }

  private paintPage(p: InteractivePanel, n: number, side: 'left' | 'right'): void {
    const c = p.ctx;
    const [W, H] = PX;
    p.clear();
    // paper, darkening into the spine
    c.fillStyle = PAPER;
    c.fillRect(0, 0, W, H);
    const g = c.createLinearGradient(side === 'left' ? W : 0, 0, side === 'left' ? W - 90 : 90, 0);
    g.addColorStop(0, 'rgba(90, 60, 30, 0.35)');
    g.addColorStop(1, 'rgba(90, 60, 30, 0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.textBaseline = 'alphabetic';
    const page = this.pages[n];
    if (page?.kind === 'title') this.title(c);
    else if (page?.kind === 'pair') page.ids.forEach((id, i) => this.entry(c, id, 50 + i * 540, i === 0 && page.ids.length > 1));
    else if (page?.kind === 'big') this.bigEntry(c, page.id);
    // the folio and the corner arrow
    c.textAlign = 'center';
    c.font = font(600, 28);
    c.fillStyle = INK_FADED;
    c.fillText(`— ${n + 1} —`, W / 2, H - 38);
    const last = this.spread >= this.pages.length / 2 - 1;
    const first = this.spread === 0;
    const can = side === 'left' ? !first : !last;
    const bx = side === 'left' ? 30 : W - 190;
    p.buttons = can ? [{ id: side, x: bx, y: H - 110, w: 160, h: 90 }] : [];
    if (can) {
      c.fillStyle = p.hover === side ? '#8a5a2a' : 'rgba(90, 60, 30, 0.75)';
      c.font = font(700, 64);
      c.fillText(side === 'left' ? '◀' : '▶', bx + 80, H - 42);
    }
    p.commit();
  }

  private title(c: CanvasRenderingContext2D): void {
    const W = PX[0];
    const found = FISH_IDS.filter((id) => this.caught(id)).length;
    const trophies = BIG.filter((id) => this.caught(id)).length;
    c.textAlign = 'center';
    c.fillStyle = INK_BROWN;
    c.font = font(700, 96);
    c.fillText('FIELD GUIDE', W / 2, 260);
    c.font = `italic ${font(500, 42)}`;
    c.fillText('to the marine fauna', W / 2, 330);
    c.fillText('of Tidewater Island', W / 2, 380);
    c.strokeStyle = INK_FADED;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(220, 440);
    c.lineTo(W - 220, 440);
    c.stroke();
    c.font = font(700, 60);
    c.fillText(`${found} of ${FISH_IDS.length}`, W / 2, 560);
    c.font = font(600, 32);
    c.fillStyle = INK_FADED;
    c.fillText('species caught and recorded', W / 2, 606);
    // the progress bar
    c.fillStyle = 'rgba(90, 60, 30, 0.2)';
    c.fillRect(170, 650, W - 340, 26);
    c.fillStyle = '#3f7f55';
    c.fillRect(170, 650, ((W - 340) * found) / FISH_IDS.length, 26);
    c.fillStyle = INK_BROWN;
    c.font = font(700, 40);
    c.fillText(`★ ${trophies} of ${BIG.length} big ones`, W / 2, 760);
    c.font = `italic ${font(500, 30)}`;
    c.fillStyle = INK_FADED;
    const lines = ['Two to a page; the big, rare ones', 'have a page to themselves, at the back.', 'Each fills itself in the first time you land one.'];
    lines.forEach((l, i) => c.fillText(l, W / 2, 860 + i * 44));
  }

  private caught(id: string): boolean {
    return (this.state.log[id]?.count ?? 0) > 0;
  }

  /** where it lives and when it bites */
  private whereWhen(id: string): string {
    const f = FISH[id];
    const where = (Object.entries(f.habitat) as [HabitatKey, number][])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([k]) => WHERE[k])
      .join(', ');
    const when = TIMED[id]?.when.replace(/^only bites /, '') ?? WHEN[f.time] ?? '';
    return `${where}  ·  ${when}`;
  }

  private record(id: string): string {
    const e = this.state.log[id];
    if (!e) return '';
    const cm = e.bestCm ?? Math.round(fishLengthCm(id, e.bestKg));
    return `Caught ${e.count}  ·  best ${e.bestKg.toFixed(2)} kg, ${cm} cm  ·  $${FISH[id].price}/kg`;
  }

  private picture(c: CanvasRenderingContext2D, id: string, x: number, y: number, w: number, h: number): void {
    const pic = this.caught(id) ? this.pics.get(id) : this.shadows.get(id);
    if (!pic) return;
    const k = Math.min(w / pic.width, h / pic.height);
    c.drawImage(pic, x + (w - pic.width * k) / 2, y + (h - pic.height * k) / 2, pic.width * k, pic.height * k);
  }

  private entry(c: CanvasRenderingContext2D, id: string, y: number, rule: boolean): void {
    const W = PX[0];
    const f = FISH[id];
    const got = this.caught(id);
    this.picture(c, id, 60, y, W - 120, 290);
    c.textAlign = 'left';
    c.fillStyle = got ? INK_BROWN : INK_FADED;
    c.font = font(700, 50);
    c.fillText(got ? f.name : '? ? ?', 60, y + 342, W - 120);
    c.font = `italic ${font(500, 30)}`;
    c.fillStyle = INK_FADED;
    c.fillText(got ? f.sci : 'not yet caught', 60, y + 380, W - 120);
    c.font = font(600, 28);
    c.fillStyle = INK_BROWN;
    c.fillText(`Found: ${this.whereWhen(id)}`, 60, y + 422, W - 120);
    if (got) {
      c.fillText(this.record(id), 60, y + 458, W - 120);
      c.font = `italic ${font(500, 27)}`;
      c.fillStyle = INK_FADED;
      wrap(c, NOTES[id] ?? '', 60, y + 494, W - 120, 32, 1);
    }
    if (rule) {
      c.strokeStyle = 'rgba(90, 60, 30, 0.3)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(100, y + 525);
      c.lineTo(W - 100, y + 525);
      c.stroke();
    }
  }

  private bigEntry(c: CanvasRenderingContext2D, id: string): void {
    const W = PX[0];
    const f = FISH[id];
    const t = TROPHY[id];
    const got = this.caught(id);
    c.textAlign = 'center';
    c.font = font(700, 34);
    c.fillStyle = '#9a6a1a';
    c.fillText(t ? '★  TROPHY FISH  ★' : '★  THE SILVER KING  ★', W / 2, 96);
    this.picture(c, id, 40, 130, W - 80, 420);
    c.fillStyle = got ? INK_BROWN : INK_FADED;
    c.font = font(700, 72);
    c.fillText(got ? f.name : '? ? ?', W / 2, 640, W - 80);
    c.font = `italic ${font(500, 34)}`;
    c.fillStyle = INK_FADED;
    c.fillText(got ? f.sci : 'not yet caught', W / 2, 688, W - 80);
    c.textAlign = 'left';
    c.font = font(600, 30);
    c.fillStyle = INK_BROWN;
    c.fillText(`Found: ${this.whereWhen(id)}`, 70, 760, W - 140);
    c.fillText(`Up to ${f.kg[1]} kg`, 70, 804, W - 140);
    // how to catch it: always there (the guide is how you learn what a trophy needs)
    if (t) wrap(c, `To catch one: ${t.when}`, 70, 848, W - 140, 38, 2);
    if (got) {
      c.fillText(this.record(id), 70, t ? 940 : 848, W - 140);
      c.font = `italic ${font(500, 29)}`;
      c.fillStyle = INK_FADED;
      wrap(c, NOTES[id] ?? '', 70, t ? 990 : 900, W - 140, 36, t ? 2 : 4);
    }
  }
}

/** Fill `text` into at most `lines` lines of `maxW`, from (x, y) down. */
function wrap(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, lines: number): void {
  const words = text.split(' ');
  let line = '';
  let n = 0;
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (c.measureText(next).width > maxW && line) {
      if (n === lines - 1) {
        c.fillText(`${line} ${words.slice(i).join(' ')}`, x, y + n * lh, maxW);
        return;
      }
      c.fillText(line, x, y + n * lh, maxW);
      n++;
      line = words[i];
    } else line = next;
  }
  if (line) c.fillText(line, x, y + n * lh, maxW);
}
