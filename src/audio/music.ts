/**
 * The island's music: songs off FIRE FIGHT 2's jukebox, played the way ff2 plays its jukebox
 * (src/audio/musicTrack.ts there):
 *
 *  - through the shared AudioContext, never an <audio> element — on Quest an audible media
 *    element wakes Android's media session, which can take Meta Browser down with it;
 *  - decoded lo-fi, 24 kHz mono, so a whole song is a few MB of PCM rather than ~100;
 *  - the silent head of the file skipped, so a loop doesn't open on a gap.
 *
 * Two players:
 *  - OUTSIDE, the rotation: the songs in ./songs, in filename order, one after another, round
 *    and round. The next song decodes in the background while this one plays (a little after it
 *    starts), and is scheduled to start on the sample this one ends: no gap, and no decode at
 *    the change. (Decoding at the change, then folding and measuring ~6 M samples in one go,
 *    stalled the frame on the headset every time the song changed.)
 *  - IN THE CASINOS, their own song (./casino), on a loop. Inside one you hear only that. Walking
 *    up to a casino, it spills out of the open door, muffled by the walls and placed at the door,
 *    and the rotation dips under it.
 *
 * The backpack's MUSIC button mutes both (the sea and the game's sounds carry on). The choice
 * is kept in this browser.
 */

import { introDone } from '../experience/introGate.ts';
import { Vector3 } from 'three';
import type { Interior } from '../village/interiors.ts';
import { audioContext, sfxOut } from './sfx.ts';

const byName = (files: Record<string, string>): string[] =>
  Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, url]) => url);
