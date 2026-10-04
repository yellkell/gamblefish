/**
 * The baked fishing props (tools/bake-props.mjs) as three.js meshes.
 *
 * The rod keeps Tidewater's live animation, ported from its WGSL vertex stage
 * (game/FishingRod.js) to GLSL: the blank bends toward the line with a fast action (only the tip
 * under a light load, down into the butt under a heavy one), the rotor spins, the bail flips
 * open for the cast, the crank turns, the spool oscillates and slips back when the drag gives.
 * With a conventional reel on it (fishing/conventionalReel.ts, fitted by fishing/rod.ts) the
 * spinning reel folds away, the guides turn to the top, and the new reel's spool, handle and drag
 * lever turn about its axle.
 * The fish get a swimming body wave that grows toward the tail, with fins fluttering over it,
 * and Tidewater's own procedural skin (fishing/fishSkin.ts): scales, markings, fin rays, eyes,
 * the silvery sheen.
 */

import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshLambertMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
  Vector2,
  Vector4,
  type IUniform,
  type Texture,
} from 'three';
import { unpack, type Typed } from '../world/data.ts';
import { FISH_SKIN_PARS, fishSkinSurface } from './fishSkin.ts';

/* Tidewater FishingRod.js rod frame: +Y along the blank (butt 0, tip ROD_L), reel toward −Z. */
export const ROD_L = 2.13;
export const BLANK_START = 0.535;
export const SEAT_Y = 0.405;
export const REEL_Z = -0.092;
export const BODY_Y = 0.327;
export const PIVOT_Y = 0.403;
/** The crank's T-knob: centre of its circle (rod space) and radius. */
export const CRANK = { x: -0.046, y: BODY_Y, z: REEL_Z, r: 0.052 };
/** Tidewater's first (stripper) guide: its height and the centre of its ring, below the blank. */
export const GUIDE1 = { y: 0.86, z: -0.068 };
/** The spool end of the line off a conventional reel is below here (its other end is at the first guide). */
const SPOOL_END = 0.54;
/** How far a big-game reel's drag lever pulls back for free spool (rad). */
const LEVER_BACK = 0.9;

/**
 * The parts of a conventional reel (fishing/conventionalReel.ts), by the rod shader's `anim` tag:
 * after Tidewater's own (1 rotor .. 5 braid), and all turning about the reel's axle.
 */
export const CONV_TAG = { frame: 6, spool: 7, line: 8, crank: 9, lever: 10, lead: 11 } as const;

/** Deflection of the blank at rod height y (Tidewater `bendAt`, same curve as the shader). */
export function bendAt(y: number, bend: number, p: number, out: { lat: number; drop: number }): { lat: number; drop: number } {
  const s = Math.min(1, Math.max(0, (y - BLANK_START) / (ROD_L - BLANK_START)));
  const lat = bend * ROD_L * Math.pow(s, p);
  out.lat = lat;
  out.drop = (0.5 * lat * lat) / (y - BLANK_START + 0.06);
  return out;
}

/** Tidewater BEND_P: fast action under a light load, deep bend under a heavy one. */
export const bendPower = (load: number): number => 3.4 + (1.7 - 3.4) * Math.min(1, Math.max(0, load));

export interface RodUniforms {
  rodBend: IUniform<Vector4>; // xyz bend direction (rod space), w bend
  rodShape: IUniform<Vector4>; // x bend exponent
  reelAnim: IUniform<Vector4>; // rotor, bail 0..1, crank, spool angle
  reelAnim2: IUniform<Vector4>; // spool oscillation (m), line fill, 1 with a conventional reel on
  reelAxle: IUniform<Vector4>; // a conventional reel's axle (rod y, z), its spool's core radius
}

export interface FishUniforms {
  uTime: IUniform<number>;
  uSwim: IUniform<number>; // body-wave amplitude (fraction of length)
  uFreq: IUniform<number>; // tail beats per second
  uPhase: IUniform<number>; // tail beats run on so far, on top of uTime·uFreq (a live fish's: see swim())
  /** how far the lower jaw hangs open (rad; only the shark has a jaw that opens) */
  uJaw: IUniform<number>;
}

/**
 * A live fish's tail, beating `freq` times a second at `amp`. The phase is run on here a frame at a
 * time, so the rate can change as it fights without the wave jumping: uTime·uFreq with a changing
 * uFreq leaps a whole world-clock's worth of beats at once, and the fish shudders. (uTime still
 * drives the fins' flutter.)
 */
export function swim(u: FishUniforms, amp: number, freq: number, dt: number): void {
  u.uSwim.value = amp;
  u.uFreq.value = 0;
  u.uPhase.value = (u.uPhase.value + freq * dt) % 1;
}

