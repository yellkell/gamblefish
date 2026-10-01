/**
 * THE ISLAND BANK: coins for real money, and the account that keeps them.
 * Ported from FIRE FIGHT 2's bank (ff2/server/bank.mjs); it runs alone on
 * Render as `gamblefish-bank`.
 *
 * The headset never touches a card and never says how many coins it has
 * bought. It asks here for a CHECKOUT (a Stripe-hosted page), you pay on your
 * phone, Stripe tells this server it was paid (a signed webhook), this server
 * writes the coins into THE LEDGER, and the headset CLAIMS them:
 *
 *   GET  /            the catalogue: mode, currency, packs      (public)
 *   POST /checkout    {pack} → {id, url, short, pack}           (signed)
 *   GET  /go/<code>   the short link → 302 to the checkout      (public)
 *   POST /webhook     Stripe's word that a session was paid     (Stripe)
 *   POST /claim       {} → {coins, credit, claimed, email}      (signed)
 *   GET  /whoami      {uid, protected, email (masked)}          (signed)
 *   POST /protect     {email} → attach it to this uid           (signed)
 *   POST /restore     {email, receipt} → {token, uid, purchases}: LOG IN with the receipt number
 *                     on a Stripe receipt for that email (no email sent, no phone)
 *   POST /handoff     {} → {code, purchases, token?} for a new headset to redeem (signed)
 *   POST /redeem      {code} → {token} that signs it in as you  (public, throttled)
 *   GET  /save        {data, at} — this account's game save     (signed)
 *   POST /save        {data, at} → keep it                      (signed)
 *
 * SIGNED means a Firebase ID token in `Authorization: Bearer …`, verified here
 * with the service account that writes the ledger. The uid in the token is the
 * uid that is credited, and nothing the client sends can name another.
 *
 * LOGGING IN WITH THE EMAIL YOU PAID WITH. The email link (login.html) signs the
 * phone in as whichever uid wears that email, and if none does, Firebase makes a
 * new, empty one. A player who paid but never tapped SAVE MY PURCHASES has no uid
 * wearing their email: their purchases sit under an anonymous uid, with the email
 * Stripe took at checkout written beside them in the ledger. So /handoff, asked by
 * a phone that has just proved it owns an email (a verified email in its token)
 * and that holds no purchases of its own, looks the email up in the ledger and
 * hands off the account that paid with it instead, moving the email onto it so
 * the next LOG IN goes straight there. No purchases anywhere for that email, on a
 * brand-new uid, and it says so rather than handing the headset an empty account.
 *
 * THE LEDGER is `bank/{uid}` in Firestore: `credit` (what Stripe has been paid
 * for, ever), `claimed` (what the headset has collected), and one receipt per
 * checkout session, so a webhook Stripe retries credits nothing twice. Claiming
 * is a transaction: owed = credit − claimed, and claimed becomes credit in the
 * same write.
 *
 * THE SAVE is `saves/{uid}`: the whole game (wallet, backpack, catch log,
 * upgrades) as the headset last sent it. The account is what carries a
 * player's purchases to a new headset. Sign in there and the save comes back,
 * with every coin bought and not yet spent.
 *
 * MODES. With STRIPE_SECRET_KEY + FIREBASE_SERVICE_ACCOUNT set this is a bank
 * ('live' with an sk_live key, 'test' with sk_test, which takes Stripe's test
 * cards and no real money). With either missing, on a laptop, it is 'dev': the
 * checkout is a page this server serves with one PAY button, the ledger is in
 * memory, and an unsigned `x-dev-uid` header stands in for a token. On Render
 * (which sets RENDER) a bank without its secrets is CLOSED and answers 503: a
 * dev-mode PAY button must never be reachable on a public host.
 *
 *   STRIPE_SECRET_KEY        sk_test_… / sk_live_…
 *   STRIPE_WEBHOOK_SECRET    whsec_… for this server's /webhook
 *   FIREBASE_SERVICE_ACCOUNT the service-account JSON (raw or base64)
 *   BANK_CURRENCY            ISO code, default usd
 *   PUBLIC_URL               where paid.html lives (default https://gamblefish.web.app)
 *   RETURN_URLS              other addresses the game is served from, comma-separated: a
 *                            checkout started there returns there (default the GitHub Pages copy)
 *   BANK_TAX_CODE            the packs' Stripe tax code (default txcd_10201000, downloaded video games)
 *   BANK_DEV=1               force dev mode (never on a public host)
 */

import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { callerOf, RedeemGuard, returnBase } from './guards.mjs';

