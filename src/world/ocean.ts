/**
 * The sea, Quest-sized, shaded the way Tidewater shades it.
 *
 * Tidewater runs a four-cascade FFT ocean with breakers, swash and refraction in WebGPU compute;
 * none of that fits a standalone headset at 72 Hz in stereo. The swell here is a few Gerstner
 * waves (dense under the viewer, flat toward the horizon). The shading is Tidewater's optics
 * (ocean/WaterMaterial.js, MIT), by way of FIRE FIGHT 2's cove sea, which carried them to Quest:
 *
 *  - REFLECTION: exact dielectric Fresnel; the sky dome's own gradient and sun glow, the
 *    reflection tilted toward the higher, darker sky where the ripples are too fine to see
 *    (Cox–Munk, as Tidewater); a GGX sun glint whose roughness grows with distance, so the sun
 *    lays a soft path on the sea instead of a hard pin.
 *  - THE WATER COLUMN: the refracted ray traced down to the seabed (Tidewater's bathymetry, and
 *    the terrain's own ground colour for the sand), Beer–Lambert absorption along it with
 *    Tidewater's coefficients (red goes first: clear over the sand, green, then blue in the deep),
 *    analytic single-scatter in-scattering with a multiple-scattering backscatter term, and the
 *    sun's caustics dancing on the sand in the shallows.
 *  - DETAIL: one tileable texture (built once, 256²): ripple slopes from 28 random capillary
 *    waves in two layers drifting at different scales (no repeating stripes), a caustic web, and
 *    bubbly foam, so the swash is a lace of foam rather than a painted band.
 *
 * Unlike the cove, the island has things in the water (piles, rocks, a fish on the line, the sand
 * itself): the water is blended over them by how much light gets back up through the column, so
 * the shallows stay clear and the deep is the water's own colour.
 *
 * One mesh, one pass: a polar grid dense under the viewer and sparse at the horizon, re-centred on
 * the camera every frame (snapped, so the vertices don't swim through the waves).
 */

import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  NoColorSpace,
  RedFormat,
  RepeatWrapping,
  RGBAFormat,
  ShaderMaterial,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  type Camera,
} from 'three';
import type { TerrainGrid } from './data.ts';
import type { SkyState } from './sky.ts';

const RINGS = 72;
const SEGMENTS = 96;
const INNER = 1.5;
const OUTER = 5500;
const SNAP = 4;

