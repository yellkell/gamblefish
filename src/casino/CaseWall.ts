/**
 * The case wall in The Lucky Lure: THE LURE CASE, opened the way a CS case is.
 *
 *  THE WALL   A cabinet against the room's side wall in the Lucky Lure's own look (the roulette
 *             table's boards): black lacquer on a plinth, gold down its edges and round its
 *             cornice, and down its front one column, all one width: THE LURE CASE in gold leaf on
 *             a board at the top, the window, the case's board. At eye height a long window with a gold marker down its middle, and behind the glass a
 *             strip of cards, one per prize, each wearing its grade's colour along the bottom
 *             (each card trimmed at the glass's ends, so none of the strip shows outside it).
 *             Under it the case's board: everything in the case, in grade colours, the odds of
 *             each grade, and OPEN ($50). Point and pull the trigger. The gems are only in the
 *             case once the Jeweller's pickaxe is yours: till then it's logs and fish (and the
 *             board shows just those).
 *  THE SPIN   The prize is drawn first (casino/cases.ts, crypto RNG); the strip is dressed round
 *             it and races past the marker, ticking card by card, slowing and slowing, and comes
 *             to rest with the marker somewhere on your card.
 *  THE PRIZE  Your card comes out of the strip toward you, bigger, in its grade's light (rays
 *             behind it from Restricted up), its size and worth on it; the rest of the strip goes
 *             dark. Mil-Spec and up get a party in the grade's colour (casino/celebrate.ts), bigger
 *             up the grades; Covert and the ★ Rare Special get their banner. Then it's yours:
 *             logs into your backpack, a fish into its grid, a stone into your pouch (none of
 *             them fill the field guide: the book is for what you catch and dig out yourself). A
 *             fish with no room in the backpack is sold on the spot, the money in your wallet.
 *
 * Leaving mid-spin never costs you: the prize is already drawn, and it's yours at once.
 */

import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Shape,
  SRGBColorSpace,
  Vector3,
  type Camera,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { World } from '@iwsdk/core';
import { cardFlip, reelTick, uiClick, uiDeny } from '../audio/sfx.ts';
import { TIER_CSS } from '../backpack/BackpackSystem.ts';
import { findSpot, GRID_SIZES, shapeFor, type Piece, type Rot } from '../backpack/logic.ts';
import type { Props } from '../fishing/props.ts';
import type { GameState } from '../fishing/tidewater.ts';
import { pulseHand } from '../input/haptics.ts';
import { gemMesh } from '../mining/gemMesh.ts';
import { lookFor, Lettering, mount } from '../ui/boards.ts';
import { font } from '../ui/fonts.ts';
import { Panel, roundRect } from '../ui/panel.ts';
import { InteractivePanel, register } from '../ui/pointer.ts';
import { thumbnail } from '../ui/thumbnail.ts';
import type { Interior } from '../village/interiors.ts';
import { CASE_PRICE, contents, GRADES, gradeOf, ITEMS, itemName, openCase, stripFor, type CaseItem, type GradeId, type Prize } from './cases.ts';
import { Celebration, raysTexture, type Tier } from './celebrate.ts';
import { look } from './look.ts';
import { payOut, stake } from './money.ts';

/* ── the cabinet (its own frame: the wall at z = 0, facing +z, floor at y = 0) ── */
/**
 * One column down the front, 6.5 cm apart and all one width: the name's board, the window, the case's
 * board (each board 1.5 m across in a 4.5 cm frame, and the window's housing as wide as the frames).
 */
const BOARD_W = 1.5;
const FRAME = 0.045;
const GAP = 0.065;
const BOARD_Y = 0.98;
const BOARD_H = 0.6;
const STRIP_Y = 1.62;
const FACE_W = BOARD_W + FRAME * 2;
const FACE_H = 0.46;
const HEAD_H = 0.3;
const HEAD_Y = STRIP_Y + FACE_H / 2 + GAP + FRAME + HEAD_H / 2;
/** the body round the column, and how far its front stands out from the wall (village/interiors.ts FURNITURE C holds it) */
const W = FACE_W + GAP * 2;
const DEPTH = 0.17;
const BODY = { y0: 0.1, y1: HEAD_Y + HEAD_H / 2 + FRAME + GAP };
const WIN_W = BOARD_W;
const WIN_H = 0.33;
const CARD_W = 0.235;
const CARD_H = 0.27;
const PITCH = 0.25;
/** the window's housing stands on the body's front (it's 0.05 deep) */
const FACE_Z = DEPTH;
const CARD_Z = FACE_Z + 0.025;
const N_CARDS = 60;
/** where the prize sits in the strip */
const WIN_AT = 52;
/** how long the strip runs */
const SPIN_T = 6.4;
/** the pause on the marker before the card comes out */
const LAND_PAUSE = 0.35;
/** how long the prize card stays out */
const SHOW_T = 4.2;
/** where the prize card comes out to */
const OUT = new Vector3(0, STRIP_Y + 0.03, CARD_Z + 0.215);