/**
 * Per rod vertex, from the bake: its material (an index into `names`), whether it's the reel's,
 * and how it fits a conventional reel (1 it comes off with the spinning reel, 2 it turns to the
 * top with the guides; null from a bake older than that, which only takes a spinning reel).
 */
export interface RodTags {
  names: string[];
  mat: Uint8Array;
  reel: Uint8Array;
  fit: Uint8Array | null;
}

export interface Props {
  rodGeometry: BufferGeometry;
  /** null from a bake that's older than the tags (the rod then keeps Tidewater's colours) */
  rodTags: RodTags | null;
  bobberGeometry: BufferGeometry;
  makeRod(): { mesh: Mesh; uniforms: RodUniforms };
  makeBobber(): Mesh;
  /**
   * A fish of `species`. `seed` sets its own markings (where the spots fall, and for some species
   * which colouring it has: a French or a blue grunt, a male or a female bluehead, a stoplight or a
   * queen parrotfish); a new one if not given. Pass the one it came back with to draw that fish again.
   */
  makeFish(species: string, seed?: number): { mesh: Mesh<BufferGeometry, MeshStandardMaterial>; uniforms: FishUniforms; seed: number };
  /** the reflections the silvery fish show (set once the renderer can make one) */
  setEnv(env: Texture): void;
}

const f = (x: number): string => x.toFixed(4);

const ROD_VERTEX = /* glsl */ `
  vec3 P = position;
  vec3 Nn = normal;
  float part = anim;
  vec3 axisC = vec3(0.0, 0.0, ${f(REEL_Z)});
  bool conv = reelAnim2.z > 0.5;
  if (part > 5.5) {
    // a conventional reel: the spool winds in with the handle (the other way round from it, as
    // gears turn), runs back paying out; the line on it thins as it goes; the lever pulls back
    // for free spool. All about the axle across the rod (x). The line leaving the spool for the
    // first guide (11) comes off the top of what's left on it.
    vec2 q = P.yz - reelAxle.xy;
    if ((part > 7.5 && part < 8.5) || (part > 10.5 && P.y < ${f(SPOOL_END)})) {
      float r = length(q);
      q *= mix(reelAxle.z, r, reelAnim2.y) / max(r, 1e-5);
    }
    float a = part < 6.5 || part > 10.5 ? 0.0 : part < 8.5 ? reelAnim.w : part < 9.5 ? -reelAnim.z : reelAnim.y * ${f(LEVER_BACK)};
    float ca = cos(a); float sa = sin(a);
    P.yz = reelAxle.xy + vec2(q.x * ca - q.y * sa, q.x * sa + q.y * ca);
    Nn.yz = vec2(Nn.y * ca - Nn.z * sa, Nn.y * sa + Nn.z * ca);
  } else if (conv && fit > 0.5 && fit < 1.5) {
    // the spinning reel is off the rod: its triangles fold away to a point inside the seat
    P = vec3(0.0, ${f(SEAT_Y)}, 0.0);
  } else if (conv && fit > 1.5) {
    // the guides turn to the top with the reel (a half turn about the blank)
    P.xz = -P.xz;
    Nn.xz = -Nn.xz;
  } else if (part > 0.5) {
    if (part < 2.5) {
      if (part > 1.5) {
        // the bail flips back about the line through its two pivots
        float a = -reelAnim.y * 1.95;
        vec3 c = vec3(0.0, ${f(PIVOT_Y)}, ${f(REEL_Z)});
        float ca = cos(a); float sa = sin(a);
        vec3 q = P - c;
        P = c + vec3(q.x, q.y * ca - q.z * sa, q.y * sa + q.z * ca);
        Nn = vec3(Nn.x, Nn.y * ca - Nn.z * sa, Nn.y * sa + Nn.z * ca);
      }
      // rotor (and the bail on it) turn about the reel axis
      float a = reelAnim.x;
      float ca = cos(a); float sa = sin(a);
      vec3 q = P - axisC;
      P = vec3(q.x * ca + q.z * sa, P.y, -q.x * sa + q.z * ca) + vec3(0.0, 0.0, axisC.z);
      Nn = vec3(Nn.x * ca + Nn.z * sa, Nn.y, -Nn.x * sa + Nn.z * ca);
    } else if (part < 3.5) {
      // crank handle about its shaft (along x)
      float a = reelAnim.z;
      vec3 c = vec3(0.0, ${f(BODY_Y)}, ${f(REEL_Z)});
      float ca = cos(a); float sa = sin(a);
      vec3 q = P - c;
      P = c + vec3(q.x, q.y * ca - q.z * sa, q.y * sa + q.z * ca);
      Nn = vec3(Nn.x, Nn.y * ca - Nn.z * sa, Nn.y * sa + Nn.z * ca);
    } else {
      // spool: in and out with the crank, turning back when the drag slips; the braid on it
      // shrinks as line goes out
      vec3 q = P - axisC;
      if (part > 4.5) {
        float r = length(q.xz);
        float r2 = mix(0.0205, r, reelAnim2.y);
        q = vec3(q.x * r2 / max(r, 1e-5), q.y, q.z * r2 / max(r, 1e-5));
      }
      float a = reelAnim.w;
      float ca = cos(a); float sa = sin(a);
      P = vec3(q.x * ca + q.z * sa, P.y + reelAnim2.x, -q.x * sa + q.z * ca) + vec3(0.0, 0.0, axisC.z);
      Nn = vec3(Nn.x * ca + Nn.z * sa, Nn.y, -Nn.x * sa + Nn.z * ca);
    }
  }
  // the blank bends toward the line (fast action: rodShape.x = exponent of the deflection)
  float span = ${f(ROD_L - BLANK_START)};
  float s = clamp((P.y - ${f(BLANK_START)}) / span, 0.0, 1.0);
  float pw = rodShape.x;
  float lat = rodBend.w * ${f(ROD_L)} * pow(s, pw);
  float slope = rodBend.w * ${f(ROD_L)} * pw * pow(max(s, 1e-4), pw - 1.0) / span;
  float drop = 0.5 * lat * lat / (max(P.y - ${f(BLANK_START)}, 0.0) + 0.06);
  P = P + rodBend.xyz * lat - vec3(0.0, drop, 0.0);
  Nn = normalize(Nn - vec3(0.0, slope * dot(Nn, rodBend.xyz), 0.0));
  vec3 rodP = P;
  vec3 objectNormal = Nn;
`;