function polarGrid(): BufferGeometry {
  const pos: number[] = [0, 0, 0];
  for (let r = 1; r <= RINGS; r++) {
    // exponential ring spacing: ~0.5 m apart at your feet, hundreds at the horizon
    const t = r / RINGS;
    const rad = INNER * Math.pow(OUTER / INNER, t) - INNER * (1 - t);
    for (let s = 0; s < SEGMENTS; s++) {
      const a = (s / SEGMENTS) * Math.PI * 2;
      pos.push(Math.cos(a) * rad, 0, Math.sin(a) * rad);
    }
  }
  const idx: number[] = [];
  for (let s = 0; s < SEGMENTS; s++) idx.push(0, 1 + ((s + 1) % SEGMENTS), 1 + s);
  for (let r = 1; r < RINGS; r++) {
    const a0 = 1 + (r - 1) * SEGMENTS;
    const b0 = 1 + r * SEGMENTS;
    for (let s = 0; s < SEGMENTS; s++) {
      const s1 = (s + 1) % SEGMENTS;
      idx.push(a0 + s, a0 + s1, b0 + s, a0 + s1, b0 + s1, b0 + s);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  return g;
}

/* ── the detail texture (FIRE FIGHT 2's cove sea, arena/cove/water.ts) ─── */

const TEX = 256;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One tileable 256² texture, three jobs:
 *   RG  capillary / chop normal slopes (a sum of periodic sines)
 *   B   caustic web (Worley F2 − F1: bright where two cells meet)
 *   A   foam (bubbly Worley blobs at two scales)
 * Built once on the CPU; it tiles because every wave vector and every cell point is on the period.
 */
function detailTexture(): DataTexture {
  const r = rng(0x71de);
  const data = new Uint8Array(TEX * TEX * 4);
  const waves: { kx: number; ky: number; a: number; ph: number }[] = [];
  for (let i = 0; i < 28; i++) {
    const f = 2 + Math.floor(r() * r() * 22);
    const ang = r() * Math.PI * 2;
    const kx = Math.round(Math.cos(ang) * f);
    const ky = Math.round(Math.sin(ang) * f);
    if (kx === 0 && ky === 0) continue;
    waves.push({ kx, ky, a: 1 / Math.hypot(kx, ky) ** 1.1, ph: r() * Math.PI * 2 });
  }
  const cells = (n: number, seed: number): Float32Array => {
    const q = rng(seed);
    const pts = new Float32Array(n * n * 2);
    for (let i = 0; i < n * n; i++) {
      pts[i * 2] = ((i % n) + 0.15 + 0.7 * q()) / n;
      pts[i * 2 + 1] = (Math.floor(i / n) + 0.15 + 0.7 * q()) / n;
    }
    return pts;
  };
  const worley = (pts: Float32Array, n: number, u: number, v: number): [number, number] => {
    const cx = Math.floor(u * n);
    const cy = Math.floor(v * n);
    let f1 = 9;
    let f2 = 9;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const ix = (((cx + ox) % n) + n) % n;
        const iy = (((cy + oy) % n) + n) % n;
        const px = pts[(iy * n + ix) * 2] + (cx + ox - ix) / n;
        const py = pts[(iy * n + ix) * 2 + 1] + (cy + oy - iy) / n;
        const d = Math.hypot(u - px, v - py) * n;
        if (d < f1) {
          f2 = f1;
          f1 = d;
        } else if (d < f2) f2 = d;
      }
    }
    return [f1, f2];
  };
  const cA = cells(10, 0x51c);
  const fA = cells(18, 0xf0a);
  const fB = cells(40, 0xb0b);
  let maxS = 0;
  const slopes = new Float32Array(TEX * TEX * 2);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      let sx = 0;
      let sy = 0;
      for (const w of waves) {
        const c = Math.cos(2 * Math.PI * ((w.kx * x) / TEX + (w.ky * y) / TEX) + w.ph) * w.a;
        sx += c * w.kx;
        sy += c * w.ky;
      }
      slopes[(y * TEX + x) * 2] = sx;
      slopes[(y * TEX + x) * 2 + 1] = sy;
      maxS = Math.max(maxS, Math.abs(sx), Math.abs(sy));
    }
  }
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const i = y * TEX + x;
      const u = (x + 0.5) / TEX;
      const v = (y + 0.5) / TEX;
      const [c1, c2] = worley(cA, 10, u, v);
      const caustic = Math.pow(1 - Math.min(1, (c2 - c1) / 0.28), 3);
      const [a1] = worley(fA, 18, u, v);
      const [b1] = worley(fB, 40, u, v);
      const foam = Math.min(1, Math.max(0, 1.15 - a1 * 0.9) * 0.65 + Math.max(0, 1 - b1) * 0.45);
      data[i * 4] = Math.round((slopes[i * 2] / maxS) * 127 + 128);
      data[i * 4 + 1] = Math.round((slopes[i * 2 + 1] / maxS) * 127 + 128);
      data[i * 4 + 2] = Math.round(caustic * 255);
      data[i * 4 + 3] = Math.round(foam * 255);
    }
  }
  const tex = new DataTexture(data, TEX, TEX, RGBAFormat, UnsignedByteType);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.colorSpace = NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const vertexShader = /* glsl */ `
uniform float uTime;
uniform vec4 uWaves[4];   // dir.xy, wavelength, amplitude
uniform vec2 uCenter;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vFade;

void main() {
  vec3 p = position + vec3(uCenter.x, 0.0, uCenter.y);
  float dist = length(position.xz);
  // waves flatten toward the horizon where the grid can't carry them
  float fade = 1.0 - smoothstep(250.0, 1400.0, dist);
  vec3 d = vec3(0.0);
  vec3 tx = vec3(1.0, 0.0, 0.0);
  vec3 tz = vec3(0.0, 0.0, 1.0);
  for (int i = 0; i < 4; i++) {
    vec2 dir = uWaves[i].xy;
    float k = 6.2831853 / uWaves[i].z;
    float a = uWaves[i].w * fade;
    float c = sqrt(9.8 / k);
    float f = k * (dot(dir, p.xz) - c * uTime);
    float q = 0.55 / (k * a * 4.0 + 1e-4);
    float qa = min(q, 1.0) * a;
    d.x += dir.x * qa * cos(f);
    d.z += dir.y * qa * cos(f);
    d.y += a * sin(f);
    float wa = k * a;
    tx += vec3(-dir.x * dir.x * min(q, 1.0) * wa * sin(f), dir.x * wa * cos(f), -dir.x * dir.y * min(q, 1.0) * wa * sin(f));
    tz += vec3(-dir.x * dir.y * min(q, 1.0) * wa * sin(f), dir.y * wa * cos(f), -dir.y * dir.y * min(q, 1.0) * wa * sin(f));
  }
  vec3 world = p + d;
  vWorld = world;
  vNormal = normalize(cross(tz, tx));
  vFade = fade;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform sampler2D uDepth;
uniform sampler2D uAlbedo;
uniform sampler2D uDetail;
uniform float uDepthRange;
uniform vec2 uTerrainOrigin;
uniform float uTerrainSize;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSunE;
uniform vec3 uSkyE;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vFade;

#define PI 3.141592653589793
#define RECIPROCAL_PI 0.3183098861837907
const float IOR = 1.333;
const vec3 SIG_A = vec3(0.42, 0.075, 0.035);   // Tidewater's absorption (/m)
const vec3 SIG_S = vec3(0.012, 0.018, 0.024);  // Tidewater's scattering (/m)

float fresnelDielectric(float cosI, float eta) {
  float c = clamp(cosI, 0.0, 1.0);
  float g2 = eta * eta - 1.0 + c * c;
  if (g2 < 0.0) return 1.0;
  float g = sqrt(g2);
  float a = (g - c) / (g + c);
  float b = (c * (g + c) - 1.0) / (c * (g - c) + 1.0);
  return 0.5 * a * a * (b * b + 1.0);
}
float phaseHG(float c, float g) {
  float g2 = g * g;
  return ((1.0 - g2) / (4.0 * PI)) / pow(max(1.0 + g2 - c * 2.0 * g, 1e-4), 1.5);
}
float dGGX(float NdH, float a2) {
  float d = NdH * NdH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}
float vSmith(float NdL, float NdV, float a2) {
  float gv = NdL * sqrt(NdV * NdV * (1.0 - a2) + a2);
  float gl = NdV * sqrt(NdL * NdL * (1.0 - a2) + a2);
  return 0.5 / max(gv + gl, 1e-5);
}
// the sky dome's own colour in a direction (world/sky.ts), less the sun's disc (the glint is that)
vec3 skyAt(vec3 d) {
  vec3 col = mix(uSkyHorizon, uSkyZenith, pow(max(d.y, 0.0), 0.5));
  col = mix(col, uSkyHorizon * 0.92, smoothstep(0.0, -0.05, d.y));
  float s = max(dot(d, uSunDir), 0.0);
  return col + uSunColor * (pow(s, 64.0) * 0.35 + pow(s, 6.0) * 0.12);
}
vec2 terrainUv(vec2 xz) { return (xz - uTerrainOrigin) / uTerrainSize; }
// still-water depth at xz (0 at the tide line; open sea past the map's edge)
float depthAt(vec2 xz) {
  vec2 uv = terrainUv(xz);
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  return mix(uDepthRange, texture2D(uDepth, uv).r * uDepthRange, inside);
}

void main() {
  vec3 P = vWorld;
  vec3 toCam = cameraPosition - P;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec3 L = uSunDir;
  float depth = depthAt(P.xz);
  float thick = max(depth + P.y, 0.0);            // the water column here, with the swell (m)

  // ---- normal: the swell's, and two drifting layers of ripples (gone with range, so they
  // never alias into sparkle)
  float detK = (1.0 - smoothstep(25.0, 220.0, dist)) * smoothstep(0.0, 0.25, thick);
  vec4 tA = texture2D(uDetail, P.xz / 7.5 + vec2(0.018, 0.011) * uTime);
  vec4 tB = texture2D(uDetail, P.xz / 2.7 + vec2(-0.027, 0.036) * uTime);
  vec2 slope = ((tA.xy - 0.5) * 0.22 + (tB.xy - 0.5) * 0.12) * detK;
  vec3 N = normalize(vNormal + vec3(slope.x, 0.0, slope.y));
  // facets turned away from the eye bend to grazing instead of flipping
  N = normalize(N + V * max(-dot(N, V) + 0.03, 0.0));
  float NdV = max(dot(N, V), 1e-4);
  float F = fresnelDielectric(NdV, IOR);

  // ---- reflection: the sky, tilted up where the unresolved ripples roughen it
  vec3 Rraw = reflect(-V, N);
  float rough = 0.05 + smoothstep(40.0, 900.0, dist) * 0.1;
  float Rup = max(Rraw.y, 0.004) + rough * 1.3 * (1.0 - max(Rraw.y, 0.0));
  vec3 refl = skyAt(normalize(vec3(Rraw.x, Rup, Rraw.z)));
  refl = mix(refl * 0.35, refl, smoothstep(-0.12, 0.08, Rraw.y));

  // ---- the sun's glint (GGX)
  vec3 H = normalize(L + V);
  float NdL = max(dot(N, L), 0.0);
  float a2 = rough * rough;
  vec3 sunSpec = uSunE * min(dGGX(max(dot(N, H), 0.0), a2) * vSmith(NdL, NdV, a2) * fresnelDielectric(max(dot(V, H), 0.0), IOR) * NdL, 60.0) * step(0.0, L.y);

  // ---- the water column: the refracted ray down to the seabed
  vec3 Tr = refract(-V, N, 1.0 / IOR);
  vec3 Tv = normalize(vec3(Tr.x, min(Tr.y, -0.08), Tr.z));
  float tDown = max(-Tv.y, 0.04);
  float L0 = thick / tDown;
  float Lt = L0;
  if (L0 < 60.0) {
    vec2 q = P.xz + Tv.xz * L0 * 0.7;
    Lt = max(depthAt(q) + P.y, 0.0) / tDown;
  }
  float pathLen = min(Lt, 120.0);
  vec2 bedXZ = P.xz + Tv.xz * pathLen;
  float bedDepth = pathLen * tDown;
  vec3 sigT = SIG_A + SIG_S;

  // the seabed: the terrain's own ground colour, caustics on it in the shallows
  vec3 sand = texture2D(uAlbedo, terrainUv(bedXZ)).rgb;
  vec2 cuv = bedXZ / 3.4;
  float caus = min(texture2D(uDetail, cuv + vec2(0.043, 0.021) * uTime).b, texture2D(uDetail, cuv * 1.31 + vec2(-0.031, 0.047) * uTime + 0.37).b);
  caus *= (1.0 - smoothstep(0.5, 7.0, bedDepth)) * smoothstep(0.02, 0.35, bedDepth) * (1.0 - smoothstep(30.0, 90.0, dist)) * step(0.0, L.y);
  vec3 Ls = -refract(-L, vec3(0.0, 1.0, 0.0), 1.0 / IOR);
  float muS = max(Ls.y, 0.1);
  vec3 sunIn = uSunE * (1.0 - fresnelDielectric(max(L.y, 0.02), IOR)) * step(0.0, L.y);
  vec3 bedE = sunIn * muS * exp(-sigT * bedDepth / muS) * (0.75 + 2.2 * caus) + uSkyE * exp(-sigT * bedDepth * 1.3);
  vec3 bedRad = sand * bedE * RECIPROCAL_PI;

  // light scattered back up out of the water along the view ray (single scatter + ambient)
  float muV = max(-Tv.y, 0.15);
  vec3 Tview = exp(-sigT * pathLen);
  vec3 kSun = sigT * (1.0 + muV / muS);
  vec3 kAmb = sigT * (1.0 + muV / 0.75);
  float phase = phaseHG(dot(Tv, Ls), 0.86) * 0.7 + 0.3 / (4.0 * PI);
  vec3 bb = SIG_S * 0.035;
  vec3 albedoMS = bb * (0.33 * 4.0) / (SIG_A + bb);
  vec3 inSun = sunIn * (SIG_S * phase + albedoMS * sigT * RECIPROCAL_PI) * (1.0 - exp(-kSun * pathLen)) / kSun;
  vec3 inAmb = uSkyE * RECIPROCAL_PI * (SIG_S * 0.25 + albedoMS * sigT) * (1.0 - exp(-kAmb * pathLen)) / kAmb;

  // What's really under the water (the sand, the piles, a fish) shows through as much as the
  // column lets light back up: its least-transmitted colour, everywhere. The rest of the bed's
  // light (the green and blue that get further than the red) is drawn from the ground colour.
  float seen = min(Tview.r, min(Tview.g, Tview.b));
  vec3 water = F * refl + (1.0 - F) * (inSun + inAmb + bedRad * (Tview - seen));
  float alpha = 1.0 - (1.0 - F) * seen;

  // ---- foam where the swash runs up the sand: on the cycle the shore's sound keeps
  // (audio/shore.ts: ψ = 1.3t − 0.21x − 0.6z), a lace of bubbles rather than a painted band
  float wave = sin(P.x * 0.21 + P.z * 0.6 - uTime * 1.3) * 0.5 + 0.5;
  // the sheet thins out behind the swash's reach (a lace of bubbles), and a bead of foam rides
  // the very edge of the water
  float sheet = (1.0 - smoothstep(0.0, 0.04 + wave * 0.22, thick)) * 0.5;
  float bead = smoothstep(0.0, 0.01, thick) * (1.0 - smoothstep(0.015, 0.05, thick)) * 0.8;
  float foamAmt = max(sheet, bead) * step(0.0, terrainUv(P.xz).x) * step(terrainUv(P.xz).x, 1.0) * (1.0 - smoothstep(1.2, 3.0, depth));
  float foam = 0.0;
  if (foamAmt > 0.001) {
    float fTex = texture2D(uDetail, P.xz / 5.5 + vec2(0.0, 0.03) * uTime).a * 0.65 + texture2D(uDetail, P.xz / 1.9 - vec2(0.02, 0.0) * uTime).a * 0.35;
    foamAmt *= 0.55 + 0.45 * texture2D(uDetail, P.xz / 23.0 + 0.3).a;
    foam = smoothstep(1.0 - foamAmt * 0.9, 1.0 - foamAmt * 0.9 + 0.18, fTex) * smoothstep(0.0, 0.1, foamAmt);
  }
  vec3 foamCol = (uSunE * (NdL * 0.75 + 0.06) + uSkyE * 1.15) * RECIPROCAL_PI * 0.85;

  // premultiplied: the water's own light, plus the glint, plus the foam on top
  vec3 pre = water + sunSpec;
  pre = mix(pre, foamCol + sunSpec * 0.05, foam);
  alpha = mix(alpha, 1.0, foam);
  // the glint is light on the surface: it covers what's behind
  alpha = clamp(alpha + max(sunSpec.r, max(sunSpec.g, sunSpec.b)), 0.0, 1.0);

  float fog = smoothstep(uFogNear, uFogFar, dist);
  pre = mix(pre, uFogColor, fog);
  alpha = mix(alpha, 1.0, fog);
  gl_FragColor = vec4(min(pre / max(alpha, 1e-3), vec3(1.0)), alpha);
  #include <colorspace_fragment>
}
`;

