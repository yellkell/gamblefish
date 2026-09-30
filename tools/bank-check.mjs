#!/usr/bin/env node
/**
 * THE ISLAND BANK — headless. Starts server/bank.mjs in its dev mode (memory ledger, no
 * Stripe, an `x-dev-uid` header for a player) on a spare port and walks it over HTTP: packs,
 * checkouts, paying, claiming (once), the short links, the save (newer wins), handing an
 * account to a new headset (by the email it was saved to, or the one it was paid with), and
 * the throttle that stops anyone guessing a LOG IN code. Then the guards themselves
 * (server/guards.mjs) on a stopped clock.
 *
 *   node tools/bank-check.mjs
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { REDEEM_OVERALL, REDEEM_PER_CALLER, RedeemGuard, returnBase } from '../server/guards.mjs';

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? ` — ${detail}` : ''}`);
};

/* ── the guards, on a stopped clock ─────────────────────────────────── */

console.log('\nthe redeem guard');
{
  let t = 1_000_000;
  const g = new RedeemGuard({ now: () => t });
  for (let i = 0; i < REDEEM_PER_CALLER; i++) g.miss('a');
  check(`a caller is stopped after ${REDEEM_PER_CALLER} wrong codes`, g.refuse('a') !== '');
  check('another caller is not', g.refuse('b') === '');
  t += 10 * 60 * 1000 + 1;
  check('ten minutes on, the caller may try again', g.refuse('a') === '');
  for (let i = 0; i < REDEEM_OVERALL; i++) g.miss(`caller-${i}`);
  check(`${REDEEM_OVERALL} wrong codes in a minute from ${REDEEM_OVERALL} callers stop everyone`, g.refuse('fresh') !== '');
  t += 60 * 1000 + 1;
  check('a minute on, the bank takes codes again', g.refuse('fresh') === '');
  check('the guard forgets callers whose misses have aged out', (t += 10 * 60 * 1000 + 1, g.refuse('x'), g.callers.size === 0));
}

console.log('\nwhere a checkout returns');
{
  const allowed = ['https://gamblefish.web.app', 'https://yellkell.github.io/gamblefish'];
  const fallback = 'https://gamblefish.web.app';
  check('the GitHub Pages copy returns to itself', returnBase('https://yellkell.github.io/gamblefish/', allowed, fallback) === 'https://yellkell.github.io/gamblefish');
  check('the Firebase copy returns to itself', returnBase('https://gamblefish.web.app/', allowed, fallback) === 'https://gamblefish.web.app');
  check('an address off the list goes to PUBLIC_URL', returnBase('https://evil.example/', allowed, fallback) === fallback);
  check('a lookalike path is off the list', returnBase('https://yellkell.github.io/gamblefish/../other', allowed, fallback) === fallback);
  check('no address at all goes to PUBLIC_URL', returnBase(undefined, allowed, fallback) === fallback);
}

/* ── the server, over HTTP ──────────────────────────────────────────── */

const port = 20000 + Math.floor(Math.random() * 20000);
const env = { ...process.env, PORT: String(port), BANK_DEV: '1', STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', FIREBASE_SERVICE_ACCOUNT: '' };
delete env.RENDER;
const server = spawn(process.execPath, [fileURLToPath(new URL('../server/bank.mjs', import.meta.url))], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stdout.on('data', (d) => (log += d));
server.stderr.on('data', (d) => (log += d));
const stop = () => server.kill();
process.on('exit', stop);

await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`the bank did not start:\n${log}`)), 15_000);
  server.stdout.on('data', () => {
    if (log.includes('listening')) {
      clearTimeout(t);
      resolve();
    }
  });
  server.on('exit', (code) => reject(new Error(`the bank exited (${code}):\n${log}`)));
});

const base = `http://127.0.0.1:${port}`;
const as = (uid, extra = {}) => ({ 'content-type': 'application/json', 'x-dev-uid': uid, ...extra });
async function req(path, { method = 'GET', headers = {}, body, redirect } = {}) {
  const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: res.status, json, headers: res.headers };
}

