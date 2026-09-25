/**
 * The casino's shared materials. Glossy paint, chrome and gold all reflect one small studio
 * environment (three's RoomEnvironment, prefiltered once), so machines and fittings catch
 * highlights the way lacquer and metal do, whatever the island's sun is doing outside.
 */

import { Color, MeshStandardMaterial, PMREMGenerator, type Texture, type WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

let env: Texture | null = null;

export function casinoEnv(renderer: WebGLRenderer): Texture {
  if (env) return env;
  const pmrem = new PMREMGenerator(renderer);
  env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return env;
}

export const look = {
  paint(renderer: WebGLRenderer, colour: string | number): MeshStandardMaterial {
    return new MeshStandardMaterial({ color: new Color(colour), roughness: 0.22, metalness: 0.15, envMap: casinoEnv(renderer), envMapIntensity: 1.1 });
  },
  chrome(renderer: WebGLRenderer): MeshStandardMaterial {
    return new MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.08, metalness: 1, envMap: casinoEnv(renderer), envMapIntensity: 1.4 });
  },
  gold(renderer: WebGLRenderer): MeshStandardMaterial {
    return new MeshStandardMaterial({ color: 0xffc848, roughness: 0.2, metalness: 1, envMap: casinoEnv(renderer), envMapIntensity: 1.5 });
  },
  gloss(renderer: WebGLRenderer, colour: string | number): MeshStandardMaterial {
    return new MeshStandardMaterial({ color: new Color(colour), roughness: 0.12, metalness: 0, envMap: casinoEnv(renderer), envMapIntensity: 1.2 });
  },
  satin(renderer: WebGLRenderer, colour: string | number): MeshStandardMaterial {
    return new MeshStandardMaterial({ color: new Color(colour), roughness: 0.55, metalness: 0.1, envMap: casinoEnv(renderer), envMapIntensity: 0.6 });
  },
};
