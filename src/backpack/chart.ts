/**
 * The chart of the bay for the field guide: the island's south shore as a hand-tinted nautical
 * chart, drawn once from the baked terrain.
 *
 *  - LAND in buff, shaded by the hills, sand along the shore, an inked coastline;
 *  - SEA tinted by depth, pale over the shallows to deep blue past the drop-off, with the 6 m
 *    line (the drop-off: where the trophy fish start) dashed and the 12 m line drawn in;
 *  - THE PIER, the reef (hatched) and the village's buildings;
 *  - numbered markers on the places you'll want (the shops, the casinos, home), keyed in a list
 *    under the chart rather than lettered over it, so nothing overlaps.
 *
 * North is up (−z): the village at the top, the sea at the bottom, as you see it from the pier.
 */

import type { BuildingFrame } from '../village/signs.ts';
import type { WorldJson } from '../world/data.ts';

export interface ChartSource {
  heightAt(x: number, z: number): number;
  layout: WorldJson['layout'];
  buildings: BuildingFrame[];
}

/** the part of the island charted (world metres) */
export const CHART = { x0: -200, x1: 220, z0: -215, z1: 165 };

/** the numbered places: [building name, what it is] */
export const KEY: [string, string][] = [
  ['S1', 'Home, your shack'],
  ['S3', 'Tackle shop'],
  ['S2', 'Bait shop'],
  ['stall', 'Fish market'],
  ['C', 'Roulette: the Lucky Lure'],
  ['B', "Slots: Reel 'Em In"],
  ['G', 'Blackjack: the Card Shark'],
  ['H', 'Island bank'],
  ['boathouse', 'Boatyard'],
  ['N', 'Fortune teller'],
  ['K', 'Taxidermist'],
  ['L', "Villa Mar: Coral's"],
];

const INK = '#2e2214';

