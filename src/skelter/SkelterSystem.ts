/**
 * THE HELTER SKELTER: HELTER SKELTER (github.com/yellkell/helter) in its full glory, raised with
 * wood at the back of the village (skelter/site.ts).
 *
 *  THE PLOT      once the deep walk is finished, its plot at the back left of the village is
 *                staked out, with a build crate and a notice board (woodworks/buildSign.ts):
 *                500 logs. Every log that goes in raises the tower: the plinth, then the
 *                candy-striped drum, the slide spiralling up round it, the roof, the finial and
 *                the flag, a timber collar climbing with the work (skelter/clip.ts). Once it's
 *                up it's on the field guide's chart, and the board says RIDE TO THE TOP.
 *  THE TOP       the lift takes you to the balcony, 300 m up, and a warning comes up before you
 *                go: centre yourself in your play space (a ring on the floor marks the middle),
 *                because the ride moves you and you dodge the gates with your real body.
 *  THE RIDE      helter's ride, carried over whole (skelter/slide.ts, coins.ts, tower.ts,
 *                track.ts): three tiers of DOWN's sliding, gates to lean past, a voiced 3-2-1 on
 *                every bay, strings of coins through the gaps. While you're on the tower the
 *                teleport is off and the slide moves you, the rod's away and the island's songs
 *                make way for the ride's. The coins are money: what you've caught goes into your
 *                wallet at every landing (and if a gate takes you off, you keep what you had).
 *  THE BOTTOM    the choice: back up to the top, or off into the village.
 *  AFTER DARK    lanterns all the way up the slide's outer rail come on at dusk, like the pier's
 *                (skelter/lights.ts): the tower's wound in a string of warm lights.
 *
 * How far it's built rides in the save (GameState.woodworks.built.skelter, in logs).
 */

import { createSystem } from '@iwsdk/core';
import { AdditiveBlending, BoxGeometry, ConeGeometry, CylinderGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, RingGeometry, TorusGeometry, Vector3, type Material } from 'three';
import { logThunk, plankLay, uiDeny, winFanfare } from '../audio/sfx.ts';
import { musicView } from '../audio/music.ts';
import { skelterAudio } from '../audio/skelter.ts';
import { Celebration } from '../casino/celebrate.ts';
import { introActive } from '../experience/introGate.ts';
import { Toast } from '../fishing/hud.ts';
import type { GameState } from '../fishing/tidewater.ts';
import { locomotion, teleportPlayer } from '../locomotion/TeleportSystem.ts';
import { font } from '../ui/fonts.ts';
import { INK, Panel, roundRect } from '../ui/panel.ts';
import { InteractivePanel, register } from '../ui/pointer.ts';
import type { BoxCollider } from '../world/data.ts';
import type { SkyState } from '../world/sky.ts';
import { BuildSign, type SignText } from '../woodworks/buildSign.ts';
import { clipAbove, setBuilding, BUILT } from './clip.ts';
import { Coins } from './coins.ts';
import { BARRIER_SIZE, GROUND_LANDING_Y, HEAD_RADIUS, LANDING_HOLD, PLINTH_RADIUS, PLINTH_TOP, ROOF_HEIGHT, SLIDE_PITCH, SLIDE_SPEED, TOTAL_DESCENT, TOTAL_TIERS, TOWER_RADIUS, TOWER_TOP } from './constants.ts';
import { SKY_LIGHT } from './fx.ts';
import { createLights, type SkelterLights } from './lights.ts';
import { HelterPath, helterPath } from './path.ts';
import { SKELTER, TOWARD_VILLAGE } from './site.ts';
import { Slide } from './slide.ts';
import { emit, game, on, resetGameState } from './state.ts';
import { createTower, type TowerHandles } from './tower.ts';
import { createSlideTrack, createStreaks, type StreakHandles, type TrackHandles } from './track.ts';

/** from the plinth's foot to the top of the flag */
const FULL_H = TOWER_TOP + ROOF_HEIGHT + 16;
/** how fast the work climbs (m/s) as the logs go in, and a hammer's knock every so often */
const RISE = 30;
const KNOCK_S = 0.3;
/** the key in the save's woodworks.built */
const KEY = 'skelter';
/** seconds between refreshes of the fast-changing HUD readouts (each one repaints and re-uploads
 * the HUD's canvas: at a tenth of a second the height ticking over had it doing that every frame
 * or two down the slide) */
const HUD_REFRESH = 0.25;
/** and the HUD's repainted at most this often, whatever changed (a string of coins had it
 *  repainting and re-uploading its canvas seven times a second down the slide) */
const HUD_PAINT = 0.2;

export const skelterDeps: {
  state: GameState | null;
  ground: ((x: number, z: number) => number) | null;
  addBox: ((b: BoxCollider) => void) | null;
  removeBox: ((b: BoxCollider) => void) | null;
  /** the island's day (world/sky.ts): the tower's paint is lit by its sun */
  sky: SkyState | null;
  /** is the deep walk finished (the plot opens then) */
  unlocked: (() => boolean) | null;
  /** hide a jump (fx/blink.ts) */
  blink: (() => void) | null;
} = { state: null, ground: null, addBox: null, removeBox: null, sky: null, unlocked: null, blink: null };

export const skelterView: {
  /** you're up the tower (the teleport's off, the rod's away, the backpack stays shut) */
  onTower: boolean;
  /** up in the first two tiers, 100 m and more over the plants: the near plants needn't be kept at
   *  full detail round the tower's foot (main.ts), only for the last tier down to them */
  high: boolean;
  /** how far it's built, 0..1 (the chart draws it at 1) */
  progress: () => number;
  /** where you stand to get on, and what you face (the chart's "go there") */
  gate: { at: [number, number]; face: [number, number] } | null;
  system?: SkelterSystem;
} = { onTower: false, high: false, progress: () => 0, gate: null };