const PORT = Number(process.env.PORT || 8792);
const CURRENCY = (process.env.BANK_CURRENCY || 'usd').toLowerCase();
const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://gamblefish.web.app').replace(/\/$/, '');
/** Every address a checkout may return to (see guards.mjs). */
const RETURN_URLS = [PUBLIC_URL, ...(process.env.RETURN_URLS ?? 'https://yellkell.github.io/gamblefish').split(',')].map((u) => u.trim()).filter(Boolean);
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const FORCE_DEV = process.env.BANK_DEV === '1';
/** The packs' Stripe tax code: video games, downloaded, permanent rights (the same as ff2's coins). */
const TAX_CODE = process.env.BANK_TAX_CODE || 'txcd_10201000';
/** Stripe's minimum session life is 30 minutes; the client calls it expired at 25. */
const SESSION_TTL_MS = 35 * 60 * 1000;
const MAX_OPEN_PER_UID = 6;
/** A save is a few KB; this is a generous ceiling, not a target. */
const MAX_SAVE_BYTES = 200 * 1024;

/**
 * THE PACKS. The server's list is the one that charges; the client's copy
 * (src/net/bank.ts FALLBACK_PACKS) is only what the board draws before this
 * answers. `minor` is the price in the currency's minor unit.
 */
export const PACKS = [
  { id: 'pouch', coins: 3500, minor: 199 },
  { id: 'purse', coins: 9000, minor: 449 },
  { id: 'chest', coins: 21000, minor: 899, best: true },
  { id: 'vault', coins: 50000, minor: 1799 },
];

const packName = (pack) => `Support Fish & Chips: ${pack.coins.toLocaleString('en-US')} coins as thanks`;

/* ── the ledger ──────────────────────────────────────────────────────── */

/** Dev only: forgets everything on restart. */
class MemoryLedger {
  persistent = false;
  accounts = new Map(); // uid → { credit, claimed, receipts: Map, lastEmail, emails: Set, at }
  saves = new Map(); // uid → { data, at }
  account(uid) {
    let a = this.accounts.get(uid);
    if (!a) {
      a = { credit: 0, claimed: 0, receipts: new Map(), lastEmail: '', emails: new Set(), at: 0 };
      this.accounts.set(uid, a);
    }
    return a;
  }
  async credit(uid, receipt, coins, meta) {
    const a = this.account(uid);
    if (a.receipts.has(receipt)) return { credited: false, duplicate: true, credit: a.credit };
    a.receipts.set(receipt, { coins, ...meta, at: Date.now() });
    a.credit += coins;
    a.at = Date.now();
    if (meta.email) {
      a.lastEmail = meta.email;
      a.emails.add(meta.email);
    }
    return { credited: true, credit: a.credit };
  }
  async creditOf(uid) {
    return this.accounts.get(uid)?.credit ?? 0;
  }
  /** An email the account's owner gave it (SAVE MY PURCHASES), beside the ones it paid with. */
  async noteEmail(uid, email) {
    this.account(uid).emails.add(email);
  }
  /** The payments credited to an account: {id (the checkout session), ...what settle noted}. */
  async receiptsOf(uid) {
    return [...(this.accounts.get(uid)?.receipts ?? new Map())].map(([id, r]) => ({ id, ...r }));
  }
  async byEmail(email) {
    const out = [];
    for (const [uid, a] of this.accounts) if (a.emails.has(email) || a.lastEmail === email) out.push({ uid, credit: a.credit, at: a.at });
    return out.sort((x, y) => y.at - x.at);
  }
  async claim(uid) {
    const a = this.account(uid);
    const owed = Math.max(0, a.credit - a.claimed);
    a.claimed = a.credit;
    return { coins: owed, credit: a.credit, claimed: a.claimed, email: a.lastEmail };
  }
  async getSave(uid) {
    return this.saves.get(uid) ?? null;
  }
  async putSave(uid, data, at) {
    const prev = this.saves.get(uid);
    if (prev && prev.at > at) return { kept: false, at: prev.at };
    this.saves.set(uid, { data, at });
    return { kept: true, at };
  }
}