console.log('\nthe catalogue');
{
  const r = await req('/');
  check('GET / answers in dev mode with a memory ledger', r.status === 200 && r.json?.mode === 'dev' && r.json?.ledger === 'memory', `${r.json?.mode}, ${r.json?.ledger}`);
  check('four packs, one flagged best value', r.json?.packs?.length === 4 && r.json.packs.filter((p) => p.best).length === 1);
  const h = await req('/health');
  check('/health answers', h.status === 200 && h.json?.ok === true);
}

console.log('\nbuying');
{
  const anon = await req('/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: { pack: 'pouch' } });
  check('a checkout with nobody signed in is refused', anon.status === 401);
  const bad = await req('/checkout', { method: 'POST', headers: as('buyer'), body: { pack: 'nope' } });
  check('a pack that does not exist is refused', bad.status === 400);
  const co = await req('/checkout', { method: 'POST', headers: as('buyer'), body: { pack: 'purse', home: 'https://yellkell.github.io/gamblefish/' } });
  check('a checkout opens with a URL and a short link', co.status === 200 && !!co.json?.url && /\/go\/[A-Za-z0-9]{8}$/.test(co.json?.short ?? ''), co.json?.short);
  const go = await req(new URL(co.json.short).pathname, { redirect: 'manual' });
  check('the short link sends you to the checkout', go.status === 302 && go.headers.get('location') === co.json.url);
  const gone = await req('/go/zzzzzzzz', { redirect: 'manual' });
  check('an unknown short link says it has expired', gone.status === 404);

  const before = await req('/claim', { method: 'POST', headers: as('buyer'), body: {} });
  check('nothing to claim before paying', before.json?.coins === 0);
  const pay = await req('/dev-pay', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: { s: co.json.id } });
  check('paying credits the pack', pay.json?.paid === true && pay.json?.duplicate === false && pay.json?.credit === 1300, `credit ${pay.json?.credit}`);
  const again = await req('/dev-pay', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: { s: co.json.id } });
  check('the same payment told twice credits nothing more', again.json?.duplicate === true && again.json?.credit === 1300);
  const other = await req('/claim', { method: 'POST', headers: as('someone-else'), body: {} });
  check("another player can't claim it", other.json?.coins === 0);
  const claim = await req('/claim', { method: 'POST', headers: as('buyer'), body: {} });
  check('the buyer claims it', claim.json?.coins === 1300, `${claim.json?.coins}`);
  const twice = await req('/claim', { method: 'POST', headers: as('buyer'), body: {} });
  check('and only once', twice.json?.coins === 0);

  let last = 0;
  for (let i = 0; i < 7; i++) last = (await req('/checkout', { method: 'POST', headers: as('hoarder'), body: { pack: 'pouch' } })).status;
  check('no more than six unpaid checkouts at once', last === 429);
}

console.log('\nthe save');
{
  const none = await req('/save', { headers: as('saver') });
  check('a new player has no save', none.status === 200 && none.json?.data === null && none.json?.at === 0);
  const put = await req('/save', { method: 'POST', headers: as('saver'), body: { data: JSON.stringify({ money: 10 }), at: 2000 } });
  check('a save is kept', put.json?.kept === true);
  const old = await req('/save', { method: 'POST', headers: as('saver'), body: { data: JSON.stringify({ money: 1 }), at: 1000 } });
  check('an older save arriving late is not', old.json?.kept === false);
  const got = await req('/save', { headers: as('saver') });
  check('the newer save comes back', got.json?.at === 2000 && JSON.parse(got.json?.data ?? '{}').money === 10);
  const junk = await req('/save', { method: 'POST', headers: as('saver'), body: { data: '{not json', at: 3000 } });
  check('a save that is not JSON is refused', junk.status === 400);
  const anon = await req('/save', { headers: { 'content-type': 'application/json' } });
  check('nobody signed in gets no save', anon.status === 401);
}

