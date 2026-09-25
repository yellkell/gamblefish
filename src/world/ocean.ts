/**
 * The sea, Quest-sized. Tidewater runs a four-cascade FFT ocean with
 * breakers, swash and refraction in WebGPU compute; none of that fits a
 * standalone headset at 72 Hz in stereo. What's kept is what you read from
 * a pier: a gentle Gerstner swell, the lagoon's colour going from clear
 * turquoise over sand to deep blue past the drop-off (straight from
 * Tidewater's own depth field), a foam line where the water meets the
 * beach, sky reflection and the sun's glitter path.
 *
 * One mesh, one pass: a polar grid dense under the viewer and sparse at the
 * horizon, re-centred on the camera every frame (snapped, so the vertices
 * don't swim through the waves).
 */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  LinearFilter,
  Mesh,
  RedFormat,
  ShaderMaterial,
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
uniform float uDepthRange;
uniform vec2 uTerrainOrigin;
uniform float uTerrainSize;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFogColor;
uniform vec3 uAmbient;
uniform float uFogNear;
uniform float uFogFar;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vFade;

// cheap ripple normal: two crossing sine fields, no texture fetch
vec3 ripples(vec2 p, float t) {
  vec2 g = vec2(0.0);
  g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 1.9 + t * 1.7) * 0.05;
  g += vec2(-0.55, 0.83) * cos(dot(p, vec2(-0.55, 0.83)) * 3.1 + t * 2.3) * 0.035;
  g += vec2(0.96, -0.28) * cos(dot(p, vec2(0.96, -0.28)) * 5.3 - t * 2.9) * 0.02;
  g += vec2(-0.3, -0.95) * cos(dot(p, vec2(-0.3, -0.95)) * 8.7 + t * 3.7) * 0.012;
  return vec3(-g.x, 1.0, -g.y);
}

void main() {
  vec3 V = cameraPosition - vWorld;
  float dist = length(V);
  V /= dist;
  float detail = 1.0 - smoothstep(20.0, 160.0, dist);
  vec3 N = normalize(vNormal + (ripples(vWorld.xz, uTime) - vec3(0.0, 1.0, 0.0)) * detail);

  // water depth from Tidewater's bathymetry (0 at the tide line)
  vec2 uv = (vWorld.xz - uTerrainOrigin) / uTerrainSize;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  float depth = mix(uDepthRange, texture2D(uDepth, uv).r * uDepthRange, inside);

  // body colour: clear turquoise over the sand, deep blue past the drop-off
  vec3 body = mix(uShallow, uDeep, smoothstep(0.5, 18.0, depth)) * uAmbient; // lit as the day goes
  float clarity = 1.0 - smoothstep(0.2, 6.0, depth);

  // sky reflection, Schlick fresnel
  float cosT = max(dot(N, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
  vec3 R = reflect(-V, N);
  vec3 sky = mix(uSkyHorizon, uSkyZenith, pow(clamp(R.y, 0.0, 1.0), 0.45));
  vec3 col = mix(body, sky, fres);

  // sun glitter
  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(N, H), 0.0), 380.0) * 6.0 + pow(max(dot(N, H), 0.0), 60.0) * 0.12;
  col += uSunColor * spec;

  // foam where the swash runs up the sand
  float wave = sin(vWorld.x * 0.21 + vWorld.z * 0.6 - uTime * 1.3) * 0.5 + 0.5;
  float foam = (1.0 - smoothstep(0.05, 0.45 + wave * 0.35, depth)) * inside;
  foam *= 0.55 + 0.45 * sin(dot(vWorld.xz, vec2(3.1, 2.3)) + uTime * 2.0);
  col = mix(col, vec3(0.93, 0.95, 0.95) * uAmbient, clamp(foam, 0.0, 1.0) * 0.85);

  // shallow water lets the seabed through
  float alpha = mix(1.0, 0.35 + 0.65 * fres, clarity);
  alpha = max(alpha, foam * 0.9);

  float fog = smoothstep(uFogNear, uFogFar, dist);
  col = mix(col, uFogColor, fog);
  alpha = mix(alpha, 1.0, fog);
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}
`;

export class Ocean {
  readonly mesh: Mesh;
  /** seconds, the clock the waves run on */
  time = 0;
  private readonly material: ShaderMaterial;
  private readonly waves: Vector4[];

  constructor(grid: TerrainGrid, sky: SkyState) {
    const depth = new DataTexture(grid.depth, grid.res, grid.res, RedFormat, UnsignedByteType);
    depth.minFilter = LinearFilter;
    depth.magFilter = LinearFilter;
    depth.flipY = false;
    depth.needsUpdate = true;

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
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: true,
      uniforms: {
        uTime: { value: 0 },
        uWaves: { value: waves },
        uCenter: { value: new Vector2() },
        uDepth: { value: depth },
        uDepthRange: { value: grid.depthRange },
        uTerrainOrigin: { value: new Vector2(grid.origin, grid.origin) },
        uTerrainSize: { value: grid.res * grid.cell },
        uSunDir: { value: sky.sunDir },
        uSunColor: { value: sky.sunColor },
        uSkyZenith: { value: sky.zenith },
        uSkyHorizon: { value: sky.horizon },
        uShallow: { value: new Color(0x3fd6c6).convertSRGBToLinear() },
        uDeep: { value: new Color(0x0a3d62).convertSRGBToLinear() },
        uFogColor: { value: sky.fogColor },
        uAmbient: { value: sky.ambient },
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
