/**
 * THE ISLAND BANK, headset side: coins for real money, and the account that
 * keeps them (ported from ff2's src/net/bank.ts). Every step that matters is
 * somebody else's word, never the client's:
 *
 *   1. The headset asks the bank server (server/bank.mjs) for a CHECKOUT,
 *      signed with its Firebase ID token so the server knows which uid is
 *      buying. The server opens a Stripe Checkout and hands back its URL, and
 *      a short link to it that the board can draw as a QR code.
 *   2. You scan the QR with your phone and pay there (or OPEN ON THIS HEADSET).
 *      Stripe takes the card; this code never sees a digit of it.
 *   3. Stripe tells the server it was paid (a signed webhook); the server
 *      writes the coins into the ledger, keyed on the session so nothing is
 *      credited twice.
 *   4. The headset CLAIMS what it's owed and the coins land in the wallet with
 *      the cash chime. Claiming runs at every boot and every few seconds while
 *      a checkout is open, so a purchase lands within a breath of paying, or
 *      the next time the game starts.
 *
 * THE ACCOUNT. A headset is its anonymous uid. SAVE MY PURCHASES attaches an
 * email to it (the email you paid with, one tap), and from then on the game
 * save lives on the server too (net/cloudSave.ts). On a new headset, LOG IN
 * emails a sign-in link; the phone that opens it (login.html) shows a six-digit
 * code; typing it at the bank signs this headset in as the same uid, and the
 * account's save comes down with every coin bought.
 */

import { payOut } from '../casino/money.ts';
import type { GameState } from '../fishing/tidewater.ts';
import { cloud, idTokenNow } from './firebase.ts';
import { markAdopt } from './cloudSave.ts';

export interface CoinPack {
  id: string;
  coins: number;
  /** price in the currency's minor unit (pence) */
  minor: number;
  best?: boolean;
}

export type BankMode = 'live' | 'test' | 'dev' | 'closed' | '';

export interface Checkout {
  id: string;
  url: string;
  short: string;
  pack: CoinPack;
  at: number;
  state: 'opening' | 'waiting' | 'paid' | 'failed' | 'expired';
  paid: number;
  note: string;
}

/** What the board draws until the server answers. Keep in step with server/bank.mjs PACKS. */
export const FALLBACK_PACKS: CoinPack[] = [
  { id: 'pouch', coins: 500, minor: 199 },
  { id: 'purse', coins: 1300, minor: 449 },
  { id: 'chest', coins: 3000, minor: 899, best: true },
  { id: 'vault', coins: 7000, minor: 1799 },
];

export type RecoveryStage = 'idle' | 'sending' | 'sent' | 'redeeming' | 'done' | 'failed';

/** Live bank state: the board repaints when `version` changes. */
export const bank = {
  status: 'idle' as 'idle' | 'loading' | 'ready' | 'off',
  mode: '' as BankMode,
  currency: 'usd',
  packs: FALLBACK_PACKS,
  checkout: null as Checkout | null,
  note: '',
  account: { known: false, protected: false, email: '' },
  /** the email typed at the last paid checkout: what SAVE MY PURCHASES offers */
  lastEmail: '',
  protecting: { stage: 'idle' as 'idle' | 'busy' | 'done' | 'failed', note: '' },
  recovery: { stage: 'idle' as RecoveryStage, email: '', note: '' },
  version: 0,
};

export const bankDeps: { state: GameState | null } = { state: null };

const bump = (): void => {
  bank.version++;
};

const CHECKOUT_TTL_MS = 25 * 60 * 1000;
const POLL_MS = 3000;
const FETCH_TIMEOUT_MS = 12_000;

/** The bank server: a laptop's own on a dev serve, Render in the wild. */
export function bankHttp(): string {
  const env = (import.meta as { env?: Record<string, string> }).env?.VITE_BANK_URL;
  if (env) return env.replace(/\/$/, '');
  const h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(h)) return `http://${h}:8792`;
  return 'https://gamblefish-bank.onrender.com';
}

const SYMBOL: Record<string, string> = { usd: '$', gbp: '£', eur: '€' };

export function priceLabel(minor: number, currency = bank.currency): string {
  const cur = currency.toLowerCase();
  return `${SYMBOL[cur] ?? `${cur.toUpperCase()} `}${(minor / 100).toFixed(2)}`;
}

function isDevServe(): boolean {
  return location.protocol !== 'https:';
}