/** The chart's picture (no key, no "you are here": the page adds those), and where its markers went. */
export function drawChart(src: ChartSource, w: number, h: number): { canvas: HTMLCanvasElement; markers: { n: number; x: number; y: number }[]; toPx: (x: number, z: number) => [number, number] } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const sx = w / (CHART.x1 - CHART.x0);
  const sz = h / (CHART.z1 - CHART.z0);
  const toPx = (x: number, z: number): [number, number] => [(x - CHART.x0) * sx, (z - CHART.z0) * sz];
  const at = (px: number, py: number): number => src.heightAt(CHART.x0 + px / sx, CHART.z0 + py / sz);

  // heights on the pixel grid (one extra row and column for the slopes and the contours)
  const H = new Float32Array((w + 1) * (h + 1));
  for (let y = 0; y <= h; y++) for (let x = 0; x <= w; x++) H[y * (w + 1) + x] = at(x, y);
  const hAt = (x: number, y: number): number => H[Math.min(h, y) * (w + 1) + Math.min(w, x)];

  const img = g.createImageData(w, h);
  const d = img.data;
  const paper = [242, 230, 204];
  const mix = (a: number[], b: number[], t: number): number[] => a.map((v, i) => v + (b[i] - v) * Math.max(0, Math.min(1, t)));
  const seaCol = (depth: number): number[] => {
    if (depth < 3) return mix([176, 222, 212], [140, 204, 204], depth / 3);
    if (depth < 6) return mix([140, 204, 204], [110, 176, 200], (depth - 3) / 3);
    if (depth < 12) return mix([110, 176, 200], [80, 138, 184], (depth - 6) / 6);
    return mix([80, 138, 184], [58, 104, 158], (depth - 12) / 18);
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const e = hAt(x, y);
      let col: number[];
      if (e <= 0) col = seaCol(-e);
      else {
        // land: sand at the shore, then scrub, then the hills; lit from the upper left
        const base = e < 1.6 ? [230, 211, 160] : e < 40 ? mix([196, 196, 136], [170, 170, 112], (e - 1.6) / 38) : mix([170, 170, 112], [150, 136, 110], (e - 40) / 120);
        const dx = hAt(x + 1, y) - e;
        const dy = hAt(x, y + 1) - e;
        const shade = Math.max(0.72, Math.min(1.18, 1 - (dx + dy) * 0.9 / Math.max(sx, 0.5)));
        col = base.map((v) => v * shade);
      }
      // the paper shows through a little everywhere
      col = mix(col, paper, 0.22);
      // contours: the coast in ink; the 6 m (drop-off) and 12 m lines in blue
      const r = hAt(x + 1, y);
      const b = hAt(x, y + 1);
      const crosses = (lvl: number): boolean => (e - lvl) * (r - lvl) <= 0 || (e - lvl) * (b - lvl) <= 0;
      if (crosses(0)) col = [60, 46, 30];
      else if (crosses(-6) && Math.floor((x + y) / 5) % 2 === 0) col = [40, 70, 120];
      else if (crosses(-12)) col = mix(col, [40, 70, 120], 0.7);
      const i = (y * w + x) * 4;
      d[i] = col[0];
      d[i + 1] = col[1];
      d[i + 2] = col[2];
      d[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);

  // the reef: hatched inside its ring
  const L = src.layout;
  const [rx, ry] = toPx(L.reef.x, L.reef.z);
  const rr = L.reef.radius * sx;
  g.save();
  g.beginPath();
  g.arc(rx, ry, rr, 0, Math.PI * 2);
  g.clip();
  g.strokeStyle = 'rgba(190, 90, 70, 0.45)';
  g.lineWidth = 2;
  for (let k = -rr * 2; k < rr * 2; k += 9) {
    g.beginPath();
    g.moveTo(rx + k - rr, ry - rr);
    g.lineTo(rx + k + rr, ry + rr);
    g.stroke();
  }
  g.restore();
  g.strokeStyle = 'rgba(160, 70, 50, 0.8)';
  g.setLineDash([6, 5]);
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(rx, ry, rr, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);

  // the pier: the walk and its head
  const P = L.pier;
  g.fillStyle = '#6b4a2a';
  const [px0, pz0] = toPx(P.x - P.width / 2, P.zStart);
  const [px1, pz1] = toPx(P.x + P.width / 2, P.zEnd);
  g.fillRect(px0, pz0, Math.max(3, px1 - px0), pz1 - pz0);
  const [hx0, hz0] = toPx(P.x - P.headWidth / 2, P.zEnd - P.headDepth);
  const [hx1, hz1] = toPx(P.x + P.headWidth / 2, P.zEnd);
  g.fillRect(hx0, hz0, hx1 - hx0, hz1 - hz0);

  // the buildings: little inked blocks
  g.fillStyle = 'rgba(60, 40, 24, 0.85)';
  for (const b of src.buildings) {
    const [bx, by] = toPx(b.x, b.z);
    g.save();
    g.translate(bx, by);
    g.rotate(-(b.yaw ?? 0));
    g.fillRect((-b.w / 2) * sx, (-b.d / 2) * sz, b.w * sx, b.d * sz);
    g.restore();
  }

  // numbered markers, nudged apart where places crowd together (with a leader back to the building)
  const markers: { n: number; x: number; y: number; bx: number; by: number }[] = [];
  KEY.forEach(([name], i) => {
    const b = src.buildings.find((k) => k.name === name);
    if (!b) return;
    const [bx, by] = toPx(b.x, b.z);
    markers.push({ n: i + 1, x: bx, y: by - 18, bx, by });
  });
  const R = 14;
  for (let it = 0; it < 60; it++)
    for (const a of markers)
      for (const b of markers) {
        if (a === b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dd = Math.hypot(dx, dy) || 0.01;
        if (dd < R * 2.3) {
          const push = (R * 2.3 - dd) / 2;
          a.x -= (dx / dd) * push;
          a.y -= (dy / dd) * push;
          b.x += (dx / dd) * push;
          b.y += (dy / dd) * push;
        }
      }
  for (const m of markers) {
    g.strokeStyle = 'rgba(46, 34, 20, 0.7)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(m.x, m.y);
    g.lineTo(m.bx, m.by);
    g.stroke();
    g.fillStyle = '#9a2a1a';
    g.beginPath();
    g.arc(m.x, m.y, R, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#f2e6cc';
    g.lineWidth = 2.5;
    g.stroke();
    g.fillStyle = '#fff6e0';
    g.font = `700 ${m.n > 9 ? 15 : 18}px 'Rajdhani', 'Arial Black', sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(m.n), m.x, m.y + 1);
  }

  // a neat ink border
  g.strokeStyle = INK;
  g.lineWidth = 4;
  g.strokeRect(2, 2, w - 4, h - 4);
  return { canvas: c, markers, toPx };
}
