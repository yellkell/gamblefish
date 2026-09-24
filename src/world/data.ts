/**
 * The baked island (tools/bake-world.mjs): a tiny binary container reader and
 * the shapes of what's inside. Pure — no three.js, no DOM — so the Node check
 * tools read the same files through the same code the headset does.
 */

export type Typed = Float32Array | Uint32Array | Uint16Array | Uint8Array | Int8Array;

const CTORS: Record<string, new (buf: ArrayBuffer, off: number, len: number) => Typed> = {
  Float32Array,
  Uint32Array,
  Uint16Array,
  Uint8Array,
  Int8Array,
};

/** Read a bake container: 'RGWF' magic, header length, JSON header, arrays. */
export function unpack(buf: ArrayBuffer): { meta: Record<string, unknown>; arrays: Record<string, Typed> } {
  const view = new DataView(buf);
  if (view.getUint32(0, true) !== 0x46574752) throw new Error('not a baked world file');
  const headerLen = view.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, headerLen)));
  const base = 8 + headerLen;
  const arrays: Record<string, Typed> = {};
  for (const e of header.arrays as { name: string; type: string; offset: number; length: number }[]) {
    arrays[e.name] = new CTORS[e.type](buf, base + e.offset, e.length);
  }
  return { meta: header.meta, arrays };
}

export interface BoxCollider {
  tag: string;
  walkable: boolean;
  solid: boolean;
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  rotY: number;
  top: number;
  bottom: number;
}

export interface CylinderCollider {
  tag: string;
  x: number;
  z: number;
  r: number;
  bottom: number;
  top: number;
}

export interface WorldJson {
  terrain: {
    size: number;
    origin: number;
    res: number;
    cell: number;
    hMin: number;
    hMax: number;
    depthRange: number;
  };
  layout: {
    pier: { x: number; zStart: number; zEnd: number; deckHeight: number; width: number; headWidth: number; headDepth: number };
    village: { x: number; z: number; radius: number };
    reef: { x: number; z: number; radius: number };
    boatDock: { x: number; z: number; heading: number };
    start: { x: number; z: number; yaw: number };
    beach: { xMin: number; xMax: number };
  };
  village: Record<string, { vertices: number; triangles: number }>;
  colliders: { boxes: BoxCollider[]; cylinders: CylinderCollider[] };
}

export interface TerrainGrid {
  res: number;
  cell: number;
  origin: number;
  /** metres, row-major (z rows, x columns) */
  heights: Float32Array;
  /** sRGB RGBA8 ground colour */
  albedo: Uint8Array;
  /** R8 water depth, 0 = at/above sea level, 255 = depthRange or deeper */
  depth: Uint8Array;
  depthRange: number;
}

/** Decode terrain.bin against world.json's terrain block. */
export function decodeTerrain(json: WorldJson, buf: ArrayBuffer): TerrainGrid {
  const { arrays } = unpack(buf);
  const t = json.terrain;
  const q = arrays.heights as Uint16Array;
  const heights = new Float32Array(q.length);
  const k = (t.hMax - t.hMin) / 65535;
  for (let i = 0; i < q.length; i++) heights[i] = t.hMin + q[i] * k;
  return {
    res: t.res,
    cell: t.cell,
    origin: t.origin,
    heights,
    albedo: arrays.albedo as Uint8Array,
    depth: arrays.depth as Uint8Array,
    depthRange: t.depthRange,
  };
}