const FISH_VERTEX = /* glsl */ `
  // the lower jaw swings open about its hinge (the shark's: no other fish has a jaw attribute)
  float ja = uJaw * jaw;
  float cj = cos(ja);
  float sj = sin(ja);
  vec2 qj = vec2(position.z - uHinge.x, position.y - uHinge.y);
  vec3 P0 = jaw > 0.0 ? vec3(position.x, uHinge.y - qj.x * sj + qj.y * cj, uHinge.x + qj.x * cj + qj.y * sj) : position;
  vec3 N0 = jaw > 0.0 ? vec3(normal.x, -normal.z * sj + normal.y * cj, normal.z * cj + normal.y * sj) : normal;
  // body wave: grows toward the tail, travelling backward; fins flutter on top
  float u = along;
  float env = 0.12 + u * u;
  float ph = u * 5.2 - (uTime * uFreq + uPhase) * 6.2831853;
  float side = uSwim * env * sin(ph) + fin * 0.012 * sin(uTime * 23.0 + u * 30.0);
  vec3 fishP = P0 + vec3(side, 0.0, 0.0);
  // x' = x + side(z), with u running 0 (snout, z = +0.5) .. 1 (tail): normals by the inverse
  // transpose of that shear, n' = (nx, ny, nz + nx * dside/du)
  float dside = uSwim * (2.0 * u * sin(ph) + env * 5.2 * cos(ph));
  vec3 objectNormal = normalize(vec3(N0.x, N0.y, N0.z + N0.x * dside));
  vFishData = data;
  vFishLocal = position;
  vFishL = length(modelMatrix[0].xyz);
`;

function geometry(arrays: Record<string, Typed>, name: string, extra: Record<string, [number, boolean]> = {}): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(arrays[`${name}.position`], 3));
  g.setAttribute('normal', new BufferAttribute(arrays[`${name}.normal`], 3, true));
  // colour: RGB (the bake's alpha channel carries a flag, split off below)
  const c = arrays[`${name}.color`] as Uint8Array;
  const n = c.length / 4;
  const rgb = new Uint8Array(n * 3);
  const flag = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    rgb[i * 3] = c[i * 4];
    rgb[i * 3 + 1] = c[i * 4 + 1];
    rgb[i * 3 + 2] = c[i * 4 + 2];
    flag[i] = c[i * 4 + 3] === 1 ? 1 : 0;
  }
  g.setAttribute('color', new BufferAttribute(rgb, 3, true));
  if (name.startsWith('fish.')) g.setAttribute('fin', new BufferAttribute(flag, 1));
  for (const [attr, [size, norm]] of Object.entries(extra)) {
    const src = arrays[`${name}.${attr}`];
    g.setAttribute(attr, new BufferAttribute(norm ? src : Float32Array.from(src), size, norm));
  }
  g.setIndex(new BufferAttribute(arrays[`${name}.index`], 1));
  g.computeBoundingSphere();
  return g;
}