const _v = new Vector3();
const _w = new Vector3();

export class SkelterSystem extends createSystem({}) {
  private ready = false;
  private readonly frame = new Group();
  private floorY = 0;
  private state!: GameState;

  /* the site */
  private tower: TowerHandles | null = null;
  private track: TrackHandles | null = null;
  private lights: SkelterLights | null = null;
  private clipped: Material[] = [];
  private collar!: Group;
  private stakes!: Group;
  private crate!: Group;
  private crateFill!: Object3D;
  private crateBox!: BoxCollider;
  private crateIn = false;
  private sign!: BuildSign;
  private signGroup!: Group;
  private shownH = 0;
  private knock = 0;
  private complete = false;
  private solid: BoxCollider[] = [];
  private solidIn = false;
  private flying: { mesh: Mesh; t: number; from: Vector3 }[] = [];
  private queued = 0;
  private queueT = 0;
  private readonly logGeo = new CylinderGeometry(0.07, 0.08, 0.55, 8).rotateZ(Math.PI / 2);
  private readonly logMat = new MeshLambertMaterial({ color: 0x8a6440 });
  private party!: Celebration;
  private toast!: Toast;

  /* the ride */
  private slide!: Slide;
  private coins!: Coins;
  private streaks!: StreakHandles;
  private ring!: Group;
  private hud!: Panel;
  private banner!: Panel;
  private warn!: InteractivePanel;
  private end!: InteractivePanel;
  private endTitle = '';
  private endLines: string[] = [];
  private hudText = { tier: '', coins: '', big: '', unit: '', alt: '', status: '' };
  private hudDirty = true;
  private hudTick = 0;
  private hudPaintT = 0;
  private bannerTimer = 0;
  private beepAt = 0;
  private winWait = 0;
  private musicTimer: number | null = null;
  private readonly head = new Vector3();
  private readonly headLocal = new Vector3();

  init(): void {
    const d = skelterDeps;
    if (!d.state || !d.ground || !d.addBox) return;
    this.ready = true;
    this.state = d.state;
    this.floorY = d.ground(SKELTER.x, SKELTER.z);
    // the tower's frame: its axis on the plot, turned so the ride lets out facing the village
    const end = helterPath.sample(helterPath.totalLength, HelterPath.makeSample());
    this.frame.position.set(SKELTER.x, this.floorY, SKELTER.z);
    this.frame.rotation.y = Math.atan2(end.position.z, end.position.x) - Math.atan2(TOWARD_VILLAGE[1], TOWARD_VILLAGE[0]);
    this.scene.add(this.frame);
    this.frame.updateMatrixWorld(true);

    this.buildSite(d.ground);
    this.party = new Celebration(this.scene, (x, z) => Math.max(0, d.ground!(x, z)), () => this.renderer.xr.getSession());
    this.toast = new Toast();
    this.toast.panel.mesh.visible = false;
    this.scene.add(this.toast.panel.mesh);
    this.buildRidePanels();

    // what's already in the crate is already built
    this.shownH = this.target();
    this.complete = this.logsIn() >= SKELTER.cost;
    skelterView.progress = () => (this.complete ? 1 : this.shownH / FULL_H);
    const gate = this.gateSpot();
    skelterView.gate = { at: gate, face: [SKELTER.x, SKELTER.z] };
    skelterView.system = this;
    this.sign.draw();
    this.state.onChange(() => this.sign.draw());
    on('slide-complete', () => this.onTierComplete());
    on('final-slide-complete', () => this.onWin());
  }

  /* ── the plot, the crate, the board ─────────────────────────────────── */

  private logsIn(): number {
    return this.state.woodworks.built[KEY] ?? 0;
  }
  private open(): boolean {
    return skelterDeps.unlocked?.() ?? false;
  }
  /** how high the logs in the crate have it */
  private target(): number {
    return (Math.min(SKELTER.cost, this.logsIn()) / SKELTER.cost) * FULL_H;
  }

  /** where the crate and the board stand: at the plinth's edge, toward the village */
  private gateSpot(): [number, number] {
    const r = PLINTH_RADIUS + 4.5;
    return [SKELTER.x + TOWARD_VILLAGE[0] * r, SKELTER.z + TOWARD_VILLAGE[1] * r];
  }

