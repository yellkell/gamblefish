/**
 * Sky, sun and fog for a fixed late-afternoon on the island. Tidewater
 * integrates a physically based atmosphere with volumetric clouds; on Quest
 * the sky is a gradient dome with a sun disc and glow, in the same colours,
 * and the lights and fog are tuned to match it so the land sinks into the
 * sea haze at the same distance the dome does.
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
  /** unit vector toward the sun */
  sunDir: Vector3;
  /** linear-space colours */
  sunColor: Color;
  zenith: Color;
  horizon: Color;
  fogColor: Color;
  fogNear: number;
  fogFar: number;
}

/** Tidewater: the sun sets in the west (−x), the open sea lies south (+z).
 *  Late afternoon puts it low over the south-west — behind the glitter path
 *  you see from the end of the pier. */
const SUN_AZIMUTH = (-128 * Math.PI) / 180; // from +z toward −x
const SUN_ELEVATION = (24 * Math.PI) / 180;

export function createSky(scene: Scene): { state: SkyState; dome: Mesh } {
  const sunDir = new Vector3(
    Math.sin(SUN_AZIMUTH) * Math.cos(SUN_ELEVATION),
    Math.sin(SUN_ELEVATION),
    Math.cos(SUN_AZIMUTH) * Math.cos(SUN_ELEVATION),
  ).normalize();
  const lin = (hex: number): Color => new Color(hex).convertSRGBToLinear();
  const state: SkyState = {
    sunDir,
    sunColor: lin(0xfff0d6).multiplyScalar(1.6),
    zenith: lin(0x3f7fc4),
    horizon: lin(0xcfe0ea),
    fogColor: lin(0xc6d9e3),
    fogNear: 220,
    fogFar: 3200,
  };

  const dome = new Mesh(
    new SphereGeometry(4800, 32, 16),
    new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uSunDir: { value: sunDir },
        uZenith: { value: state.zenith },
        uHorizon: { value: state.horizon },
        uSun: { value: state.sunColor },
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
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float up = max(d.y, 0.0);
          vec3 col = mix(uHorizon, uZenith, pow(up, 0.5));
          // below the horizon the haze just continues (the sea covers it)
          col = mix(col, uHorizon * 0.92, smoothstep(0.0, -0.05, d.y));
          float s = max(dot(d, uSunDir), 0.0);
          col += uSun * (pow(s, 1800.0) * 30.0 + pow(s, 64.0) * 0.35 + pow(s, 6.0) * 0.12);
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

  scene.fog = new Fog(state.fogColor.clone().convertLinearToSRGB(), state.fogNear, state.fogFar);
  scene.background = null;

  const sun = new DirectionalLight(0xfff0d6, 2.6);
  sun.position.copy(sunDir).multiplyScalar(100);
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new HemisphereLight(0xbcd6ee, 0x8a7a5a, 1.25);
  scene.add(hemi);

  return { state, dome };
}
