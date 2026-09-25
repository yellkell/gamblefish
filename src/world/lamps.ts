/**
 * The village's lamps after dark: a soft warm halo at every lantern and path light Tidewater
 * placed (world.json `lamps`, from the bake), fading in with the sky's `night`. One instanced
 * draw of camera-facing quads, additive, no depth writes; the lamps' own glass glows with the
 * windows (world/village.ts).
 */

import { AdditiveBlending, InstancedMesh, Matrix4, PlaneGeometry, ShaderMaterial } from 'three';

export function buildLamps(lamps: [number, number, number, string][], night: { value: number }): InstancedMesh {
  const list = lamps.filter((l) => l[3] !== 'window'); // lit windows glow in their own panes
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uNight: night },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        // the quad's corner offsets in view space: always facing you
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        mv.xy += position.xy;
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
  const mesh = new InstancedMesh(new PlaneGeometry(1.1, 1.1), mat, list.length);
  const m = new Matrix4();
  list.forEach(([x, y, z], i) => mesh.setMatrixAt(i, m.makeTranslation(x, y, z)));
  mesh.name = 'lamps';
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.visible = false; // by day there's nothing to draw: the frame loop shows it at dusk
  return mesh;
}
