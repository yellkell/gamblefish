/**
 * The casinos' music: songs off FIRE FIGHT 2's pub jukebox (ff2 src/pub/songs), played the way
 * ff2 plays its jukebox (src/audio/musicTrack.ts there):
 *
 *  - through the shared AudioContext, never an <audio> element — on Quest an audible media
 *    element wakes Android's media session, which can take Meta Browser down with it;
 *  - decoded lo-fi, 24 kHz mono, so a whole song is a few MB of PCM rather than ~100;
 *  - the silent head of the file skipped, so the loop doesn't open on a gap.
 *
 * The song plays IN the casinos. Inside one you hear it full; outside, it comes out of the
 * nearest casino's open door, muffled by the walls and fading with distance, so the Lucky Lure
 * is faintly there from the boardwalk and louder as you walk up to it.
 *
 * Songs are the files in ./songs, in filename order (drop in more `.mp3` / `.m4a` and they join
 * the rotation); one song just loops.
 */

import { Vector3 } from 'three';
import type { Interior } from '../village/interiors.ts';
import { audioContext, sfxOut } from './sfx.ts';

const SONGS = Object.entries(
  import.meta.glob('./songs/*.{mp3,m4a}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>,
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url);

/** ff2's jukebox decode rate */
const LOFI_RATE = 24000;
/** level in a casino, and out of the door at the door (the panner then falls it off) */
const INSIDE = 0.2;
const OUTSIDE = 0.34;
/** past this far from every casino door it's silent */
const REACH = 60;

interface Loaded {
  buffer: AudioBuffer;
  head: number;
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
      for (let c = 0; c < src.numberOfChannels; c++) {
        const d = src.getChannelData(c);
        for (let i = 0; i < sum.length; i++) sum[i] += d[i] / src.numberOfChannels;
      }
    }
    return { buffer, head: audibleFrom(buffer) };
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

export class CasinoMusic {
  private readonly doors: Vector3[];
  private started = false;
  private song = 0;
  private source: AudioBufferSourceNode | null = null;
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
    if (!ctx || !out || !SONGS.length || !this.casinos.length) return;
    // wait for the Enter VR tap to have started the audio, then load the first song
    if (!this.started) {
      if (ctx.state !== 'running') return;
      this.started = true;
      this.build(ctx, out);
      void this.play(ctx, 0);
    }
    const p = camera.getWorldPosition(this.head);
    const inside = this.casinos.some((i) => i.inside(p.x, p.z));
    let door = this.doors[0];
    let d = Infinity;
    for (const q of this.doors) {
      const k = q.distanceTo(p);
      if (k < d) {
        d = k;
        door = q;
      }
    }
    const t = ctx.currentTime;
    const fade = Math.max(0, Math.min(1, (REACH - d) / (REACH * 0.4)));
    this.inGain!.gain.setTargetAtTime(inside ? INSIDE : 0, t, 0.15);
    this.outGain!.gain.setTargetAtTime(inside ? 0 : OUTSIDE * fade, t, 0.15);
    // through the walls it's all bass; standing in the doorway you hear the room
    this.muffle!.frequency.setTargetAtTime(650 + 3400 * Math.max(0, 1 - d / 7) ** 2, t, 0.15);
    this.panner!.positionX.setTargetAtTime(door.x, t, 0.05);
    this.panner!.positionY.setTargetAtTime(door.y, t, 0.05);
    this.panner!.positionZ.setTargetAtTime(door.z, t, 0.05);
  }

  /** source → (inside: straight in) + (outside: walls' low-pass → the door, placed in 3-D) → SFX bus */
  private build(ctx: AudioContext, out: AudioNode): void {
    this.inGain = ctx.createGain();
    this.inGain.gain.value = 0;
    this.inGain.connect(out);
    this.outGain = ctx.createGain();
    this.outGain.gain.value = 0;
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 650;
    this.muffle.Q.value = 0.5;
    this.panner = ctx.createPanner();
    this.panner.panningModel = 'HRTF';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = 3;
    this.panner.rolloffFactor = 1.1;
    this.muffle.connect(this.panner).connect(this.outGain).connect(out);
  }

  private async play(ctx: AudioContext, i: number): Promise<void> {
    this.song = i;
    const loaded = await decode(SONGS[i]);
    if (!loaded || this.song !== i) return;
    const src = ctx.createBufferSource();
    src.buffer = loaded.buffer;
    src.connect(this.inGain!);
    src.connect(this.muffle!);
    if (SONGS.length === 1) {
      src.loop = true;
      src.loopStart = loaded.head;
      src.loopEnd = loaded.buffer.duration;
    } else {
      // the next song decodes when this one ends; the old buffer goes with its source
      src.onended = () => void this.play(ctx, (i + 1) % SONGS.length);
    }
    src.start(0, loaded.head);
    this.source?.disconnect();
    this.source = src;
  }
}