/** The real thing: `bank/{uid}` + receipts, and `saves/{uid}`. */
class FirestoreLedger {
  persistent = true;
  constructor(db, FieldValue) {
    this.db = db;
    this.FieldValue = FieldValue;
  }
  async credit(uid, receipt, coins, meta) {
    const acct = this.db.collection('bank').doc(uid);
    const rcpt = acct.collection('receipts').doc(receipt);
    return this.db.runTransaction(async (tx) => {
      const r = await tx.get(rcpt);
      const a = await tx.get(acct);
      const prev = a.exists ? a.data() : {};
      if (r.exists) return { credited: false, duplicate: true, credit: prev.credit ?? 0 };
      const credit = (prev.credit ?? 0) + coins;
      tx.set(rcpt, { coins, ...meta, at: Date.now() });
      tx.set(acct, { credit, claimed: prev.claimed ?? 0, at: Date.now(), lastEmail: meta.email || prev.lastEmail || '', ...(meta.email ? { emails: this.FieldValue.arrayUnion(meta.email) } : {}) }, { merge: true });
      return { credited: true, credit };
    });
  }
  async creditOf(uid) {
    const a = await this.db.collection('bank').doc(uid).get();
    return a.exists ? (a.data().credit ?? 0) : 0;
  }
  /** An email the account's owner gave it (SAVE MY PURCHASES), beside the ones it paid with. */
  async noteEmail(uid, email) {
    await this.db.collection('bank').doc(uid).set({ emails: this.FieldValue.arrayUnion(email) }, { merge: true });
  }
  /** The payments credited to an account: {id (the checkout session), ...what settle noted}. */
  async receiptsOf(uid) {
    const snap = await this.db.collection('bank').doc(uid).collection('receipts').limit(50).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  /** Every account that paid with this email, newest purchase first. `emails` is every checkout's; older accounts only have `lastEmail`. */
  async byEmail(email) {
    const bank = this.db.collection('bank');
    const snaps = await Promise.all([bank.where('emails', 'array-contains', email).limit(10).get(), bank.where('lastEmail', '==', email).limit(10).get()]);
    const found = new Map();
    for (const snap of snaps) for (const d of snap.docs) found.set(d.id, { uid: d.id, credit: d.data().credit ?? 0, at: d.data().at ?? 0 });
    return [...found.values()].sort((x, y) => y.at - x.at);
  }
  async claim(uid) {
    const acct = this.db.collection('bank').doc(uid);
    return this.db.runTransaction(async (tx) => {
      const a = await tx.get(acct);
      if (!a.exists) return { coins: 0, credit: 0, claimed: 0, email: '' };
      const { credit = 0, claimed = 0, lastEmail = '' } = a.data();
      const owed = Math.max(0, credit - claimed);
      if (owed > 0) tx.update(acct, { claimed: credit, claimedAt: Date.now() });
      return { coins: owed, credit, claimed: credit, email: lastEmail };
    });
  }
  async getSave(uid) {
    const s = await this.db.collection('saves').doc(uid).get();
    return s.exists ? { data: s.data().data, at: s.data().at } : null;
  }
  async putSave(uid, data, at) {
    const ref = this.db.collection('saves').doc(uid);
    return this.db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      // an older save arriving late (a flaky connection) never overwrites a newer one
      if (s.exists && (s.data().at ?? 0) > at) return { kept: false, at: s.data().at };
      tx.set(ref, { data, at, savedAt: Date.now() });
      return { kept: true, at };
    });
  }
}

/** Open the ledger: Firestore with a service account, memory without. */
async function openLedger() {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) return { ledger: new MemoryLedger(), auth: null };
  try {
    const json = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    const { initializeApp, cert, getApps } = await import('firebase-admin/app');
    const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
    const { getAuth } = await import('firebase-admin/auth');
    const app = getApps()[0] ?? initializeApp({ credential: cert(json), projectId: json.project_id });
    return { ledger: new FirestoreLedger(getFirestore(app), FieldValue), auth: getAuth(app) };
  } catch (err) {
    console.error(`[bank] FIREBASE_SERVICE_ACCOUNT unusable (${err?.message ?? err}) — memory ledger`);
    return { ledger: new MemoryLedger(), auth: null };
  }
}

const { ledger, auth } = await openLedger();

/* ── stripe ──────────────────────────────────────────────────────────── */

let stripe = null;
if (STRIPE_KEY && !FORCE_DEV) {
  if (!ledger.persistent) {
    console.error('[bank] STRIPE_SECRET_KEY is set but there is no ledger to write — refusing to take money. Set FIREBASE_SERVICE_ACCOUNT.');
  } else {
    try {
      const { default: Stripe } = await import('stripe');
      stripe = new Stripe(STRIPE_KEY);
      if (!WEBHOOK_SECRET) console.error('[bank] STRIPE_WEBHOOK_SECRET is not set — paid sessions will not be credited until it is.');
    } catch (err) {
      console.error(`[bank] the stripe package is not available (${err?.message ?? err})`);
    }
  }
}

const DEV_ALLOWED = FORCE_DEV || !process.env.RENDER;
export const MODE = stripe ? (STRIPE_KEY.startsWith('sk_live') ? 'live' : 'test') : DEV_ALLOWED ? 'dev' : 'closed';
const DEV = MODE === 'dev';
const CLOSED = MODE === 'closed';
/** Why it is closed, in words the board can show: which secret is missing, never a secret. */
const CLOSED_WHY = !CLOSED
  ? ''
  : !STRIPE_KEY
    ? 'no Stripe key on the server yet'
    : !ledger.persistent
      ? 'the server has a Stripe key but no usable Firebase service account'
      : 'the Stripe library failed to load on the server';

console.log(
  CLOSED
    ? `[bank] CLOSED — ${CLOSED_WHY}. Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and FIREBASE_SERVICE_ACCOUNT.`
    : `[bank] open — ${MODE} mode, ${ledger.persistent ? 'firestore' : 'memory'} ledger, ${CURRENCY.toUpperCase()}`,
);

/* ── sessions, short links, handoffs (memory) ────────────────────────── */

