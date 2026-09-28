/**
 * make-icons — the site's icons, rendered from public/favicon.svg (the chip-and-sailfish mark):
 *
 *   favicon.ico            16, 32 and 48 px, for browsers that don't take an SVG icon
 *   apple-touch-icon.png   180 px, the chip on the splash's night sea (iOS wants it opaque)
 *   icon-192.png           the same tile, for the web app manifest
 *   icon-512.png           and larger; the chip sits well inside the maskable safe zone
 *
 * Rasterised by headless Chrome, so each size is the vector drawn at that size rather than a
 * shrunk big one. The outputs are committed; run this again only after editing the SVG.
 *
 * Usage: node tools/make-icons.mjs   (CHROME=/path/to/chrome to pick the browser)
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = resolve(ROOT, 'public');
const CHROME = process.env.CHROME ?? '/opt/pw-browsers/chromium';

const svg = readFileSync(resolve(PUB, 'favicon.svg'), 'utf8');
const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

// name → [size, on the sea tile?]
const OUT = {
  'ico-16': [16, false],
  'ico-32': [32, false],
  'ico-48': [48, false],
  'apple-touch-icon.png': [180, true],
  'icon-192.png': [192, true],
  'icon-512.png': [512, true],
};

// The page draws every size onto a canvas and leaves the PNGs in the DOM for --dump-dom.
const page = `<!doctype html><body><script>
const OUT = ${JSON.stringify(OUT)};
const img = new Image();
img.onload = () => {
  const pre = document.createElement('pre');
  pre.id = 'out';
  const got = {};
  for (const [name, [s, tile]] of Object.entries(OUT)) {
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    if (tile) {
      // the splash's night sea (index.html #landing), a red glow where the chip sits
      const sea = g.createLinearGradient(0, 0, 0, s);
      sea.addColorStop(0, '#02070c');
      sea.addColorStop(0.58, '#06202c');
      sea.addColorStop(1, '#0a3040');
      g.fillStyle = sea;
      g.fillRect(0, 0, s, s);
      for (const [x, y, r, rgb, a] of [[0.5, 0.42, 0.6, '63, 214, 198', 0.22], [0.5, 1.1, 0.55, '255, 176, 0', 0.18], [0.5, 0.52, 0.42, '200, 36, 58', 0.35]]) {
        const glow = g.createRadialGradient(x * s, y * s, 0, x * s, y * s, r * s);
        glow.addColorStop(0, 'rgba(' + rgb + ', ' + a + ')');
        glow.addColorStop(1, 'rgba(' + rgb + ', 0)');
        g.fillStyle = glow;
        g.fillRect(0, 0, s, s);
      }
      const d = s * 0.68;
      g.drawImage(img, (s - d) / 2, (s - d) / 2, d, d);
    } else g.drawImage(img, 0, 0, s, s);
    got[name] = c.toDataURL('image/png').split(',')[1];
  }
  pre.textContent = JSON.stringify(got);
  document.body.appendChild(pre);
};
img.src = ${JSON.stringify(src)};
</script></body>`;

const dir = mkdtempSync(join(tmpdir(), 'icons-'));
let dom;
try {
  const html = join(dir, 'icons.html');
  writeFileSync(html, page);
  dom = execFileSync(CHROME, ['--headless', '--no-sandbox', '--disable-gpu', '--virtual-time-budget=5000', '--dump-dom', `file://${html}`], {
    encoding: 'utf8',
    maxBuffer: 64 << 20,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
const m = dom.match(/<pre id="out">([^<]*)<\/pre>/);
if (!m) throw new Error('Chrome did not render the icons');
const png = Object.fromEntries(Object.entries(JSON.parse(m[1])).map(([k, v]) => [k, Buffer.from(v, 'base64')]));

for (const name of Object.keys(OUT)) {
  if (name.startsWith('ico-')) continue;
  writeFileSync(resolve(PUB, name), png[name]);
  console.log(`public/${name}  ${png[name].length} B`);
}

// An .ico holding PNGs: a 6-byte header, a 16-byte entry per image, then the images.
const icons = ['ico-16', 'ico-32', 'ico-48'].map((k) => [OUT[k][0], png[k]]);
const head = Buffer.alloc(6 + 16 * icons.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2); // icon
head.writeUInt16LE(icons.length, 4);
let at = head.length;
icons.forEach(([s, data], i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(s, e); // width
  head.writeUInt8(s, e + 1); // height
  head.writeUInt8(0, e + 2); // no palette
  head.writeUInt8(0, e + 3);
  head.writeUInt16LE(1, e + 4); // planes
  head.writeUInt16LE(32, e + 6); // bits per pixel
  head.writeUInt32LE(data.length, e + 8);
  head.writeUInt32LE(at, e + 12);
  at += data.length;
});
const ico = Buffer.concat([head, ...icons.map(([, d]) => d)]);
writeFileSync(resolve(PUB, 'favicon.ico'), ico);
console.log(`public/favicon.ico  ${ico.length} B`);