  private buildSite(ground: (x: number, z: number) => number): void {
    // the crate, a big one, at the plinth's edge toward the village, its board on stakes in its back
    const [tx, tz] = TOWARD_VILLAGE;
    const cr = PLINTH_RADIUS + 2.4;
    const cx = SKELTER.x + tx * cr;
    const cz = SKELTER.z + tz * cr;
    this.crate = new Group();
    this.crate.position.set(cx, ground(cx, cz), cz);
    this.crate.rotation.y = Math.atan2(tx, tz);
    const slat = new MeshLambertMaterial({ color: 0x9a7a52 });
    const dark = new MeshLambertMaterial({ color: 0x5a4432 });
    const box = (m: MeshLambertMaterial, sx: number, sy: number, sz: number, x: number, y: number, z: number, ry = 0): Mesh => {
      const o = new Mesh(new BoxGeometry(sx, sy, sz), m);
      o.position.set(x, y, z);
      o.rotation.y = ry;
      this.crate.add(o);
      return o;
    };
    box(dark, 1.16, 0.62, 1.16, 0, 0.31, 0);
    for (const y of [0.1, 0.31, 0.52])
      for (const [x, z, r] of [
        [0, 0.585, 0],
        [0, -0.585, 0],
        [0.585, 0, 1],
        [-0.585, 0, 1],
      ])
        box(slat, 1.18, 0.14, 0.03, x, y, z, (r * Math.PI) / 2);
    this.crateFill = box(new MeshLambertMaterial({ color: 0x7a5636 }), 1.08, 0.1, 1.08, 0, 0.1, 0);
    this.crateBox = { tag: 'buildCrate', walkable: false, solid: true, cx, cz, hx: 0.6, hz: 0.6, rotY: this.crate.rotation.y, top: this.crate.position.y + 0.62, bottom: this.crate.position.y - 1 };
    this.scene.add(this.crate);
    // the board: on its own two posts beside the crate once the crate's gone (it's the ride's sign then)
    this.signGroup = new Group();
    this.signGroup.position.copy(this.crate.position);
    this.signGroup.rotation.y = this.crate.rotation.y;
    this.sign = new BuildSign(71, () => this.signText());
    this.sign.group.position.set(0, 0, -0.4);
    // (bigger than the walks': it's read from across the plot)
    this.sign.group.scale.setScalar(1.4);
    this.sign.group.rotation.x = -0.05;
    this.signGroup.add(this.sign.group);
    this.sign.board.onClick = (id) => {
      if (id !== 'deposit') return;
      if (this.complete) this.goUp();
      else this.deposit();
    };
    this.scene.add(this.signGroup);

    // the plot staked out round where the plinth will go: posts with a red rag on each
    this.stakes = new Group();
    const n = 18;
    const post = new InstancedMesh(new CylinderGeometry(0.035, 0.045, 1.1, 5), new MeshLambertMaterial({ color: 0x8a6a48 }), n);
    const rag = new InstancedMesh(new ConeGeometry(0.09, 0.26, 3).rotateZ(Math.PI / 2), new MeshLambertMaterial({ color: 0xc8322a, side: DoubleSide }), n);
    const m = new Matrix4();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = SKELTER.x + Math.cos(a) * PLINTH_RADIUS;
      const z = SKELTER.z + Math.sin(a) * PLINTH_RADIUS;
      const y = ground(x, z);
      post.setMatrixAt(i, m.makeRotationZ(0.04 * Math.sin(i * 3.1)).setPosition(x, y + 0.45, z));
      rag.setMatrixAt(i, m.makeRotationY(a).setPosition(x + Math.cos(a + 1.3) * 0.12, y + 0.92, z + Math.sin(a + 1.3) * 0.12));
    }
    this.stakes.add(post, rag);
    this.scene.add(this.stakes);

