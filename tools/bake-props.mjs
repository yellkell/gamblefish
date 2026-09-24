/**
 * bake-props — Tidewater's fishing props, from its OWN builders (vendor/tidewater, MIT):
 *
 *   rod      the 7 ft spinning combo (game/FishingRod.js buildRodGeometry): blank, guides,
 *            grips, reel with rotor / bail / crank / spool. Per vertex: linear colour and the
 *            animated-part tag the reel shader reads (1 rotor, 2 bail, 3 crank, 4 spool, 5 braid).
 *   bobber   the red-and-white float (buildBobberGeometry).
 *   fish     all 18 catchable species (world/fish/FishGeometry.js fishGeometry, total length 1,
 *            snout at +z), counter-shaded into vertex colour from world/fish/FishSpecies.js SKIN
 *            the way Tidewater's fish shader does it (back → flank → belly by height, fins
 *            darkening to their edge, eyes), plus `along` (0 snout .. 1 tail tip) for the swim bend.
 *
 * FishingRod.js keeps its geometry builders module-private. Rather than copy or edit vendored
 * code, the bake loads a throwaway copy of the module with one export line appended, next to the
 * original so its relative imports resolve, then deletes it.
 *
 * Output: public/props/props.bin. Usage: node tools/bake-props.mjs [--if-missing]
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pack } from './pack.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TW = resolve(ROOT, 'vendor/tidewater/src');
const OUT = resolve(ROOT, 'public/props');
const url = (p) => 'file:///' + resolve(TW, p).replace(/\\/g, '/');

if (process.argv.includes('--if-missing') && existsSync(resolve(OUT, 'props.bin'))) process.exit(0);

const { SPECIES, SKIN } = await import(url('world/fish/FishSpecies.js'));
const { fishGeometry, PART } = await import(url('world/fish/FishGeometry.js'));
const { FISH, FISH_IDS } = await import(url('game/FishTable.js'));

// the rod module, with its builders exported
const rodSrc = readFileSync(resolve(TW, 'game/FishingRod.js'), 'utf8');
const tmp = resolve(TW, 'game/.FishingRod.bake.mjs');
writeFileSync(tmp, rodSrc + '\nexport { buildRodGeometry, buildBobberGeometry };\n');
let rodMod;
try {
  rodMod = await import(url('game/.FishingRod.bake.mjs'));
} finally {
  unlinkSync(tmp);
}

const arrays = {};
const meta = { fish: {} };

/** Flatten a GeoKit geometry (color = linear rgb, aux.w = anim tag) into our arrays. */
function putGeoKit(name, g) {
  const n = g.attributes.position.count;
  arrays[`${name}.position`] = new Float32Array(g.attributes.position.array);
  arrays[`${name}.normal`] = toInt8(g.attributes.normal.array);
  const c = g.attributes.color.array;
  const col = new Uint8Array(n * 4);
  const aux = g.attributes.aux?.array;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) col[i * 4 + k] = Math.round(Math.min(1, Math.max(0, c[i * 3 + k])) * 255);
    col[i * 4 + 3] = 255;
  }
  arrays[`${name}.color`] = col;
  if (aux) {
    const anim = new Uint8Array(n);
    for (let i = 0; i < n; i++) anim[i] = Math.round(aux[i * 4 + 3]);
    arrays[`${name}.anim`] = anim;
  }
  const idx = g.index.array;
  arrays[`${name}.index`] = n > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  return { vertices: n, triangles: idx.length / 3 };
}

function toInt8(a) {
  const o = new Int8Array(a.length);
  for (let i = 0; i < a.length; i++) o[i] = Math.round(Math.max(-1, Math.min(1, a[i])) * 127);
  return o;
}

meta.rod = putGeoKit('rod', rodMod.buildRodGeometry());
meta.bobber = putGeoKit('bobber', rodMod.buildBobberGeometry());

/* ── fish ─────────────────────────────────────────────────────────────── */

const lin = (hex) => {
  const s = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => v / 255);
  return s.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
};
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const sat = (v) => Math.min(1, Math.max(0, v));
const smooth = (e0, e1, x) => {
  const t = sat((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

for (const id of FISH_IDS) {
  const model = FISH[id].model;
  const S = SPECIES[model];
  const K = SKIN[model];
  const g = fishGeometry(S, { lod: 1, pose: 'swim', eyes: true });
  const n = g.attributes.position.count;
  const P = g.attributes.position.array;
  const D = g.attributes.aData.array;
  const back = lin(K.back);
  const flank = lin(K.flank);
  const belly = lin(K.belly);
  const fin = lin(K.fin);
  const edge = lin(K.edge);
  const iris = lin(S.iris);
  const col = new Uint8Array(n * 4);
  const along = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const u = D[i * 4];
    const part = Math.floor(D[i * 4 + 1] + 1e-4);
    const t = D[i * 4 + 2];
    const h = D[i * 4 + 3];
    let c;
    if (part === PART.EYE) {
      const r = Math.hypot(t, h);
      c = r < 0.45 ? [0.01, 0.01, 0.012] : mix(iris, flank.map((v) => v * 0.6), smooth(0.9, 1, r));
    } else if (part >= PART.DORSAL1 && part <= PART.FINLET) {
      c = mix(fin, edge, smooth(0.4, 1, t)).map((v) => v * (smooth(0, 0.15, t) * 0.2 + 0.8));
    } else if (part === PART.MOUTH) {
      c = [0.35, 0.08, 0.07];
    } else {
      // counter-shading, exactly the shader's bands
      c = mix(mix(flank, back, smooth(0.2, 0.75, h)), belly, 1 - smooth(-0.7, -0.1, h));
      // the painted eye on the head (the dome sits over it)
      const z = P[i * 3 + 2];
      const y = P[i * 3 + 1];
      const ez = 0.5 - S.eye.u * S.body;
      const er = Math.hypot(z - ez, y - S.eye.y) / S.eye.r;
      if (er < 1.1) c = mix(c, er < 0.45 ? [0.01, 0.01, 0.012] : iris, 1 - smooth(0.95, 1.1, er));
    }
    for (let k = 0; k < 3; k++) col[i * 4 + k] = Math.round(sat(c[k]) * 255);
    col[i * 4 + 3] = part >= PART.DORSAL1 && part <= PART.FINLET ? 1 : 0; // fin flag (flutter)
    along[i] = Math.round(sat(u) * 255);
  }
  arrays[`fish.${id}.position`] = new Float32Array(P);
  arrays[`fish.${id}.normal`] = toInt8(g.attributes.normal.array);
  arrays[`fish.${id}.color`] = col;
  arrays[`fish.${id}.along`] = along;
  const idx = g.index.array;
  arrays[`fish.${id}.index`] = n > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  meta.fish[id] = { vertices: n, triangles: idx.length / 3, metal: S.metal ?? 0 };
}

mkdirSync(OUT, { recursive: true });
const buf = pack(arrays, meta);
writeFileSync(resolve(OUT, 'props.bin'), buf);
const tris = Object.values(meta.fish).map((f) => f.triangles);
console.log(`props.bin ${(buf.length / 1048576).toFixed(2)} MB — rod ${meta.rod.triangles} tris, bobber ${meta.bobber.triangles}, fish ${Math.min(...tris)}–${Math.max(...tris)} tris × ${FISH_IDS.length}`);