/** id → { uid, pack, coins, url, code, at, paid } */
const sessions = new Map();
/** short code → session id */
const codes = new Map();
/** handoff code → { uid, at } */
const handoffs = new Map();
const HANDOFF_TTL_MS = 10 * 60 * 1000;
const MAX_HANDOFFS_PER_UID = 3;
/** Wrong LOG IN codes, counted so nobody can guess their way into an account. */
const redeemGuard = new RedeemGuard();
/** Wrong receipt numbers, counted the same way. */
const restoreGuard = new RedeemGuard();
/** Dev mode only: email → uid, in place of Firebase Auth. */
const devEmails = new Map();

setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, s] of sessions)
    if (s.at < cutoff) {
      sessions.delete(id);
      codes.delete(s.code);
    }
  const dead = Date.now() - HANDOFF_TTL_MS;
  for (const [code, h] of handoffs) if (h.at < dead) handoffs.delete(code);
}, 60_000).unref();

const EMAIL_OK = /^[^\s@]{1,64}@[^\s@]{1,128}\.[^\s@]{2,24}$/;
const UID_OK = /^[A-Za-z0-9_-]{1,128}$/;

/** a***@example.com: enough to recognise, not enough to harvest. */
function maskEmail(email) {
  if (!email) return '';
  const [user, domain] = email.split('@');
  return `${user.slice(0, 1)}***@${domain ?? ''}`;
}

async function emailOf(uid) {
  if (auth) {
    try {
      return (await auth.getUser(uid)).email ?? '';
    } catch {
      return '';
    }
  }
  for (const [email, owner] of devEmails) if (owner === uid) return email;
  return '';
}

/** The uid wearing an email, or ''. */
async function ownerOf(email) {
  if (auth) return (await auth.getUserByEmail(email).catch(() => null))?.uid ?? '';
  return devEmails.get(email) ?? '';
}

/**
 * Every uid wearing an email in sign-in. Usually one, but Firebase can keep an account per way of
 * signing in, so an email link can make a new one beside the account that SAVE MY PURCHASES put
 * the email on: those are found by going through the accounts (only when the ledger had no answer).
 */
async function holdersOf(email) {
  if (!auth) return devEmails.has(email) ? [devEmails.get(email)] : [];
  const out = new Set();
  const one = await ownerOf(email);
  if (one) out.add(one);
  let token;
  for (let pages = 0; pages < 20; pages++) {
    const page = await auth.listUsers(1000, token);
    for (const u of page.users) if ((u.email ?? '').toLowerCase() === email) out.add(u.uid);
    token = page.pageToken;
    if (!token) break;
  }
  return [...out];
}

/** Nothing bought, nothing saved: an account an email link made and nothing ever used. */
async function isEmpty(uid) {
  return (await ledger.creditOf(uid)) === 0 && !(await ledger.getSave(uid));
}

/** Delete a uid's sign-in (its ledger and save, if any, stay where they are). */
async function dropUser(uid) {
  if (auth) await auth.deleteUser(uid);
  for (const [email, owner] of devEmails) if (owner === uid) devEmails.delete(email);
}

/**
 * Attach an email to a uid (the uid never changes, so nothing moves). 'taken' when another uid
 * wears it, unless that uid is empty (a LOG IN that found nothing): then the email comes here.
 */
async function protect(uid, email, verified = false) {
  const other = await ownerOf(email);
  if (other && other !== uid) {
    if (!(await isEmpty(other))) return { ok: false, taken: true };
    await dropUser(other);
    console.log(`[bank] ${maskEmail(email)} taken back from empty ${other}`);
  }
  if (other === uid && !verified) return { ok: true };
  if (auth) {
    try {
      await auth.updateUser(uid, { email, emailVerified: verified });
    } catch (err) {
      if (err?.code === 'auth/email-already-exists') return { ok: false, taken: true };
      throw err;
    }
  } else devEmails.set(email, uid);
  // and in the ledger, beside the emails it paid with: a LOG IN looks there first
  await ledger.noteEmail(uid, email).catch((err) => console.error(`[bank] could not note ${maskEmail(email)} on ${uid}: ${err?.message ?? err}`));
  return { ok: true };
}

/**
 * Which account a LOG IN hands off (see LOGGING IN WITH THE EMAIL YOU PAID WITH above). `uid` is
 * the phone's, `email` the verified email it signed in with ('' for anything else).
 */