function devUid(): string {
  const KEY = 'vrfish.bank-devuid';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = `dev-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return 'dev-anon';
  }
}

/** The headers that say who is asking: a Firebase ID token, or on a dev serve with no cloud, a stand-in. */
export async function identity(): Promise<Record<string, string> | null> {
  const token = await idTokenNow();
  if (token) return { authorization: `Bearer ${token}` };
  if (isDevServe()) return { 'x-dev-uid': devUid() };
  bank.note = 'no connection: the bank needs the internet';
  return null;
}

export async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${bankHttp()}${path}`, { ...init, signal: ctl.signal, cache: 'no-store' });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

let loading: Promise<void> | null = null;

/** Fetch the server's packs, prices and mode (once, unless it failed). Render's free tier sleeps, so the first call can take a while. */
export function loadPacks(): Promise<void> {
  if (bank.status === 'ready') return Promise.resolve();
  if (loading) return loading;
  bank.status = 'loading';
  bump();
  loading = (async () => {
    try {
      const cat = await call<{ mode: BankMode; currency: string; packs: CoinPack[] }>('/');
      if (!Array.isArray(cat.packs) || !cat.packs.length) throw new Error('no packs');
      bank.packs = cat.packs;
      bank.mode = cat.mode;
      bank.currency = cat.currency || 'usd';
      bank.status = 'ready';
      bank.note = '';
    } catch (err) {
      bank.status = 'off';
      const said = String((err as Error)?.message ?? '');
      bank.note = /abort/i.test(said) ? 'the bank is waking up: try again in a moment' : /not open yet/.test(said) ? said.replace(/^the bank is not open yet — /, 'closed: ') : 'the bank is closed right now';
    } finally {
      loading = null;
      bump();
    }
  })();
  return loading;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

function stopPolling(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

/** Open a checkout for a pack. One at a time. */
export async function startCheckout(packId: string): Promise<void> {
  const pack = bank.packs.find((p) => p.id === packId);
  if (!pack) return;
  if (bank.checkout && (bank.checkout.state === 'opening' || bank.checkout.state === 'waiting')) return;
  const co: Checkout = { id: '', url: '', short: '', pack, at: performance.now(), state: 'opening', paid: 0, note: '' };
  bank.checkout = co;
  bump();
  const who = await identity();
  if (!who) {
    co.state = 'failed';
    co.note = bank.note;
    bump();
    return;
  }
  try {
    const reply = await call<{ id: string; url: string; short: string; pack: CoinPack }>('/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...who },
      body: JSON.stringify({ pack: packId }),
    });
    co.id = reply.id;
    co.url = reply.url;
    co.short = reply.short || reply.url;
    co.pack = reply.pack ?? pack;
    co.state = 'waiting';
    stopPolling();
    pollTimer = setInterval(() => void poll(), POLL_MS);
  } catch (err) {
    co.state = 'failed';
    co.note = String((err as Error)?.message ?? err).slice(0, 80);
  }
  bump();
}

async function poll(): Promise<void> {
  const co = bank.checkout;
  if (!co || co.state !== 'waiting') return stopPolling();
  if (performance.now() - co.at > CHECKOUT_TTL_MS) {
    co.state = 'expired';
    stopPolling();
    bump();
    return;
  }
  const got = await claimPurchases();
  if (got > 0) {
    co.state = 'paid';
    co.paid = got;
    stopPolling();
    bump();
    void whoami();
  }
}

export function cancelCheckout(): void {
  stopPolling();
  bank.checkout = null;
  bump();
}

/** OPEN ON THIS HEADSET: the checkout in a new tab (it shows when you take the headset off, or on a flat screen). */
export function openCheckout(): boolean {
  const co = bank.checkout;
  if (!co?.url) return false;
  try {
    return !!window.open(co.url, '_blank', 'noopener');
  } catch {
    return false;
  }
}

let claiming: Promise<number> | null = null;

/** Collect whatever the ledger says is owed and put it in the wallet. Idempotent on the server. */
export function claimPurchases(): Promise<number> {
  if (claiming) return claiming;
  claiming = (async () => {
    try {
      const who = await identity();
      if (!who) return 0;
      const reply = await call<{ coins: number; email?: string }>('/claim', { method: 'POST', headers: { 'content-type': 'application/json', ...who }, body: '{}' });
      const coins = Math.floor(reply.coins ?? 0);
      if (reply.email && reply.email !== bank.lastEmail) {
        bank.lastEmail = reply.email;
        bump();
      }
      if (coins > 0 && bankDeps.state) {
        payOut(bankDeps.state, coins);
        bump();
      }
      return coins;
    } catch {
      return 0;
    } finally {
      claiming = null;
    }
  })();
  return claiming;
}

/* ── the account ──────────────────────────────────────────────────────── */

export async function whoami(): Promise<void> {
  const who = await identity();
  if (!who) return;
  try {
    const reply = await call<{ protected: boolean; email: string }>('/whoami', { headers: who });
    bank.account = { known: true, protected: !!reply.protected, email: reply.email ?? '' };
  } catch {
    /* the board shows the last known state */
  }
  bump();
}

const EMAIL_OK = /^[^\s@]{1,64}@[^\s@]{1,128}\.[^\s@]{2,24}$/;

/** SAVE MY PURCHASES: attach an email to this uid so another headset can log in to it. */
export async function protect(email: string): Promise<boolean> {
  const addr = email.trim().toLowerCase();
  if (!EMAIL_OK.test(addr)) {
    bank.protecting = { stage: 'failed', note: 'that is not an email address' };
    bump();
    return false;
  }
  bank.protecting = { stage: 'busy', note: '' };
  bump();
  const who = await identity();
  if (!who) {
    bank.protecting = { stage: 'failed', note: bank.note || 'no connection' };
    bump();
    return false;
  }
  try {
    const reply = await call<{ protected: boolean; email: string }>('/protect', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...who },
      body: JSON.stringify({ email: addr }),
    });
    bank.account = { known: true, protected: !!reply.protected, email: reply.email ?? '' };
    bank.protecting = { stage: 'done', note: '' };
    bump();
    return true;
  } catch (err) {
    bank.protecting = { stage: 'failed', note: String((err as Error)?.message ?? err).slice(0, 90) };
    bump();
    return false;
  }
}

