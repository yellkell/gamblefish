/**
 * The fish's skin: Tidewater's fish material (vendor/tidewater/src/world/fish/FishMaterial.js,
 * WGSL) ported to GLSL as a hook into three's MeshStandardMaterial, so the fish in your hands,
 * on the catch card and in the field guide are painted the way Tidewater paints its reef.
 *
 * Everything is procedural, from the anatomy the bake stores per vertex (aData: u from snout to
 * tail, the part, the across / height coordinates) and per species (eight rows of colours and
 * landmarks: eye, gill cover, lateral line, jaw):
 *  - counter-shading from the dark back to the pale belly;
 *  - overlapping scales in offset rows, in colour and relief, fading out when smaller than a pixel;
 *  - the lateral line, the edge of the gill cover, the lips, the nostril;
 *  - fins as ray-striped membranes, darker and thinner toward the edge, lit through;
 *  - eyes with a pupil, a streaked iris and a glossy cornea;
 *  - silvery guanine reflection (metalness, off the environment map) with an iridescent sheen at
 *    grazing angles;
 *  - each species' markings: the grunt's stripes, the grouper's bars, the mahi's spots, ...
 *
 * Added here: pattern 21, the great white shark (fishing/shark.ts): slate back with a ragged
 * edge onto a white belly, five gill slits, black-tipped pectorals, a black eye, no scales.
 *
 * Not carried over: the props' drying / wet / blood flags, the rays' and turtle's parts (none
 * of those are caught), motion vectors.
 */

export const SHARK_PATTERN = 21;

/** GLSL: the helpers (Tidewater's fishHash, fishVnoise, fishBand, fishOpercle*, fishEyeCol). */
export const FISH_SKIN_PARS = /* glsl */ `
uniform vec4 uRows[8];
uniform float uPattern;
uniform float uSeed;
varying vec4 vFishData;
varying vec3 vFishLocal;
varying float vFishL;

float fishHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fishVnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 w = f * f * (3.0 - f * 2.0);
  float a = fishHash(i); float b = fishHash(i + vec2(1.0, 0.0)); float c = fishHash(i + vec2(0.0, 1.0)); float d = fishHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}
float fishOpercleEdge(float zOp, float h) { return zOp - 0.028 * (1.0 - h * h) + smoothstep(-0.35, -1.0, h) * 0.07; }
float fishOpercleMask(float h) { return smoothstep(-0.98, -0.9, h) * (1.0 - smoothstep(0.45, 0.62, h)); }
float fishBand(float x, float center, float width, float soft) { return 1.0 - smoothstep(width, width + soft, abs(x - center)); }
vec3 fishEyeCol(float r, float ang, vec3 irisC) {
  float streak = sin(ang * 26.0) * 0.5 + 0.5;
  float irisL = dot(irisC, vec3(0.3, 0.59, 0.11));
  vec3 iris = irisC * min(1.0, 0.36 / max(irisL, 1e-3)) * mix(0.6, 1.05, streak) * (smoothstep(0.55, 0.72, r) * 0.45 + 0.5);
  float ring = smoothstep(0.8, 0.97, r);
  vec3 e = mix(iris, vec3(0.025, 0.025, 0.028), ring);
  return mix(e, vec3(0.004, 0.005, 0.007), 1.0 - smoothstep(0.5, 0.56, r));
}
`;

/** GLSL: the surface, run after three's normal is known; sets diffuse, roughness, metalness,
 *  normal and adds the fins' translucency to the emissive. `P` is the PART table. */
