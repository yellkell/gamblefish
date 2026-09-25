/**
 * Sky, sun, moon and fog through the island's day. Tidewater integrates a physically based
 * atmosphere with volumetric clouds; on Quest the sky is a gradient dome with a sun (or moon)
 * disc and glow, and the lights and fog are tuned to match it so the land sinks into the sea
 * haze at the same distance the dome does.
 *
 * THE DAY runs by itself: a whole day in about 40 minutes, the night going by faster than the
 * day. It starts in the late afternoon, then comes golden hour, a red sunset, a purple dusk and
 * a blue moonlit night (dark enough to feel like night, never too dark to fish or find the
 * stairs), then the dawn. Palettes are keyframed by the hour and blended in linear space; the
 * sky state's colours are mutated in place, so the ocean (world/ocean.ts), which holds the same
 * objects as uniforms, follows along. `night` (0 by day .. 1 after dark) drives the stars, the
 * lit windows and the lamps (world/village.ts, world/lamps.ts).
 */

import {
  BackSide,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Scene,
} from 'three';

export interface SkyState {
  /** unit vector toward the sun — or the moon, once the sun is down */
  sunDir: Vector3;
  /** linear-space colours */
  sunColor: Color;
  zenith: Color;
  horizon: Color;
  fogColor: Color;
  fogNear: number;
  fogFar: number;
  /** the light on unlit things (the sea's body colour): 1 in the afternoon, dim and blue at night */
  ambient: Color;
  /** 0 by day .. 1 after dark (a uniform: shared with the materials that light up at night) */
  night: { value: number };
  /** the hour, 0..24 */
  hour: number;
}

/** a whole day, in real minutes (the night runs NIGHT_PACE times faster) */
const DAY_MINUTES = 40;
const NIGHT_PACE = 2.5;
/** where a new session starts: the late afternoon the island was lit for before */
const START_HOUR = 16.5;

/** sunrise, sunset (h) and how high the sun climbs; the moon's arc is the same, half a day on */
const SUNRISE = 6;
const SUNSET = 18.5;
const SUN_TOP = (50 * Math.PI) / 180;
const MOON_TOP = (42 * Math.PI) / 180;
const MOON_LAG = 13.2;

/**
 * Where a body on the day arc stands at hour h (rising at SUNRISE, setting at SUNSET): from the
 * east (+x) round through the south (+z, the open sea) into the west (−x). Tidewater's layout:
 * the sun sets in the west. At 16:30 it's the old fixed sun: low in the south-west-by-west.
 */
function arc(h: number, top: number, out: Vector3): Vector3 {
  const t = (h - SUNRISE) / (SUNSET - SUNRISE); // 0 rise .. 1 set (outside: below the horizon)
  const el = top * Math.sin(Math.PI * t);
  const az = ((70 - 235 * t) * Math.PI) / 180; // from +z toward +x
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
}

interface Key {
  h: number;
  zenith: number;
  horizon: number;
  fog: number;
  /** the disc and the key light (sun, or moon at night) */
  sun: number;
  sunI: number;
  hemiSky: number;
  hemiGround: number;
  hemiI: number;
}

