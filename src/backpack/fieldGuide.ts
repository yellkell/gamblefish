/**
 * THE FIELD GUIDE: the backpack's second tab, a book of the island's marine fauna that fills
 * itself in as you fish.
 *
 * It lies open in the tray (the tray's slots and fish put away while it's out), two pages at a
 * time: a title page with how many you've found, then two species to a page — and the big,
 * rare ones (the tarpon and the trophy fish) a page each, at the back. A species you haven't
 * caught is a shadow and a hint of where and when to look; the first one you land fills its
 * entry in: its picture (Tidewater's own model, photographed once), its names, where it lives
 * and when it bites, how many you've had and your best, and a true fact about it from the
 * natural history books. Opposite the title page is a chart of the bay (backpack/chart.ts) with
 * the reef, the drop-off, the pier and the village's places, and where you're standing. The
 * great white has the last page to itself. Point at the arrows in the page corners to turn.
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
import { SHARK_ID } from '../fishing/shark.ts';
import { drawChart, KEY, CHART, type ChartSource } from './chart.ts';

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

/** one true thing about each, from the natural history books (shown once you've caught one) */
const FACTS: Record<string, string> = {
  silverside: 'Silversides lay eggs with sticky threads that tangle them onto seagrass and weed.',
  mullet: 'A mullet has a gizzard, like a bird: a muscular stomach that grinds the algae it sifts from the mud.',
  needlefish: 'Its bones are bright green, stained by a bile pigment. It is perfectly safe to eat.',
  sergeant: 'Males turn dark blue while they guard their eggs, a purple patch laid on the rock.',
  grunt: 'Rival grunts face off with their mouths wide open and push, in what looks like a kiss.',
  yellowtail: 'Unlike most snappers it hunts up in open water, well off the bottom.',
  chromis: 'Blue chromis hang in clouds above the coral, picking plankton out of the current.',
  tang: 'Young blue tangs are bright yellow; they turn blue as they grow.',
  wrasse: 'Every hogfish starts life female. The biggest change sex and become males.',
  parrot: 'At night many parrotfish sleep inside a bubble of mucus they blow around themselves.',
  angel: 'Young queen angelfish keep cleaning stations, picking parasites off much bigger fish.',
  jack: 'Crevalle jacks croak when they are caught, and hunt in packs that herd baitfish together.',
  barracuda: 'A great barracuda can strike at around 58 km/h, in a single burst from standing still.',
  grouper: 'Each winter, near the full moon, Nassau groupers gather in thousands at the same spawning sites.',
  redSnapper: 'Red snapper can live for more than 50 years.',
  tuna: 'Tuna must keep swimming to breathe: moving forward is what pushes water over their gills.',
  mahi: 'Mahi-mahi grow astonishingly fast, near full size within a year, and rarely live past five.',
  tarpon: 'Tarpon gulp air at the surface into a lung-like swim bladder, so they thrive in still water.',
  bonefish: 'Bonefish larvae are clear, flat ribbons, like baby eels, that shrink as they turn into fish.',
  trigger: 'It locks its first dorsal spine upright to wedge into a crevice; only the second spine unlocks it.',
  permit: 'Permit crush crabs and clams between hard plates in their throat.',
  lookdown: 'Its silver flanks reflect light in a way that hides it in open water, even from polarised eyes.',
  glasseye: 'It can switch from blood red to silvery pink and back in a few seconds.',
  roosterfish: 'Its comb of spines folds away into a groove along its back when it isn’t hunting.',
  opah: 'The opah swims by flapping its long pectoral fins like wings.',
  sailfish: 'It flashes stripes and colour in an instant as it hunts, perhaps to signal to the rest of its pack.',
  swordfish: 'A pad of heater tissue beside its eyes keeps them warm, so it can see in the cold dark deep.',
  marlin: 'Female blue marlin can weigh four times as much as the males.',
  [SHARK_ID]: 'Pores on its snout, the ampullae of Lorenzini, feel the faint electric field of a heartbeat.',
};