export class Ocean {
  readonly mesh: Mesh;
  /** seconds, the clock the waves run on */
  time = 0;
  /**
   * The swell's own uniforms (the clock and the four waves), for anything else that lies on the
   * sea and should ride it (fx/water.ts: the ripples).
   */
  readonly swell: { uTime: { value: number }; uWaves: { value: Vector4[] } };
  private readonly material: ShaderMaterial;
  private readonly waves: Vector4[];

  constructor(grid: TerrainGrid, sky: SkyState) {
    const depth = new DataTexture(grid.depth, grid.res, grid.res, RedFormat, UnsignedByteType);
    depth.minFilter = LinearFilter;
    depth.magFilter = LinearFilter;
    depth.flipY = false;
    depth.needsUpdate = true;
    // the ground's colour, for the sand you see through the water
    const albedo = new DataTexture(grid.albedo, grid.res, grid.res, RGBAFormat, UnsignedByteType);
    albedo.colorSpace = SRGBColorSpace;
    albedo.minFilter = LinearFilter;
    albedo.magFilter = LinearFilter;
    albedo.flipY = false;
    albedo.needsUpdate = true;

    // A calm day in the lee of the island: a long swell from the south
    // (Tidewater's swell runs toward −z) and a little wind chop over it.
    const waves = [
      [-0.12, -1, 38, 0.16],
      [0.35, -0.94, 17, 0.07],
      [-0.7, -0.7, 7.5, 0.035],
      [0.9, -0.43, 3.6, 0.018],
    ].map(([x, z, l, a]) => {
      const d = new Vector2(x, z).normalize();
      return new Vector4(d.x, d.y, l, a);
    });

    this.waves = waves;
    this.swell = { uTime: { value: 0 }, uWaves: { value: waves } };
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: true,
      uniforms: {
        ...this.swell,
        uCenter: { value: new Vector2() },
        uDepth: { value: depth },
        uDepthRange: { value: grid.depthRange },
        uTerrainOrigin: { value: new Vector2(grid.origin, grid.origin) },
        uTerrainSize: { value: grid.res * grid.cell },
        uSunDir: { value: sky.sunDir },
        uSunColor: { value: sky.sunColor },
        uSunE: { value: sky.sunE },
        uSkyE: { value: sky.skyE },
        uSkyZenith: { value: sky.zenith },
        uSkyHorizon: { value: sky.horizon },
        uAlbedo: { value: albedo },
        uDetail: { value: detailTexture() },
        uFogColor: { value: sky.fogColor },
        uFogNear: { value: sky.fogNear },
        uFogFar: { value: sky.fogFar },
      },
    });
    this.mesh = new Mesh(polarGrid(), this.material);
    this.mesh.name = 'ocean';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  /**
   * Height of the sea surface at (x, z) now: the vertical part of the same Gerstner sum the
   * vertex shader runs (at full strength — this is for things near the viewer, like a bobber).
   */
  heightAt(x: number, z: number): number {
    let y = 0;
    for (const w of this.waves) {
      const k = (Math.PI * 2) / w.z;
      const c = Math.sqrt(9.8 / k);
      y += w.w * Math.sin(k * (w.x * x + w.y * z - c * this.time));
    }
    return y;
  }

  update(time: number, camera: Camera): void {
    const u = this.material.uniforms;
    this.time = time;
    u.uTime.value = time;
    // read the eye's world matrix as three set it (getWorldPosition would recompute it and, on a
    // parentless XR eye camera, drop the rig — everything after would draw from the origin)
    const p = _cam.setFromMatrixPosition(camera.matrixWorld);
    (u.uCenter.value as Vector2).set(Math.round(p.x / SNAP) * SNAP, Math.round(p.z / SNAP) * SNAP);
  }
}

const _cam = new Vector3();