export interface CaseWallOptions {
  /** where it hangs, in the room's floor frame: x, z, and its turn (0 = facing +z) */
  at: [number, number, number];
  /** the fish models, for the cards' pictures */
  props: Props;
  /** the island's hour (a fish's "caught at") */
  hour?: () => number;
}

type Phase = 'idle' | 'spinning' | 'landed' | 'showing';

export class CaseWall {
  readonly group = new Group();
  private readonly board: InteractivePanel;
  private readonly letters: Lettering;
  private readonly cards: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  private readonly art = new Map<string, CanvasTexture>();
  private readonly pics = new Map<string, HTMLCanvasElement>();
  private readonly prizeCard: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly prizeGlow: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly prizeRays: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly marker: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly markerGlow: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly party: Celebration;

  private phase: Phase = 'idle';
  private strip: CaseItem[] = [];
  private prize: Prize | null = null;
  private granted = true;
  private t = 0;
  private clock = 0;
  private p = 3 * PITCH; // how far along the strip the marker is (m)
  private p0 = 0;
  private p1 = 0;
  /** where the strip was when its cards were last laid out (it only moves while it spins) */
  private laidP = NaN;
  private lastCard = 0;
  private lastTick = 0;
  private status = 'Open a case: $' + CASE_PRICE;
  private statusInk: 'ink' | 'good' | 'bad' = 'ink';

