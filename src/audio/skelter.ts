/**
 * The helter skelter's sound: HELTER SKELTER's soundtrack and DOWN's voice lines (their
 * src/audio.ts), played the island's way (audio/music.ts): through the shared AudioContext, never
 * an <audio> element, the songs decoded lo-fi and levelled.
 *
 *  - 4 LEAF CLOVERS at the top, on the balcony while you read the warning.
 *  - BRAIN EATER (FireFight's boss theme) on the way down: in from its top when you're centred,
 *    DOWN's 3-2-1 on its beats, and the launch off the balcony right on its drop. From there it
 *    just plays, through every landing, once: its outro at the bottom, then the island's songs.
 *  - DOWN's voiced 3-2-1 on every bay, BEGIN at the top, NICE and PERFECT on the landings, WELL
 *    DONE at the bottom, and the crash if a gate takes you off.
 *  - The coin ding: a bright tone that climbs a semitone with each coin in a streak; a gem gets a
 *    two-note chime.
 *
 * While you're on the tower the island's own songs step aside (musicView.away), and the
 * backpack's MUSIC switch mutes these too.
 */

import { audioContext, sfxOut } from './sfx.ts';
import { decode, musicView, type Loaded } from './music.ts';

const FILES = import.meta.glob('./skelter/*.{mp3,ogg,wav}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const file = (name: string): string => FILES[`./skelter/${name}`];

const SFX = {
  begin: 'begin.ogg',
  one: 'countdown-one.ogg',
  two: 'countdown-two.ogg',
  three: 'countdown-three.ogg',
  die: 'die.ogg',
  gameover: 'gameover.ogg',
  nice: 'nice.wav',
  perfect: 'perfect.wav',
  welldone: 'welldone.wav',
} as const;
export type SkelterSfx = keyof typeof SFX;

/** the balcony's song, and the descent's */
const LOBBY = 'four-leaf-clovers.mp3';
/** BRAIN EATER: 150 BPM on the dot, from its first sample, played once through */
const DESCENT = 'brain-eater.mp3';
const BEAT = 60 / 150;
/** its drop, 4 bars in: where the first launch lands */
const DROP = 16 * BEAT;
/** the balcony's 3-2-1, a line every two beats into the drop */
export const COUNT_STEP = 2 * BEAT;

function dB(x: number): number {
  return Math.pow(10, x / 20);
}
/** the songs a touch under the island's rotation outdoors; the voice lines over them */
const SONG = dB(-3);
const VOICE = dB(2);

interface Playing {
  src: AudioBufferSourceNode;
  gain: GainNode;
  /** seconds into the song it started from, and the context's clock then */
  from: number;
  t0: number;
}

class SkelterAudio {
  private readonly sfx = new Map<SkelterSfx, AudioBuffer>();
  private readonly songs = new Map<string, Promise<Loaded | null>>();
  private out: GainNode | null = null;
  private music: GainNode | null = null;
  private lobby: Playing | null = null;
  private run: Playing | null = null;
  private live = new Set<AudioBufferSourceNode>();
  /** BRAIN EATER's played out (not stopped): the system hands the music back to the island */
  onEnd: (() => void) | null = null;

  private bus(): { ctx: AudioContext; out: GainNode; music: GainNode } | null {
    const ctx = audioContext();
    const dest = sfxOut();
    if (!ctx || !dest) return null;
    if (!this.out) {
      this.out = ctx.createGain();
      this.out.connect(dest);
      this.music = ctx.createGain();
      this.music.connect(this.out);
    }
    return { ctx, out: this.out, music: this.music! };
  }

  /** Get everything loading (on the way up the tower): the voice lines, the balcony's song, the descent's. */
  load(): void {
    const b = this.bus();
    if (!b) return;
    if (!this.sfx.size)
      for (const [k, f] of Object.entries(SFX) as [SkelterSfx, string][])
        void fetch(file(f))
          .then((r) => r.arrayBuffer())
          .then((buf) => b.ctx.decodeAudioData(buf))
          .then((d) => this.sfx.set(k, d))
          .catch(() => {}); // a missing line is never fatal
    this.song(LOBBY);
    this.song(DESCENT);
  }

  private song(name: string): Promise<Loaded | null> {
    let p = this.songs.get(name);
    if (!p) this.songs.set(name, (p = decode(file(name))));
    return p;
  }

  /** once a frame: the MUSIC switch */
  update(): void {
    const b = this.bus();
    if (!b) return;
    b.music.gain.setTargetAtTime(musicView.muted ? 0 : 1, b.ctx.currentTime, 0.12);
  }

  /** Play a song from `from` seconds in (its head by default): looping, unless `loop` is false. */
  private start(name: string, from?: number, loop = true): Promise<Playing | null> {
    return this.song(name).then((l) => {
      const b = this.bus();
      if (!l || !b) return null;
      const at = Math.min(Math.max(from ?? l.head, l.head), l.buffer.duration);
      const src = b.ctx.createBufferSource();
      src.buffer = l.buffer;
      src.loop = loop;
      src.loopStart = l.head;
      const gain = b.ctx.createGain();
      gain.gain.value = l.level * SONG;
      src.connect(gain).connect(b.music);
      // a hair ahead, so the clock knows exactly when it started
      const t0 = b.ctx.currentTime + 0.05;
      src.start(t0, at);
      return { src, gain, from: at, t0 };
    });
  }

  private fade(p: Playing | null, seconds = 0.6): void {
    const ctx = audioContext();
    if (!p || !ctx) return;
    p.gain.gain.setTargetAtTime(0, ctx.currentTime, seconds / 4);
    try {
      p.src.stop(ctx.currentTime + seconds);
    } catch {
      /* already stopped */
    }
  }

  /** 4 Leaf Clovers at the top: keeps looping until the first drop. No-op if it's on. */
  playLobby(): void {
    if (this.lobby) return;
    const marker = { src: null } as unknown as Playing;
    this.lobby = marker;
    void this.start(LOBBY).then((p) => {
      if (this.lobby !== marker) return this.fade(p, 0.05);
      this.lobby = p;
    });
  }

  stopLobby(seconds = 0.6): void {
    const l = this.lobby;
    this.lobby = null;
    if (l?.src) this.fade(l, seconds);
  }

  /**
   * I'M CENTRED: 4 Leaf Clovers out, BRAIN EATER in from its top, DOWN's 3-2-1 set on its beats.
   * Resolves to when (on the context's clock) its drop lands, the launch, or null if it can't play.
   */
  drop(): Promise<number | null> {
    this.stopLobby(0.3);
    const marker = { src: null } as unknown as Playing;
    this.run = marker;
    return this.start(DESCENT, 0, false).then((p) => {
      if (this.run !== marker) {
        this.fade(p, 0.05);
        return null;
      }
      this.run = p;
      if (!p) return null;
      // (a stop clears this.run first, so only the song running out gets here)
      p.src.onended = () => {
        if (this.run !== p) return;
        this.run = null;
        this.onEnd?.();
      };
      const at = p.t0 + DROP - p.from;
      this.play('three', 0.9, at - 3 * COUNT_STEP);
      this.play('two', 0.9, at - 2 * COUNT_STEP);
      this.play('one', 0.9, at - COUNT_STEP);
      return at;
    });
  }

  /** the context's clock, that drop() times the launch on */
  now(): number {
    return audioContext()?.currentTime ?? 0;
  }

  /** The run's song and any line still playing, gone. */
  stopRun(seconds = 0.6): void {
    const r = this.run;
    this.run = null;
    if (r?.src) this.fade(r, seconds);
    for (const s of this.live)
      try {
        s.stop();
      } catch {
        /* already ended */
      }
    this.live.clear();
  }

  stopAll(seconds = 0.6): void {
    this.stopLobby(seconds);
    this.stopRun(seconds);
  }

  /** A voice line, now or at `at` on the context's clock. */
  play(name: SkelterSfx, volume = 1, at = 0): void {
    const b = this.bus();
    const buffer = this.sfx.get(name);
    if (!b || !buffer || b.ctx.state !== 'running') return;
    const src = b.ctx.createBufferSource();
    src.buffer = buffer;
    const g = b.ctx.createGain();
    g.gain.value = volume * VOICE;
    src.connect(g).connect(b.out);
    this.live.add(src);
    src.onended = () => this.live.delete(src);
    src.start(at);
  }

  /** The coin ding: climbs with the streak, Subway Surfers style; a gem's is two notes. */
  coin(streak: number, gem = false): void {
    const b = this.bus();
    if (!b || b.ctx.state !== 'running') return;
    const t = b.ctx.currentTime;
    const tone = (freq: number, at: number, dur: number, vol: number): void => {
      const osc = b.ctx.createOscillator();
      const gain = b.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(vol, at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(gain).connect(b.out);
      osc.start(at);
      osc.stop(at + dur + 0.02);
    };
    if (gem) {
      tone(1320, t, 0.12, 0.2);
      tone(1980, t + 0.09, 0.22, 0.2);
      return;
    }
    tone(880 * Math.pow(2, Math.min(streak, 14) / 12), t, 0.11, 0.16);
  }
}

export const skelterAudio = new SkelterAudio();