console.log('\nlogging in on a new headset');
{
  const hand = async () => (await req('/handoff', { method: 'POST', headers: as('owner'), body: {} })).json?.code;
  const code = await hand();
  check('the phone gets a six-digit code', /^\d{6}$/.test(code ?? ''), code);
  const ok = await req('/redeem', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.1' }, body: { code } });
  check('the code signs the headset in as the owner', ok.status === 200 && ok.json?.uid === 'owner');
  const reuse = await req('/redeem', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.1' }, body: { code } });
  check('a code works once', reuse.status === 404);

  // one caller guessing: eight misses, then stopped, even with a right code
  const wrong = (ip) => req('/redeem', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: { code: '000000' } });
  let misses = 1; // the reused code
  for (let i = 0; i < REDEEM_PER_CALLER; i++, misses++) await wrong('10.0.0.2');
  const good = await hand();
  const guesser = await req('/redeem', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.2' }, body: { code: good } });
  check(`a caller with ${REDEEM_PER_CALLER} wrong codes is stopped, right code or not`, guesser.status === 429, guesser.json?.error);
  const owner = await req('/redeem', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.3' }, body: { code: good } });
  check('someone else can still log in with it', owner.status === 200 && owner.json?.uid === 'owner');

  // many callers guessing: the bank-wide cap stops them all
  let first429 = 0;
  for (let i = 0; i < REDEEM_OVERALL + 5 && !first429; i++) if ((await wrong(`10.1.0.${i}`)).status === 429) first429 = misses + i; // misses before this one
  check(`the bank stops all guessing at ${REDEEM_OVERALL} wrong codes a minute, however many callers`, first429 === REDEEM_OVERALL, `stopped after ${first429}`);
  const late = await hand();
  const fresh = await req('/redeem', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.2.0.1' }, body: { code: late } });
  check('while it is stopped, even a right code waits a minute', fresh.status === 429);
}

console.log('\nlogging in with the email you paid with');
{
  // (the redeem throttle above is still shut: these read the handoff itself, which is what decides the account)
  const hand = (uid, email) => req('/handoff', { method: 'POST', headers: as(uid, email ? { 'x-dev-email': email } : {}), body: {} });
  // bought coins on a headset, never tapped SAVE MY PURCHASES, then lost the headset's save
  const co = await req('/checkout', { method: 'POST', headers: as('lost-headset'), body: { pack: 'chest' } });
  await req('/dev-pay', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: { s: co.json.id, email: 'payer@example.com' } });
  // the email link signs the phone in as a new uid wearing that email
  await req('/protect', { method: 'POST', headers: as('link-made'), body: { email: 'payer@example.com' } });
  const r = await hand('link-made', 'payer@example.com');
  check('a LOG IN with the email you paid with hands off the account that paid', r.status === 200 && /^\d{6}$/.test(r.json?.code ?? '') && r.json?.purchases === 3000, `${r.status} ${JSON.stringify(r.json)}`);
  check('and signs the phone in as that account too', r.json?.token === 'dev:lost-headset');
  const paid = await req('/whoami', { headers: as('lost-headset') });
  check('the email moves onto the account that paid', paid.json?.protected === true && paid.json?.email === 'p***@example.com', JSON.stringify(paid.json));
  const made = await req('/whoami', { headers: as('link-made') });
  check('and off the empty one the link made', made.json?.protected === false);
  const next = await hand('lost-headset', 'payer@example.com');
  check('the next LOG IN goes straight there', next.status === 200 && next.json?.token === undefined && next.json?.purchases === 3000);

  const none = await hand('stranger', 'nobody@example.com');
  check('an email with nothing saved or bought says so, instead of handing off an empty account', none.status === 404 && none.json?.empty === true, none.json?.error);
  await req('/save', { method: 'POST', headers: as('player'), body: { data: JSON.stringify({ money: 5 }), at: 1000 } });
  const saved = await hand('player', 'player@example.com');
  check('an account with a save but no purchases still logs in as itself', saved.status === 200 && saved.json?.purchases === 0 && saved.json?.token === undefined);
  const plain = await hand('player');
  check('a handoff with no email is the plain one', plain.status === 200 && plain.json?.token === undefined);

  await req('/protect', { method: 'POST', headers: as('ghost'), body: { email: 'mine@example.com' } });
  const back = await req('/protect', { method: 'POST', headers: as('keeper'), body: { email: 'mine@example.com' } });
  check('SAVE MY PURCHASES takes an email back from an empty account', back.status === 200 && back.json?.protected === true);
  await req('/save', { method: 'POST', headers: as('keeper'), body: { data: JSON.stringify({ money: 1 }), at: 1000 } });
  const held = await req('/protect', { method: 'POST', headers: as('player'), body: { email: 'mine@example.com' } });
  check("but not from one that's been played", held.status === 409 && held.json?.taken === true, `${held.status}`);
}

stop();
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
