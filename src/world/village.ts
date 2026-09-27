/**
 * Tidewater's village, pier and boardwalks — the real geometry from its own
 * builders (tools/bake-world.mjs), one vertex-coloured Lambert draw per
 * material class.
 *
 * After dark the panes Tidewater lights — the windows it flags lit and the
 * lanterns' glass — glow warm: a per-vertex `glow` from the bake, times the
 * sky's `night` (world/sky.ts), added to the emissive light. No extra draws.
 *
 * The roofs get a little texture in the same draws, worked out in the fragment stage from
 * Tidewater's own roof coordinates (metres up the slope from the eave, and along it: `ruv`)
 * and what each vertex is (`roof`: a metal roof, or thatch, and its rust or age):
 *   thatch  straw streaking down the slope, laid in courses whose lower edges shade the next,
 *           patches of older, greyer thatch
 *   metal   corrugations, the seams between sheets and the laps up the slope, each sheet a
 *           shade apart, rust coming through in streaks (most along the eave)
 * The fine detail fades out with distance before it could shimmer.
 */

import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshLambertMaterial,
} from 'three';
import { unpack } from './data.ts';

export function buildVillage(buf: ArrayBuffer, night: { value: number }): Group {
  const { arrays } = unpack(buf);
  const group = new Group();
  group.name = 'village';
  const classes = new Set(Object.keys(arrays).map((k) => k.split('.')[0]));
  for (const cls of classes) {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(arrays[`${cls}.position`], 3));
    geo.setAttribute('normal', new BufferAttribute(arrays[`${cls}.normal`], 3, true));
    geo.setAttribute('color', new BufferAttribute(arrays[`${cls}.color`], 4, true));
    geo.setIndex(new BufferAttribute(arrays[`${cls}.index`], 1));
    geo.computeBoundingSphere();
    const mat = new MeshLambertMaterial({ vertexColors: true });
    if (cls === 'cloth') mat.side = DoubleSide;
    const glow = arrays[`${cls}.glow`];
    const ruv = arrays[`${cls}.ruv`];
    const roof = arrays[`${cls}.roof`];
    if (glow) geo.setAttribute('glow', new BufferAttribute(glow, 1, true));
    if (ruv && roof) {
      geo.setAttribute('ruv', new BufferAttribute(ruv, 2));
      geo.setAttribute('roof', new BufferAttribute(roof, 2, true));
    }
    if (glow || (ruv && roof)) {
      const withGlow = !!glow;
      const withRoofs = !!(ruv && roof);
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uNight = night;
        let vDecl = '';
        let vBody = '';
        let fDecl = '';
        if (withGlow) {
          vDecl += '\nattribute float glow;\nvarying float vGlow;';
          vBody += '\nvGlow = glow;';
          fDecl += '\nuniform float uNight;\nvarying float vGlow;';
        }
        if (withRoofs) {
          vDecl += '\nattribute vec2 ruv;\nattribute vec2 roof;\nvarying vec2 vRuv;\nvarying vec2 vRoof;';
          vBody += '\nvRuv = ruv;\nvRoof = roof;';
          fDecl += '\nvarying vec2 vRuv;\nvarying vec2 vRoof;\n' + ROOF_GLSL;
        }
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>' + vDecl).replace('#include <begin_vertex>', '#include <begin_vertex>' + vBody);
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>' + fDecl);
        if (withRoofs) shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = roofColour(diffuseColor.rgb);');
        if (withGlow)
          shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.66, 0.32) * vGlow * uNight * 1.6;');
      };
      mat.customProgramCacheKey = () => `village${withGlow ? '-glow' : ''}${withRoofs ? '-roofs' : ''}`;
    }
    const mesh = new Mesh(geo, mat);
    mesh.name = `village_${cls}`;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  return group;
}

/** The roofs' texture, from their coordinates (see the top of this file). */
const ROOF_GLSL = /* glsl */ `
float rHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rHash(i), rHash(i + vec2(1.0, 0.0)), f.x), mix(rHash(i + vec2(0.0, 1.0)), rHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 roofColour(vec3 col) {
  if (vRoof.x < 0.3) return col;
  vec2 q = vRuv;                                  // x: up the slope, y: along the eave (m)
  vec2 fw = fwidth(q);
  float patchN = rNoise(q * vec2(0.35, 0.28) + 17.0);
  if (vRoof.x < 0.75) {
    // thatch: straw streaks down the slope, courses of bundles, older and greyer in patches
    float fine = 1.0 - smoothstep(0.012, 0.05, fw.y);
    float mid = 1.0 - smoothstep(0.04, 0.16, fw.y);
    float streak = rNoise(vec2(q.y * 26.0, q.x * 1.4)) - 0.5;
    float straw = rNoise(vec2(q.y * 90.0, q.x * 4.0)) - 0.5;
    float row = fract(q.x / 0.34);
    float course = mix(1.0, mix(0.7, 1.05, smoothstep(0.0, 0.4, row)), 1.0 - smoothstep(0.05, 0.2, fw.x));
    col *= (1.0 + streak * 0.5 * mid + straw * 0.35 * fine) * course * (0.86 + 0.28 * patchN);
    float lum = dot(col, vec3(0.3, 0.59, 0.11));
    float grey = clamp(vRoof.y * 0.5 + (patchN - 0.5) * 0.6, 0.0, 0.75);
    return mix(col, vec3(lum) * vec3(0.96, 0.9, 0.8), grey);
  }
  // corrugated metal: ribs along the eave, 0.84 m sheets lapped every 1.68 m up the slope
  float ribs = 1.0 - smoothstep(0.02, 0.07, fw.y);
  float rib = sin(q.y * 6.2831853 / 0.12);
  float sheetId = floor(q.y / 0.84) + floor(q.x / 1.68) * 17.0;
  float sheet = 0.9 + 0.16 * rHash(vec2(sheetId, 3.1));
  float seamY = fract(q.y / 0.84);
  float seamX = fract(q.x / 1.68);
  float seam = min(smoothstep(0.0, 0.02, seamY) * smoothstep(1.0, 0.98, seamY), smoothstep(0.0, 0.02, seamX));
  seam = mix(1.0, 0.75 + 0.25 * seam, 1.0 - smoothstep(0.03, 0.12, max(fw.x, fw.y)));
  // each corrugation: a lit crown and a shaded trough
  float crown = pow(max(rib, 0.0), 3.0);
  col *= (0.9 + (rib * 0.14 + crown * 0.22) * ribs) * sheet * seam;
  // rust: streaks running down the slope, heaviest along the eave and at the laps
  float rn = rNoise(vec2(q.y * 2.2, q.x * 0.5)) * 0.4 + rNoise(vec2(q.y * 16.0, q.x * 1.1)) * 0.6;
  float eave = 1.0 - smoothstep(0.0, 1.0, q.x);
  float lap = 1.0 - smoothstep(0.0, 0.25, seamX);
  float thr = 0.8 - vRoof.y * 0.32 - eave * 0.15 - lap * 0.06;
  float rust = smoothstep(thr - 0.05, thr + 0.05, rn);
  vec3 rustCol = mix(vec3(0.12, 0.045, 0.02), vec3(0.38, 0.16, 0.06), rNoise(q * 5.0));
  return mix(col, rustCol, rust * 0.85);
}
`;
