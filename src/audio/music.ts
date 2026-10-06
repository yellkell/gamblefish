/**
 * The island's music, played the way FIRE FIGHT 2 plays its jukebox (src/audio/musicTrack.ts
 * there):
 *
 *  - through the shared AudioContext, never an <audio> element — on Quest an audible media
 *    element wakes Android's media session, which can take Meta Browser down with it;
 *  - decoded lo-fi, 24 kHz mono, so a whole song is a few MB of PCM rather than ~100;
 *  - the silent head and tail of the file skipped, so nothing opens or closes on a gap.
 *
 * Outside, three playlists (the music team's soundtrack board, public/soundtrack.html):
 *  - DAY (sunrise to sunset), wherever you are;
 *  - NIGHT, round the island after dark;
 *  - THE PIER AT NIGHT: standing out on the pier (or the walks off its head) after dark,
 *    line in the water or not.
 * Each is dealt a new order every day (and every night): the songs you didn't hear last time
 * first, then the rest, shuffled, never the same song twice running. The very first day of a
 * session opens on Tell Me Something.
 *
 * Seamless: one song runs into the next, the next coming in under the last seconds of this one
 * as it fades. When night falls or day breaks, or you step on or off the pier after dark, the
 * playlist changes: if this song is nearly over it's played out and the new one comes in under
 * its end; otherwise they cross-fade there and then. Off the pier and back on, the pier's song
 * picks up where it left off.
 *
 * The next song decodes in the background while this one plays (a little after it starts), so
 * nothing decodes at a change. (Decoding at the change, then folding and measuring ~6 M samples
 * in one go, stalled the frame on the headset every time the song changed.)
 *
 * IN THE CASINOS, their own songs (./casino), played the same way. Inside one you hear only
 * those. Walking up to a casino, they spill out of the open door, muffled by the walls and
 * placed at the door, and the island's songs dip under them.
 *
 * The backpack's MUSIC button mutes both (the sea and the game's sounds carry on). The choice
 * is kept in this browser.
 */

import { introDone } from '../experience/introGate.ts';
import { Vector3 } from 'three';
import type { Interior } from '../village/interiors.ts';
import { SUNRISE, SUNSET } from '../world/sky.ts';
import { audioContext, sfxOut } from './sfx.ts';

