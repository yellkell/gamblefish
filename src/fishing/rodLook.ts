/**
 * How each level of the rod, reel and line tracks looks (fishing/gear.ts): the tackle shop's
 * pictures of them (village/wares/tackle.ts) and the rod in your hand (fishing/rod.ts), which is
 * repainted to match whatever you've bought.
 *
 * The rod in your hand is Tidewater's baked combo; the bake tags every vertex with its material
 * and whether it's part of the reel (tools/bake-props.mjs), and rodPaint says what colour each
 * of those takes at your levels. Plain data, so Node runs this file as it is.
 */

/** each rod level: the blank, the grips, the thread wraps at the guides */
export const RODS: { blank: string; len: number; grip: 'cork' | 'eva'; wrap: string }[] = [
  { blank: '#8a6a48', len: 1.9, grip: 'cork', wrap: '#2a2a2e' }, // hand-me-down
  { blank: '#1c1c20', len: 2.1, grip: 'cork', wrap: '#c8a040' }, // 7 ft graphite
  { blank: '#a8201c', len: 2.4, grip: 'eva', wrap: '#f4f0e8' }, // 9 ft surf
  { blank: '#101a3a', len: 2.2, grip: 'eva', wrap: '#c8a040' }, // carbon big-game
];

/** each reel level: the body, its trim, and the body in shadow (the rotor, the side plates) */
export const REELS: { body: string; trim: string; dark: string }[] = [
  { body: '#4a4e56', trim: '#b8bcc4', dark: '#24262a' }, // old spinning reel
  { body: '#c8a040', trim: '#2a2a2e', dark: '#3a2e14' }, // smooth spinning reel
  { body: '#1a2a5a', trim: '#c8ccd4', dark: '#0e1630' }, // conventional reel
  { body: '#c8a040', trim: '#1a1a1e', dark: '#1a1a1e' }, // two-speed lever drag
];

/** each line level's colour: mono, clear mono, then hi-vis braids */
export const LINE = ['#e8e0c0', '#f4f4f0', '#3fd66a', '#ff8a3a', '#3fa0ff'];

const GRIP = { cork: '#b08a58', eva: '#26262a' };

/** the rod's metalwork at each level: tarnished, Tidewater's own (as baked), polished, gold */
const METAL: (string | null)[] = ['#7a7468', null, '#c8ccd4', '#c8a040'];

export interface GearLevels {
  rod: number;
  reel: number;
  line: number;
}

const at = <T>(list: T[], i: number): T => list[Math.max(0, Math.min(list.length - 1, i | 0))];

/**
 * The colour (sRGB) a rod material takes at these gear levels, or null to keep Tidewater's.
 * `mat` is one of the bake's material names; `onReel`, whether that vertex is part of the reel.
 */
export function rodPaint(mat: string, onReel: boolean, g: GearLevels): string | null {
  const r = at(RODS, g.rod);
  const metal = at(METAL, g.rod);
  const rl = at(REELS, g.reel);
  const line = at(LINE, g.line);
  if (onReel) {
    switch (mat) {
      case 'gun':
        return rl.body;
      case 'black':
        return rl.dark;
      case 'champ':
        return rl.trim;
      case 'braid':
      case 'line':
        return line;
      // the guides hang below the seat too, and belong to the rod
      case 'frame':
        return metal;
      default:
        return null;
    }
  }
  switch (mat) {
    case 'blank':
      return r.blank;
    case 'eva':
      return GRIP[r.grip];
    case 'wrap':
      return r.wrap;
    // the thread's trim ring by each wrap, the winding checks, the guides, the seat's hoods
    case 'trim':
    case 'champ':
    case 'frame':
    case 'gun':
    case 'knurl':
      return metal;
    // the big-game rod's butt is a gold gimbal
    case 'rubber':
      return g.rod >= 3 ? '#c8a040' : null;
    case 'seat':
      return g.rod === 0 ? '#3a2a1c' : g.rod >= 2 ? r.blank : null;
    case 'line':
    case 'braid':
      return line;
    default:
      return null;
  }
}