export function fishSkinSurface(P: Record<string, number>): string {
  const pa = (k: string): string => `${P[k].toFixed(1)}`;
  return /* glsl */ `
{
  vec4 D = vFishData; vec3 Lp = vFishLocal;
  float L = vFishL;
  float pat = floor(uPattern + 0.5);
  float part = floor(D.y + 0.01);
  vec4 r0 = uRows[0]; vec4 r1 = uRows[1]; vec4 r2 = uRows[2]; vec4 r3 = uRows[3];
  vec4 r4 = uRows[4]; vec4 r5 = uRows[5]; vec4 eye = uRows[6]; vec4 lat = uRows[7];
  float scaleSize = r4.w; float scaleVis = r5.w;
  bool shark = pat == ${SHARK_PATTERN}.0;

  // ---- scale rows: posterior margins are arcs, rows offset by half a scale
  float ss = max(scaleSize, 0.004);
  float warp = (sin(Lp.z * 23.0 + D.z * 31.0) * 0.35 + sin(Lp.z * 41.0 - D.z * 17.0) * 0.25) * mix(1.0, 0.3, smoothstep(0.015, 0.045, scaleSize));
  float sa = (0.5 - Lp.z) / ss + warp; float sb = D.z / (ss * 0.8) + warp * 0.6;
  float rowI = floor(sb);
  float fb = fract(sb) * 2.0 - 1.0;
  float sf = fract(sa + rowI * 0.5 + fb * fb * 0.32);
  float px = length(fwidth(vViewPosition));
  float sfade = (1.0 - smoothstep(0.25, 0.7, px / (ss * L))) * (scaleSize > 0.001 ? 1.0 : 0.0);

  bool isBody = part == ${pa('BODY')};
  bool isFin = part > 0.5 && part < 7.5;
  float bodyK = isBody ? 1.0 : 0.0;
  float u = D.x; float h = D.w; float sd = D.z;
  float z = Lp.z; float y = Lp.y;
  float t = D.z; float w = D.w;

  // ---- relief (m): scales rise toward their free margin, the gill cover stands proud, grain
  float zE = fishOpercleEdge(eye.w, h);
  float onOpR = fishOpercleMask(h) * (shark ? 0.0 : 1.0);
  float sc = smoothstep(0.0, 0.9, sf) * (1.0 - smoothstep(0.9, 1.0, sf)) * sfade * scaleVis;
  float op = smoothstep(-0.004, 0.004, Lp.z - zE) * onOpR;
  float grainFade = 1.0 - smoothstep(0.3, 0.8, px / (0.004 * L));
  float grain = (fishVnoise(vec2(Lp.z, D.z) * 420.0) - 0.5) * 0.00022 * grainFade;
  float rd0 = abs(fract(D.w + 0.5) - 0.5);
  float rayH = (1.0 - smoothstep(0.0, 0.25, rd0)) * 0.0004;
  float bumpH = (isBody ? sc * 0.0016 + op * 0.0025 + grain : isFin && !shark ? rayH : 0.0) * L;

  float rough = 0.4; float metal = 0.0; float transl = 0.0;
  vec3 back = r0.xyz; vec3 flank = r1.xyz; vec3 belly = r2.xyz;
  vec3 finC = r3.xyz; vec3 edgeC = r4.xyz; vec3 irisC = r5.xyz;
  float seed = uSeed;
  float n1 = fishVnoise(vec2(z, y) * 38.0 + seed * 17.0);
  float n2 = fishVnoise(vec2(z, sd) * 11.0 + seed * 5.0);
  float fwW = fwidth(w); float fwH = fwidth(h);

  // ---- counter-shading
  float tBack = smoothstep(0.2, 0.75, h);
  float tBelly = 1.0 - smoothstep(-0.7, -0.1, h);
  vec3 c = mix(mix(flank, back, tBack), belly, tBelly);
  float silver = 1.0 - tBack * 0.75;
  metal = r0.w * silver * bodyK;
  rough = r2.w;
  float scaleShade = smoothstep(0.3, 0.9, sf) * sfade * scaleVis;
  float pocket = smoothstep(0.88, 0.97, sf) * (1.0 - smoothstep(0.97, 1.0, sf)) * sfade * scaleVis;
  float cellK = (fishHash(vec2(floor(sa + floor(sb) * 0.5), floor(sb))) - 0.5) * 0.1 * sfade * scaleVis;
  c *= mix(1.0, 0.96 + scaleShade * 0.07 - pocket * mix(0.14, 0.06, r0.w) + cellK, bodyK);
  c *= mix(1.0, n1 * 0.14 + 0.93, bodyK);
  c *= mix(1.0, n2 * 0.2 + 0.9, bodyK);
  rough = mix(rough, rough * mix(0.8, 1.25, n2), bodyK);

  // ---- fins: ray-striped membranes, darker and thinner toward the edge
  if (isFin && part != ${pa('FINLET')}) {
    vec3 fin = mix(finC, edgeC, smoothstep(0.4, 1.0, t));
    float rd = abs(fract(w + 0.5) - 0.5);
    float rayW = part == ${pa('DORSAL1')} ? 0.1 : 0.06;
    float ray = (1.0 - smoothstep(rayW, fwW * 1.2 + rayW + 0.04, rd)) * (1.0 - smoothstep(0.2, 0.6, fwW));
    if (!shark) fin *= mix(0.9, 1.06, ray);
    fin *= smoothstep(0.0, 0.15, t) * 0.2 + 0.8;
    c = fin;
    transl = mix(0.8, 0.55, ray) * (smoothstep(0.0, 0.3, t) * 0.4 + 0.6);
    bool paired = part == ${pa('PECTORAL')} || part == ${pa('PELVIC')};
    c = paired ? c * mix(0.85, 1.1, smoothstep(0.2, 1.0, t)) : c;
    transl *= paired ? 0.45 : 1.0;
    rough = 0.4;
    if (shark) transl *= 0.2;
  }

  // ---- species markings
  if (pat == 0.0) { // silverside: silver lateral band with a dark upper edge
    float bandK = fishBand(h, 0.02, 0.1, fwH + 0.05) * bodyK;
    c = mix(c, vec3(0.78, 0.82, 0.84), bandK * 0.8);
    c = mix(c, vec3(0.12, 0.2, 0.2), fishBand(h, 0.14, 0.015, fwH + 0.02) * bodyK * 0.6);
    metal += bandK * 0.25;
  } else if (pat == 1.0) { // chromis: dark tail-lobe margins, azure line through the eye
    float lobe = part == ${pa('CAUDAL')} ? smoothstep(5.5, 7.5, abs(w - 8.0)) : 0.0;
    c = mix(c, vec3(0.01, 0.015, 0.03), lobe);
    float lineK = fishBand(y - (z - eye.x) * 0.35, eye.y + 0.015, 0.004, 0.003) * smoothstep(eye.x - 0.02, eye.x + 0.05, z) * bodyK;
    c = mix(c, vec3(0.3, 0.6, 0.95), lineK * 0.7);
  } else if (pat == 2.0) { // grunt: oblique stripes (French) or straight blue ones
    bool blue = fract(seed * 3.7) < 0.4;
    float above = smoothstep(0.35, 0.45, h);
    float slope = blue ? 0.0 : mix(0.45, 0.0, above);
    float sv = sin((y - z * slope) * (blue ? 190.0 : 150.0));
    float stripe = smoothstep(0.45, 0.8, sv) * bodyK * (1.0 - tBelly * 0.7);
    vec3 lineC = blue ? vec3(0.12, 0.26, 0.55) : vec3(0.52, 0.6, 0.7);
    c = mix(c, lineC, stripe * (blue ? 0.9 : 0.7));
  } else if (pat == 3.0) { // yellowtail: yellow stripe into the yellow tail, spots on the back
    float wS = mix(0.006, 0.035, smoothstep(0.1, -0.25, z));
    float stripe = fishBand(y - 0.004, 0.0, wS, 0.004) * bodyK;
    vec2 qq = vec2(z, y) * 70.0;
    vec2 cell = floor(qq);
    vec2 j = (vec2(fishHash(cell + 3.1), fishHash(cell + 7.7)) - 0.5) * 0.5;
    float rr = fishHash(cell + 1.3) * 0.14 + 0.1;
    float spots = (1.0 - smoothstep(rr, rr + 0.12, length(fract(qq) - 0.5 - j))) * step(0.4, fishHash(cell + seed)) * tBack * bodyK;
    c = mix(c, vec3(0.85, 0.62, 0.05), max(stripe, spots * 0.8));
    c = mix(c, vec3(0.86, 0.66, 0.06), part == ${pa('CAUDAL')} ? 1.0 : 0.0);
  } else if (pat == 4.0) { // tang: fine wavy lines, pale scalpel
    float lines = smoothstep(0.75, 0.95, sin(y * 170.0 + z * 30.0 + n1 * 3.0)) * 0.3 * bodyK;
    c *= 1.0 - lines;
    float spine = (1.0 - smoothstep(0.01, 0.02, length(vec2(z + 0.27, y * 1.5)))) * bodyK;
    c = mix(c, vec3(0.85, 0.8, 0.55), spine);
    c = mix(c, edgeC, isFin ? smoothstep(0.8, 1.0, t) : 0.0);
  } else if (pat == 5.0) { // sergeant major: five black bars, a spot at the pectoral
    float barsP = smoothstep(0.45, 0.7, sin((z - 0.215) * 52.0 + 1.57)) * smoothstep(-0.29, -0.24, z) * (1.0 - smoothstep(0.225, 0.26, z));
    float sixth = fishBand(z, -0.33, 0.012, 0.01) * 0.4;
    float bars = max(barsP, sixth) * (1.0 - tBelly * 0.8);
    c = mix(c, vec3(0.02, 0.02, 0.03), bars * (isBody ? 0.92 : isFin ? 0.4 : 0.0));
    float pecSpot = (1.0 - smoothstep(0.012, 0.02, length(vec2(z - eye.w + 0.03, y + 0.005)))) * bodyK;
    c = mix(c, vec3(0.03, 0.035, 0.05), pecSpot * 0.8);
  } else if (pat == 6.0) { // bluehead wrasse
    bool male = fract(seed * 7.1) < 0.15;
    float stripe = fishBand(h, 0.05, 0.1, fwH + 0.04) * bodyK * smoothstep(0.25, 0.1, z);
    vec3 female = mix(c, vec3(0.04, 0.04, 0.03), stripe * 0.9);
    float head = smoothstep(0.12, 0.17, z);
    float collar = fishBand(z, 0.13, 0.012, 0.006);
    vec3 maleC = mix(mix(vec3(0.1, 0.42, 0.28), vec3(0.05, 0.14, 0.62), head), vec3(0.02), collar * bodyK);
    c = male ? maleC : female;
  } else if (pat == 7.0) { // stoplight / queen parrotfish
    bool queen = fract(seed * 4.3) < 0.4;
    vec3 base = queen ? vec3(0.06, 0.34, 0.42) : vec3(0.1, 0.42, 0.26);
    c = mix(c, base * mix(0.8, 1.1, scaleShade), bodyK * 0.75);
    float mark = fishBand(y - (z - 0.3) * 0.4, -0.03, 0.008, 0.008) * smoothstep(0.18, 0.35, z) * bodyK;
    c = mix(c, queen ? vec3(0.75, 0.42, 0.28) : vec3(0.85, 0.45, 0.32), mark);
    float spot = (1.0 - smoothstep(0.01, 0.02, length(vec2(z - eye.w - 0.02, y - 0.05)))) * bodyK;
    c = mix(c, vec3(0.88, 0.72, 0.12), spot * (queen ? 0.0 : 1.0));
  } else if (pat == 8.0) { // French angelfish: yellow scale rims, face and eye ring
    float rims = smoothstep(0.72, 0.95, sf) * max(sfade, 0.35) * bodyK;
    c = mix(c, vec3(0.62, 0.48, 0.06), rims * 0.6);
    float face = smoothstep(0.4, 0.43, z) * bodyK;
    c = mix(c, vec3(0.55, 0.45, 0.2), face * 0.6);
    float er0 = length(vec2(z - eye.x, y - eye.y)) / eye.z;
    float ringA = smoothstep(1.05, 1.2, er0) * (1.0 - smoothstep(1.45, 1.65, er0)) * bodyK;
    c = mix(c, vec3(0.7, 0.52, 0.06), ringA * 0.85);
  } else if (pat == 9.0) { // barracuda: oblique bars, black blotches, pale tail tips
    float bars = smoothstep(0.35, 0.8, sin(z * 58.0 + h * 1.5 + n1)) * smoothstep(0.2, 0.55, h) * bodyK;
    c *= 1.0 - bars * 0.45;
    float bl = smoothstep(0.6, 0.78, n2) * smoothstep(0.1, -0.25, z) * (1.0 - smoothstep(-0.3, 0.2, h)) * bodyK;
    c = mix(c, vec3(0.03, 0.03, 0.035), bl * 0.9);
    c = mix(c, vec3(0.75, 0.78, 0.8), part == ${pa('CAUDAL')} ? smoothstep(0.85, 1.0, t) * smoothstep(5.0, 7.0, abs(w - 8.0)) : 0.0);
  } else if (pat == 10.0) { // red snapper: fine oblique scale-row lines
    float rows = smoothstep(0.6, 0.95, sin(y * 210.0 + z * 120.0)) * max(sfade, 0.3) * bodyK * 0.15;
    c *= 1.0 - rows;
  } else if (pat == 11.0) { // Nassau grouper: bars, eye band, saddle, spots
    float zz = 0.5 - z;
    float wob = (n2 - 0.5) * 0.03;
    float bars = smoothstep(0.2, 0.6, sin((zz + wob) * 34.0 - 1.2)) * smoothstep(0.3, 0.38, zz) * smoothstep(0.86, 0.78, zz) * (1.0 - tBelly * 0.85);
    float stripe = fishBand(y - eye.y - (z - eye.x) * 0.25, 0.0, 0.008, 0.006) * smoothstep(eye.x - 0.08, eye.x, z) * smoothstep(0.5, 0.45, z);
    float saddle = smoothstep(0.4, 0.7, h) * fishBand(zz, 0.8, 0.025, 0.01);
    float spots = smoothstep(0.72, 0.85, fishVnoise(vec2(z, y) * 160.0 + seed * 3.0)) * smoothstep(eye.x - 0.12, eye.x, z);
    float dark = max(max(bars * 0.85, stripe * 0.85), max(saddle, spots * 0.7)) * bodyK;
    c = mix(c, vec3(0.13, 0.085, 0.05), dark);
    float pale = smoothstep(0.86, 0.93, fishVnoise(vec2(z, y) * 150.0 + 9.0)) * bodyK * 0.2;
    c = mix(c, vec3(0.85, 0.8, 0.72), pale);
  } else if (pat == 12.0) { // blackfin tuna: bronze band, pale belly bars, yellow finlets
    float bronze = fishBand(h, 0.28, 0.05, fwH + 0.06) * smoothstep(0.3, 0.2, z) * bodyK;
    c = mix(c, vec3(0.42, 0.34, 0.14), bronze * 0.6);
    c = mix(c, back, smoothstep(0.28, 0.4, h) * bodyK);
    float bars = smoothstep(0.6, 0.9, sin(z * 95.0)) * smoothstep(0.0, -0.3, h) * smoothstep(0.2, 0.1, z) * bodyK;
    c = mix(c, vec3(0.85, 0.88, 0.9), bars * 0.35);
    c = mix(c, vec3(0.55, 0.48, 0.16), part == ${pa('FINLET')} ? 0.85 : 0.0);
  } else if (pat == 13.0) { // mahi-mahi: blue spots on gold
    vec2 cell = floor(vec2(z, y) * 55.0);
    vec2 jit = vec2(fishHash(cell + 3.1), fishHash(cell + 7.7)) - 0.5;
    vec2 fc = fract(vec2(z, y) * 55.0) - 0.5 - jit * 0.55;
    float rs = mix(0.1, 0.24, fishHash(cell + 1.3));
    float spots = (1.0 - smoothstep(rs, rs + 0.1, length(fc * vec2(1.0, 1.25)))) * step(0.45, fishHash(cell + seed * 7.0)) * bodyK * (1.0 - tBelly);
    c = mix(c, vec3(0.08, 0.22, 0.5), spots * 0.75);
    c = mix(c, vec3(0.2, 0.5, 0.3), smoothstep(0.0, 0.5, h) * bodyK * 0.35);
  } else if (pat == 14.0) { // mullet: faint stripes along the scale rows
    float lines = smoothstep(0.7, 0.95, sin(sd * 280.0)) * smoothstep(-0.1, 0.3, h) * bodyK * 0.25;
    c *= 1.0 - lines;
  } else if (pat == 15.0) { // needlefish: blue lateral stripe, dark beak
    float stripe = fishBand(h, 0.0, 0.06, fwH + 0.05) * bodyK;
    c = mix(c, vec3(0.12, 0.25, 0.45), stripe * 0.6);
    c = mix(c, vec3(0.12, 0.16, 0.16), smoothstep(0.32, 0.36, z) * bodyK * 0.7);
  } else if (pat == 16.0) { // bar jack: black stripe along the dorsal base into the lower lobe
    float top = fishBand(h, 0.82, 0.06, fwH + 0.05) * smoothstep(0.2, 0.05, z) * bodyK;
    float blue = fishBand(h, 0.68, 0.05, fwH + 0.05) * smoothstep(0.2, 0.05, z) * bodyK;
    c = mix(c, vec3(0.15, 0.45, 0.9), blue * 0.5);
    c = mix(c, vec3(0.02, 0.03, 0.05), top * 0.85);
    float lobe = part == ${pa('CAUDAL')} ? smoothstep(7.5, 5.5, w) * smoothstep(0.1, 0.3, t) : 0.0;
    c = mix(c, vec3(0.02, 0.03, 0.05), lobe * 0.8);
  } else if (pat == 17.0) { // tarpon: huge scales with dark edges
    float rims = smoothstep(0.8, 0.97, sf) * sfade * bodyK;
    c *= 1.0 - rims * 0.35;
  } else if (shark) {
    // great white: a ragged line between the slate back and the white belly, low on the flank
    float edge = -0.12 + (fishVnoise(vec2(z * 26.0, seed)) - 0.5) * 0.16 + (fishVnoise(vec2(z * 70.0, 3.0 + seed)) - 0.5) * 0.05;
    float top = smoothstep(edge - 0.035, edge + 0.035, h);
    vec3 slate = mix(flank, back, smoothstep(0.1, 0.8, h)) * mix(0.9, 1.08, n1);
    c = mix(belly, slate, top);
    // five gill slits in front of the pectoral fin
    float gz = eye.w - 0.012;
    float slits = 0.0;
    for (int k = 0; k < 5; k++) {
      float zk = gz - float(k) * 0.017 - (0.4 - h) * 0.006;
      slits = max(slits, (1.0 - smoothstep(0.0012, 0.0028, abs(z - zk))) * smoothstep(-0.55, -0.35, h) * (1.0 - smoothstep(0.35, 0.55, h)));
    }
    c = mix(c, vec3(0.05, 0.05, 0.06), slits * bodyK * 0.9);
    // black tips under the pectorals, dark rims on the fins
    float tip = part == ${pa('PECTORAL')} ? smoothstep(0.7, 0.95, t) : 0.0;
    c = mix(c, vec3(0.02, 0.02, 0.025), tip);
    if (isFin && part != ${pa('PECTORAL')}) c = mix(slate, slate * 0.55, smoothstep(0.6, 1.0, t));
    // dermal denticles: a fine, sandpapery sheen rather than scales
    rough = mix(0.5, 0.62, n2);
    metal = 0.0;
  }

  // ---- lateral line
  float hl = lat.x + lat.y * (1.0 - smoothstep(0.12, 0.55, u));
  float lineK = fishBand(h, hl, fwH * 0.5 + 0.012, fwH + 0.008) * bodyK * smoothstep(0.18, 0.25, u) * smoothstep(0.9, 0.8, u);
  if (!shark) c *= 1.0 - lineK * 0.3;

  // ---- gill cover edge and the preopercle
  float dOp = z - zE;
  float onOp = onOpR * bodyK;
  float crease = (1.0 - smoothstep(0.0015, 0.004, abs(dOp))) * onOp;
  c *= 1.0 - crease * 0.45;
  float pre = (1.0 - smoothstep(0.001, 0.003, abs(dOp - 0.04))) * onOp * smoothstep(0.6, 0.2, h);
  c *= 1.0 - pre * 0.2;

  // ---- lips, the upper jaw bone, the nostril
  float hz = lat.z; float hy = lat.w; float tipY = r3.w;
  float mt = clamp((z - hz) / (0.5 - hz), 0.0, 1.0);
  float yLip = mix(hy, tipY, mt);
  float lips = (1.0 - smoothstep(0.0015, 0.0035, abs(y - yLip))) * step(hz - 0.004, z) * bodyK;
  c *= 1.0 - lips * 0.55;
  float maxZ = hz + 0.006 - (y - hy) * 0.35;
  float maxilla = (1.0 - smoothstep(0.001, 0.0025, abs(z - maxZ))) * smoothstep(hy - 0.002, hy + 0.002, y) * smoothstep(hy + 0.04, hy + 0.025, y) * bodyK;
  if (!shark) c *= 1.0 - maxilla * 0.3;
  float nostril = (1.0 - smoothstep(0.1, 0.2, length(vec2(z - eye.x - eye.z * 1.7, y - eye.y - eye.z * 0.25)) / eye.z)) * bodyK;
  c *= 1.0 - nostril * 0.6;

  // ---- the painted eye, and the eye dome
  float er = length(vec2(z - eye.x, y - eye.y)) / eye.z;
  float painted = (1.0 - smoothstep(0.95, 1.1, er)) * bodyK;
  vec3 eyeC = shark ? vec3(0.006, 0.006, 0.008) : fishEyeCol(er, atan(y - eye.y, z - eye.x), irisC);
  c = mix(c, eyeC, painted);
  metal *= 1.0 - painted;
  float gloss = 0.0;
  if (part == ${pa('EYE')}) {
    float r = length(vec2(t, w));
    c = shark ? vec3(0.006, 0.006, 0.008) : fishEyeCol(r, atan(w, t), irisC);
    c = mix(c, flank * 0.6, smoothstep(0.93, 1.0, r));
    rough = 0.04;
    metal = 0.0;
    gloss = 1.0;
  } else if (part == ${pa('MOUTH')}) {
    vec3 lip = pat == 2.0 ? vec3(0.6, 0.08, 0.06) : vec3(0.5, 0.3, 0.3);
    c = mix(lip, vec3(0.03, 0.012, 0.012), smoothstep(0.05, 0.85, t));
    metal = 0.0;
    rough = 0.35;
  }

  // ---- iridescent sheen on silvery skin at grazing angles
  float cosV = abs(dot(normal, normalize(vViewPosition)));
  float irid = r1.w * bodyK * silver * (1.0 - cosV);
  c = mix(c, c * mix(vec3(0.55, 0.95, 0.8), vec3(0.95, 0.6, 1.0), cosV) * 1.25, irid * 0.6);

  // ---- relief onto the normal (view space; the scales, the gill cover, the fin rays)
  vec3 sX = dFdx(-vViewPosition); vec3 sY = dFdy(-vViewPosition);
  vec3 R1 = cross(sY, normal); vec3 R2 = cross(normal, sX);
  float det = dot(sX, R1);
  vec3 grad = sign(det) * (dFdx(bumpH) * R1 + dFdy(bumpH) * R2);
  normal = normalize(abs(det) * normal - grad);

  diffuseColor.rgb = c;
  roughnessFactor = clamp(rough, 0.04, 1.0);
  metalnessFactor = clamp(metal, 0.0, 1.0);
  // fins lit through from behind: a little of their own colour, always
  totalEmissiveRadiance += c * transl * 0.12;
  // the wet eye catches every light
  totalEmissiveRadiance += vec3(0.02) * gloss;
}
`;
}
