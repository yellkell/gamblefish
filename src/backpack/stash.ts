/**
 * WHAT YOU CARRY BESIDE THE FISH: off the backpack tray's right rim, the things themselves.
 *
 *  THE LOGS   a little bundle of real logs, bark and pale cut ends with their rings, bound with a
 *             rope: one log for each you carry, up to a full stack of six. A pine tag in front,
 *             the count burnt into it.
 *  THE POUCH  once the Jeweller's pickaxe is yours (and never before): a drawstring pouch of
 *             violet velvet, gold cord and tassels, its mouth open and your best stones peeking
 *             out of it, sparkling, one of each of your three most valuable kinds. A black velvet
 *             tag in front: how many stones, for the Jeweller (not what they're worth).
 *
 * Both sit in the tray's frame (X across, Y up out of the tray, Z down it toward you).
 */

import { BufferGeometry, CatmullRomCurve3, CylinderGeometry, Group, Mesh, MeshLambertMaterial, SphereGeometry, TorusGeometry, TubeGeometry, Vector3, type Points, type WebGLRenderer } from 'three';
import type { GameState } from '../fishing/tidewater.ts';
import { dropTwinkles, gemMesh, twinkles } from '../mining/gemMesh.ts';
import { GEMS } from '../mining/gems.ts';
import { Lettering, LOOKS } from '../ui/boards.ts';
import { Panel } from '../ui/panel.ts';
import { Batch, M, stalk, turned } from '../village/craft.ts';

/** the most logs drawn in the bundle */
const MAX_LOGS = 6;
/** a log's radius (its thick end a touch more), and the rope's */
const LOG_R = 0.017;
const ROPE_R = 0.003;
/** how far the rope stands off the bark (the logs' nine flats and their knots) */
const ROPE_GAP = 0.0006;
/** the tags: canvas px and size (m) */
const TAG_PX: [number, number] = [320, 120];
const TAG_M: [number, number] = [0.13, 0.04875];

export class Stash {
  readonly group = new Group();
  private readonly logs: Mesh[] = [];
  /** the logs, lifted onto the rope that runs under them */
  private readonly bundle = new Group();
  /** the log centres across the bundle's end (x, y), in stacking order */
  private readonly centres: [number, number][] = [];
  /** the rope round the bundle, two turns (gone with the last log but one) */
  private readonly bands: Mesh[] = [];
  private readonly logTag: Panel;
  private readonly logLetters: Lettering;
  private readonly pouch = new Group();
  private readonly gemTag: Panel;
  private readonly gemLetters: Lettering;
  /** the stones in the pouch's mouth, and their sparkle */
  private stones: { holder: Group; sparkle: Points }[] = [];
  private logKey = '';
  private gemKey = '';