    // the timber collar that climbs with the work
    this.collar = new Group();
    const wood = new MeshLambertMaterial({ color: 0x8a6a48 });
    const ring = new Mesh(new TorusGeometry(TOWER_RADIUS + 1.1, 0.22, 6, 48), wood);
    ring.rotation.x = Math.PI / 2;
    const ring2 = ring.clone();
    ring2.position.y = -2.4;
    const poles = new InstancedMesh(new CylinderGeometry(0.1, 0.1, 5, 5), wood, 16);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      poles.setMatrixAt(i, m.makeTranslation(Math.cos(a) * (TOWER_RADIUS + 1.1), -1.8, Math.sin(a) * (TOWER_RADIUS + 1.1)));
    }
    this.collar.add(ring, ring2, poles);
    this.collar.visible = false;
    this.frame.add(this.collar);

    // what stops an arc once it's up: the plinth to stand on, the tower's drum
    const R = PLINTH_RADIUS - 0.3;
    const strips = 12;
    for (let i = 0; i < strips; i++) {
      const z0 = -R + (i * 2 * R) / strips;
      const z1 = z0 + (2 * R) / strips;
      const hw = z0 < 0 && z1 > 0 ? R : Math.sqrt(R * R - Math.max(z0 * z0, z1 * z1));
      const c = this.frame.localToWorld(_v.set(0, 0, (z0 + z1) / 2));
      this.solid.push({ tag: 'skelterPlinth', walkable: true, solid: true, cx: c.x, cz: c.z, hx: hw, hz: (z1 - z0) / 2 + 0.02, rotY: this.frame.rotation.y, top: this.floorY + PLINTH_TOP, bottom: this.floorY - 0.5 });
    }
    for (let k = 0; k < 4; k++)
      this.solid.push({ tag: 'skelterTower', walkable: false, solid: true, cx: SKELTER.x, cz: SKELTER.z, hx: TOWER_RADIUS * 0.75, hz: TOWER_RADIUS * 0.75, rotY: (k * Math.PI) / 8, top: this.floorY + TOWER_TOP, bottom: this.floorY });
  }

  /** The tower and its slide, made the first time the plot's open (the paint takes a moment to lay out). */
  private ensureTower(): void {
    if (this.tower) return;
    this.tower = createTower();
    this.track = createSlideTrack(helterPath);
    this.lights = createLights(helterPath);
    this.frame.add(this.tower.group, this.track.group, this.lights.group);
    this.clipped = [...clipAbove(this.tower.group), ...clipAbove(this.track.group), ...clipAbove(this.lights.group)];
    // the ride: its slide, its coins, the wind past you
    this.slide = new Slide(this.frame, this.player);
    this.coins = new Coins(this.frame, this.player, (streak, gem) => skelterAudio.coin(streak, gem));
    this.streaks = createStreaks();
    this.player.add(this.streaks.object);
    this.frame.updateMatrixWorld(true);
  }

  private deposit(): void {
    const ww = this.state.woodworks;
    const need = SKELTER.cost - this.logsIn();
    const n = Math.min(ww.wood, need);
    if (!this.open() || n <= 0) return uiDeny();
    ww.wood -= n;
    ww.built[KEY] = this.logsIn() + n;
    this.state.save();
    this.state.emit();
    this.queued += Math.min(n, 16);
  }

  private signText(): SignText {
    const total = SKELTER.cost;
    const inCrate = Math.min(total, this.logsIn());
    const ww = this.state.woodworks;
    if (this.complete)
      return {
        title: 'The Helter Skelter',
        sub: '300 m up, and the long way down',
        progress: -1,
        count: 'Coins you catch are yours',
        note: 'Lean past the gates. Mind the step at the bottom.',
        tag: 'Ride to the top',
        can: !skelterView.onTower,
        done: false,
        go: true,
      };
    const can = this.open() && ww.wood > 0 && inCrate < total;
    return {
      title: 'The Helter Skelter',
      sub: 'a tower 300 m tall, and a slide round it',
      progress: inCrate / total,
      count: inCrate >= total ? 'Going up…' : `${inCrate} of ${total} logs`,
      note:
        inCrate >= total
          ? 'Nearly there.'
          : ww.wood > 0
            ? `You're carrying ${ww.wood} log${ww.wood === 1 ? '' : 's'}.`
            : ww.axe
              ? 'Chop wood in the woodlots, or buy it at the timber yard.'
              : 'Buy an axe, or wood, at the timber yard on the beach.',
      tag: can ? 'Put in wood' : 'Needs wood',
      can,
      done: false,
    };
  }

  /** The work climbs toward what the logs in the crate pay for; it's finished at the top. */
  private updateBuild(dt: number, eye: Vector3): void {
    const open = this.open();
    if (open) this.ensureTower();
    // logs leaving your backpack for the crate
    this.queueT -= dt;
    if (this.queued > 0 && this.queueT <= 0) {
      this.queueT = 0.08;
      this.queued--;
      const m = new Mesh(this.logGeo, this.logMat);
      m.position.copy(eye);
      this.scene.add(m);
      this.flying.push({ mesh: m, t: 0, from: eye.clone() });
    }
    const to = _w.copy(this.crate.position);
    to.y += 0.5;
    this.flying = this.flying.filter((f) => {
      f.t += dt / 0.55;
      const k = Math.min(1, f.t);
      f.mesh.position.lerpVectors(f.from, to, k);
      f.mesh.position.y += Math.sin(k * Math.PI) * 0.9;
      f.mesh.rotation.set(k * 5, k * 3, 0);
      if (k >= 1) {
        this.scene.remove(f.mesh);
        logThunk();
        return false;
      }
      return true;
    });
    this.crateFill.visible = this.queued > 0 || this.flying.length > 0;
    // the tower rises once the logs are in
    const target = this.target();
    const settled = this.queued === 0 && this.flying.length === 0;
    if (settled && this.shownH < target) {
      this.shownH = Math.min(target, this.shownH + RISE * dt);
      this.knock -= dt;
      if (this.knock <= 0) {
        this.knock = KNOCK_S;
        plankLay();
      }
      if (this.shownH >= FULL_H - 1e-3 && !this.complete) this.finish();
    }
    const building = !this.complete && this.shownH > 0;
    if (this.tower && this.track) {
      this.tower.group.visible = this.shownH > 0.01;
      this.track.group.visible = this.shownH > 0.01;
      if (this.lights) this.lights.group.visible = this.shownH > 0.01;
      setBuilding(this.clipped, !this.complete);
      BUILT.value = this.floorY + (this.complete ? 1e6 : this.shownH);
    }
    this.collar.visible = building && this.shownH > 3;
    this.collar.position.y = Math.max(3, this.shownH);
    this.stakes.visible = open && !this.complete && this.shownH < 1;
    const crateUp = open && !this.complete;
    this.crate.visible = crateUp;
    if (crateUp !== this.crateIn) {
      (crateUp ? skelterDeps.addBox! : skelterDeps.removeBox!)(this.crateBox);
      this.crateIn = crateUp;
    }
    this.signGroup.visible = open;
    // once there's a plinth you can stand on it; once it's up, the drum's in the way
    const solid = this.shownH > PLINTH_TOP;
    if (solid !== this.solidIn) {
      for (const b of this.solid) (solid ? skelterDeps.addBox! : skelterDeps.removeBox!)(b);
      this.solidIn = solid;
    }
  }

  private finish(): void {
    this.complete = true;
    this.sign.draw();
    winFanfare(40);
    const gate = this.gateSpot();
    this.party.win({ at: new Vector3(gate[0], this.floorY + 1.5, gate[1]), tier: 3, banner: 'HELTER SKELTER OPEN!', bannerAt: new Vector3(gate[0], this.floorY + 3.2, gate[1]), scale: 3, coins: false });
    this.toast.show('The helter skelter is up! Take the lift to the top from the board by the crate.', 6, INK.good);
    // the chart in the field guide draws it now
    this.state.emit();
  }

  /* ── up the tower ────────────────────────────────────────────────────── */

  /** The lift: to the balcony, 300 m up, and the warning. */
  goUp(): void {
    if (!this.complete || skelterView.onTower) return;
    this.ensureTower();
    this.toTop();
  }

  /** Up to the balcony with a fresh course: from the board below, or again from the end of a ride. */
  private toTop(): void {
    skelterDeps.blink?.();
    this.clearTimer();
    skelterView.onTower = true;
    musicView.away = true;
    skelterAudio.load();
    // (back up after a win, the descent's song is still going)
    skelterAudio.stopRun();
    resetGameState();
    emit('game-reset');
    this.slide.placeAtStart();
    this.slide.buildCourse();
    this.coins.build(this.slide.getGates());
    game.phase = 'START';
    this.showMenu(this.warn);
    this.ring.visible = true;
    this.setHud(false);
    this.banner.mesh.visible = false;
    skelterAudio.playLobby();
  }

  /** Off the tower: onto the plinth where you stand (at the bottom), or down the stairs to the gate. */
  private leave(toGate: boolean): void {
    if (toGate) {
      skelterDeps.blink?.();
      const [gx, gz] = this.gateSpot();
      const x = gx + TOWARD_VILLAGE[0] * 1.5;
      const z = gz + TOWARD_VILLAGE[1] * 1.5;
      teleportPlayer(this.player, x, z, Math.atan2(-(SKELTER.x - x), -(SKELTER.z - z)), skelterDeps.ground!(x, z));
    }
    this.clearTimer();
    resetGameState();
    emit('game-reset');
    game.phase = 'OFF';
    skelterView.onTower = false;
    this.warn.mesh.visible = false;
    this.end.mesh.visible = false;
    this.ring.visible = false;
    this.setHud(false);
    this.banner.mesh.visible = false;
    skelterAudio.stopAll(1.2);
    window.setTimeout(() => {
      if (!skelterView.onTower) musicView.away = false;
    }, 1200);
    this.sign.draw();
  }

  /* ── the ride's panels ──────────────────────────────────────────────── */

  private buildRidePanels(): void {
    const rig = this.player;
    const onTop = (p: Panel): void => {
      const m = p.mesh.material as MeshBasicMaterial;
      m.depthTest = false;
      m.depthWrite = false;
      p.mesh.renderOrder = 60;
      p.mesh.visible = false;
      rig.add(p.mesh);
    };
    // the HUD: above the eyeline, well ahead
    // (painted at half the canvas it's laid out on: plenty for 1.1 m a few metres off, and a
    // quarter of the upload each time it changes)
    this.hud = new Panel([440, 300], [1.1, 0.75], { depthTest: false });
    this.hud.mesh.position.set(0, 2.45, -3.6);
    this.hud.mesh.rotation.x = 0.14;
    onTop(this.hud);
    // the banner (HOLD ON, GO!, LANDED, FINAL DROP)
    this.banner = new Panel([1100, 250], [2.2, 0.5], { depthTest: false });
    this.banner.mesh.position.set(0, 1.15, -2.6);
    this.banner.mesh.rotation.x = -0.18;
    onTop(this.banner);
    // the warning at the top
    this.warn = new InteractivePanel([1100, 860], [1.4, (1.4 * 860) / 1100]);
    this.warn.mesh.position.set(0, 1.42, -1.7);
    onTop(this.warn);
    register(this.warn);
    this.warn.paint = () => this.paintWarn();
    this.warn.onClick = (id) => {
      if (id === 'go') this.startRide();
      else if (id === 'down') this.leave(true);
    };
    this.warn.repaintOnFonts(() => this.paintWarn());
    this.paintWarn();
    // the end of a ride
    this.end = new InteractivePanel([1040, 820], [1.3, 1.025]);
    this.end.mesh.position.set(0, 1.45, -1.8);
    onTop(this.end);
    register(this.end);
    this.end.paint = () => this.paintEnd();
    this.end.onClick = (id) => {
      // (you're still on the tower here, so straight back up, not through the board's goUp)
      if (id === 'again') this.toTop();
      else if (id === 'off') this.leave(game.phase === 'GAME_OVER');
    };
    // the middle of your play space, marked on the balcony floor: step into it
    this.ring = new Group();
    const glow = new MeshBasicMaterial({ color: 0x5ee8d8, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false });
    const r1 = new Mesh(new RingGeometry(0.36, 0.42, 48).rotateX(-Math.PI / 2), glow);
    const r2 = new Mesh(new RingGeometry(0.06, 0.09, 24).rotateX(-Math.PI / 2), glow);
    const fill = new Mesh(new RingGeometry(0.0, 0.36, 48).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0x5ee8d8, transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false }));
    // an arrow on it, down the slide (the rig's −z)
    const arrow = new Mesh(new ConeGeometry(0.08, 0.16, 3).rotateX(-Math.PI / 2), glow);
    arrow.position.set(0, 0.01, -0.55);
    this.ring.add(r1, r2, fill, arrow);
    this.ring.position.y = 0.02;
    this.ring.visible = false;
    rig.add(this.ring);
  }

  private showMenu(p: InteractivePanel): void {
    this.warn.mesh.visible = p === this.warn;
    this.end.mesh.visible = p === this.end;
    p.paint();
  }

  private setHud(shown: boolean): void {
    this.hud.mesh.visible = shown;
    if (shown) this.hudDirty = true;
  }

  private hudSet(key: keyof SkelterSystem['hudText'], value: string): void {
    if (this.hudText[key] === value) return;
    this.hudText[key] = value;
    this.hudDirty = true;
  }

  private showBanner(text: string, seconds: number): void {
    const p = this.banner;
    const c = p.ctx;
    p.clear();
    c.font = font(700, 120);
    const w = Math.min(1060, c.measureText(text).width + 140);
    roundRect(c, (1100 - w) / 2, 26, w, 198, 60);
    c.fillStyle = '#e8322e';
    c.fill();
    c.lineWidth = 12;
    c.strokeStyle = '#fff4e0';
    c.stroke();
    c.fillStyle = '#fff4e0';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 550, 132, 1000);
    p.commit();
    p.mesh.visible = true;
    this.bannerTimer = seconds;
  }

  /** helter's HUD: a cream card with a red rim; tier, coins and height along the top, the big readout, a line of what to do */
  private paintHud(): void {
    const p = this.hud;
    const c = p.ctx;
    const t = this.hudText;
    p.clear();
    c.save();
    c.scale(0.5, 0.5);
    roundRect(c, 8, 8, 864, 584, 44);
    c.fillStyle = '#fff4e0';
    c.fill();
    c.lineWidth = 12;
    c.strokeStyle = '#e8322e';
    c.stroke();
    c.textBaseline = 'alphabetic';
    c.font = font(700, 50);
    c.textAlign = 'left';
    c.fillStyle = '#e8322e';
    c.fillText(t.tier, 50, 90);
    c.textAlign = 'center';
    c.fillStyle = '#b58f1f';
    c.fillText(t.coins, 440, 90);
    c.textAlign = 'right';
    c.fillStyle = '#1e6f9e';
    c.fillText(t.alt, 830, 90);
    c.textAlign = 'center';
    c.fillStyle = '#1a1614';
    c.font = font(700, 280);
    c.fillText(t.big, 440, 380);
    c.font = font(700, 54);
    c.fillStyle = '#a5201d';
    c.fillText(t.unit, 440, 450);
    c.font = font(600, 40);
    c.fillStyle = '#1a1614';
    c.fillText(t.status, 440, 540, 800);
    c.restore();
    p.commit();
  }

  private paintWarn(): void {
    const p = this.warn;
    const c = p.ctx;
    const [W, H] = p.px;
    p.clear();
    roundRect(c, 8, 8, W - 16, H - 16, 44);
    c.fillStyle = '#fff4e0';
    c.fill();
    c.lineWidth = 14;
    c.strokeStyle = '#e8322e';
    c.stroke();
    // hazard stripes across the top
    c.save();
    roundRect(c, 8, 8, W - 16, 70, 44);
    c.clip();
    for (let x = -80; x < W + 80; x += 60) {
      c.fillStyle = (x / 60) % 2 === 0 ? '#e8322e' : '#fff4e0';
      c.beginPath();
      c.moveTo(x, 8);
      c.lineTo(x + 60, 8);
      c.lineTo(x + 30, 78);
      c.lineTo(x - 30, 78);
      c.closePath();
      c.fill();
    }
    c.restore();
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillStyle = '#e8322e';
    c.font = font(700, 84);
    c.fillText('BEFORE YOU DROP', W / 2, 170);
    c.fillStyle = '#1a1614';
    c.font = font(700, 46);
    c.fillText('Centre yourself in your play space.', W / 2, 250, W - 80);
    c.font = font(500, 34);
    c.fillStyle = '#3a2e28';
    const lines = [
      'Step into the ring at your feet, facing down the slide.',
      'The ride moves you, and you dodge the gates by leaning',
      'with your real body: clear about 2 m × 2 m around you.',
      'Ring not under you? Hold the Meta button to recentre.',
    ];
    lines.forEach((l, i) => c.fillText(l, W / 2, 318 + i * 50, W - 90));
    c.font = font(600, 32);
    c.fillStyle = '#b58f1f';
    c.fillText('Every coin you catch goes in your wallet at the landings.', W / 2, 540, W - 90);
    const go = { id: 'go', x: 110, y: 590, w: W - 220, h: 130 };
    const down = { id: 'down', x: 300, y: 740, w: W - 600, h: 84 };
    p.buttons = [go, down];
    roundRect(c, go.x, go.y, go.w, go.h, 36);
    c.fillStyle = p.hover === 'go' ? '#ff5a48' : '#e8322e';
    c.fill();
    c.fillStyle = '#fff4e0';
    c.font = font(700, 58);
    c.fillText("I'M CENTRED. LET'S GO", W / 2, go.y + 85, go.w - 40);
    roundRect(c, down.x, down.y, down.w, down.h, 26);
    c.fillStyle = p.hover === 'down' ? 'rgba(26, 22, 20, 0.2)' : 'rgba(26, 22, 20, 0.08)';
    c.fill();
    c.fillStyle = '#3a2e28';
    c.font = font(600, 36);
    c.fillText('TAKE THE STAIRS DOWN', W / 2, down.y + 56, down.w - 30);
    p.commit();
  }

  private paintEnd(): void {
    const p = this.end;
    const c = p.ctx;
    const [W, H] = p.px;
    p.clear();
    roundRect(c, 8, 8, W - 16, H - 16, 44);
    c.fillStyle = '#fff4e0';
    c.fill();
    c.lineWidth = 14;
    c.strokeStyle = '#e8322e';
    c.stroke();
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillStyle = '#e8322e';
    c.font = font(700, 96);
    c.fillText(this.endTitle, W / 2, 150, W - 80);
    c.fillStyle = '#1a1614';
    c.font = font(600, 42);
    this.endLines.forEach((l, i) => {
      c.fillStyle = i === 0 ? '#b58f1f' : '#1a1614';
      c.font = font(i === 0 ? 700 : 600, i === 0 ? 60 : 40);
      c.fillText(l, W / 2, 250 + i * 70, W - 80);
    });
    const again = { id: 'again', x: 100, y: 500, w: W - 200, h: 130 };
    const off = { id: 'off', x: 220, y: 660, w: W - 440, h: 100 };
    p.buttons = [again, off];
    roundRect(c, again.x, again.y, again.w, again.h, 36);
    c.fillStyle = p.hover === 'again' ? '#ff5a48' : '#e8322e';
    c.fill();
    c.fillStyle = '#fff4e0';
    c.font = font(700, 58);
    c.fillText('BACK UP TO THE TOP', W / 2, again.y + 86, again.w - 40);
    roundRect(c, off.x, off.y, off.w, off.h, 30);
    c.fillStyle = p.hover === 'off' ? 'rgba(26, 22, 20, 0.2)' : 'rgba(26, 22, 20, 0.08)';
    c.fill();
    c.fillStyle = '#3a2e28';
    c.font = font(700, 44);
    c.fillText(game.phase === 'GAME_OVER' ? 'CLIMB DOWN' : 'STEP OFF', W / 2, off.y + 66, off.w - 30);
    p.commit();
  }

  /* ── the ride (helter's GameSystem) ─────────────────────────────────── */

  private clearTimer(): void {
    if (this.musicTimer !== null) window.clearTimeout(this.musicTimer);
    this.musicTimer = null;
  }

  /** BEGIN: the warning's read, the course is up; hold on the balcony for the count. */
  private startRide(): void {
    if (game.phase !== 'START') return;
    this.warn.mesh.visible = false;
    this.ring.visible = false;
    this.clearTimer();
    skelterAudio.stopRun();
    skelterAudio.play('begin', 0.82);
    this.hudTick = 0;
    this.setHud(true);
    emit('game-start');
    this.enterLanding(LANDING_HOLD + 0.8);
  }

  /** Standing on a landing (or the balcony): a beat, no motion, DOWN's voiced 3-2-1, then the next tier. */
  private enterLanding(hold: number): void {
    game.phase = 'LANDING';
    game.timeInPhase = 0;
    game.holdRemaining = hold;
    this.beepAt = 3;
    this.showBanner(game.tier === 1 ? 'HOLD ON' : 'LANDED', 1.4);
  }

  private enterSlide(): void {
    game.phase = 'SLIDE';
    game.timeInPhase = 0;
    this.slide.begin(game.tier - 1);
    if (game.tier === 1) skelterAudio.startDescent();
    this.showBanner(game.tier >= TOTAL_TIERS ? 'FINAL DROP' : 'GO!', 1.4);
  }

  /** What you've caught since the last landing, into your wallet. */
  private payIn(): void {
    if (game.unpaid <= 0) return;
    this.state.money += game.unpaid;
    game.unpaid = 0;
    this.state.save();
    this.state.emit();
  }

  private onTierComplete(): void {
    // escalating praise: "nice" after the first tier, "perfect" after the second
    skelterAudio.play(game.tier === 1 ? 'nice' : 'perfect');
    game.arrival = 1;
    this.landAt();
    this.payIn();
    game.tier += 1;
    this.enterLanding(LANDING_HOLD);
  }

  private onWin(): void {
    game.phase = 'WIN';
    game.arrival = 1;
    this.landAt();
    // all the way down: a leg of the journey (statue/journey.ts), saved with the pay-in
    this.state.journey.rides += 1;
    this.payIn();
    this.state.save();
    this.state.emit();
    skelterAudio.play('welldone');
    this.endTitle = 'YOU MADE IT!';
    this.endLines = [`+$${game.coins} of $${game.coinsTotal} on offer`, `${TOTAL_DESCENT} m down in ${this.formatTime(game.runTime)}`];
    this.setHud(false);
    this.banner.mesh.visible = false;
    // the landing breathes: a few seconds before the board
    this.winWait = 3.2;
  }

  private gameOver(): void {
    game.phase = 'GAME_OVER';
    skelterAudio.play('die');
    window.setTimeout(() => skelterAudio.play('gameover'), 250);
    skelterAudio.stopAll(0.3);
    emit('game-over');
    this.payIn();
    const alt = Math.max(0, Math.round(this.player.position.y - this.floorY - GROUND_LANDING_Y));
    this.endTitle = 'OFF THE RIDE';
    this.endLines = [game.coins > 0 ? `You keep your $${game.coins}` : 'No coins this time', `Tier ${game.tier} of ${TOTAL_TIERS}, ${alt} m up, ${this.formatTime(game.runTime)}`];
    this.setHud(false);
    this.banner.mesh.visible = false;
    this.showMenu(this.end);
  }

  private formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  /** the landing's shockwave, at the rig's feet */
  private landAt(): void {
    const ring = this.track!.arrivalRing;
    ring.position.copy(this.frame.worldToLocal(_v.copy(this.player.position)));
    ring.position.y += 0.05;
    ring.visible = true;
  }

  /* ── the frame ─────────────────────────────────────────────────────── */

  update(delta: number, time: number): void {
    if (!this.ready || introActive()) return;
    const dt = Math.min(delta, 0.05);
    const e = this.camera.matrixWorld.elements;
    this.updateBuild(dt, _v.set(e[12], e[13] - 0.35, e[14]));
    this.party.update(dt, this.camera);
    this.toast.update(dt, this.camera);
    this.lightByDay();
    skelterAudio.update();
    // (the last tier's plants are picked in the landing's hold before it, standing still)
    skelterView.high = skelterView.onTower && game.tier < TOTAL_TIERS;
    if (!this.tower || !this.track) return;
    const t = time / 1000;
    this.tower.uniforms.uTime.value = t;
    this.track.uniforms.uTime.value = t;

    if (skelterView.onTower) {
      // the slide moves you now: no teleport, no snap turn
      locomotion.enabled = false;
      this.ride(dt);
    }
    this.coins.update(dt, time, game.phase === 'SLIDE' ? this.sweep() : null);
    this.effects(dt);
    this.hudPaintT -= dt;
    if (this.hud.mesh.visible && this.hudDirty && this.hudPaintT <= 0) {
      this.hudDirty = false;
      this.hudPaintT = HUD_PAINT;
      this.paintHud();
    }
  }

  /** where the rider's head is across the slide, and the span swept this frame */
  private sweep(): { from: number; to: number; lateral: number } {
    this.player.head.getWorldPosition(this.head);
    return { from: this.slide.previousDistance, to: this.slide.distance, lateral: this.slide.lateralOf(this.head) };
  }

  private ride(dt: number): void {
    if (game.phase === 'SLIDE') this.slide.update(dt);
    // (the slide sets the rig's pose while it runs; otherwise it's held where the ride stopped, so
    // a recentre up here moves the play space's middle to you, not you off the tower)
    if (game.phase !== 'SLIDE' || !game.slideSpeed) this.slide.hold();

    if (game.phase === 'WIN' || game.phase === 'GAME_OVER') {
      if (this.winWait > 0) {
        this.winWait -= dt;
        if (this.winWait <= 0) this.showMenu(this.end);
      }
      return;
    }
    if (game.phase === 'START') return;

    game.runTime += dt;
    game.timeInPhase += dt;
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.mesh.visible = false;
    }
    this.hudSet('tier', game.tier >= TOTAL_TIERS ? 'FINAL TIER' : `TIER ${game.tier}/${TOTAL_TIERS}`);
    this.hudSet('coins', `$${game.coins}`);
    this.hudTick -= dt;
    const refresh = this.hudTick <= 0;
    if (refresh) {
      this.hudTick = HUD_REFRESH;
      this.hudSet('alt', `ALT ${Math.max(0, Math.round(this.player.position.y - this.floorY - GROUND_LANDING_Y))}M`);
    }

    if (game.phase === 'LANDING') {
      game.holdRemaining -= dt;
      const remaining = Math.max(0, game.holdRemaining);
      this.hudSet('big', Math.ceil(remaining).toFixed(0));
      this.hudSet('unit', ' ');
      this.hudSet('status', game.tier === 1 ? 'GRAB THE RAIL - FACE DOWNHILL' : 'CATCH YOUR BREATH');
      if (remaining <= this.beepAt && this.beepAt > 0) {
        // DOWN's voiced count: THREE... TWO... ONE... then the launch
        skelterAudio.play(this.beepAt === 3 ? 'three' : this.beepAt === 2 ? 'two' : 'one', 0.9);
        this.beepAt -= 1;
      }
      if (remaining <= 0) this.enterSlide();
      return;
    }
    // SLIDE
    if (refresh) this.hudSet('big', Math.round(game.slideSpeed * 3.6).toFixed(0));
    this.hudSet('unit', 'KM/H');
    this.hudSet('status', 'LEAN BETWEEN THE GATES');
    // head against the gates just ahead and around the rig, each in its own frame
    this.player.head.getWorldPosition(this.head);
    const halfW = BARRIER_SIZE.w / 2 + 0.05 + HEAD_RADIUS;
    const halfH = BARRIER_SIZE.h / 2 + HEAD_RADIUS;
    const halfD = BARRIER_SIZE.d / 2 + 0.05 + HEAD_RADIUS;
    const here = this.slide.distance;
    for (const gate of this.slide.getGates()) {
      if (Math.abs(gate.s - here) > 3) continue;
      this.headLocal.copy(this.head);
      gate.group.worldToLocal(this.headLocal);
      if (Math.abs(this.headLocal.x) < halfW && Math.abs(this.headLocal.y) < halfH && Math.abs(this.headLocal.z) < halfD) {
        this.gameOver();
        return;
      }
    }
  }

  /** the landing's shockwave, the wind past you */
  private effects(dt: number): void {
    const ring = this.track!.arrivalRing;
    if (game.arrival > 0) {
      game.arrival = Math.max(0, game.arrival - dt / 0.9);
      const grow = 1 + (1 - game.arrival) * 5.5;
      ring.scale.set(grow, grow, 1);
      (ring.material as MeshBasicMaterial).opacity = game.arrival * 0.9;
      ring.visible = true;
    } else if (ring.visible) ring.visible = false;
    const k = game.slideSpeed / SLIDE_SPEED;
    const u = this.streaks.uniforms;
    u.uStrength.value += (k - u.uStrength.value) * Math.min(1, dt * 4);
    u.uOffset.value += game.slideSpeed * dt * 1.35;
    this.streaks.object.visible = u.uStrength.value > 0.02;
    this.streaks.object.rotation.x = -SLIDE_PITCH;
  }

  /** The painted tower is lit by the island's sun (or moon), and dims with the day; its lanterns
   *  come on at dusk, like the pier's. */
  private lightByDay(): void {
    const sky = skelterDeps.sky;
    if (!sky) return;
    const n = sky.night.value;
    this.lights?.update(n);
    SKY_LIGHT.uSunDir.value.copy(sky.sunDir);
    const c = sky.sunColor;
    const m = Math.max(c.r, c.g, c.b, 1e-3);
    SKY_LIGHT.uSunCol.value.setRGB((c.r / m) * 0.95, (c.g / m) * 0.9, (c.b / m) * 0.82).multiplyScalar(1 - 0.72 * n);
    SKY_LIGHT.uSkyCol.value.setRGB(0.275, 0.363, 0.495).multiplyScalar(1 - 0.6 * n);
    SKY_LIGHT.uGroundCol.value.setRGB(0.162, 0.18, 0.144).multiplyScalar(1 - 0.6 * n);
  }

  /* ── dev ───────────────────────────────────────────────────────────── */

  /** dev: fill the crate, and (`now`) have it up straight away */
  fill(now = false): void {
    this.state.woodworks.built[KEY] = SKELTER.cost;
    this.state.save();
    this.state.emit();
    if (now) this.shownH = FULL_H - 1e-4;
  }
}

