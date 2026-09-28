/**
 * CORAL, in person: what she says when you come in to Villa Mar, in a speech bubble over her
 * head (ui/speechBubble.ts) rather than on a board on the wall.
 *
 *  - She greets you as warmly as you've earned: her heart is the gifts you've given her from the
 *    Jeweller and the Boutique (village/homeGoods.ts), one heart each, and how she talks to you
 *    moves through five stages as they fill (a stranger, warming, fond, close, yours).
 *  - Anything delivered since you were last here, she thanks you for in person, by name, one
 *    line each, and a heart fills in the bubble with a chime; then a word on where the two of you
 *    are now (the line for that many hearts).
 *  - Early on, with nothing new, she lets slip where the nice things come from.
 *  - Back in straight after leaving: just a word. Walking out: a goodbye.
 *
 * What she's thanked you for, and how often you've called, ride along in the save (`coral`), so
 * a gift bought and delivered while you're across the island still gets its thank-you.
 */

import type { Camera } from 'three';
import { heartChime, speechPop } from '../audio/sfx.ts';
import type { GameState } from '../fishing/tidewater.ts';
import { SpeechBubble, type Line } from '../ui/speechBubble.ts';
import type { Character } from './characters.ts';
import { LOVE_INTEREST } from './roles.ts';

/** a word on where you are now, by how many gifts she has (0: the first time you meet) */
const HEART = [
  'Oh, hello. You’re the one who fishes off the pier?',
  'You didn’t have to. …But I’m glad you did.',
  'People are starting to talk about us, you know.',
  'Stay for a drink? The sunset’s better from here.',
  'I told my mother about you.',
  'You remembered what I said about the sea. Nobody remembers.',
  'You’ve made this place feel like a home.',
  'Stay a little longer tonight?',
  'Nobody’s ever spoiled me like this.',
  'Every time the door opens, I hope it’s you.',
  'Ask me. You know what I’ll say.',
];

/** her thanks for each thing, the first time she sees it (village/homeGoods.ts ids) */
const THANKS: Record<string, string> = {
  chandelier: 'A chandelier? Look at the light! The whole hall’s sparkling.',
  vanity: 'A vanity, in mother-of-pearl. I’ll think of you every morning.',
  pearls: 'Pearls from the deep reef… did you dive for these yourself?',
  ring: '…That’s a ring. Under glass. I… I’ll keep it safe. For now.',
  tiara: 'A mermaid’s tiara! How did you know I always wanted to be one?',
  chaise: 'A chaise by the window. Long afternoons, just like I said.',
  mirror: 'It does flatter the light. And me, apparently.',
  drapes: 'Rose silk! The sunset comes in pink now.',
  piano: 'A baby grand? Sit down, I’ll play you something.',
  screen: 'Birds of paradise. It’s like the garden came inside.',
};

type Stage = 'stranger' | 'warming' | 'fond' | 'close' | 'yours';

function stage(n: number, of: number): Stage {
  if (n >= of) return 'yours';
  if (n === 0) return 'stranger';
  if (n <= 2) return 'warming';
  if (n <= 5) return 'fond';
  return 'close';
}

/** coming in (by day) */
const HELLO: Record<Stage, string[]> = {
  stranger: ['You again. The pier’s back that way, you know.', 'Lost? Most people knock.', 'Oh. It’s the fisherman. Hello.'],
  warming: ['Oh, it’s you! Come in, come in.', 'I was hoping you’d stop by.', 'Hello, you. Catch anything?'],
  fond: ['There you are. I was starting to miss you.', 'You smell like the sea. I don’t mind.', 'Come sit with me a while.'],
  close: ['Finally! Come here, you.', 'I kept the good chair for you.', 'I heard you were out on the pier. I watched for a bit.'],
  yours: ['Hello, my love.', 'Home at last. I missed you.', 'There’s my favourite fisherman.'],
};

/** coming in after dark */
const EVENING: Record<Stage, string[]> = {
  stranger: ['It’s late. Are you lost?'],
  warming: ['Out fishing by moonlight? Come in, it’s cold.'],
  fond: ['I left the lamp on for you.'],
  close: ['I couldn’t sleep until you came by.'],
  yours: ['There you are. Stay the night?'],
};

/** early on, with nothing new: where the nice things come from */
const HINTS = [
  'The Jeweller in town has the prettiest things. Just saying.',
  'Have you seen the Boutique? Their silks are divine.',
  'A girl could get used to a little sparkle, you know.',
];

/** back in before she's missed you */
const AGAIN = ['Back so soon?', 'Forget something?', 'Couldn’t stay away?'];

