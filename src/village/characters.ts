/**
 * The island's people: Tidewater's Rocketbox characters (MIT, public/models/characters) — Joe the
 * fish buyer and Marta at the chandlery — as skinned glTF with their own animation clips.
 *
 * They idle (breathing, looking around), turn toward you when you come near and wave once, and
 * switch to talking gestures while you're at their counter.
 *
 * Someone indoors (Coral in her villa) isn't lit by the island's sun and sky, which reach
 * through the roof: from inside, the sun raked across her at odd angles by day and she went
 * black at night, under a lamp-lit room. Indoors, a character is lit the way the room's
 * furniture is — by the small studio environment (casino/look.ts), soft and even, at any hour.
 */

import { AnimationMixer, Group, LoopOnce, MeshStandardMaterial, Vector3, type AnimationAction, type Camera, type Material, type Mesh, type WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { casinoEnv } from '../casino/look.ts';

/** Light a character's materials from the studio environment only: no sun, moon or sky. */
function lightIndoors(root: Group, renderer: WebGLRenderer): void {
  const env = casinoEnv(renderer);
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as Material[]) {
      if (!(mat instanceof MeshStandardMaterial)) continue;
      mat.envMap = env;
      mat.envMapIntensity = 1.15;
      // after the lights are gathered: drop the direct ones (sun, moon) and the sky's ambient
      mat.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <lights_fragment_begin>',
          '#include <lights_fragment_begin>\nreflectedLight.directDiffuse = vec3(0.0);\nreflectedLight.directSpecular = vec3(0.0);\nirradiance = vec3(0.0);',
        );
      };
      mat.customProgramCacheKey = () => 'character-indoors';
      mat.needsUpdate = true;
    }
  });
}

const loader = new GLTFLoader();
const _v = new Vector3();

export class Character {
  readonly group = new Group();
  private mixer: AnimationMixer | null = null;
  private actions: Record<string, AnimationAction> = {};
  private current: AnimationAction | null = null;
  private near = false;
  private yaw: number;
  private readonly baseYaw: number;
  talking = false;

  /** indoors: pass the renderer, and the studio environment lights them instead of the sky */
  constructor(url: string, x: number, y: number, z: number, yaw: number, indoors?: WebGLRenderer) {
    this.group.position.set(x, y, z);
    this.group.rotation.y = yaw;
    this.yaw = this.baseYaw = yaw;
    loader.load(
      url,
      (gltf) => {
        const root = gltf.scene;
        root.traverse((o) => {
          o.frustumCulled = false;
        });
        if (indoors) lightIndoors(root, indoors);
        this.group.add(root);
        this.mixer = new AnimationMixer(root);
        for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
        this.play('idle_neutral_01');
      },
      undefined,
      (e) => console.warn('character failed to load', url, e),
    );
  }

  private play(name: string, once = false): void {
    const a = this.actions[name];
    if (!a || a === this.current) return;
    a.reset();
    if (once) {
      a.setLoop(LoopOnce, 1);
      a.clampWhenFinished = false;
    }
    a.play();
    if (this.current) a.crossFadeFrom(this.current, 0.35, false);
    this.current = a;
  }

  /** Per frame: face the viewer when they're near, wave once on arrival, talk at the counter. */
  update(dt: number, camera: Camera): void {
    this.mixer?.update(dt);
    camera.getWorldPosition(_v);
    const dx = _v.x - this.group.position.x;
    const dz = _v.z - this.group.position.z;
    const dist = Math.hypot(dx, dz);
    const near = dist < 6;
    if (near && !this.near) {
      this.play('wave_01', true);
      window.setTimeout(() => this.play(this.talking ? 'gestic_talk_relaxed_01' : 'idle_breathe_01'), 2200);
    } else if (!near && this.near) this.play('idle_look_around_01');
    this.near = near;
    if (near && this.current === this.actions['idle_breathe_01'] && this.talking) this.play('gestic_talk_relaxed_01');
    if (!this.talking && this.current === this.actions['gestic_talk_relaxed_01']) this.play('idle_breathe_01');
    // turn toward you (within reason), back to their post when you leave
    const want = near ? Math.atan2(dx, dz) : this.baseYaw;
    let d = want - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * (1 - Math.exp(-dt * 3));
    this.group.rotation.y = this.yaw;
  }
}