  constructor(
    private readonly state: GameState,
    renderer: WebGLRenderer,
  ) {
    // the logs: a pyramid of three, two, one lying across, bound with rope
    const bark = new MeshLambertMaterial({ color: 0x7a5636 });
    const cut = new MeshLambertMaterial({ color: 0xe2c496 });
    const r = LOG_R;
    const len = 0.1;
    const logGeo = new CylinderGeometry(r, r * 1.06, len, 9).rotateX(Math.PI / 2);
    const stack: [number, number][] = [
      [-1, 0],
      [0, 0],
      [1, 0],
      [-0.5, 1],
      [0.5, 1],
      [0, 2],
    ];
    const bundle = this.bundle;
    stack.forEach(([x, row], i) => {
      const m = new Mesh(logGeo, [bark, cut, cut]);
      m.position.set(x * r * 2.05, r + row * r * 1.75, (i % 2 ? 1 : -1) * 0.004);
      this.centres.push([m.position.x, m.position.y]);
      m.rotation.z = i * 1.3;
      bundle.add(m);
      this.logs.push(m);
    });
    // the rope round them, drawn tight round however many there are (update)
    const rope = new MeshLambertMaterial({ color: 0xc8b07a });
    for (const z of [-0.028, 0.028]) {
      const band = new Mesh(undefined, rope);
      this.bands.push(band);
      band.position.z = z;
      bundle.add(band);
    }
    bundle.rotation.y = Math.PI / 2;
    this.group.add(bundle);
    this.logTag = new Panel(TAG_PX, TAG_M, { depthTest: true });
    this.logTag.mesh.rotation.x = -Math.PI / 2;
    this.logTag.mesh.position.set(0, 0.004, 0.068);
    this.logLetters = new Lettering(this.logTag, LOOKS.pine, 3);
    this.group.add(this.logTag.mesh);

    // the pouch: a velvet bag, round-bellied, gathered in pleats at the neck by its cord, a short
    // frill standing up round an open mouth
    const b = new Batch();
    const velvet = M.cloth(renderer, '#4a1a66', 'velvet');
    const gold = M.gold(renderer);
    const bag = turned(
      [
        [0, 0],
        [0.024, 0.002],
        [0.038, 0.011],
        [0.045, 0.026],
        [0.043, 0.043],
        [0.034, 0.058],
        [0.021, 0.068],
        [0.016, 0.074],
        [0.019, 0.08],
        [0.025, 0.088],
        [0.028, 0.094],
        [0.025, 0.096],
        [0.017, 0.089],
        [0.012, 0.084],
        [0, 0.083],
      ],
      54,
    );
    // the pleats: the cloth gathered in folds, deep at the neck and frill, easing out over the belly
    const pos = bag.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const th = Math.atan2(z, x);
      const neck = Math.exp(-(((y - 0.078) / 0.018) ** 2));
      const k = 1 + Math.cos(th * 9) * (0.02 + 0.13 * neck) + Math.cos(th * 5 + 1) * 0.02;
      pos.setXYZ(i, x * k, y, z * k);
    }
    bag.computeVertexNormals();
    b.add(velvet, bag);
    // the dark inside of its mouth
    b.at(M.cloth(renderer, '#12051a', 'velvet'), new CylinderGeometry(0.014, 0.014, 0.002, 18), 0, 0.0845, 0);
    // the cord drawn round the neck, a bow's two ends hanging down it, a tassel on each
    b.at(gold, new TorusGeometry(0.0185, 0.0028, 6, 24).rotateX(Math.PI / 2), 0, 0.074, 0);
    for (const s of [-1, 1]) {
      const end = new Vector3(s * 0.02, 0.028, 0.038);
      b.add(gold, stalk([new Vector3(s * 0.006, 0.074, 0.0185), new Vector3(s * 0.014, 0.062, 0.034), end], 0.0022, 0.0022, 5, 10));
      b.at(gold, turned([[0, 0.012], [0.004, 0.008], [0.006, -0.01], [0, -0.012]], 10), end.x, end.y - 0.01, end.z);
    }
    this.pouch.add(b.group());
    this.pouch.position.set(0, 0, 0.14);
    this.group.add(this.pouch);
    this.gemTag = new Panel(TAG_PX, TAG_M, { depthTest: true });
    this.gemTag.mesh.rotation.x = -Math.PI / 2;
    this.gemTag.mesh.position.set(0, 0.004, 0.214);
    this.gemLetters = new Lettering(this.gemTag, LOOKS.velvet, 5);
    this.group.add(this.gemTag.mesh);
    // (a shadow of velvet under the bag, so it sits on the tray's rim, not over it)
    const foot = new Mesh(new SphereGeometry(0.03, 12, 6).scale(1, 0.12, 1), new MeshLambertMaterial({ color: 0x1a0822 }));
    foot.position.set(0, 0.001, 0.14);
    this.group.add(foot);
    this.pouch.userData.foot = foot;
  }

  /** Per frame while the backpack's open: the counts, the stones in the pouch, their turn. */
  update(time: number): void {
    const s = this.state;
    const n = s.woodworks.wood;
    const logKey = `${n}`;
    if (logKey !== this.logKey) {
      this.logKey = logKey;
      const shown = Math.min(MAX_LOGS, n);
      this.logs.forEach((m, i) => (m.visible = i < shown));
      // a rope round two or more, pulled tight round the stack; nothing to tie round one
      const tied = shown >= 2;
      for (const b of this.bands) b.visible = tied;
      if (tied) {
        const geo = ropeRound(this.centres.slice(0, shown));
        this.bands[0].geometry.dispose();
        for (const b of this.bands) b.geometry = geo;
      }
      // the rope runs under the bottom row: the logs sit on it
      this.bundle.position.y = tied ? LOG_R * 0.06 + ROPE_GAP + 2 * ROPE_R : 0;
      const L = this.logLetters;
      L.begin();
      L.title(n ? `${n} LOG${n === 1 ? '' : 'S'}` : 'NO LOGS', TAG_PX[0] / 2, 84, 56, 'center', TAG_PX[0] - 30);
      L.end();
    }
    // the pouch: only once the pickaxe is yours
    const own = s.gems.pick;
    this.pouch.visible = own;
    (this.pouch.userData.foot as Mesh).visible = own;
    this.gemTag.mesh.visible = own;
    if (!own) return;
    const pouch = s.gems.pouch;
    // its best kinds, peeking out of its mouth
    const best = [...new Set([...pouch].sort((a, b) => b.value - a.value).map((g) => g.id))].slice(0, 3);
    const gemKey = `${pouch.length}|${best.join(',')}`;
    if (gemKey !== this.gemKey) {
      this.gemKey = gemKey;
      for (const st of this.stones) {
        st.holder.removeFromParent();
        dropTwinkles(st.sparkle);
      }
      this.stones = best.map((id, i) => {
        const holder = new Group();
        holder.add(gemMesh(id, 0.022, 'pouch'));
        const sparkle = twinkles(2, 0.013, GEMS[id].colour, i * 17 + 3, 0.45);
        holder.add(sparkle);
        const a = (i / Math.max(1, best.length)) * Math.PI * 2 + 0.6;
        holder.position.set(Math.cos(a) * (best.length > 1 ? 0.008 : 0), 0.09 + (i === 0 ? 0.005 : 0), Math.sin(a) * (best.length > 1 ? 0.008 : 0));
        holder.rotation.set(0.5 * Math.cos(a), a, 0.5 * Math.sin(a));
        this.pouch.add(holder);
        return { holder, sparkle };
      });
      const L = this.gemLetters;
      L.begin();
      const count = pouch.length;
      L.title(count ? `${count} GEM${count === 1 ? '' : 'S'}` : 'EMPTY POUCH', TAG_PX[0] / 2, count ? 58 : 72, count ? 40 : 36, 'center', TAG_PX[0] - 60);
      if (count) L.text('take these to the Jeweller', TAG_PX[0] / 2, 88, 19, 'accent', 'center', 600, TAG_PX[0] - 70);
      L.end();
    }
    this.stones.forEach((st, i) => (st.holder.rotation.y = time * 0.6 + i * 2.1));
  }
}