/** walking out */
const BYE: Record<Stage, string[]> = {
  stranger: ['Mind the step.', 'Bye, then.'],
  warming: ['Come back soon?', 'Good luck out there!'],
  fond: ['Don’t be a stranger.', 'Bring me back a story.'],
  close: ['Leaving already? Come back to me.', 'Be careful on that pier.'],
  yours: ['Come home soon, my love.', 'I’ll be right here.'],
};

const pick = (a: string[]): string => a[Math.floor(Math.random() * a.length)];

/** how long a line stays up: long enough to read, not so long you're waiting */
const hold = (text: string): number => Math.min(6.5, Math.max(2.6, 1.6 + text.length * 0.055));

/** comes in within this long of leaving (s): "back so soon?" */
const SOON = 30;
/** she starts talking this long after you're through the door (s): the wave comes first */
const OPENING = 0.8;

interface Queued extends Line {
  /** fill a heart as it comes up */
  chime?: boolean;
}

export class CoralTalk {
  readonly bubble = new SpeechBubble({ name: LOVE_INTEREST.name, accent: '#e8506a', paper: '#fff7f0', ink: '#3a1422' });
  private queue: Queued[] = [];
  /** time left on the line that's up, or before the next one */
  private wait = 0;
  private inside = false;
  private insideFor = 0;
  /** clock (s) when you last walked out */
  private leftAt = -Infinity;
  private clock = 0;

  constructor(
    private readonly state: GameState,
    private readonly coral: Character,
    /** her gifts' ids, in the order the shops list them */
    private readonly gifts: readonly string[],
    private readonly night: () => number = () => 0,
  ) {
    // new gifts turning up while you're here (a cloud save coming in): she notices at once
    state.onChange(() => {
      if (this.inside && !this.queue.length && this.fresh().length) this.thank();
    });
  }

  /** how many of her gifts she has */
  private count(): number {
    return this.gifts.filter((id) => this.state.home.includes(id)).length;
  }

  /** gifts delivered that she hasn't thanked you for yet */
  private fresh(): string[] {
    return this.gifts.filter((id) => this.state.home.includes(id) && !this.state.coral.thanked.includes(id));
  }

  /** Per frame, with whether you're in the room and where her head is. */
  update(dt: number, camera: Camera, inside: boolean): void {
    this.clock += dt;
    if (inside && !this.inside) this.arrive();
    else if (!inside && this.inside) this.leave();
    this.inside = inside;
    if (inside) this.insideFor += dt;
    this.wait -= dt;
    if (this.wait <= 0) {
      const next = this.queue.shift();
      if (next) {
        this.bubble.say(next);
        speechPop();
        if (next.chime) heartChime();
        this.coral.talking = true;
        this.wait = hold(next.text);
      } else if (this.bubble.speaking) {
        this.bubble.hide();
        this.coral.talking = false;
      }
    }
    this.bubble.update(dt, camera);
  }

  private arrive(): void {
    this.insideFor = 0;
    this.queue = [];
    this.bubble.clear();
    this.wait = OPENING;
    const soon = this.clock - this.leftAt < SOON;
    if (this.fresh().length) {
      this.thank();
    } else if (soon) {
      this.queue.push({ text: pick(AGAIN) });
    } else {
      this.greet();
    }
    if (!soon) {
      this.state.coral.visits++;
      this.state.save();
    }
  }

  private leave(): void {
    this.leftAt = this.clock;
    this.queue = [];
    // a goodbye over her shoulder, seen back through the doorway (if you stayed a moment)
    if (this.insideFor > 2) {
      this.queue.push({ text: pick(BYE[stage(this.count(), this.gifts.length)]) });
      this.wait = 0.2;
    } else {
      this.bubble.clear();
      this.coral.talking = false;
    }
  }

  private greet(): void {
    const n = this.count();
    const of = this.gifts.length;
    const s = stage(n, of);
    const hearts = { n, of };
    if (this.state.coral.visits === 0 && n === 0) {
      this.queue.push({ text: HEART[0] }, { text: pick(HINTS) });
      return;
    }
    this.queue.push({ text: pick(this.night() > 0.5 ? EVENING[s] : HELLO[s]), hearts });
    if (n < 3) this.queue.push({ text: pick(HINTS), hearts });
  }

  /** each new gift by name, a heart filling for each, then where that leaves you */
  private thank(): void {
    const fresh = this.fresh();
    const of = this.gifts.length;
    let n = this.count() - fresh.length;
    for (const id of fresh) {
      n++;
      this.queue.push({ text: THANKS[id] ?? 'For me? You spoil me.', hearts: { n, of, lit: n - 1 }, chime: true });
      this.state.coral.thanked.push(id);
    }
    this.queue.push({ text: HEART[Math.min(n, HEART.length - 1)], hearts: { n, of } });
    this.state.save();
  }
}