export function loadProps(buf: ArrayBuffer): Props {
  const { arrays, meta } = unpack(buf);
  const fishMeta = (meta as { fish: Record<string, { metal: number; pattern: number; rows: number[] }> }).fish;
  const sharkHinge = (meta as { shark?: { hinge: [number, number] } }).shark?.hinge ?? [0, 0];
  const part = (meta as { part: Record<string, number> }).part;
  const surface = fishSkinSurface(part);
  let env: Texture | null = null;
  const fishMats = new Set<MeshStandardMaterial>();
  const rodGeometry = geometry(arrays, 'rod', { anim: [1, false] });
  const rodMats = (meta as { rodMats?: string[] }).rodMats;
  const fit = (arrays['rod.fit'] as Uint8Array | undefined) ?? null;
  const rodTags: RodTags | null = rodMats && arrays['rod.mat'] && arrays['rod.reel'] ? { names: rodMats, mat: arrays['rod.mat'] as Uint8Array, reel: arrays['rod.reel'] as Uint8Array, fit } : null;
  rodGeometry.setAttribute('fit', new BufferAttribute(fit ? Float32Array.from(fit) : new Float32Array(rodGeometry.getAttribute('position').count), 1));
  const bobberGeometry = geometry(arrays, 'bobber');
  const fishGeo = new Map<string, BufferGeometry>();

  return {
    rodGeometry,
    rodTags,
    bobberGeometry,

    makeRod() {
      const uniforms: RodUniforms = {
        rodBend: { value: new Vector4(0, 0, -1, 0) },
        rodShape: { value: new Vector4(3, 0, 0, 0) },
        reelAnim: { value: new Vector4() },
        reelAnim2: { value: new Vector4(0, 1, 0, 0) },
        reelAxle: { value: new Vector4() },
      };
      const mat = new MeshPhongMaterial({ vertexColors: true, shininess: 60, specular: 0x333333 });
      mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            '#include <common>\nattribute float anim;\nattribute float fit;\nuniform vec4 rodBend;\nuniform vec4 rodShape;\nuniform vec4 reelAnim;\nuniform vec4 reelAnim2;\nuniform vec4 reelAxle;',
          )
          .replace('#include <beginnormal_vertex>', ROD_VERTEX)
          .replace('#include <begin_vertex>', 'vec3 transformed = rodP;');
      };
      mat.customProgramCacheKey = () => 'tidewater-rod';
      const mesh = new Mesh(rodGeometry, mat);
      mesh.name = 'rod';
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      return { mesh, uniforms };
    },

    makeBobber() {
      const m = new Mesh(bobberGeometry, new MeshLambertMaterial({ vertexColors: true }));
      m.name = 'bobber';
      m.frustumCulled = false;
      return m;
    },

    makeFish(species: string, seed = Math.random()) {
      let g = fishGeo.get(species);
      if (!g) {
        g = geometry(arrays, `fish.${species}`, { along: [1, true], data: [4, false], ...(arrays[`fish.${species}.jaw`] ? { jaw: [1, true] as [number, boolean] } : {}) });
        fishGeo.set(species, g);
      }
      const uniforms: FishUniforms = { uTime: { value: 0 }, uSwim: { value: 0.06 }, uFreq: { value: 2 }, uPhase: { value: 0 }, uJaw: { value: 0 } };
      const fm = fishMeta[species];
      const rows = Array.from({ length: 8 }, (_, i) => new Vector4().fromArray(fm?.rows ?? [], i * 4));
      const skin = { uRows: { value: rows }, uPattern: { value: fm?.pattern ?? 0 }, uSeed: { value: seed }, uHinge: { value: new Vector2(sharkHinge[0], sharkHinge[1]) } };
      const mat = new MeshStandardMaterial({ side: DoubleSide, envMap: env, envMapIntensity: 0.9 });
      mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms, skin);
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            '#include <common>\nattribute float along;\nattribute float fin;\nattribute vec4 data;\nattribute float jaw;\nuniform float uTime;\nuniform float uSwim;\nuniform float uFreq;\nuniform float uPhase;\nuniform float uJaw;\nuniform vec2 uHinge;\nvarying vec4 vFishData;\nvarying vec3 vFishLocal;\nvarying float vFishL;',
          )
          .replace('#include <beginnormal_vertex>', FISH_VERTEX)
          .replace('#include <begin_vertex>', 'vec3 transformed = fishP;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>\n${FISH_SKIN_PARS}`)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${surface}`);
      };
      mat.customProgramCacheKey = () => 'tidewater-fish-skin';
      fishMats.add(mat);
      mat.addEventListener('dispose', () => fishMats.delete(mat));
      const mesh = new Mesh(g, mat);
      mesh.name = `fish_${species}`;
      mesh.frustumCulled = false;
      return { mesh, uniforms, seed };
    },

    setEnv(tex: Texture) {
      env = tex;
      for (const m of fishMats) {
        m.envMap = tex;
        m.needsUpdate = true;
      }
    },
  };
}