  constructor(
    private readonly room: Interior,
    private readonly state: GameState,
    private readonly world: World,
    private readonly opts: CaseWallOptions,
  ) {
    const r = world.renderer;
    const g = this.group;
    g.position.set(opts.at[0], 0, opts.at[1]);
    g.rotation.y = opts.at[2];
    room.contents.add(g);

    // the cabinet: black lacquer on a plinth, gold down its edges and round its cornice, in the
    // Lucky Lure's own look (the roulette table's boards: black lacquer, gold leaf, pink enamel)
    const gold = look.gold(r);
    const lacquer = look.gloss(r, 0x160b11);
    const bodyH = BODY.y1 - BODY.y0;
    const plinth = new Mesh(new RoundedBoxGeometry(W + 0.04, BODY.y0, DEPTH + 0.02, 3, 0.02), lacquer);
    plinth.position.set(0, BODY.y0 / 2, (DEPTH + 0.02) / 2);
    const body = new Mesh(new RoundedBoxGeometry(W, bodyH, DEPTH, 4, 0.025), lacquer);
    body.position.set(0, (BODY.y0 + BODY.y1) / 2, DEPTH / 2);
    const cornice = new Mesh(new RoundedBoxGeometry(W + 0.04, 0.05, DEPTH + 0.02, 3, 0.015), lacquer);
    cornice.position.set(0, BODY.y1 + 0.025, (DEPTH + 0.02) / 2);
    g.add(plinth, body, cornice);
    for (const sx of [-1, 1]) {
      const edge = new Mesh(new RoundedBoxGeometry(0.018, bodyH - 0.02, 0.018, 2, 0.007), gold);
      edge.position.set(sx * (W / 2 - 0.004), (BODY.y0 + BODY.y1) / 2, DEPTH - 0.004);
      g.add(edge);
    }
    for (const y of [BODY.y0 + 0.011, BODY.y1 + 0.004]) {
      const band = new Mesh(new RoundedBoxGeometry(W + 0.05, 0.016, DEPTH + 0.03, 2, 0.006), gold);
      band.position.set(0, y, (DEPTH + 0.03) / 2);
      g.add(band);
    }

    // its name at the top, on a board like the one below it (same face, same gold-leaf lettering,
    // same frame), the one place it's said
    const head = new Panel([1400, 280], [BOARD_W, HEAD_H]);
    const headLetters = new Lettering(head, lookFor('C'), 3);
    const paintHead = (): void => {
      headLetters.begin();
      headLetters.title('THE LURE CASE', 700, 186, 116, 'center', 1100);
      headLetters.end();
    };
    paintHead();
    head.repaintOnFonts(paintHead);
    mount(head, lookFor('C'), { renderer: r });
    head.mesh.position.set(0, HEAD_Y, DEPTH + 0.02);
    g.add(head.mesh);

    // the window: a dark well behind the cards, a housing with the window cut in it, a chrome ring
    const well = new Mesh(new PlaneGeometry(WIN_W + 0.06, WIN_H + 0.06), new MeshBasicMaterial({ map: wellTexture() }));
    well.position.set(0, STRIP_Y, FACE_Z + 0.006);
    g.add(well);
    const face = new Shape();
    rrect(face, -FACE_W / 2, STRIP_Y - FACE_H / 2, FACE_W, FACE_H, 0.03);
    const hole = new Shape();
    rrect(hole, -WIN_W / 2, STRIP_Y - WIN_H / 2, WIN_W, WIN_H, 0.02);
    face.holes.push(hole);
    const faceMesh = new Mesh(new ExtrudeGeometry(face, { depth: 0.05, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 }), lacquer);
    faceMesh.position.z = FACE_Z;
    g.add(faceMesh);
    const ringOuter = new Shape();
    rrect(ringOuter, -WIN_W / 2 - 0.018, STRIP_Y - WIN_H / 2 - 0.018, WIN_W + 0.036, WIN_H + 0.036, 0.035);
    const ringHole = new Shape();
    rrect(ringHole, -WIN_W / 2, STRIP_Y - WIN_H / 2, WIN_W, WIN_H, 0.02);
    ringOuter.holes.push(ringHole);
    const ring = new Mesh(new ExtrudeGeometry(ringOuter, { depth: 0.008, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 3 }), look.chrome(r));
    ring.position.z = FACE_Z + 0.058;
    g.add(ring);

    // the cards (only those in the window are drawn, and each is cut off at the window's ends:
    // layout() trims its quad and its picture, so nothing of the strip is ever outside the glass)
    for (let k = 0; k < N_CARDS; k++) {
      const m = new Mesh(new PlaneGeometry(CARD_W, CARD_H), new MeshBasicMaterial({ toneMapped: false }));
      m.visible = false;
      m.frustumCulled = false;
      g.add(m);
      this.cards.push(m);
    }
    // the ends of the window fall into shadow, and glass over it all
    const shade = new Mesh(new PlaneGeometry(WIN_W, WIN_H), new MeshBasicMaterial({ map: shadeTexture(), transparent: true, depthWrite: false }));
    shade.position.set(0, STRIP_Y, CARD_Z + 0.006);
    const glass = new Mesh(new PlaneGeometry(WIN_W, WIN_H), new MeshBasicMaterial({ map: glassTexture(), transparent: true, blending: AdditiveBlending, depthWrite: false }));
    glass.position.set(0, STRIP_Y, CARD_Z + 0.012);
    g.add(shade, glass);

    // the marker: a gold line down the middle, a glow round it, a notch above and below
    this.markerGlow = new Mesh(new PlaneGeometry(0.06, WIN_H), new MeshBasicMaterial({ map: softTexture(), color: 0xffc83a, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.markerGlow.position.set(0, STRIP_Y, CARD_Z + 0.008);
    this.marker = new Mesh(new PlaneGeometry(0.006, WIN_H), new MeshBasicMaterial({ color: 0xffd24a, toneMapped: false }));
    this.marker.position.set(0, STRIP_Y, CARD_Z + 0.009);
    g.add(this.markerGlow, this.marker);
    for (const sy of [-1, 1]) {
      const notch = new Mesh(new CylinderGeometry(0.02, 0.02, 0.01, 3).rotateX(Math.PI / 2).rotateZ(sy > 0 ? Math.PI / 2 : -Math.PI / 2 + Math.PI), gold);
      notch.position.set(0, STRIP_Y + sy * (WIN_H / 2 + 0.03), FACE_Z + 0.066);
      g.add(notch);
    }

    // the prize card, and the light it comes out in
    this.prizeRays = new Mesh(new PlaneGeometry(0.95, 0.95), new MeshBasicMaterial({ map: raysTexture(), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.prizeGlow = new Mesh(new PlaneGeometry(0.75, 0.75), new MeshBasicMaterial({ map: softTexture(), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.prizeCard = new Mesh(new PlaneGeometry(0.34, 0.425), new MeshBasicMaterial({ transparent: true, toneMapped: false }));
    this.prizeRays.renderOrder = 7;
    this.prizeGlow.renderOrder = 8;
    this.prizeCard.renderOrder = 9;
    this.prizeRays.visible = this.prizeGlow.visible = this.prizeCard.visible = false;
    g.add(this.prizeRays, this.prizeGlow, this.prizeCard);

    // every item's picture, and its card
    this.photograph(opts.props);

    // the case's board
    this.board = new InteractivePanel([1400, 560], [BOARD_W, BOARD_H]);
    this.letters = new Lettering(this.board, lookFor('C'), 5);
    mount(this.board, lookFor('C'), { renderer: r });
    this.board.mesh.position.set(0, BOARD_Y, DEPTH + 0.02);
    g.add(this.board.mesh);
    this.board.paint = () => this.paintBoard();
    this.board.onClick = (id) => id === 'open' && this.open();
    register(this.board);
    this.paintBoard();
    this.board.repaintOnFonts(() => this.paintBoard());
    state.onChange(() => this.paintBoard());

    this.party = new Celebration(g, () => 0, () => world.renderer.xr.getSession());

    // a strip to look at before the first case
    const shown = contents(this.gems);
    this.strip = Array.from({ length: N_CARDS }, (_, k) => shown[(k * 7) % shown.length]);
    this.dress();
    this.layout();

    // leaving mid-spin: the prize is already drawn, so it's yours now
    window.addEventListener('pagehide', () => this.grant());
  }

  /* ── pictures ─────────────────────────────────────────────────────── */

  private photograph(props: Props): void {
    const r = this.world.renderer;
    for (const item of ITEMS) {
      if (this.pics.has(item.id)) continue;
      let pic: HTMLCanvasElement;
      if (item.kind === 'fish') {
        const { mesh, uniforms } = props.makeFish(item.of!);
        uniforms.uSwim.value = 0;
        mesh.rotation.y = Math.PI / 2;
        pic = thumbnail(r, mesh, { w: 320, h: 180, dir: new Vector3(0.12, 0.18, 1).normalize() });
      } else if (item.kind === 'gem') {
        const m = gemMesh(item.of!, 0.1, 'thumb');
        m.rotation.set(0.9, 0.4, 0);
        pic = thumbnail(r, m, { w: 220, h: 220 });
      } else pic = thumbnail(r, logPile(item.count!), { w: 260, h: 200, dir: new Vector3(0.35, 0.3, 1).normalize() });
      this.pics.set(item.id, pic);
      this.art.set(item.id, cardTexture(item, pic));
    }
  }

  /* ── opening ──────────────────────────────────────────────────────── */

  /** Are the gems in the case? Only once the pickaxe (and so the pouch) is yours. */
  private get gems(): boolean {
    return this.state.gems.pick;
  }

  private open(): void {
    if (this.phase === 'spinning' || this.phase === 'landed') return uiDeny();
    if (!stake(this.state, CASE_PRICE)) {
      this.say(`You need $${CASE_PRICE - this.state.money} more to open a case`, 'bad');
      return uiDeny();
    }
    uiClick();
    // the prize first; then the strip round it, starting from the cards in the window now so
    // nothing jumps
    const gems = this.gems;
    const prize = openCase(undefined, gems);
    const shown = Math.round(this.p / PITCH);
    const strip = stripFor(prize, N_CARDS, WIN_AT, Math.random, gems);
    for (let k = 0; k < 7; k++) strip[k] = this.strip[Math.max(0, Math.min(N_CARDS - 1, shown - 3 + k))];
    this.strip = strip;
    this.p0 = this.p - (shown - 3) * PITCH;
    // it comes to rest with the marker anywhere on the card but its very edges
    this.p1 = WIN_AT * PITCH + (Math.random() - 0.5) * CARD_W * 0.84;
    this.prize = prize;
    this.granted = false;
    this.phase = 'spinning';
    this.t = 0;
    this.lastCard = Math.floor((this.p0 + PITCH / 2) / PITCH);
    this.prizeCard.visible = this.prizeGlow.visible = this.prizeRays.visible = false;
    this.dress();
    this.say('Opening…', 'ink');
  }

  /** The prize is yours: into the backpack or the pouch, or (no room for it) sold. */
  private grant(): void {
    const p = this.prize;
    if (!p || this.granted) return;
    this.granted = true;
    const s = this.state;
    const name = itemName(p.item);
    const grade = gradeOf(p.item.grade).name;
    if (p.item.kind === 'logs') {
      s.woodworks.wood += p.item.count!;
      s.save();
      s.emit();
      this.say(`${name}, ${grade}: into your backpack (${s.woodworks.wood} logs)`, 'good');
    } else if (p.item.kind === 'gem') {
      // (a stone is only ever drawn with the pouch yours; its log, the book's gem pages, is left
      // alone: those fill from the rocks)
      s.gems.pouch.push({ id: p.item.of!, ct: p.size, value: p.value });
      s.save();
      s.emit();
      this.say(`${name}, ${p.size} ct, ${grade}: into your pouch (the Jeweller pays $${p.value})`, 'good');
    } else {
      const species = p.item.of!;
      const lv = Math.max(0, Math.min(GRID_SIZES.length - 1, s.upgrades.hold | 0));
      const [C, R] = GRID_SIZES[lv];
      const inv = s.inventory as unknown as Piece[];
      const box = s as unknown as { _nextId: number };
      const piece = {
        id: box._nextId,
        species,
        kg: p.size,
        cm: p.cm,
        value: p.value,
        caughtAt: this.opts.hour?.() ?? 12,
        record: false,
        tier: p.tier,
        shape: shapeFor(species, p.cm, p.size),
        placed: true,
        x: 0,
        y: 0,
        rot: 0 as Rot,
      } as unknown as Piece;
      const spot = findSpot(piece, inv, C, R);
      const silver = p.tier ? 'Silver ' : '';
      if (spot) {
        box._nextId++;
        Object.assign(piece, spot);
        inv.push(piece);
        s.save();
        s.emit();
        this.say(`${silver}${name}, ${p.size} kg, ${grade}: into your backpack ($${p.value})`, 'good');
      } else {
        payOut(s, p.value);
        this.say(`${silver}${name}, ${grade}: no room in your backpack, so it's sold for $${p.value}`, 'good');
      }
    }
  }

  private say(text: string, ink: 'ink' | 'good' | 'bad'): void {
    this.status = text;
    this.statusInk = ink;
    this.paintBoard();
  }

  /* ── frame ────────────────────────────────────────────────────────── */

  update(dt: number, camera: Camera): void {
    const e = camera.matrixWorld.elements;
    const inside = this.room.inside(e[12], e[14]);
    this.clock += dt;
    if (this.phase === 'spinning') {
      this.t += dt;
      const u = Math.min(1, this.t / SPIN_T);
      // a flying start, then a long, long slowing: the last few cards crawl past the marker
      this.p = this.p0 + (this.p1 - this.p0) * (1 - Math.pow(1 - u, 4));
      const card = Math.floor((this.p + PITCH / 2) / PITCH);
      if (card !== this.lastCard) {
        this.lastCard = card;
        // a tick for each card over the marker (the sound can't keep up at the start: it skips)
        if (inside && this.clock - this.lastTick > 0.035) {
          this.lastTick = this.clock;
          reelTick(0.7 + 0.5 * u);
          const s = this.world.renderer.xr.getSession() ?? undefined;
          if (u > 0.5) for (const h of ['left', 'right'] as const) pulseHand(s, h, 0.12 + 0.2 * u, 8);
        }
      }
      if (u >= 1) {
        this.phase = 'landed';
        this.t = 0;
      }
    } else if (this.phase === 'landed') {
      this.t += dt;
      if (this.t >= LAND_PAUSE) this.reveal(inside);
    } else if (this.phase === 'showing') {
      this.t += dt;
      if (this.t >= SHOW_T) {
        this.phase = 'idle';
        this.dress();
      }
    }
    this.layout();
    this.updatePrize();
    // the marker breathes; brighter while the strip runs
    this.markerGlow.material.opacity = (this.phase === 'spinning' ? 0.8 : 0.45) + 0.15 * Math.sin(this.clock * 5);
    this.party.update(dt, camera);
  }

  /** Your card comes out, the party goes up, the prize is yours. */
  private reveal(inside: boolean): void {
    const p = this.prize!;
    const grade = gradeOf(p.item.grade);
    const tint = new Color(grade.colour).getHex();
    this.phase = 'showing';
    this.t = 0;
    const m = this.prizeCard.material;
    m.map?.dispose();
    m.map = prizeTexture(p, this.pics.get(p.item.id));
    m.needsUpdate = true;
    this.prizeGlow.material.color.setHex(tint);
    this.prizeRays.material.color.setHex(tint);
    this.prizeCard.visible = this.prizeGlow.visible = true;
    this.prizeRays.visible = rank(p.item.grade) >= 3;
    this.dress(); // the rest of the strip goes dark
    if (inside) cardFlip();
    // the party, in the grade's colour, bigger up the grades
    const at = new Vector3(0, STRIP_Y, CARD_Z + 0.255);
    const g = rank(p.item.grade);
    const tier: Tier | 0 = g >= 5 ? 3 : g >= 3 ? 2 : g >= 2 ? 1 : 0;
    if (tier)
      this.party.win({
        at,
        tier,
        tint,
        coins: p.item.grade === 'rare',
        banner: p.item.grade === 'rare' ? '★ RARE SPECIAL ★' : p.item.grade === 'covert' ? 'COVERT!' : p.item.grade === 'classified' ? 'CLASSIFIED' : undefined,
        bannerAt: new Vector3(0, HEAD_Y, CARD_Z + 0.335),
        hold: p.item.grade === 'rare' ? 3 : 0,
        quiet: !inside,
      });
    this.grant();
  }

  /** Each card's picture, and (with a prize out) all but it darkened. */
  private dress(): void {
    const out = this.phase === 'showing';
    this.cards.forEach((c, k) => {
      const m = c.material;
      const map = this.art.get(this.strip[k]?.id ?? '') ?? null;
      if (m.map !== map) {
        m.map = map;
        m.needsUpdate = true;
      }
      m.color.setScalar(out && k !== WIN_AT ? 0.3 : 1);
    });
  }

  /** Each card where the strip has it, trimmed to the window: its quad and its picture both cut at the glass's ends. */
  private layout(): void {
    if (this.p === this.laidP) return;
    this.laidP = this.p;
    const half = WIN_W / 2;
    this.cards.forEach((c, k) => {
      const x = k * PITCH - this.p;
      const x0 = Math.max(x - CARD_W / 2, -half);
      const x1 = Math.min(x + CARD_W / 2, half);
      c.visible = x1 - x0 > 1e-4;
      if (!c.visible) return;
      c.position.set(0, STRIP_Y, CARD_Z);
      // PlaneGeometry's corners: top left, top right, bottom left, bottom right
      const pos = c.geometry.attributes.position;
      const uv = c.geometry.attributes.uv;
      const u0 = (x0 - (x - CARD_W / 2)) / CARD_W;
      const u1 = (x1 - (x - CARD_W / 2)) / CARD_W;
      pos.setX(0, x0).setX(2, x0).setX(1, x1).setX(3, x1);
      uv.setX(0, u0).setX(2, u0).setX(1, u1).setX(3, u1);
      pos.needsUpdate = true;
      uv.needsUpdate = true;
    });
  }

  private updatePrize(): void {
    if (!this.prizeCard.visible) return;
    const s = this.t;
    // out of the strip toward you with a little overshoot, a slow bob, then back in and gone
    const outK = s < 0.4 ? easeOutBack(s / 0.4) : 1;
    const back = Math.max(0, Math.min(1, (s - (SHOW_T - 0.35)) / 0.35));
    const k = outK * (1 - back);
    const x = this.p1 - WIN_AT * PITCH;
    this.prizeCard.position.set(-x * (1 - k), STRIP_Y + (OUT.y - STRIP_Y) * k + 0.008 * Math.sin(s * 2.4) * k, CARD_Z + 0.01 + (OUT.z - CARD_Z) * k);
    this.prizeCard.scale.setScalar(Math.max(0.001, 0.62 + 0.38 * k));
    const glowK = Math.min(1, s / 0.25) * (1 - back);
    this.prizeGlow.position.copy(this.prizeCard.position).z -= 0.01;
    this.prizeGlow.material.opacity = 0.75 * glowK * (0.85 + 0.15 * Math.sin(s * 6));
    this.prizeGlow.scale.setScalar(0.7 + 0.3 * glowK);
    this.prizeRays.position.copy(this.prizeCard.position).z -= 0.02;
    this.prizeRays.rotation.z = s * 0.4;
    this.prizeRays.material.opacity = 0.6 * glowK;
    if (back >= 1) this.prizeCard.visible = this.prizeGlow.visible = this.prizeRays.visible = false;
  }

  /* ── the board ────────────────────────────────────────────────────── */

  private paintBoard(): void {
    const L = this.letters;
    const c = L.begin();
    // (everything kept in from the gold-leaf fans in the corners; the case's name is on the board over the window)
    L.text(this.status, 80, 66, 26, this.statusInk, 'left', 600, 1060);
    L.text(`$${this.state.money}`, 1316, 66, 28, 'accent', 'right', 700);
    // what's in it, commonest first, each tile in its grade's colour
    const inCase = contents(this.gems);
    inCase.forEach((item, i) => {
      const x = 56 + (i % 9) * 104;
      const y = 108 + Math.floor(i / 9) * 128;
      const col = gradeOf(item.grade).colour;
      c.save();
      roundRect(c, x, y, 96, 118, 10);
      c.fillStyle = 'rgba(12, 14, 22, 0.85)';
      c.fill();
      c.clip();
      const glow = c.createRadialGradient(x + 48, y + 70, 4, x + 48, y + 70, 60);
      glow.addColorStop(0, hexA(col, 0.35));
      glow.addColorStop(1, hexA(col, 0));
      c.fillStyle = glow;
      c.fillRect(x, y, 96, 118);
      const pic = this.pics.get(item.id);
      if (pic) contain(c, pic, x + 4, y + 6, 88, 72);
      c.fillStyle = '#e8ecf4';
      c.font = font(600, 15);
      c.textAlign = 'center';
      c.fillText(itemName(item), x + 48, y + 96, 90);
      c.fillStyle = col;
      c.fillRect(x, y + 108, 96, 10);
      c.restore();
    });
    // the odds of each grade
    const ox = 1006;
    const rx = 1316;
    L.text('THE ODDS', ox, 124, 24, 'dim', 'left', 700);
    GRADES.forEach((g, i) => {
      const y = 160 + i * 34;
      c.fillStyle = g.colour;
      c.fillRect(ox, y - 18, 22, 22);
      L.text(g.name, ox + 34, y, 22, 'ink', 'left', 600, 210);
      L.text(`${(g.odds / 100).toFixed(g.odds < 100 ? 2 : 1)}%`, rx, y, 22, 'ink', 'right', 700);
    });
    const busy = this.phase === 'spinning' || this.phase === 'landed';
    L.button('open', busy ? 'OPENING…' : `OPEN · $${CASE_PRICE}`, ox, 424, rx - ox, 80, busy ? 'off' : this.state.money >= CASE_PRICE ? 'go' : 'off', 36);
    L.end();
  }
}

/** A grade's place, commonest (0) to rarest (6). */
function rank(id: GradeId): number {
  return GRADES.findIndex((g) => g.id === id);
}

function easeOutBack(x: number): number {
  const c1 = 1.8;
  return 1 + (c1 + 1) * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function rrect(s: Shape, x: number, y: number, w: number, h: number, r: number): void {
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
}

/* ── art ──────────────────────────────────────────────────────────────── */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** '#rrggbb' at alpha a */
function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Draw `pic` as big as fits in the box, centred. */
function contain(g: CanvasRenderingContext2D, pic: HTMLCanvasElement, x: number, y: number, w: number, h: number): void {
  const k = Math.min(w / pic.width, h / pic.height);
  const pw = pic.width * k;
  const ph = pic.height * k;
  g.drawImage(pic, x + (w - pw) / 2, y + (h - ph) / 2, pw, ph);
}

/** A card in the strip: the item on dark glass, lit from below in its grade's colour, the grade's bar along the bottom. */
function cardTexture(item: CaseItem, pic: HTMLCanvasElement): CanvasTexture {
  const [c, g] = canvas(240, 276);
  const col = gradeOf(item.grade).colour;
  const bg = g.createLinearGradient(0, 0, 0, 276);
  bg.addColorStop(0, '#2a2f3e');
  bg.addColorStop(1, '#10131b');
  g.fillStyle = bg;
  g.fillRect(0, 0, 240, 276);
  const glow = g.createRadialGradient(120, 190, 10, 120, 170, 150);
  glow.addColorStop(0, hexA(col, 0.5));
  glow.addColorStop(1, hexA(col, 0));
  g.fillStyle = glow;
  g.fillRect(0, 0, 240, 276);
  contain(g, pic, 14, 18, 212, 170);
  g.fillStyle = '#eef1f7';
  g.font = font(600, 24);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(itemName(item), 120, 222, 224);
  g.fillStyle = col;
  g.fillRect(0, 250, 240, 26);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(0, 250, 240, 3);
  g.strokeStyle = 'rgba(255,255,255,0.1)';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, 237, 273);
  return tex(c);
}

/** The prize card: bigger, with its grade, its size and what it's worth (and SILVER, if it is). */
function prizeTexture(p: Prize, pic: HTMLCanvasElement | undefined): CanvasTexture {
  const [c, g] = canvas(400, 500);
  const grade = gradeOf(p.item.grade);
  roundRect(g, 4, 4, 392, 492, 22);
  g.save();
  g.clip();
  const bg = g.createLinearGradient(0, 0, 0, 500);
  bg.addColorStop(0, '#2c3242');
  bg.addColorStop(1, '#0e1118');
  g.fillStyle = bg;
  g.fillRect(0, 0, 400, 500);
  const glow = g.createRadialGradient(200, 200, 10, 200, 200, 230);
  glow.addColorStop(0, hexA(grade.colour, 0.6));
  glow.addColorStop(1, hexA(grade.colour, 0));
  g.fillStyle = glow;
  g.fillRect(0, 0, 400, 500);
  if (pic) contain(g, pic, 24, 40, 352, 250);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = grade.colour;
  g.font = font(700, 26);
  g.fillText(grade.name.toUpperCase(), 200, 306, 370);
  g.fillStyle = '#ffffff';
  g.font = font(700, 40);
  g.fillText(itemName(p.item), 200, 346, 370);
  const size = p.item.kind === 'fish' ? `${p.size} kg · ${p.cm} cm` : p.item.kind === 'gem' ? `${p.size} carats` : 'for your walks';
  g.fillStyle = 'rgba(232, 236, 244, 0.75)';
  g.font = font(600, 24);
  g.fillText(size, 200, 386, 370);
  g.fillStyle = '#ffd24a';
  g.font = font(700, 40);
  g.fillText(`$${p.value.toLocaleString('en-US')}`, 200, 432, 370);
  g.fillStyle = grade.colour;
  g.fillRect(0, 466, 400, 34);
  g.restore();
  g.lineWidth = 6;
  g.strokeStyle = grade.colour;
  roundRect(g, 4, 4, 392, 492, 22);
  g.stroke();
  if (p.tier) {
    // Silver, like a StatTrak's tag: top corner
    roundRect(g, 22, 24, 140, 38, 10);
    g.fillStyle = 'rgba(10, 12, 18, 0.9)';
    g.fill();
    g.strokeStyle = TIER_CSS[1];
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = TIER_CSS[1];
    g.font = font(700, 22);
    g.fillText('SILVER', 92, 44, 128);
  }
  return tex(c);
}

let soft: CanvasTexture | null = null;
function softTexture(): CanvasTexture {
  if (soft) return soft;
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  soft = tex(c);
  return soft;
}

/** The well the cards run in: near black, a little lighter through the middle. */
function wellTexture(): CanvasTexture {
  const [c, g] = canvas(8, 128);
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#07080c');
  grad.addColorStop(0.5, '#171b26');
  grad.addColorStop(1, '#07080c');
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 128);
  return tex(c);
}

/** Dark at the window's ends, clear through the middle: the strip runs out of the light. */
function shadeTexture(): CanvasTexture {
  const [c, g] = canvas(256, 8);
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, 'rgba(4,5,8,0.95)');
  grad.addColorStop(0.2, 'rgba(4,5,8,0.25)');
  grad.addColorStop(0.35, 'rgba(4,5,8,0)');
  grad.addColorStop(0.65, 'rgba(4,5,8,0)');
  grad.addColorStop(0.8, 'rgba(4,5,8,0.25)');
  grad.addColorStop(1, 'rgba(4,5,8,0.95)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 8);
  return tex(c);
}

/** A couple of soft reflections on the glass. */
function glassTexture(): CanvasTexture {
  const [c, g] = canvas(512, 128);
  g.fillStyle = 'rgba(255,255,255,0.07)';
  g.beginPath();
  g.moveTo(120, 0);
  g.lineTo(190, 0);
  g.lineTo(130, 128);
  g.lineTo(60, 128);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.045)';
  g.beginPath();
  g.moveTo(215, 0);
  g.lineTo(232, 0);
  g.lineTo(172, 128);
  g.lineTo(155, 128);
  g.fill();
  return tex(c);
}

/** A little pyramid of logs, their cut ends to the front, for the logs' cards. */
function logPile(count: number): Group {
  const pile = new Group();
  const bark = new MeshLambertMaterial({ color: 0x6e4b2c });
  const end = new MeshLambertMaterial({ map: endGrain() });
  const geo = new CylinderGeometry(0.06, 0.06, 0.4, 14).rotateX(Math.PI / 2);
  // rows from the bottom, one fewer each row up
  let rows = 1;
  while ((rows * (rows + 1)) / 2 < Math.min(count, 21)) rows++;
  for (let row = 0; row < rows; row++) {
    const n = rows - row;
    for (let i = 0; i < n; i++) {
      const log = new Mesh(geo, [bark, end, end]);
      log.position.set((i - (n - 1) / 2) * 0.122, 0.06 + row * 0.106, (Math.sin(i * 3.1 + row) * 0.02));
      pile.add(log);
    }
  }
  return pile;
}

let grain: CanvasTexture | null = null;
/** A log's cut end: pale wood in rings, the bark round it. */
function endGrain(): CanvasTexture {
  if (grain) return grain;
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#4a3220';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#d9b27a';
  g.beginPath();
  g.arc(64, 64, 56, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(140, 94, 50, 0.6)';
  g.lineWidth = 2;
  for (let r = 8; r < 56; r += 7) {
    g.beginPath();
    g.arc(64 + Math.sin(r) * 1.5, 64, r, 0, Math.PI * 2);
    g.stroke();
  }
  grain = tex(c);
  return grain;
}