const SONGS = import.meta.glob('./songs/*.{mp3,m4a}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const CASINO_SONGS = import.meta.glob('./casino/*.{mp3,m4a}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/**
 * The playlists, as the soundtrack board has them (./songs; By the River is on the board's
 * shelf, not in a playlist). Their order here doesn't matter: each day deals its own.
 */
const PLAYLISTS = {
  day: [
    '11-tell-me-something.mp3',
    '06-mist.m4a',
    '02-poo-song.mp3',
    '12-the-line.mp3',
    '01-paradise.m4a',
    '13-bobber.mp3',
    '04-experimental-song.mp3',
    '14-sunny-beats.mp3',
    '08-like-that.mp3',
    '15-disco-ball.mp3',
    '16-new-song-98.mp3',
    '17-morning.mp3',
  ],
  night: ['19-harmony.m4a', '20-neighborhood.mp3', '09-imagine.m4a'],
  pier: ['18-night-catch.mp3', '10-novus.mp3', '05-new-song-35.mp3'],
};
/** the first day of a session opens on this */
const OPENER = '11-tell-me-something.mp3';

const songUrls = (names: string[]): string[] => names.map((n) => SONGS[`./songs/${n}`]).filter((u): u is string => !!u);
const CASINO = Object.keys(CASINO_SONGS)
  .sort()
  .map((k) => CASINO_SONGS[k]);

/** ff2's jukebox decode rate */
const LOFI_RATE = 24000;
/**
 * Every song is levelled to the same loudness as it's decoded (NORM, RMS dBFS: the masters sit
 * 7 dB apart), then:
 *  - the island's songs outdoors ~8 dB over a wash breaking 5 m away, ~14 dB over the distant
 *    surf (shore.ts levels, measured) and under a close splash;
 *  - the casino songs a little fuller inside, and out of the door at the door (the panner then
 *    falls it off).
 */
const NORM = -20;
const OUTDOOR = dB(-4);
const INSIDE = dB(-2);
const DOOR = dB(0);
/** how far from a casino door you start hearing it (and the island's songs dip) */
const SPILL = 16;

/**
 * Song into song (s): the last OUT seconds of a song fade away, and the next comes in LEAD
 * seconds before its end, rising over RISE. (Half the songs stop dead at full level; the other
 * half fade out by themselves, and lose only a quiet tail.)
 */
const OUT = 4.5;
const LEAD = 2.5;
const RISE = 1.2;
/** how far ahead of a change it's put on the audio clock */
const AHEAD = 0.25;
/**
 * Playlist into playlist. Nightfall and daybreak: a song with up to a minute left plays out,
 * else an 8 s cross-fade. On or off the pier at night: up to 12 s left plays out, else 4 s.
 */
const DAYNIGHT = { grace: 60, fade: 8 };
const PIERSIDE = { grace: 12, fade: 4 };
/** how long you're on the pier (or off it) before the music believes it (s) */
const ON_PIER = 1.5;
const OFF_PIER = 3;
/** how long before sunset (or sunrise) the next playlist's first song decodes (island hours) */
const READY_AHEAD = 0.5;
/** a paused song with less than this left starts over with the next one instead */
const NOT_WORTH = 20;

const MUTE_KEY = 'gamblefish.music.muted';

/** The mute switch (the backpack's MUSIC button). */
export const musicView = {
  muted: readMuted(),
  /** the island's songs step aside (the helter skelter plays its own: audio/skelter.ts) */
  away: false,
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

export interface Loaded {
  buffer: AudioBuffer;
  /** where the music starts and stops (s into the buffer) */
  head: number;
  tail: number;
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

export async function decode(url: string): Promise<Loaded | null> {
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
    const [head, tail] = audible(buffer);
    return { buffer, head, tail, level: await levelOf(buffer) };
  } catch {
    return null; // a song that won't load is just silence
  }
}

/**
 * Where the music starts and stops: the first and last 50 ms windows over ~−50 dBFS (ff2's
 * firstAudibleSecond, from both ends).
 */
function audible(buffer: AudioBuffer): [number, number] {
  const data = buffer.getChannelData(0);
  const win = Math.max(1, Math.floor(buffer.sampleRate * 0.05));
  const loud = (s: number): boolean => {
    const end = Math.min(s + win, data.length);
    let sum = 0;
    for (let i = s; i < end; i++) sum += data[i] * data[i];
    return Math.sqrt(sum / Math.max(1, end - s)) > 0.003;
  };
  let head = 0;
  for (let s = 0; s < data.length; s += win) {
    if (loud(s)) {
      head = Math.max(0, s / buffer.sampleRate - 0.05);
      break;
    }
  }
  let tail = buffer.duration;
  for (let s = data.length - win; s > 0; s -= win) {
    if (loud(s)) {
      tail = Math.min(buffer.duration, (s + win) / buffer.sampleRate + 0.05);
      break;
    }
  }
  return [head, Math.max(head + 1, tail)];
}

/** equal-power fades: in and out */
const curve = (f: (x: number) => number): Float32Array => Float32Array.from({ length: 64 }, (_, i) => f(i / 63));
const FADE_IN = curve((x) => Math.sin((x * Math.PI) / 2));
const FADE_OUT = curve((x) => Math.cos((x * Math.PI) / 2));

/** Freeze a param's automation at t (keeping the value it has there); returns that value. */
function holdAt(p: AudioParam, t: number): number {
  if (typeof p.cancelAndHoldAtTime === 'function') {
    p.cancelAndHoldAtTime(t);
    return p.value;
  }
  const v = p.value;
  p.cancelScheduledValues(t);
  p.setValueAtTime(v, t);
  return v;
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * A day's order: what wasn't heard last time first, then what was, each shuffled; never the
 * song just played first (and `first`, if given, at the top).
 */
function deal(songs: string[], heard: ReadonlySet<string>, last: string | null, first?: string): string[] {
  const rest = songs.filter((s) => s !== first);
  const order = [...shuffle(rest.filter((s) => !heard.has(s))), ...shuffle(rest.filter((s) => heard.has(s)))];
  if (order.length > 1 && order[0] === last) [order[0], order[1]] = [order[1], order[0]];
  if (first && songs.includes(first)) order.unshift(first);
  return order;
}

/** A song on the audio graph. */
interface Voice {
  src: AudioBufferSourceNode;
  env: GainNode;
  url: string;
  loaded: Loaded;
  /** audio-clock time it starts, from this far into the buffer */
  start: number;
  from: number;
  /** how long it fades in, and the audio-clock time its music ends */
  rise: number;
  end: number;
}

/**
 * One playlist: a song on, the next decoding behind it, one into the next on the audio clock.
 * It can stop part-way through a song (fading out) and pick up there again.
 */
class Station {
  private order: string[] = [];
  private at = 0;
  /** the song on (or, mid-change, the one coming in) */
  private voice: Voice | null = null;
  /** songs on their way out */
  private outs: Voice[] = [];
  /** decoded: the song to start with, the one after this one, and a song stopped part-way */
  private ready: Loaded | null = null;
  private next: Loaded | null = null;
  private held: { loaded: Loaded; offset: number } | null = null;
  private fetching = false;
  private preparing: Promise<boolean> | null = null;
  private heard = new Set<string>();
  private readonly broken = new Set<string>();
  /** playing (not stopped, not handed over) */
  live = false;
  /** which day or night it was dealt for */
  period = -1;
  /** set: play this song out, then call this with the time the next playlist comes in */
  last: ((at: number) => void) | null = null;

  constructor(
    private readonly ctx: AudioContext,
    private readonly into: AudioNode[],
    private readonly songs: string[],
  ) {}

  /** the song on (its url), for the dev hook */
  get playing(): string | null {
    return this.voice?.url ?? null;
  }

  /** A new day (or night): a new order. */
  deal(period: number, first?: string): void {
    // (it isn't playing; anything still fading out of it fades on)
    if (this.voice) this.fadeOut(this.voice, this.ctx.currentTime, 0.05);
    this.voice = null;
    this.live = false;
    this.last = null;
    const was = this.order[this.at] ?? null;
    this.order = deal(this.playable(), this.heard, was, first);
    this.heard = new Set();
    this.at = 0;
    this.ready = this.next = this.held = null;
    this.period = period;
  }

  /** Decode the song it would start with (resolves true once it can start at once). */
  prepare(): Promise<boolean> {
    if (this.held || this.ready) return Promise.resolve(true);
    if (this.preparing) return this.preparing;
    const order = this.order;
    this.preparing = (async () => {
      while (order === this.order && this.name(this.at)) {
        const url = this.name(this.at)!;
        const l = await decode(url);
        if (order !== this.order) return false;
        if (l) {
          this.ready = l;
          return true;
        }
        this.broken.add(url);
        this.order.splice(this.at, 1);
      }
      return false;
    })().finally(() => (this.preparing = null));
    return this.preparing;
  }

  /** Start (or pick up) at audio time t, fading in over `fade` s. False if it isn't decoded. */
  start(t: number, fade: number): boolean {
    let loaded: Loaded;
    let from: number;
    if (this.held) {
      ({ loaded, offset: from } = this.held);
      this.held = null;
    } else if (this.ready) {
      loaded = this.ready;
      from = loaded.head;
      this.ready = null;
    } else return false;
    this.voice = this.play(this.name(this.at)!, loaded, t, from, fade);
    this.live = true;
    return true;
  }

  /** Fade out from audio time t over `fade` s, remembering where it got to. */
  stop(t: number, fade: number): void {
    const v = this.voice;
    if (v) {
      const offset = v.from + Math.max(0, t + fade / 2 - v.start);
      if (v.loaded.tail - offset > NOT_WORTH) this.held = { loaded: v.loaded, offset };
      else this.advance();
      this.fadeOut(v, t, fade);
      this.outs.push(v);
    }
    // one already going out goes with it
    for (const o of this.outs) if (o !== v && o.end > t) this.fadeOut(o, t, Math.min(fade, o.end - t));
    this.voice = null;
    this.next = null;
    this.live = false;
    this.last = null;
  }

  /** Let go of the decoded songs it's holding (it won't be back until it's dealt again). */
  forget(): void {
    this.ready = this.next = this.held = null;
  }

  /**
   * Mid song-change, with the next song only just in (or not in yet): take it back (it's the
   * first song next time). Returns when it was to come in, or null if it's not that moment.
   */
  retract(t: number): number | null {
    const v = this.voice;
    if (!v || !this.outs.some((o) => o.end > t) || t > v.start + 1) return null;
    this.fadeOut(v, t, 0.15);
    this.heard.delete(v.url);
    if (this.at > 0) this.at--;
    else this.order.unshift(v.url);
    this.held = { loaded: v.loaded, offset: v.from };
    this.voice = null;
    this.next = null;
    this.live = false;
    this.last = null;
    return Math.max(t + 0.05, v.start);
  }

  /** a song decoded, ready to start at once */
  get loaded(): boolean {
    return !!(this.held || this.ready);
  }

  /** seconds of music left in the song on */
  remaining(now: number): number {
    return this.voice ? this.voice.end - now : 0;
  }

  /** Once a frame: the next song decoding, and one song into the next on time. */
  tick(now: number): void {
    this.outs = this.outs.filter((o) => now < o.end + 1);
    const v = this.voice;
    if (!this.live || !v) return;
    if (!this.next && !this.fetching && !this.last && now > v.start + Math.min(20, (v.end - v.start) / 3)) this.fetchNext(v);
    if (now < v.end - OUT - AHEAD) return;
    if (this.last) {
      // played out: over to the next playlist, under this one's end
      const hand = this.last;
      this.last = null;
      this.outro(v);
      this.outs.push(v);
      this.voice = null;
      this.next = null;
      this.live = false;
      this.advance();
      hand(Math.max(now + 0.05, v.end - LEAD));
      return;
    }
    // (a late decode: it comes in as soon as it's ready)
    if (!this.next) return;
    this.outro(v);
    this.outs.push(v);
    this.advance();
    const l = this.next;
    this.next = null;
    this.voice = this.play(this.name(this.at)!, l, Math.max(now + 0.05, v.end - LEAD), l.head, RISE);
  }

  private playable(): string[] {
    return this.songs.filter((s) => !this.broken.has(s));
  }

  /** the song `i` places along the order, dealing another round if it runs out */
  private name(i: number): string | null {
    while (i >= this.order.length) {
      const more = deal(this.playable(), new Set(), this.order[this.order.length - 1] ?? null);
      if (!more.length) return null;
      this.order.push(...more);
    }
    return this.order[i];
  }

  private advance(): void {
    this.at++;
    // drop what's been played
    if (this.at > 32) {
      this.order = this.order.slice(this.at);
      this.at = 0;
    }
  }

  private fetchNext(v: Voice): void {
    const url = this.name(this.at + 1);
    if (!url) return;
    this.fetching = true;
    void decode(url).then((l) => {
      this.fetching = false;
      if (this.voice !== v) return; // it's moved on (stopped, or a new day) meanwhile
      if (l) this.next = l;
      else {
        this.broken.add(url);
        this.order.splice(this.at + 1, 1);
      }
    });
  }

  private play(url: string, loaded: Loaded, t: number, from: number, rise: number): Voice {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = loaded.buffer;
    const lv = ctx.createGain();
    lv.gain.value = loaded.level;
    const env = ctx.createGain();
    if (rise > 0) {
      env.gain.value = 0;
      env.gain.setValueCurveAtTime(FADE_IN, t, rise);
    }
    src.connect(lv).connect(env);
    for (const n of this.into) env.connect(n);
    src.start(t, from);
    // the buffer goes with its source, once it's played
    src.onended = () => {
      src.disconnect();
      lv.disconnect();
      env.disconnect();
    };
    this.heard.add(url);
    return { src, env, url, loaded, start: t, from, rise, end: t + Math.max(0, loaded.tail - from) };
  }

  /** a song's own ending: its last OUT seconds fade away */
  private outro(v: Voice): void {
    const t = Math.max(v.end - OUT, v.start + v.rise + 0.01, this.ctx.currentTime + 0.01);
    this.fadeOut(v, t, Math.max(0.05, v.end - t));
  }

  private fadeOut(v: Voice, t: number, fade: number): void {
    const p = v.env.gain;
    const from = holdAt(p, t);
    p.setValueCurveAtTime(FADE_OUT.map((x) => x * from), t + 0.005, Math.max(0.02, fade));
    v.src.stop(t + fade + 0.05);
    v.end = Math.min(v.end, t + fade);
  }
}

type Mood = keyof typeof PLAYLISTS;

export interface MusicDeps {
  /** the island clock, 0..24 (world/sky.ts) */
  hour: () => number;
  /** standing on the pier (or a walk off its head) */
  onPier: () => boolean;
}

export class Music {
  private readonly doors: Vector3[];
  private started = false;
  private master: GainNode | null = null;
  private rotation: GainNode | null = null;
  private inGain: GainNode | null = null;
  private outGain: GainNode | null = null;
  private muffle: BiquadFilterNode | null = null;
  private panner: PannerNode | null = null;
  private readonly head = new Vector3();

  private stations: Record<Mood, Station> | null = null;
  private casino: Station | null = null;
  /** the playlist on (null while the first song is loading) */
  mood: Mood | null = null;
  /** a change under way: waiting on its first song to decode, or on this song to play out */
  private switching: Mood | null = null;
  private handing: Mood | null = null;
  /** counts sunrises and sunsets: a playlist dealt for an older one is dealt again */
  private period = 0;
  private dark: boolean | null = null;
  private opened = false;
  /** the playlist after the coming sunset (or sunrise) is ready */
  private readied = false;
  /** on the pier, as the music believes it, and for how long the feet have said otherwise */
  private pier = false;
  private doubt = 0;
  private lastT = 0;

  constructor(
    private readonly casinos: Interior[],
    private readonly deps: MusicDeps,
  ) {
    this.doors = casinos.map((i) => i.toWorld(i.frame.doorX, 1.3, i.frame.d / 2 + 0.2));
  }

  /** the song on outside, for the dev hook */
  get song(): string | null {
    return this.mood ? (this.stations?.[this.mood].playing ?? null) : null;
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
      void this.boot(ctx);
    }
    const t = ctx.currentTime;
    this.master!.gain.setTargetAtTime(musicView.muted || musicView.away ? 0 : 1, t, musicView.away ? 0.5 : 0.12);
    this.steer(t);

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
   * island songs (day / night / pier) → rotation → master
   * casino songs → (inside: straight in) + (outside: walls' low-pass → the door, in 3-D) → master
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
    const station = (names: string[]): Station => new Station(ctx, [this.rotation!], songUrls(names));
    this.stations = { day: station(PLAYLISTS.day), night: station(PLAYLISTS.night), pier: station(PLAYLISTS.pier) };
    this.casino = new Station(ctx, [this.inGain, this.muffle], CASINO);
  }

  /** The first song decodes behind the boot intro's curtain and starts as it drops; then the casinos'. */
  private async boot(ctx: AudioContext): Promise<void> {
    this.lastT = ctx.currentTime;
    this.dark = this.isDark();
    const mood = this.want(0);
    const s = this.fresh(mood);
    await s.prepare();
    await introDone();
    s.start(ctx.currentTime, 0);
    this.mood = mood;
    const c = this.casino!;
    c.deal(0);
    if (await c.prepare()) c.start(ctx.currentTime + 0.05, 0);
  }

  private isDark(): boolean {
    const h = this.deps.hour();
    return h >= SUNSET || h < SUNRISE;
  }

  /** where the music should be: day, or at night out on the pier or anywhere else */
  private want(dt: number): Mood {
    if (this.pier !== this.deps.onPier()) {
      this.doubt += dt;
      if (this.doubt >= (this.pier ? OFF_PIER : ON_PIER)) {
        this.pier = !this.pier;
        this.doubt = 0;
      }
    } else this.doubt = 0;
    return this.dark ? (this.pier ? 'pier' : 'night') : 'day';
  }

  /** a playlist dealt for this day or night (the session's first day opens on Tell Me Something) */
  private fresh(mood: Mood, period = this.period): Station {
    const s = this.stations![mood];
    if (s.period !== period) {
      const open = mood === 'day' && !this.opened;
      if (open) this.opened = true;
      s.deal(period, open ? songUrls([OPENER])[0] : undefined);
    }
    return s;
  }

  private steer(now: number): void {
    const dt = Math.min(0.5, Math.max(0, now - this.lastT));
    this.lastT = now;
    if (!this.stations) return;
    for (const s of Object.values(this.stations)) s.tick(now);
    this.casino!.tick(now);
    if (!this.mood) return;
    const dark = this.isDark();
    if (dark !== this.dark) {
      this.dark = dark;
      this.period++;
      this.readied = false;
    }
    const want = this.want(dt);
    // nearly sunset (or sunrise): the playlist that comes next is dealt and its first song decoded
    if (!this.readied && this.hoursToTurn() < READY_AHEAD) {
      this.readied = true;
      void this.fresh(dark ? 'day' : this.pier ? 'pier' : 'night', this.period + 1).prepare();
    }
    const from = this.stations[this.mood];
    if (want === this.mood) {
      // nothing due (or not any more): carry on
      if (this.handing) from.last = null;
      this.handing = this.switching = null;
      return;
    }
    if (want === this.handing || want === this.switching) return;
    // changed its mind mid-change: this song carries on until the new one's ready
    if (this.handing) from.last = null;
    this.handing = this.switching = null;
    this.change(want);
  }

  /** island hours to the next sunset or sunrise */
  private hoursToTurn(): number {
    const h = this.deps.hour();
    return (((this.dark ? SUNRISE : SUNSET) - h) % 24 + 24) % 24;
  }

  /** Over to another playlist: played out, or cross-faded now (see the top of the file). */
  private change(want: Mood): void {
    const ctx = audioContext()!;
    const t = ctx.currentTime;
    const from = this.stations![this.mood!];
    const to = this.fresh(want);
    const how = (this.mood === 'day') !== (want === 'day') ? DAYNIGHT : PIERSIDE;
    // the new playlist comes in at `at` (or as soon after as its song's decoded)
    const over = (at: number): void => {
      if (how === DAYNIGHT) from.forget();
      this.handing = null;
      this.mood = want;
      void to.prepare().then((ok) => {
        if (ok && this.mood === want && !to.live) to.start(Math.max(at, ctx.currentTime + 0.05), RISE);
        this.prepareOther();
      });
    };
    if (!from.live) return over(t);
    // its next song only just coming in: that one's taken back, and the new playlist comes in instead
    const back = from.retract(t);
    if (back !== null) return over(back);
    // nearly over: played out, the new playlist coming in under its end
    if (from.remaining(t) <= how.grace) {
      this.handing = want;
      from.last = over;
      return;
    }
    // else a cross-fade, as soon as the new song's decoded
    if (!to.loaded) {
      this.switching = want;
      void to.prepare().then((ok) => {
        if (this.switching !== want) return;
        this.switching = null;
        if (ok) this.change(want);
      });
      return;
    }
    from.stop(t, how.fade);
    if (how === DAYNIGHT) from.forget();
    to.start(t + 0.05, how.fade * 0.75);
    this.mood = want;
    this.prepareOther();
  }

  /** at night, the other night playlist ready to come straight in (for stepping on or off the pier) */
  private prepareOther(): void {
    if (this.mood === 'day') return;
    void this.fresh(this.mood === 'pier' ? 'night' : 'pier').prepare();
  }
}