/**
 * A rope pulled tight round logs lying side by side: round the outside of the stack (the hull of
 * the logs' circles), in the bundle's end plane. Straight across between the outermost logs,
 * following each one's curve where it turns a corner.
 */
function ropeRound(centres: [number, number][]): BufferGeometry {
  const R = LOG_R * 1.06 + ROPE_GAP + ROPE_R;
  // the hull of the centres, anticlockwise (Andrew's monotone chain; points in a line drop out)
  const pts = [...centres].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  const upper: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-12) lower.pop();
    lower.push(p);
  }
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-12) upper.pop();
    upper.push(p);
  }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  // round each corner on its log, a few points along each straight between
  const path: Vector3[] = [];
  const n = hull.length;
  for (let i = 0; i < n; i++) {
    const [px, py] = hull[(i + n - 1) % n];
    const [cx, cy] = hull[i];
    const [nx, ny] = hull[(i + 1) % n];
    // outward, the right-hand side of each edge (the hull runs anticlockwise)
    const a0 = Math.atan2(-(cx - px), cy - py);
    let a1 = Math.atan2(-(nx - cx), ny - cy);
    while (a1 < a0) a1 += Math.PI * 2;
    const steps = Math.max(1, Math.ceil((a1 - a0) / (Math.PI / 10)));
    for (let k = 0; k <= steps; k++) {
      const a = a0 + ((a1 - a0) * k) / steps;
      path.push(new Vector3(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 0));
    }
    // the straight to the next log
    const e = path[path.length - 1];
    const tx = nx - cx;
    const ty = ny - cy;
    for (const f of [0.25, 0.5, 0.75]) path.push(new Vector3(e.x + tx * f, e.y + ty * f, 0));
  }
  return new TubeGeometry(new CatmullRomCurve3(path, true, 'centripetal'), path.length * 2, ROPE_R, 5, true);
}