const ROTATION = byName(import.meta.glob('./songs/*.{mp3,m4a}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>);
const CASINO = byName(import.meta.glob('./casino/*.{mp3,m4a}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>)[0];

/** ff2's jukebox decode rate */
const LOFI_RATE = 24000;
/**
 * Every song is levelled to the same loudness as it's decoded (NORM, RMS dBFS: the jukebox's
 * masters sit 7 dB apart), then:
 *  - the rotation outdoors ~8 dB over a wash breaking 5 m away, ~14 dB over the distant surf
 *    (shore.ts levels, measured) and under a close splash;
 *  - the casino song a little fuller inside, and out of the door at the door (the panner then
 *    falls it off).
 */
const NORM = -20;
const OUTDOOR = dB(-4);
const INSIDE = dB(-2);
const DOOR = dB(0);
/** how far from a casino door you start hearing it (and the rotation dips) */
const SPILL = 16;

const MUTE_KEY = 'gamblefish.music.muted';

/** The mute switch (the backpack's MUSIC button). */
export const musicView = {
  muted: readMuted(),
  toggle(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      /* no storage: it just won't be remembered */
    }
    return this.muted;
  },
};

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

interface Loaded {
  buffer: AudioBuffer;
  head: number;
  /** gain that levels it to NORM */
  level: number;
}

function dB(x: number): number {
  return Math.pow(10, x / 20);
}

/**
 * The per-sample work (folding to mono, measuring loudness) is a few million samples a song:
 * done in slices, handing the frame back between them, so it never holds up a frame.
 */
const SLICE = 200_000;
const yieldFrame = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** RMS of the whole song (dBFS) → the gain to NORM (never more than +12 dB). */
async function levelOf(buffer: AudioBuffer): Promise<number> {
  const d = buffer.getChannelData(0);
  let sum = 0;
  for (let i0 = 0; i0 < d.length; i0 += SLICE) {
    const end = Math.min(d.length, i0 + SLICE);
    for (let i = i0; i < end; i += 4) sum += d[i] * d[i];
    await yieldFrame();
  }
  const rms = Math.sqrt(sum / Math.max(1, Math.ceil(d.length / 4)));
  return rms > 0 ? Math.min(dB(12), dB(NORM) / rms) : 1;
}

async function decode(url: string): Promise<Loaded | null> {
  try {
    const bytes = await (await fetch(url)).arrayBuffer();
    const src = await new OfflineAudioContext(1, 1, LOFI_RATE).decodeAudioData(bytes);
    // fold to mono
    let buffer = src;
    if (src.numberOfChannels > 1) {
      buffer = new AudioBuffer({ length: src.length, sampleRate: src.sampleRate, numberOfChannels: 1 });
      const sum = buffer.getChannelData(0);
      const n = src.numberOfChannels;
      for (let c = 0; c < n; c++) {
        const d = src.getChannelData(c);
        for (let i0 = 0; i0 < sum.length; i0 += SLICE) {
          const end = Math.min(sum.length, i0 + SLICE);
          for (let i = i0; i < end; i++) sum[i] += d[i] / n;
          await yieldFrame();
        }
      }
    }
    return { buffer, head: audibleFrom(buffer), level: await levelOf(buffer) };
  } catch {
    return null; // a song that won't load is just silence
  }
}

/** Where the music starts: the first 50 ms window over ~−50 dBFS (ff2's firstAudibleSecond). */
function audibleFrom(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0);
  const win = Math.max(1, Math.floor(buffer.sampleRate * 0.05));
  for (let s = 0; s < data.length; s += win) {
    const end = Math.min(s + win, data.length);
    let sum = 0;
    for (let i = s; i < end; i++) sum += data[i] * data[i];
    if (Math.sqrt(sum / (end - s)) > 0.003) return Math.max(0, s / buffer.sampleRate - 0.05);
  }
  return 0;
}

export class Music {
  private readonly doors: Vector3[];
  private started = false;
  /** which song of the rotation is on (the dev hook reads it) */
  song = 0;
  private master: GainNode | null = null;
  private rotation: GainNode | null = null;
  private inGain: GainNode | null = null;
  private outGain: GainNode | null = null;
  private muffle: BiquadFilterNode | null = null;
  private panner: PannerNode | null = null;
  private readonly head = new Vector3();

  constructor(private readonly casinos: Interior[]) {
    this.doors = casinos.map((i) => i.toWorld(i.frame.doorX, 1.3, i.frame.d / 2 + 0.2));
  }

  /** Once a frame, with the camera (the player's head). */
  update(camera: { getWorldPosition(v: Vector3): Vector3 }): void {
    const ctx = audioContext();
    const out = sfxOut();
    if (!ctx || !out) return;
    // wait for the Enter VR tap to have started the audio
    if (!this.started) {
      if (ctx.state !== 'running') return;
      this.started = true;
      this.build(ctx, out);
      // one decode at a time: the rotation's first song, then the casinos'
      void this.playRotation(ctx, 0).then(() => this.playCasino(ctx));
    }
    const t = ctx.currentTime;
    this.master!.gain.setTargetAtTime(musicView.muted ? 0 : 1, t, 0.12);

    const p = camera.getWorldPosition(this.head);
    const inside = this.casinos.some((i) => i.inside(p.x, p.z));
    let door: Vector3 | null = null;
    let d = Infinity;
    for (const q of this.doors) {
      const k = q.distanceTo(p);
      if (k < d) {
        d = k;
        door = q;
      }
    }
    // 0 far from every casino .. 1 in its doorway
    const near = inside ? 1 : Math.max(0, Math.min(1, 1 - d / SPILL)) ** 1.5;
    this.rotation!.gain.setTargetAtTime(inside ? 0 : OUTDOOR * (1 - 0.85 * near), t, 0.3);
    this.inGain!.gain.setTargetAtTime(inside ? INSIDE : 0, t, 0.15);
    this.outGain!.gain.setTargetAtTime(inside ? 0 : DOOR * near, t, 0.15);
    // through the walls it's all bass; standing in the doorway you hear the room
    this.muffle!.frequency.setTargetAtTime(650 + 3400 * Math.max(0, 1 - d / 7) ** 2, t, 0.15);
    if (door) {
      this.panner!.positionX.setTargetAtTime(door.x, t, 0.05);
      this.panner!.positionY.setTargetAtTime(door.y, t, 0.05);
      this.panner!.positionZ.setTargetAtTime(door.z, t, 0.05);
    }
  }

  /**
   * rotation → master
   * casino song → (inside: straight in) + (outside: walls' low-pass → the door, in 3-D) → master
   * master (the mute) → SFX bus
   */
  private build(ctx: AudioContext, out: AudioNode): void {
    const gain = (to: AudioNode, v = 0): GainNode => {
      const g = ctx.createGain();
      g.gain.value = v;
      g.connect(to);
      return g;
    };
    this.master = gain(out, musicView.muted ? 0 : 1);
    this.rotation = gain(this.master);
    this.inGain = gain(this.master);
    this.outGain = gain(this.master);
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 650;
    this.muffle.Q.value = 0.5;
    this.panner = ctx.createPanner();
    this.panner.panningModel = 'HRTF';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = 3;
    this.panner.rolloffFactor = 1.1;
    this.muffle.connect(this.panner).connect(this.outGain);
  }

  /**
   * The rotation: this song, and while it plays the next one decoding, scheduled to follow it
   * on the sample it ends; round and round.
   */
  private async playRotation(ctx: AudioContext, i: number, at = 0, ready: Loaded | null = null): Promise<void> {
    if (!ROTATION.length) return;
    const loaded = ready ?? (await decode(ROTATION[i]));
    const next = (i + 1) % ROTATION.length;
    if (!loaded) {
      // skip a song that won't decode (don't spin if none will)
      if (next !== 0) void this.playRotation(ctx, next, at);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = loaded.buffer;
    const lv = ctx.createGain();
    lv.gain.value = loaded.level;
    src.connect(lv).connect(this.rotation!);
    // the first song decodes behind the boot intro's curtain and starts as it drops
    if (!at) await introDone();
    const start = Math.max(at, ctx.currentTime);
    src.start(start, loaded.head);
    // (the dev hook reads which song is on)
    window.setTimeout(() => (this.song = i), Math.max(0, (start - ctx.currentTime) * 1000));
    if (ROTATION.length === 1) {
      src.loop = true;
      src.loopStart = loaded.head;
      src.loopEnd = loaded.buffer.duration;
      return;
    }
    // the old buffer goes with its source, once it's played
    src.onended = () => src.disconnect();
    const ends = start + loaded.buffer.duration - loaded.head;
    // decode the next a little after this one's under way (not on top of whatever started it)
    await new Promise((r) => setTimeout(r, Math.min(20, Math.max(0, (ends - ctx.currentTime) / 2)) * 1000));
    const after = await decode(ROTATION[next]);
    void this.playRotation(ctx, next, ends, after);
  }

  private async playCasino(ctx: AudioContext): Promise<void> {
    if (!CASINO) return;
    const loaded = await decode(CASINO);
    if (!loaded) return;
    const src = ctx.createBufferSource();
    src.buffer = loaded.buffer;
    src.loop = true;
    src.loopStart = loaded.head;
    src.loopEnd = loaded.buffer.duration;
    const lv = ctx.createGain();
    lv.gain.value = loaded.level;
    await introDone();
    src.connect(lv);
    lv.connect(this.inGain!);
    lv.connect(this.muffle!);
    src.start(0, loaded.head);
  }
}