/** sRGB colours at the hours that carry the day's moods */
const KEYS: Key[] = [
  { h: 0, zenith: 0x0b1733, horizon: 0x1f2d4e, fog: 0x1a2640, sun: 0xa9b8e6, sunI: 0.75, hemiSky: 0x6c80b4, hemiGround: 0x2c2c3a, hemiI: 1.25 },
  { h: 4.8, zenith: 0x0d1a38, horizon: 0x243356, fog: 0x1c2944, sun: 0xa9b8e6, sunI: 0.72, hemiSky: 0x6c80b4, hemiGround: 0x2c2c3a, hemiI: 1.25 },
  { h: 5.8, zenith: 0x2a3f72, horizon: 0xe6a088, fog: 0xa88e98, sun: 0xffa888, sunI: 1.0, hemiSky: 0xa4acd0, hemiGround: 0x5a4c48, hemiI: 1.35 },
  { h: 7.2, zenith: 0x4a86c8, horizon: 0xe6dcd0, fog: 0xcbd8e0, sun: 0xffe8c8, sunI: 2.5, hemiSky: 0xbcd6ee, hemiGround: 0x8a7a5a, hemiI: 1.55 },
  { h: 12.5, zenith: 0x3478c6, horizon: 0xd2e6f2, fog: 0xcfe2ec, sun: 0xfffaf0, sunI: 2.8, hemiSky: 0xc4dcf2, hemiGround: 0x8e7e5e, hemiI: 1.3 },
  { h: 16.5, zenith: 0x3f7fc4, horizon: 0xcfe0ea, fog: 0xc6d9e3, sun: 0xfff0d6, sunI: 2.6, hemiSky: 0xbcd6ee, hemiGround: 0x8a7a5a, hemiI: 1.25 },
  { h: 17.8, zenith: 0x4a70b2, horizon: 0xf2c690, fog: 0xe2bf98, sun: 0xffc47c, sunI: 2.7, hemiSky: 0xe8d4b8, hemiGround: 0x8a6a48, hemiI: 1.7 },
  { h: 18.6, zenith: 0x36487e, horizon: 0xf29a6a, fog: 0xc88a78, sun: 0xff9a5c, sunI: 1.8, hemiSky: 0xc0a8bc, hemiGround: 0x5e4a46, hemiI: 1.55 },
  { h: 19.4, zenith: 0x1b2554, horizon: 0x6c4a7e, fog: 0x3c3458, sun: 0xa9b8e6, sunI: 0.65, hemiSky: 0x7078a8, hemiGround: 0x2e2a36, hemiI: 1.3 },
  { h: 20.4, zenith: 0x0b1733, horizon: 0x1f2d4e, fog: 0x1a2640, sun: 0xa9b8e6, sunI: 0.75, hemiSky: 0x6c80b4, hemiGround: 0x2c2c3a, hemiI: 1.25 },
  { h: 24, zenith: 0x0b1733, horizon: 0x1f2d4e, fog: 0x1a2640, sun: 0xa9b8e6, sunI: 0.75, hemiSky: 0x6c80b4, hemiGround: 0x2c2c3a, hemiI: 1.25 },
];

const lin = (hex: number): Color => new Color(hex).convertSRGBToLinear();
const LIN = KEYS.map((k) => ({ ...k, Z: lin(k.zenith), Hz: lin(k.horizon), F: lin(k.fog), S: lin(k.sun), HS: lin(k.hemiSky), HG: lin(k.hemiGround) }));

const _sun = new Vector3();
const _moon = new Vector3();

export interface Sky {
  state: SkyState;
  dome: Mesh;
  /** advance the day (seconds of real time) */
  update(dt: number): void;
  /** jump to an hour (0..24) */
  setHour(h: number): void;
}