async function loginTarget(uid, email) {
  const credit = await ledger.creditOf(uid);
  if (!email || credit > 0) return { uid, credit };
  // the account that paid with this email, or had it given at SAVE MY PURCHASES (the ledger)...
  const payers = await ledger.byEmail(email);
  let to = payers.find((p) => p.uid !== uid && p.credit > 0) ?? null;
  // ...or, failing that, one wearing it in sign-in that has coins, or else a game saved
  const holders = to ? [] : (await holdersOf(email)).filter((h) => h !== uid);
  for (const h of holders) {
    const c = await ledger.creditOf(h);
    if (c > 0) {
      to = { uid: h, credit: c };
      break;
    }
  }
  if (!to && (await ledger.getSave(uid))) return { uid, credit };
  if (!to)
    for (const h of holders)
      if (await ledger.getSave(h)) {
        to = { uid: h, credit: 0 };
        break;
      }
  if (!to) {
    console.log(`[bank] LOG IN with ${maskEmail(email)} found nothing: ${payers.length} in the ledger with it, ${holders.length} other sign-ins wearing it`);
    // a brand-new uid the link just made: gone again, so the email stays free for SAVE MY PURCHASES
    await dropUser(uid).catch((err) => console.error(`[bank] could not drop ${uid}: ${err?.message ?? err}`));
    return { uid: '', credit: 0 };
  }
  // this uid has nothing: it goes, and the email moves to the account (unless that one already has an email of its own)
  try {
    if (await isEmpty(uid)) await dropUser(uid);
    if (!(await emailOf(to.uid))) await protect(to.uid, email, true);
  } catch (err) {
    console.error(`[bank] could not move ${maskEmail(email)} from ${uid} to ${to.uid}: ${err?.message ?? err}`);
  }
  console.log(`[bank] LOG IN with ${maskEmail(email)} → ${to.uid} (${to.credit ? 'paid' : 'saved'}; ${uid} had nothing)`);
  return { uid: to.uid, credit: to.credit, moved: true };
}

/** A receipt number as typed or printed ("#1234-5678", "1234 5678"): its letters and digits. */
const receiptKey = (r) => String(r ?? '').replace(/[^0-9a-z]/gi, '').toLowerCase();

/**
 * The number on a payment's Stripe receipt ("Receipt #1234-5678"): Stripe gives it to the charge
 * when it emails the receipt, so it's asked for, not kept. ('' when there's none: no receipt sent.)
 * The development bank's payments carry their own.
 */
async function receiptNumberOf(r) {
  if (r.receiptNumber) return String(r.receiptNumber);
  if (!stripe || !String(r.id).startsWith('cs_')) return '';
  try {
    const session = await stripe.checkout.sessions.retrieve(r.id, { expand: ['payment_intent.latest_charge'] });
    return String(session.payment_intent?.latest_charge?.receipt_number ?? '');
  } catch (err) {
    console.error(`[bank] could not read the receipt of ${r.id}: ${err?.message ?? err}`);
    return '';
  }
}

/**
 * LOG IN by receipt: the account that paid with `email` in the payment whose receipt carries
 * `receipt`. Proof enough that it's yours (you have the receipt Stripe emailed you), with no email
 * of ours to send: Firebase's sign-in emails have a small daily allowance.
 */
async function restoreTarget(email, receipt) {
  const want = receiptKey(receipt);
  if (!want) return null;
  for (const p of await ledger.byEmail(email)) {
    if (!(p.credit > 0)) continue;
    for (const r of await ledger.receiptsOf(p.uid)) {
      // (a payment made with another email than this one doesn't prove this one)
      if (r.email && r.email !== email) continue;
      if (receiptKey(await receiptNumberOf(r)) === want) return { uid: p.uid, credit: p.credit };
    }
  }
  return null;
}

function newHandoff(uid) {
  let live = 0;
  for (const h of handoffs.values()) if (h.uid === uid) live++;
  if (live >= MAX_HANDOFFS_PER_UID) return null;
  let code = '';
  do code = String(100000 + (randomBytes(4).readUInt32BE(0) % 900000));
  while (handoffs.has(code));
  handoffs.set(code, { uid, at: Date.now() });
  return code;
}

function newCode() {
  let code = '';
  do code = randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').slice(0, 8);
  while (codes.has(code));
  return code;
}

function openFor(uid) {
  let n = 0;
  for (const s of sessions.values()) if (s.uid === uid && !s.paid) n++;
  return n;
}

function selfBase(req) {
  const proto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() || 'http';
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? `localhost:${PORT}`;
  return `${proto}://${host}`;
}

/* ── identity ────────────────────────────────────────────────────────── */

/** A token's email, only when Firebase has seen it proved (an email link was opened). */
function verifiedEmail(claims) {
  const email = String(claims.email ?? '').trim().toLowerCase();
  return claims.email_verified === true && EMAIL_OK.test(email) ? email : '';
}

/**
 * Who is behind a request: {uid, email} (email '' unless verified), or null. Dev mode trusts an
 * unverified token, or an `x-dev-uid` with an `x-dev-email` standing in for an opened email link.
 */
