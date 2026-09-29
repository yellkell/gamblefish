/**
 * Two small guards for the bank (server/bank.mjs), kept apart so tools/bank-check.mjs can
 * drive them without starting a server.
 *
 * THE REDEEM GUARD. A LOG IN code is six digits, short enough to type on a headset's
 * keyboard, and /redeem needs no sign-in (that's the point: the headset has none yet). Left
 * open, anyone could run through the million codes while a real one is live and sign in as
 * someone else. So wrong guesses are counted twice over: per caller (a handful in ten
 * minutes), and across the whole bank (a few dozen a minute). A caller can disguise itself;
 * the bank-wide cap still holds, and at 30 a minute a code's ten minutes allow 300 guesses
 * of 900,000. People who mistype a code rarely miss more than once or twice.
 *
 * WHERE A CHECKOUT RETURNS. The game is served from more than one address (GitHub Pages and
 * Firebase Hosting), and each keeps its own save. Stripe sends a buyer back to paid.html on
 * the address they bought from, so the purchase never lands them on a different copy of the
 * game, as long as that address is on the list. Anything else goes to PUBLIC_URL.
 */

export const REDEEM_PER_CALLER = 8;
export const REDEEM_CALLER_WINDOW_MS = 10 * 60 * 1000;
export const REDEEM_OVERALL = 30;
export const REDEEM_OVERALL_WINDOW_MS = 60 * 1000;

export class RedeemGuard {
  constructor({
    perCaller = REDEEM_PER_CALLER,
    callerWindowMs = REDEEM_CALLER_WINDOW_MS,
    overall = REDEEM_OVERALL,
    overallWindowMs = REDEEM_OVERALL_WINDOW_MS,
    now = Date.now,
  } = {}) {
    this.perCaller = perCaller;
    this.callerWindowMs = callerWindowMs;
    this.overall = overall;
    this.overallWindowMs = overallWindowMs;
    this.now = now;
    /** caller → times of its wrong guesses */
    this.callers = new Map();
    /** times of every wrong guess */
    this.all = [];
  }

  #prune() {
    const t = this.now();
    const bankCut = t - this.overallWindowMs;
    while (this.all.length && this.all[0] <= bankCut) this.all.shift();
    const callerCut = t - this.callerWindowMs;
    for (const [who, times] of this.callers) {
      while (times.length && times[0] <= callerCut) times.shift();
      if (!times.length) this.callers.delete(who);
    }
  }

  /** '' when this caller may try a code, else why not. */
  refuse(who) {
    this.#prune();
    if (this.all.length >= this.overall) return 'too many tries at the bank just now: wait a minute and type it again';
    if ((this.callers.get(who)?.length ?? 0) >= this.perCaller) return 'too many wrong codes: wait ten minutes, or ask for a fresh link';
    return '';
  }

  /** A wrong (or expired) code. */
  miss(who) {
    const t = this.now();
    this.all.push(t);
    const times = this.callers.get(who) ?? [];
    times.push(t);
    this.callers.set(who, times);
  }
}

/** Who is asking, as well as the proxies in front of the bank say. Best effort: the bank-wide cap doesn't rely on it. */
export function callerOf(req) {
  const cf = String(req.headers['cf-connecting-ip'] ?? '').trim();
  if (cf) return cf;
  const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  return fwd || req.socket?.remoteAddress || 'unknown';
}

/** A game address as the list keeps it: no trailing slash. */
export const homeKey = (url) => String(url ?? '').trim().replace(/\/+$/, '');

/** Where Stripe should send this buyer back to: their own copy of the game if it's on the list, else the fallback. */
export function returnBase(home, allowed, fallback) {
  const h = homeKey(home);
  return h && allowed.map(homeKey).includes(h) ? h : homeKey(fallback);
}
