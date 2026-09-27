/**
 * The helter skelter's sound: HELTER SKELTER's soundtrack and DOWN's voice lines (their
 * src/audio.ts), played the island's way (audio/music.ts): through the shared AudioContext, never
 * an <audio> element, the songs decoded lo-fi and levelled.
 *
 *  - 4 LEAF CLOVERS at the top: on the balcony while you read the warning, and through the
 *    countdown. The first drop hands over to one of the ride's own songs, NEW SONG 98 or NEW
 *    SONG 129, drawn at random each ride.
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

/** the balcony's song, and the descent's (one drawn each ride) */
const LOBBY = 'four-leaf-clovers.mp3';
const DESCENT = ['new-song-98.mp3', 'new-song-129.mp3'];

function dB(x: number): number {
  return Math.pow(10, x / 20);
}
/** the songs a touch under the island's rotation outdoors; the voice lines over them */
const SONG = dB(-3);
const VOICE = dB(2);

class SkelterAudio {
  private readonly sfx = new Map<SkelterSfx, AudioBuffer>();
  private readonly songs = new Map<string, Promise<Loaded | null>>();
  private out: GainNode | null = null;
  private music: GainNode | null = null;
  private lobby: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private run: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private descent = DESCENT[0];
  private live = new Set<AudioBufferSourceNode>();

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

  /** Get everything loading (on the way up the tower): the voice lines, the balcony's song, a descent song. */
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
    // a new draw each ride, a different song from last time
    this.descent = DESCENT[(DESCENT.indexOf(this.descent) + 1 + Math.floor(Math.random() * (DESCENT.length - 1))) % DESCENT.length];
    this.song(this.descent);
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

  private start(name: string, loop: boolean): Promise<{ src: AudioBufferSourceNode; gain: GainNode } | null> {
    return this.song(name).then((l) => {
      const b = this.bus();
      if (!l || !b) return null;
      const src = b.ctx.createBufferSource();
      src.buffer = l.buffer;
      src.loop = loop;
      src.loopStart = l.head;
      src.loopEnd = l.buffer.duration;
      const gain = b.ctx.createGain();
      gain.gain.value = l.level * SONG;
      src.connect(gain).connect(b.music);
      src.start(0, l.head);
      return { src, gain };
    });
  }

  private fade(p: { src: AudioBufferSourceNode; gain: GainNode } | null, seconds = 0.6): void {
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
    const marker = { src: null as unknown as AudioBufferSourceNode, gain: null as unknown as GainNode };
    this.lobby = marker;
    void this.start(LOBBY, true).then((p) => {
      if (this.lobby !== marker) return this.fade(p, 0.05);
      this.lobby = p;
    });
  }

  stopLobby(seconds = 0.6): void {
    const l = this.lobby;
    this.lobby = null;
    if (l?.src) this.fade(l, seconds);
  }

  /** The first drop: the descent's song takes over from the balcony's. */
  startDescent(): void {
    this.stopLobby(0.4);
    this.stopRun();
    const marker = { src: null as unknown as AudioBufferSourceNode, gain: null as unknown as GainNode };
    this.run = marker;
    void this.start(this.descent, true).then((p) => {
      if (this.run !== marker) return this.fade(p, 0.05);
      this.run = p;
    });
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

  play(name: SkelterSfx, volume = 1): void {
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
    src.start();
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