async function whoIs(req) {
  const bearer = String(req.headers.authorization ?? '');
  const token = bearer.startsWith('Bearer ') ? bearer.slice(7).trim() : '';
  if (token) {
    if (auth) {
      try {
        const decoded = await auth.verifyIdToken(token);
        return UID_OK.test(decoded.uid) ? { uid: decoded.uid, email: verifiedEmail(decoded) } : null;
      } catch {
        return null;
      }
    }
    if (DEV) {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
        const uid = String(payload.sub ?? payload.user_id ?? '');
        return UID_OK.test(uid) ? { uid, email: verifiedEmail(payload) } : null;
      } catch {
        return null;
      }
    }
    return null;
  }
  if (DEV) {
    const dev = String(req.headers['x-dev-uid'] ?? '');
    if (UID_OK.test(dev)) return { uid: dev, email: verifiedEmail({ email: req.headers['x-dev-email'], email_verified: true }) };
  }
  return null;
}

/* ── http helpers ────────────────────────────────────────────────────── */

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function html(res, status, body) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
}

function readRaw(req, max = 64 * 1024) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > max) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(null));
  });
}

async function readBody(req, max = 8 * 1024) {
  const raw = await readRaw(req, max);
  if (!raw) return null;
  const text = raw.toString('utf8');
  if (String(req.headers['content-type'] ?? '').includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(text));
  try {
    return JSON.parse(text || '{}');
  } catch {
    return null;
  }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function price(minor) {
  const sym = { usd: '$', gbp: '£', eur: '€' }[CURRENCY] ?? `${CURRENCY.toUpperCase()} `;
  return `${sym}${(minor / 100).toFixed(2)}`;
}

/* ── the checkout ────────────────────────────────────────────────────── */

async function createCheckout(req, uid, pack, home) {
  const code = newCode();
  const base = selfBase(req);
  const back = returnBase(home, RETURN_URLS, PUBLIC_URL);
  let id;
  let url;
  if (stripe) {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: uid,
      // `app` tells this bank's webhook the session is ours: the Stripe account is shared with
      // ff2's bank, and Stripe sends every account's checkout events to every endpoint
      metadata: { app: 'gamblefish', uid, pack: pack.id, coins: String(pack.coins) },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            unit_amount: pack.minor,
            // the account runs Stripe Tax, which refuses a product without a tax code;
            // the price on the board is what the buyer pays
            tax_behavior: 'inclusive',
            product_data: {
              name: packName(pack),
              description: 'Thank you for supporting Fish & Chips. Your coins are for play only: no cash value, cannot be withdrawn or exchanged. 18+.',
              tax_code: TAX_CODE,
            },
          },
        },
      ],
      success_url: `${back}/paid.html?s={CHECKOUT_SESSION_ID}`,
      cancel_url: `${back}/paid.html?cancel=1`,
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    });
    id = session.id;
    url = session.url;
  } else {
    id = `dev_${code}`;
    url = `${base}/dev-pay?s=${id}`;
  }
  sessions.set(id, { uid, pack: pack.id, coins: pack.coins, url, code, at: Date.now(), paid: false });
  codes.set(code, id);
  return { id, url, short: `${base}/go/${code}`, pack };
}

async function settle(id, uid, coins, meta) {
  const s = sessions.get(id);
  if (s) s.paid = true;
  const out = await ledger.credit(uid, id, coins, meta);
  console.log(`[bank] ${out.duplicate ? 'replayed' : 'paid'} ${id} → ${uid} +${coins} (credit ${out.credit})`);
  return out;
}

async function handleWebhook(req, res) {
  if (!stripe) return json(res, 503, { error: 'no stripe in dev mode' });
  const raw = await readRaw(req, 256 * 1024);
  if (!raw) return json(res, 400, { error: 'bad body' });
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, String(req.headers['stripe-signature'] ?? ''), WEBHOOK_SECRET);
  } catch (err) {
    console.error(`[bank] webhook refused: ${err?.message ?? err}`);
    return json(res, 400, { error: 'bad signature' });
  }
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const s = event.data.object;
    if (s.metadata?.app !== 'gamblefish') return json(res, 200, { received: true, ignored: 'not a gamblefish checkout' });
    if (s.payment_status === 'paid') {
      const uid = String(s.metadata?.uid ?? s.client_reference_id ?? '');
      const coins = Number(s.metadata?.coins ?? 0);
      if (UID_OK.test(uid) && Number.isInteger(coins) && coins > 0 && coins <= 100000) {
        const email = String(s.customer_details?.email ?? '').trim().toLowerCase();
        await settle(s.id, uid, coins, { pack: String(s.metadata?.pack ?? ''), amount: s.amount_total ?? 0, currency: s.currency ?? CURRENCY, event: event.id, email: EMAIL_OK.test(email) ? email : '' });
        // and a receipt, whatever the account's email settings: its number is what LOG IN BY
        // RECEIPT asks for (Stripe numbers a payment only once it has emailed a receipt for it)
        if (EMAIL_OK.test(email) && typeof s.payment_intent === 'string')
          await stripe.paymentIntents.update(s.payment_intent, { receipt_email: email }).catch((err) => console.error(`[bank] no receipt for ${s.id}: ${err?.message ?? err}`));
      } else console.error(`[bank] paid session ${s.id} carries no usable uid/coins — not credited`);
    }
  }
  return json(res, 200, { received: true });
}

