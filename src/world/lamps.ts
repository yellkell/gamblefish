/**
 * The village's lamps after dark: a soft warm halo at every lantern and path light Tidewater
 * placed (world.json `lamps`, from the bake), fading in with the sky's `night`. One instanced
 * draw of camera-facing quads, additive, no depth writes; the lamps' own glass glows with the
 * windows (world/village.ts). The helter skelter's lanterns wear the same halo (skelter/lights.ts).
 */

import { AdditiveBlending, InstancedMesh, Matrix4, PlaneGeometry, ShaderMaterial } from 'three';

/**
 * A lamp's halo: a warm camera-facing glow, instanced, brightening with `night` (0 by day). With
 * `grow`, a far one keeps some size (it grows by `grow` of its distance past 1/grow m), the way a
 * light seen from a long way off still reads as a light.
 */
export function haloMaterial(night: { value: number }, grow = 0): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uNight: night, uGrow: { value: grow } },
    vertexShader: /* glsl */ `
      uniform float uGrow;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        // the quad's corner offsets in view space: always facing you
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        mv.xy += position.xy * max(1.0, -mv.z * uGrow);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uNight;
      varying vec2 vUv;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float a = pow(max(0.0, 1.0 - r), 2.2);
        gl_FragColor = vec4(vec3(1.0, 0.7, 0.36) * a * uNight * 0.85, 1.0);
      }`,
  });
}

export function buildLamps(lamps: [number, number, number, string][], night: { value: number }): InstancedMesh {
  const list = lamps.filter((l) => l[3] !== 'window'); // lit windows glow in their own panes
  const mat = haloMaterial(night);
  const mesh = new InstancedMesh(new PlaneGeometry(1.1, 1.1), mat, list.length);
  const m = new Matrix4();
  list.forEach(([x, y, z], i) => mesh.setMatrixAt(i, m.makeTranslation(x, y, z)));
  mesh.name = 'lamps';
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.visible = false; // by day there's nothing to draw: the frame loop shows it at dusk
  return mesh;
}
