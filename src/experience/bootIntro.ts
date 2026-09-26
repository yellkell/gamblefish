/**
 * The boot intro: ff2's opening ritual (src/experience/BootIntro.ts), shown once per page load
 * the moment the XR session starts. Black; "yellkell.com PRESENTS" fades in and out (3 s); the
 * FISH & CHIPS mark fades in and out in its sea-glass and gold glow (3 s); then the curtain
 * drops in a single frame and you're on the boardwalk, the music starting as it does.
 *
 * As in ff2: the SHADE is head-locked (a featureless black cover must follow the view so turning
 * never breaks the blackout), the CARDS are world-locked, planted once ahead of wherever you face
 * as the session opens, like a cinema screen. Nothing is paused behind it; the island keeps
 * drawing, which is what makes the cut instant. It isn't skippable (six seconds, and the first
 * song decodes behind it). While it's up, the rod, the teleport and the pointers wait
 * (introGate.ts).
 */

import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3, type PerspectiveCamera, type Scene } from 'three';
import { onFontsReady } from '../ui/fonts.ts';
import { drawLogo } from '../ui/logo.ts';
import { setIntroActive } from './introGate.ts';

const CARD_SECONDS = 3;
const FADE_SECONDS = 0.5;
const TOTAL_SECONDS = CARD_SECONDS * 2;

/** Per-card fade envelope: 0.5 s in, 2 s hold, 0.5 s out. */
function envelope(t: number): number {
  if (t <= 0 || t >= CARD_SECONDS) return 0;
  if (t < FADE_SECONDS) return t / FADE_SECONDS;
  if (t > CARD_SECONDS - FADE_SECONDS) return (CARD_SECONDS - t) / FADE_SECONDS;
  return 1;
}

interface Card {
  mesh: Mesh;
  material: MeshBasicMaterial;
  texture: CanvasTexture;
  redraw(): void;
}

function makeCard(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): Card {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 640;
  const g = canvas.getContext('2d')!;
  const paint = (): void => {
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    draw(g, canvas.width, canvas.height);
  };
  paint();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
  const mesh = new Mesh(new PlaneGeometry(2.08, 1.04), material);
  mesh.renderOrder = 10_003;
  return {
    mesh,
    material,
    texture,
    redraw() {
      paint();
      texture.needsUpdate = true;
    },
  };
}

/** ff2's publisher card, as it is. */
function drawPublisher(g: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w / 2;
  g.font = '500 118px system-ui, sans-serif';
  g.fillStyle = '#ffffff';
  g.shadowColor = 'rgba(255,255,255,0.45)';
  g.shadowBlur = 30;
  g.fillText('yellkell.com', cx, h / 2 - 26);
  g.shadowBlur = 0;
  g.font = '400 30px system-ui, sans-serif';
  g.fillStyle = '#9aa0a8';
  g.fillText('P R E S E N T S', cx, h / 2 + 84);
}

let glow: CanvasTexture | null = null;
function glowTexture(): CanvasTexture {
  if (glow) return glow;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glow = new CanvasTexture(c);
  glow.colorSpace = SRGBColorSpace;
  return glow;
}

let played = false;

/** Play the intro on this camera, once per page load (later sessions go straight in). */
export function runBootIntro(camera: PerspectiveCamera, scene: Scene): void {
  if (played) return;
  played = true;
  setIntroActive(true);

  const shade = new Mesh(
    // oversized to cover the whole per-eye frustum; transparent (at full opacity) so it draws in
    // the transparent pass, AFTER the island's own glows and panels (see ff2's note)
    new PlaneGeometry(20, 20),
    new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 1, depthTest: false, depthWrite: false }),
  );
  shade.position.z = -1.7;
  shade.renderOrder = 10_000;
  camera.add(shade);

  const pub = makeCard(drawPublisher);
  const mark = makeCard((g, w, h) => drawLogo(g, w, h));
  onFontsReady(() => mark.redraw());

  // the mark's living glow: a sea-glass haze to the left, a gold one to the right, a warm core
  const glowGroup = new Group();
  const glowMats: MeshBasicMaterial[] = [];
  const specs: [number, number, number, number][] = [
    // size, colour, x, base opacity
    [2.4, 0x1fa99c, -0.45, 0.55],
    [2.2, 0xe0900f, 0.5, 0.5],
    [1.1, 0xc8243a, 0.0, 0.45],
  ];
  specs.forEach(([size, colour, x], i) => {
    const mat = new MeshBasicMaterial({ map: glowTexture(), color: colour, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
    const plane = new Mesh(new PlaneGeometry(size, size * 0.62), mat);
    plane.position.set(x, 0, -0.06 + i * 0.01);
    plane.renderOrder = 10_001 + (i ? 1 : 0);
    glowMats.push(mat);
    glowGroup.add(plane);
  });
  const markGroup = new Group();
  markGroup.add(glowGroup, mark.mesh);

  const root = new Group();
  root.add(pub.mesh, markGroup);
  root.scale.setScalar(1.35);
  scene.add(root);

  // plant the cards ahead of the gaze: eye height, yaw only
  const place = (): void => {
    const eye = new Vector3();
    camera.getWorldPosition(eye);
    const fwd = new Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    root.position.copy(eye).addScaledVector(fwd, 2.2);
    root.lookAt(eye);
  };
  place();
  let refined = false;

  const started = performance.now();
  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    window.clearInterval(timer);
    try {
      scene.remove(root);
      camera.remove(shade);
      for (const c of [pub, mark]) {
        c.mesh.geometry.dispose();
        c.material.dispose();
        c.texture.dispose();
      }
      shade.geometry.dispose();
      (shade.material as MeshBasicMaterial).dispose();
      for (const p of glowGroup.children) (p as Mesh).geometry.dispose();
      for (const m of glowMats) m.dispose();
    } finally {
      setIntroActive(false); // curtain down: the music starts, the controls come back
    }
  };

  // a timer, not rAF: Quest Browser suspends window rAF while presenting
  const timer = window.setInterval(() => {
    const t = (performance.now() - started) / 1000;
    if (!refined && t >= 0.15) {
      refined = true;
      place(); // the first real XR pose is in by now; the cards are still near invisible
    }
    if (t >= TOTAL_SECONDS) return finish();
    pub.material.opacity = envelope(t);
    const k = envelope(t - CARD_SECONDS);
    mark.material.opacity = k;
    // the glow breathes (ff2's banner rhythm), and the mark swells a touch as it holds
    const pulse = 0.5 + 0.5 * Math.sin((performance.now() / 1000) * 1.6);
    glowGroup.scale.setScalar(0.93 + pulse * 0.14);
    glowMats.forEach((m, i) => (m.opacity = specs[i][3] * (0.72 + pulse * 0.5) * k));
    markGroup.scale.setScalar(0.97 + 0.03 * Math.min(1, Math.max(0, t - CARD_SECONDS) / CARD_SECONDS));
  }, 33);
}
