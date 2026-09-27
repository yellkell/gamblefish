/**
 * Raising the tower: while it's being built, nothing of it above the height the logs have got it
 * to is drawn. Every material in the tower and the slide gets the cut (a `discard` over one world
 * height, `BUILT`), switched on by a define only while there's building to do, so the finished
 * tower draws without it.
 */

import { ShaderMaterial, type Material, type Mesh, type Object3D } from 'three';

/** the world height the tower is built up to */
export const BUILT = { value: 1e6 };

const VARY = '#ifdef SK_CLIP\nvarying float vSkY;\n#endif\n';
const FRAG = '#ifdef SK_CLIP\nvarying float vSkY;\nuniform float uSkBuilt;\n#endif\n';
const CUT = '\n#ifdef SK_CLIP\n  if (vSkY > uSkBuilt) discard;\n#endif\n';
const worldY = (p: string): string => `\n#ifdef SK_CLIP\n  {\n    vec4 skP = vec4(${p}, 1.0);\n    #ifdef USE_INSTANCING\n      skP = instanceMatrix * skP;\n    #endif\n    vSkY = (modelMatrix * skP).y;\n  }\n#endif\n`;

/** Give every material under `root` the cut (once each). Returns them, for `setBuilding`. */
export function clipAbove(root: Object3D): Material[] {
  const out = new Set<Material>();
  root.traverse((o) => {
    const m = (o as Mesh).material;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) out.add(mat);
  });
  for (const m of out) {
    if (m.userData.skClip) continue;
    m.userData.skClip = true;
    if (m instanceof ShaderMaterial) {
      m.uniforms.uSkBuilt = BUILT;
      m.vertexShader = VARY + m.vertexShader.replace(/void main\(\)\s*\{/, (s) => s + worldY('position'));
      m.fragmentShader = FRAG + m.fragmentShader.replace(/void main\(\)\s*\{/, (s) => s + CUT);
      continue;
    }
    const before = m.onBeforeCompile.bind(m);
    m.onBeforeCompile = (shader, renderer) => {
      before(shader, renderer);
      shader.uniforms.uSkBuilt = BUILT;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + VARY).replace('#include <project_vertex>', '#include <project_vertex>' + worldY('transformed'));
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG).replace(/void main\(\)\s*\{/, (s) => s + CUT);
    };
  }
  return [...out];
}

/** The cut on (still building) or off (finished: it draws as it always did). */
export function setBuilding(materials: Material[], on: boolean): void {
  for (const m of materials) {
    const has = 'SK_CLIP' in (m.defines ?? {});
    if (has === on) continue;
    m.defines ??= {};
    if (on) m.defines.SK_CLIP = '';
    else delete m.defines.SK_CLIP;
    m.needsUpdate = true;
  }
}