function devPayPage(req, s, id, paid) {
  const pack = PACKS.find((p) => p.id === s.pack) ?? { coins: s.coins, minor: 0 };
  const body = paid
    ? `<h1>PAID</h1><p class="big">+${pack.coins}</p><p>are on their way to the headset. You can close this.</p>`
    : `<h1>TEST BANK</h1><p class="big">+${pack.coins}</p><p>${esc(packName(pack))} · ${esc(price(pack.minor))} · <em>no real charge: this is the development bank</em></p>
       <form method="post" action="/dev-pay"><input type="hidden" name="s" value="${esc(id)}"><button>PAY</button></form>`;
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fish & Chips: test bank</title>
<style>body{margin:0;background:#0c1418;color:#eaf4f8;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;text-align:center}
main{padding:32px}h1{color:#ffb000;letter-spacing:.08em}.big{font-size:3rem;font-weight:800;margin:.2em 0}
button{font:inherit;font-weight:800;letter-spacing:.1em;padding:18px 48px;border:0;border-radius:12px;background:#ffb000;color:#221302;font-size:1.2rem}
em{color:#3fd6c6;font-style:normal}</style><main>${body}</main>`;
}

/* ── the router ──────────────────────────────────────────────────────── */

/** Run a signed handler: 401 without a valid identity, 502 when the ledger throws. */
function signed(req, res, fn) {
  void (async () => {
    const who = await whoIs(req);
    if (!who) return json(res, 401, { error: 'sign in first' });
    try {
      await fn(who.uid, who.email);
    } catch (err) {
      console.error(`[bank] ${req.method} ${req.url} failed: ${err?.message ?? err}`);
      if (!res.headersSent) json(res, 502, { error: 'the bank is not answering' });
    }
  })();
}

export function handleHttp(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, x-dev-uid, x-dev-email');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'GET' && path === '/health') return json(res, 200, { ok: true, mode: MODE });
  if (CLOSED) return json(res, 503, { error: `the bank is not open yet: ${CLOSED_WHY}`, mode: 'closed' });

  if (req.method === 'GET' && (path === '/' || path === '/packs')) {
    return json(res, 200, { bank: 'gamblefish', mode: MODE, currency: CURRENCY, ledger: ledger.persistent ? 'firestore' : 'memory', packs: PACKS });
  }

  if (req.method === 'POST' && path === '/checkout')
    return signed(req, res, async (uid) => {
      const body = await readBody(req);
      const pack = PACKS.find((p) => p.id === body?.pack);
      if (!pack) return json(res, 400, { error: 'no such pack' });
      if (openFor(uid) >= MAX_OPEN_PER_UID) return json(res, 429, { error: 'too many open checkouts: pay or wait' });
      json(res, 200, await createCheckout(req, uid, pack, body?.home));
    });

  if (req.method === 'POST' && path === '/claim') return signed(req, res, async (uid) => json(res, 200, await ledger.claim(uid)));

  if (req.method === 'POST' && path === '/webhook') {
    void handleWebhook(req, res);
    return;
  }

  if (req.method === 'GET' && path === '/whoami')
    return signed(req, res, async (uid) => {
      const email = await emailOf(uid);
      json(res, 200, { uid, protected: !!email, email: maskEmail(email) });
    });

  if (req.method === 'POST' && path === '/protect')
    return signed(req, res, async (uid) => {
      const body = await readBody(req);
      const email = String(body?.email ?? '').trim().toLowerCase();
      if (!EMAIL_OK.test(email)) return json(res, 400, { error: 'that is not an email address' });
      const out = await protect(uid, email);
      if (!out.ok) return json(res, 409, { error: 'that email already has an account. LOG IN with it instead', taken: true });
      console.log(`[bank] ${uid} protected with ${maskEmail(email)}`);
      json(res, 200, { protected: true, email: maskEmail(email) });
    });

  if (req.method === 'POST' && path === '/handoff')
    return signed(req, res, async (uid, email) => {
      const to = await loginTarget(uid, email);
      if (!to.uid) return json(res, 404, { error: 'no coins were bought with that email and no game is saved to it. Try the email on your Stripe receipt', empty: true });
      const code = newHandoff(to.uid);
      if (!code) return json(res, 429, { error: 'too many codes on the go: wait ten minutes' });
      const reply = { code, ttl: HANDOFF_TTL_MS, purchases: to.credit };
      // the phone signed in as a uid that isn't the account: this signs its browser in as the account too
      if (to.moved) reply.token = auth ? await auth.createCustomToken(to.uid) : `dev:${to.uid}`;
      json(res, 200, reply);
    });

  if (req.method === 'POST' && path === '/redeem') {
    void (async () => {
      const who = callerOf(req);
      const refused = redeemGuard.refuse(who);
      if (refused) return json(res, 429, { error: refused });
      const body = await readBody(req);
      const code = String(body?.code ?? '').trim();
      const h = /^\d{6}$/.test(code) ? handoffs.get(code) : undefined;
      if (!h || h.at < Date.now() - HANDOFF_TTL_MS) {
        redeemGuard.miss(who);
        return json(res, 404, { error: 'no such code: it may have expired' });
      }
      handoffs.delete(code); // once
      try {
        const token = auth ? await auth.createCustomToken(h.uid) : `dev:${h.uid}`;
        console.log(`[bank] handoff redeemed → ${h.uid}`);
        json(res, 200, { token, uid: h.uid });
      } catch (err) {
        console.error(`[bank] redeem failed: ${err?.message ?? err}`);
        json(res, 502, { error: 'the account service is not answering' });
      }
    })();
    return;
  }

  if (req.method === 'POST' && path === '/restore') {
    void (async () => {
      const who = callerOf(req);
      // (a receipt number is short: as with the codes, nobody guesses their way in)
      const refused = restoreGuard.refuse(who);
      if (refused) return json(res, 429, { error: refused });
      const body = await readBody(req);
      const email = String(body?.email ?? '').trim().toLowerCase();
      if (!EMAIL_OK.test(email)) return json(res, 400, { error: 'that is not an email address' });
      try {
        const to = await restoreTarget(email, body?.receipt);
        if (!to) {
          restoreGuard.miss(who);
          console.log(`[bank] restore with ${maskEmail(email)}: no payment with that receipt`);
          return json(res, 404, { error: 'no payment with that email has that receipt number' });
        }
        const token = auth ? await auth.createCustomToken(to.uid) : `dev:${to.uid}`;
        console.log(`[bank] restore with ${maskEmail(email)} → ${to.uid}`);
        json(res, 200, { token, uid: to.uid, purchases: to.credit });
      } catch (err) {
        console.error(`[bank] restore failed: ${err?.message ?? err}`);
        json(res, 502, { error: 'the account service is not answering' });
      }
    })();
    return;
  }

  if (path === '/save') {
    if (req.method === 'GET') return signed(req, res, async (uid) => json(res, 200, (await ledger.getSave(uid)) ?? { data: null, at: 0 }));
    if (req.method === 'POST')
      return signed(req, res, async (uid) => {
        const body = await readBody(req, MAX_SAVE_BYTES);
        const at = Number(body?.at);
        const data = body?.data;
        if (!body || typeof data !== 'string' || data.length > MAX_SAVE_BYTES || !Number.isFinite(at) || at <= 0) return json(res, 400, { error: 'bad save' });
        try {
          JSON.parse(data);
        } catch {
          return json(res, 400, { error: 'bad save' });
        }
        json(res, 200, await ledger.putSave(uid, data, at));
      });
  }

  const go = path.match(/^\/go\/([A-Za-z0-9]{6,12})$/);
  if (req.method === 'GET' && go) {
    const id = codes.get(go[1]);
    const s = id && sessions.get(id);
    if (!s) return html(res, 404, '<!doctype html><meta charset="utf-8"><title>expired</title><p style="font-family:system-ui;padding:32px">This checkout link has expired. Start another at the Island Bank.');
    res.writeHead(302, { location: s.url, 'cache-control': 'no-store' });
    res.end();
    return;
  }

  if (DEV && path === '/dev-pay') {
    if (req.method === 'GET') {
      const id = url.searchParams.get('s') ?? '';
      const s = sessions.get(id);
      if (!s) return html(res, 404, '<!doctype html><meta charset="utf-8"><p style="font-family:system-ui;padding:32px">No such checkout.');
      return html(res, 200, devPayPage(req, s, id, s.paid));
    }
    if (req.method === 'POST') {
      void (async () => {
        const body = await readBody(req);
        const id = String(body?.s ?? '');
        const s = sessions.get(id);
        if (!s) return json(res, 404, { error: 'no such checkout' });
        // (the development bank's receipt number: a real one is Stripe's, on the receipt it emails)
        const receiptNumber = `${1000 + (randomBytes(2).readUInt16BE(0) % 9000)}-${1000 + (randomBytes(2).readUInt16BE(0) % 9000)}`;
        const out = await settle(id, s.uid, s.coins, { pack: s.pack, amount: PACKS.find((p) => p.id === s.pack)?.minor ?? 0, currency: CURRENCY, event: 'dev', email: String(body?.email ?? ''), receiptNumber });
        if (String(req.headers.accept ?? '').includes('application/json') || String(req.headers['content-type'] ?? '').includes('json')) return json(res, 200, { paid: true, duplicate: !!out.duplicate, credit: out.credit, receiptNumber });
        html(res, 200, devPayPage(req, s, id, true));
      })();
      return;
    }
  }

  json(res, 404, { error: 'not a door' });
}

const server = createServer(handleHttp);
server.on('clientError', (_err, socket) => socket.destroy());
server.listen(PORT, () => console.log(`[bank] listening on :${PORT}`));