const WHERE: Record<HabitatKey, string> = { shallows: 'the shallows', reef: 'the reef', pier: 'round the pier', bay: 'the open bay', deep: 'deep water' };
const WHEN: Record<string, string> = { day: 'by day', dawnDusk: 'at dawn and dusk', night: 'at night', any: 'any time' };

/** the big rare ones get a page each (the great white the very last) */
const BIG = ['tarpon', ...Object.keys(TROPHY)];

type Page = { kind: 'title' } | { kind: 'chart' } | { kind: 'pair'; ids: string[] } | { kind: 'big'; id: string } | { kind: 'last' };

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

  private chart: ReturnType<typeof drawChart> | null = null;

  constructor(
    private readonly state: GameState,
    props: Props,
    renderer: WebGLRenderer,
    private readonly chartSource: ChartSource | null = null,
    private readonly where: (() => { x: number; z: number }) | null = null,
  ) {
    const regular = FISH_IDS.filter((id) => !BIG.includes(id) && id !== SHARK_ID);
    this.pages = [{ kind: 'title' }, { kind: 'chart' }];
    for (let i = 0; i < regular.length; i += 2) this.pages.push({ kind: 'pair', ids: regular.slice(i, i + 2) });
    for (const id of BIG) if (FISH[id]) this.pages.push({ kind: 'big', id });
    // the great white alone on the last spread's right-hand page
    if (FISH[SHARK_ID]) {
      if (this.pages.length % 2 === 0) this.pages.push({ kind: 'pair', ids: [] });
      this.pages.push({ kind: 'last' });
    }
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
    else if (page?.kind === 'chart') this.chartPage(c);
    else if (page?.kind === 'last') this.lastPage(c);
    else if (page?.kind === 'pair') page.ids.forEach((id, i) => this.entry(c, id, 36 + i * 520, i === 0 && page.ids.length > 1));
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

  /** A true fact, in a ruled box: "Did you know?" and up to `lines` lines. */
  private fact(c: CanvasRenderingContext2D, id: string, x: number, y: number, w: number, lines: number, size: number): void {
    const text = FACTS[id];
    if (!text) return;
    const lh = size * 1.22;
    // size the box to the lines the fact really takes
    c.font = `italic ${font(500, size)}`;
    const used = Math.min(lines, measureLines(c, text, w - 36));
    const h = 44 + used * lh;
    c.fillStyle = 'rgba(154, 106, 26, 0.1)';
    c.fillRect(x, y, w, h);
    c.fillStyle = '#9a6a1a';
    c.fillRect(x, y, 5, h);
    c.textAlign = 'left';
    c.font = font(700, size - 2);
    c.fillText('DID YOU KNOW?', x + 20, y + 30);
    c.font = `italic ${font(500, size)}`;
    c.fillStyle = INK_BROWN;
    wrap(c, text, x + 20, y + 30 + lh, w - 36, lh, lines);
  }

  private entry(c: CanvasRenderingContext2D, id: string, y: number, rule: boolean): void {
    const W = PX[0];
    const f = FISH[id];
    const got = this.caught(id);
    // one entry: 540 px tall; each line has its own slot, so nothing runs into anything else
    this.picture(c, id, 60, y, W - 120, 170);
    c.textAlign = 'left';
    c.fillStyle = got ? INK_BROWN : INK_FADED;
    c.font = font(700, 44);
    c.fillText(got ? f.name : '? ? ?', 60, y + 214, W - 120);
    c.font = `italic ${font(500, 27)}`;
    c.fillStyle = INK_FADED;
    c.fillText(got ? f.sci : 'not yet caught', 60, y + 246, W - 120);
    c.font = font(600, 25);
    c.fillStyle = INK_BROWN;
    c.fillText(`Found: ${this.whereWhen(id)}`, 60, y + 280, W - 120);
    if (got) {
      c.fillText(this.record(id), 60, y + 311, W - 120);
      c.font = `italic ${font(500, 24)}`;
      c.fillStyle = INK_FADED;
      const n = wrap(c, NOTES[id] ?? '', 60, y + 343, W - 120, 28, 2);
      this.fact(c, id, 60, y + 343 + n * 28 - 8, W - 120, 2, 24);
    }
    if (rule) {
      c.strokeStyle = 'rgba(90, 60, 30, 0.3)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(100, y + 508);
      c.lineTo(W - 100, y + 508);
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
    c.fillText(t ? '★  TROPHY FISH  ★' : '★  THE SILVER KING  ★', W / 2, 90);
    this.picture(c, id, 40, 116, W - 80, 330);
    c.fillStyle = got ? INK_BROWN : INK_FADED;
    c.font = font(700, 66);
    c.fillText(got ? f.name : '? ? ?', W / 2, 520, W - 80);
    c.font = `italic ${font(500, 32)}`;
    c.fillStyle = INK_FADED;
    c.fillText(got ? f.sci : 'not yet caught', W / 2, 562, W - 80);
    c.textAlign = 'left';
    c.font = font(600, 28);
    c.fillStyle = INK_BROWN;
    c.fillText(`Found: ${this.whereWhen(id)}`, 70, 616, W - 140);
    c.fillText(`Up to ${f.kg[1]} kg`, 70, 654, W - 140);
    // how to catch it: always there (the guide is how you learn what a trophy needs)
    let y = 700;
    if (t) {
      wrap(c, `To catch one: ${t.when}`, 70, y, W - 140, 36, 2);
      y += 80;
    }
    if (got) {
      c.font = font(600, 28);
      c.fillStyle = INK_BROWN;
      c.fillText(this.record(id), 70, y, W - 140);
      c.font = `italic ${font(500, 27)}`;
      c.fillStyle = INK_FADED;
      const n = wrap(c, NOTES[id] ?? '', 70, y + 40, W - 140, 33, t ? 3 : 4);
      this.fact(c, id, 70, y + 40 + n * 33, W - 140, 3, 26);
    }
  }

  /** The great white, alone at the back: a warning until the rest of the book is full. */
  private lastPage(c: CanvasRenderingContext2D): void {
    const W = PX[0];
    const id = SHARK_ID;
    const f = FISH[id];
    const got = this.caught(id);
    const rest = FISH_IDS.filter((k) => k !== id);
    const left = rest.filter((k) => !this.caught(k)).length;
    c.textAlign = 'center';
    c.font = font(700, 36);
    c.fillStyle = '#8a1a1a';
    c.fillText('★  THE LAST CATCH  ★', W / 2, 90);
    this.picture(c, id, 30, 120, W - 60, 330);
    c.fillStyle = got ? INK_BROWN : INK_FADED;
    c.font = font(700, 66);
    c.fillText(got ? f.name : '? ? ?', W / 2, 520, W - 80);
    c.font = `italic ${font(500, 32)}`;
    c.fillStyle = INK_FADED;
    c.fillText(got ? f.sci : left ? `${left} more ${left === 1 ? 'fish' : 'fish'} in this book first` : 'something huge is out there', W / 2, 562, W - 80);
    c.textAlign = 'left';
    c.font = font(600, 28);
    c.fillStyle = INK_BROWN;
    const how = left
      ? 'Fill every other page of this book. Then fish the deep water, past the drop-off.'
      : 'Deep water past the drop-off, 6 m or more. When it runs, get your other hand on the rod and hold on. Never reel against a run.';
    wrap(c, how, 70, 620, W - 140, 36, 3);
    if (got) {
      c.fillText(this.record(id), 70, 750, W - 140);
      this.fact(c, id, 70, 790, W - 140, 2, 27);
    }
  }

  /** The chart of the bay: the picture, a few water names, where you are, and the key. */
  private chartPage(c: CanvasRenderingContext2D): void {
    const W = PX[0];
    c.textAlign = 'center';
    c.fillStyle = INK_BROWN;
    c.font = font(700, 50);
    c.fillText('CHART OF THE BAY', W / 2, 76);
    if (!this.chartSource) return;
    const X = 40;
    const Y = 100;
    const w = W - 80;
    const h = Math.round((w * (CHART.z1 - CHART.z0)) / (CHART.x1 - CHART.x0));
    this.chart ??= drawChart(this.chartSource, w, h);
    const ch = this.chart;
    c.drawImage(ch.canvas, X, Y);
    const px = (x: number, z: number): [number, number] => {
      const [a, b] = ch.toPx(x, z);
      return [X + a, Y + b];
    };
    // the water, named in italic ink where there's open space for it
    const L = this.chartSource.layout;
    const label = (text: string, x: number, z: number, size = 24): void => {
      const [a, b] = px(x, z);
      c.font = `italic ${font(700, size)}`;
      c.textAlign = 'center';
      c.lineWidth = 5;
      c.strokeStyle = 'rgba(242, 230, 204, 0.85)';
      c.strokeText(text, a, b);
      c.fillStyle = '#1e3a5a';
      c.fillText(text, a, b);
    };
    label('THE REEF', L.reef.x, L.reef.z + 6);
    label('THE SHALLOWS', -60, -30, 22);
    label('THE BAY', 150, 40, 22);
    label('DROP-OFF · 6 m', 128, 100, 20);
    label('DEEP WATER', 20, 140, 24);
    label('THE PIER', L.pier.x + 26, (L.pier.zStart + L.pier.zEnd) / 2 + 12, 20);
    // you are here
    const me = this.where?.();
    if (me && me.x > CHART.x0 && me.x < CHART.x1 && me.z > CHART.z0 && me.z < CHART.z1) {
      const [a, b] = px(me.x, me.z);
      c.fillStyle = '#d0201a';
      c.strokeStyle = '#fff6e0';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(a, b, 10, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.font = font(700, 20);
      c.textAlign = 'left';
      c.lineWidth = 5;
      c.strokeStyle = 'rgba(242, 230, 204, 0.9)';
      c.strokeText('YOU', a + 14, b + 7);
      c.fillStyle = '#d0201a';
      c.fillText('YOU', a + 14, b + 7);
    }
    // the key, in three columns under the chart
    const top = Y + h + 44;
    const colW = (W - 80) / 3;
    c.textAlign = 'left';
    KEY.forEach(([, text], i) => {
      const col = Math.floor(i / 4);
      const row = i % 4;
      const x = 40 + col * colW;
      const y = top + row * 42;
      c.fillStyle = '#9a2a1a';
      c.beginPath();
      c.arc(x + 14, y - 8, 13, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#fff6e0';
      c.font = font(700, i + 1 > 9 ? 15 : 18);
      c.textAlign = 'center';
      c.fillText(String(i + 1), x + 14, y - 2);
      c.textAlign = 'left';
      c.fillStyle = INK_BROWN;
      c.font = font(600, 21);
      c.fillText(text, x + 34, y, colW - 40);
    });
  }
}

/**
 * Fill `text` into at most `lines` lines of `maxW`, from (x, y) down, and say how many it took.
 * Nothing is squeezed: if it runs out of lines the last one ends in an ellipsis.
 */
function wrap(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, lines: number): number {
  const words = text.split(' ').filter(Boolean);
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (c.measureText(next).width > maxW && line) {
      out.push(line);
      line = w;
    } else line = next;
  }
  if (line) out.push(line);
  if (out.length > lines) {
    let last = out.slice(lines - 1).join(' ');
    while (last.length > 1 && c.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
    out.length = lines - 1;
    out.push(`${last.trimEnd()}…`);
  }
  out.forEach((l, i) => c.fillText(l, x, y + i * lh, maxW));
  return out.length;
}

/** How many lines `text` wraps to at `maxW` (in the context's current font). */
function measureLines(c: CanvasRenderingContext2D, text: string, maxW: number): number {
  let n = 1;
  let line = '';
  for (const w of text.split(' ').filter(Boolean)) {
    const next = line ? `${line} ${w}` : w;
    if (c.measureText(next).width > maxW && line) {
      n++;
      line = w;
    } else line = next;
  }
  return n;
}