/** Where the emailed link lands: the login page beside the game. */
function loginUrl(): string {
  const dir = location.pathname.replace(/[^/]*$/, '');
  return `${location.origin}${dir}login.html`;
}

/** LOG IN, step one: have Firebase email a sign-in link for that address. */
export async function startRecovery(email: string): Promise<void> {
  const addr = email.trim().toLowerCase();
  if (!EMAIL_OK.test(addr)) {
    bank.recovery = { stage: 'failed', email: addr, note: 'that is not an email address' };
    bump();
    return;
  }
  bank.recovery = { stage: 'sending', email: addr, note: '' };
  bump();
  try {
    const c = await cloud();
    if (!c) throw new Error('no connection: logging in needs the internet');
    const authMod = await import('firebase/auth');
    await authMod.sendSignInLinkToEmail(c.auth, addr, { url: loginUrl(), handleCodeInApp: true });
    try {
      localStorage.setItem('vrfish.login-email', addr);
    } catch {
      /* login.html will ask */
    }
    bank.recovery = { stage: 'sent', email: addr, note: '' };
  } catch (err) {
    const code = String((err as { code?: string })?.code ?? '');
    const note = code.includes('operation-not-allowed')
      ? 'email sign-in is not switched on yet'
      : code.includes('unauthorized-continue-uri') || code.includes('invalid-continue-uri')
        ? 'this address is not on the sign-in allow-list yet'
        : String((err as Error)?.message ?? err).slice(0, 90);
    bank.recovery = { stage: 'failed', email: addr, note };
  }
  bump();
}

/** LOG IN, step two: the code from the phone → this headset becomes the account, and restarts as it. */
export async function redeemCode(code: string): Promise<void> {
  const digits = code.replace(/\D/g, '');
  if (digits.length !== 6) {
    bank.recovery = { ...bank.recovery, stage: 'failed', note: 'the code is six digits' };
    bump();
    return;
  }
  bank.recovery = { ...bank.recovery, stage: 'redeeming', note: '' };
  bump();
  try {
    const reply = await call<{ token: string; uid: string }>('/redeem', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: digits }),
    });
    if (reply.token.startsWith('dev:')) throw new Error('the bank is in dev mode: no cloud account to log in to');
    const c = await cloud();
    if (!c) throw new Error('no connection');
    const authMod = await import('firebase/auth');
    await authMod.signInWithCustomToken(c.auth, reply.token);
    // the next boot takes the account's save, whatever this headset had
    markAdopt();
    bank.recovery = { ...bank.recovery, stage: 'done', note: '' };
    bump();
    setTimeout(() => location.reload(), 1800);
  } catch (err) {
    bank.recovery = { ...bank.recovery, stage: 'failed', note: String((err as Error)?.message ?? err).slice(0, 90) };
    bump();
  }
}

export function cancelRecovery(): void {
  bank.recovery = { stage: 'idle', email: '', note: '' };
  bump();
}

/** At boot: open the cloud, claim anything bought while the game was off, learn the account. */
export async function bootBank(): Promise<void> {
  await cloud();
  void loadPacks();
  await claimPurchases();
  await whoami();
}
