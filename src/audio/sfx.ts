/**
 * Tiny WebAudio sound kit — ff2's synth SFX bus (`src/rave/audio/sfx.ts`),
 * cut down to what the island uses so far. Same signal chain, same levels:
 * synth one-shots → `_master` (0.28, the quiet mix bus) → a soft glue
 * compressor → `_sfxOut` (the user's SFX fader) → speakers. The teleport's
 * click is ff2's `uiClick`, note for note.
 *
 * The AudioContext can only start inside a user gesture, so we unlock it on
 * the first DOM interaction; after that, sounds triggered from the frame loop
 * play fine.
 */

type Ctx = AudioContext & { _master?: GainNode; _sfxOut?: GainNode };

let ctx: Ctx | null = null;

function getCtx(): Ctx | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC() as Ctx;
    const sfxOut = ctx.createGain();
    sfxOut.gain.value = 1;
    sfxOut.connect(ctx.destination);
    ctx._sfxOut = sfxOut;
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -24;
    glue.knee.value = 14;
    glue.ratio.value = 3;
    glue.attack.value = 0.004;
    glue.release.value = 0.18;
    glue.connect(sfxOut);
    const master = ctx.createGain();
    master.gain.value = 0.28;
    master.connect(glue);
    ctx._master = master;
  }
  return ctx;
}

function unlock(): void {
  const c = getCtx();
  if (c && c.state === 'suspended') void c.resume();
}

if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'click', 'keydown', 'touchstart']) {
    window.addEventListener(ev, unlock, { capture: true });
  }
}

/** The shared AudioContext (the sampled fishing sounds play through it too). */
export function audioContext(): AudioContext | null {
  return getCtx();
}

/** The user master SFX bus — sampled clips connect here instead of the raw
 *  destination so they ride the same fader as the synth mix. */
export function sfxOut(): GainNode | null {
  return getCtx()?._sfxOut ?? null;
}

/** Call from a user gesture (e.g. the Enter VR tap) to make sure audio is live. */
export function ensureAudio(): void {
  unlock();
}

function ready(): Ctx | null {
  const c = getCtx();
  if (!c) return null;
  if (c.state === 'suspended') void c.resume();
  return c.state === 'running' ? c : null;
}

interface ToneOpts {
  freq: number;
  to?: number; // glide target
  type?: OscillatorType;
  dur?: number;
  gain?: number;
  delay?: number;
}

function tone(o: ToneOpts): void {
  const c = ready();
  if (!c) return;
  const { freq, to, type = 'sine', dur = 0.12, gain = 0.2, delay = 0 } = o;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c._master!);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

/** Bandpass-filtered noise burst — the basis of every whoosh. */
function whooshNoise(dur: number, gain: number, fromHz: number, toHz: number, delay = 0): void {
  const c = ready();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const frames = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    const p = i / frames;
    data[i] = (Math.random() * 2 - 1) * (p < 0.12 ? p / 0.12 : 1) * (1 - p) ** 0.8;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(fromHz, t0);
  bp.frequency.exponentialRampToValueAtTime(toHz, t0 + dur * 0.6);
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(bp).connect(g).connect(c._master!);
  src.start(t0);
}

/**
 * Struck plate steel: an inharmonic partial stack (plate-bell ratios, each
 * slightly detuned) over a sharp noise tick. `base` sets the pitch of the
 * plate, `dur` how long it rings.
 */
function clank(base: number, gain = 0.2, dur = 0.3, delay = 0): void {
  const c = ready();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const ratios = [1, 1.51, 2.27, 3.43, 4.83];
  ratios.forEach((ratio, i) => {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = base * ratio * (1 + (Math.random() - 0.5) * 0.015);
    const env = c.createGain();
    const g = gain * (1 / (i + 1));
    const d = dur * (1 - i * 0.12);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(g, t0 + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.04, d));
    osc.connect(env).connect(c._master!);
    osc.start(t0);
    osc.stop(t0 + d + 0.05);
  });
  // The impact tick that sells the strike.
  whooshNoise(0.03, gain * 0.7, base * 4, base * 2, delay);
}

/** UI / teleport: a light relay snap. */
export function uiClick(): void {
  clank(1500, 0.05, 0.04);
  tone({ freq: 110, type: 'sine', dur: 0.04, gain: 0.08 });
}

/**
 * The catch: a bright rising chime over a low thump, in the kit's struck-steel voice — longer
 * and higher when it's a new species or a record.
 */
export function catchSting(special = false): void {
  const notes = special ? [523, 659, 784, 1047] : [587, 784, 988];
  notes.forEach((f, i) => {
    tone({ freq: f, type: 'sine', dur: special ? 0.7 : 0.5, gain: 0.16, delay: i * 0.085 });
    tone({ freq: f * 2, type: 'triangle', dur: 0.25, gain: 0.04, delay: i * 0.085 });
  });
  tone({ freq: 90, to: 55, type: 'sine', dur: 0.3, gain: 0.3 });
  if (special) clank(2200, 0.05, 0.6, notes.length * 0.085);
}

/** A refusal: a short low double knock (the fish won't go there). */
export function uiDeny(): void {
  tone({ freq: 150, to: 110, type: 'triangle', dur: 0.08, gain: 0.12 });
  tone({ freq: 130, to: 95, type: 'triangle', dur: 0.1, gain: 0.12, delay: 0.09 });
}

/**
 * Two fish fusing: a bright arpeggio that climbs with the new tier, and climbs again for each
 * link of a chain merge — plus a plate-steel ring on the way up.
 */
export function mergeChime(tier: number, chain = 1): void {
  const root = 440 * Math.pow(2, (tier * 4 + (chain - 1) * 2) / 12);
  const steps = [0, 4, 7, 12, tier >= 2 ? 16 : 12];
  steps.forEach((st, i) => {
    const f = root * Math.pow(2, st / 12);
    tone({ freq: f, type: 'sine', dur: 0.45, gain: 0.13, delay: i * 0.055 });
    tone({ freq: f * 2, type: 'triangle', dur: 0.2, gain: 0.035, delay: i * 0.055 });
  });
  clank(1800 + tier * 400, 0.06, 0.5, steps.length * 0.055);
  tone({ freq: 70, to: 45, type: 'sine', dur: 0.35, gain: 0.3 });
}