export function createSky(scene: Scene): Sky {
  const state: SkyState = {
    sunDir: new Vector3(0, 1, 0),
    sunColor: new Color(),
    zenith: new Color(),
    horizon: new Color(),
    fogColor: new Color(),
    fogNear: 220,
    fogFar: 3200,
    ambient: new Color(1, 1, 1),
    night: { value: 0 },
    hour: START_HOUR,
  };

  const stars = { value: 0 };
  const dome = new Mesh(
    new SphereGeometry(4800, 32, 16),
    new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uSunDir: { value: state.sunDir },
        uZenith: { value: state.zenith },
        uHorizon: { value: state.horizon },
        uSun: { value: state.sunColor },
        uStars: stars,
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww; // pinned to the far plane
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir;
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uSun;
        uniform float uStars;
        varying vec3 vDir;
        float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        void main() {
          vec3 d = normalize(vDir);
          float up = max(d.y, 0.0);
          vec3 col = mix(uHorizon, uZenith, pow(up, 0.5));
          // below the horizon the haze just continues (the sea covers it)
          col = mix(col, uHorizon * 0.92, smoothstep(0.0, -0.05, d.y));
          float s = max(dot(d, uSunDir), 0.0);
          col += uSun * (pow(s, 1800.0) * 30.0 + pow(s, 64.0) * 0.35 + pow(s, 6.0) * 0.12);
          // stars: one in a few hundred cells of a fine grid on the sky, twinkle-free, thinning to
          // the horizon haze
          if (uStars > 0.001 && d.y > 0.0) {
            vec3 c = floor(d * 260.0);
            float h = hash(c);
            if (h > 0.9965) {
              vec3 f = fract(d * 260.0) - 0.5;
              float star = smoothstep(0.32, 0.0, length(f)) * (0.5 + 0.5 * fract(h * 97.0));
              col += vec3(0.9, 0.93, 1.0) * star * uStars * smoothstep(0.02, 0.25, d.y) * 1.4;
            }
          }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  dome.name = 'sky';
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  // ride with the viewer so the horizon never gets closer
  dome.onBeforeRender = (_r, _s, camera) => {
    // read, never recompute: in XR this is a per-eye camera with no parent, whose world matrix
    // three set from the rig — getWorldPosition() would rebuild it from the local pose alone
    dome.position.setFromMatrixPosition(camera.matrixWorld);
    dome.updateMatrixWorld();
  };
  scene.add(dome);

  const fog = new Fog(0xffffff, state.fogNear, state.fogFar);
  scene.fog = fog;
  scene.background = null;

  const light = new DirectionalLight(0xffffff, 2.6);
  scene.add(light);
  scene.add(light.target);
  const hemi = new HemisphereLight(0xffffff, 0xffffff, 1.25);
  scene.add(hemi);

  const apply = (): void => {
    const h = state.hour;
    let i = 0;
    while (i < LIN.length - 2 && LIN[i + 1].h <= h) i++;
    const a = LIN[i];
    const b = LIN[i + 1];
    const t = Math.min(1, Math.max(0, (h - a.h) / (b.h - a.h)));
    state.zenith.copy(a.Z).lerp(b.Z, t);
    state.horizon.copy(a.Hz).lerp(b.Hz, t);
    state.fogColor.copy(a.F).lerp(b.F, t);
    // the fog takes its colour the way it always did here (the linear colour, read as sRGB)
    fog.color.copy(state.fogColor).convertLinearToSRGB();
    hemi.color.copy(a.HS).lerp(b.HS, t);
    hemi.groundColor.copy(a.HG).lerp(b.HG, t);
    hemi.intensity = a.hemiI + (b.hemiI - a.hemiI) * t;
    light.color.copy(a.S).lerp(b.S, t);
    light.intensity = a.sunI + (b.sunI - a.sunI) * t;

    // sun, or moon: the moon takes over once the sun is a little below the horizon, and only
    // shows as it climbs clear of the dusk, so neither disc ever pops
    arc(h, SUN_TOP, _sun);
    arc((h - MOON_LAG + 24) % 24, MOON_TOP, _moon);
    const sunEl = Math.asin(_sun.y);
    const moonUp = sunEl < -0.035;
    state.sunDir.copy(moonUp ? _moon : _sun);
    const moonShow = Math.min(1, Math.max(0, (-sunEl - 0.035) / 0.12)) * Math.min(1, Math.max(0, _moon.y / 0.08));
    state.sunColor.copy(light.color).multiplyScalar(moonUp ? 0.9 * moonShow : 1.6);
    light.position.copy(moonUp && _moon.y > 0 ? _moon : _sun.y > 0 ? _sun : _moon).multiplyScalar(100);

    // the light on things that don't take the scene's lights (the sea's colour): how bright the
    // key and fill are against the afternoon's, tinted half-way to the key light's colour
    const bright = Math.pow((hemi.intensity / 1.25) * 0.55 + (light.intensity / 2.6) * 0.45, 1.5);
    const k = Math.max(light.color.r, light.color.g, light.color.b, 1e-4);
    state.ambient.setRGB(0.5 + (0.5 * light.color.r) / k, 0.5 + (0.5 * light.color.g) / k, 0.5 + (0.5 * light.color.b) / k).multiplyScalar(bright);

    // after dark: 0 while the sun's up, 1 once it's 7° down
    const n = Math.min(1, Math.max(0, (0.07 - sunEl) / 0.19));
    state.night.value = n * n * (3 - 2 * n);
    stars.value = Math.max(0, state.night.value - 0.3) / 0.7;
  };
  apply();

  return {
    state,
    dome,
    update(dt: number): void {
      const pace = 1 + (NIGHT_PACE - 1) * state.night.value;
      state.hour = (state.hour + (dt * pace * 24) / (DAY_MINUTES * 60)) % 24;
      apply();
    },
    setHour(h: number): void {
      state.hour = ((h % 24) + 24) % 24;
      apply();
    },
  };
}
