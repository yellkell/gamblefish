/**
 * THE CLOUD: one Firebase connection (the `window-7b629` project, which owns
 * gamblefish.web.app), opened lazily and failing soft, the way ff2's is.
 *
 * IDENTITY is anonymous auth. Nobody signs in to play: `signInAnonymously()`
 * mints a uid on first contact and the SDK keeps it in IndexedDB, so a headset
 * stays the same player across sessions. An account is that uid with an email
 * attached (the bank's PROTECT), and a new headset becomes the same uid by
 * redeeming a code (net/bank.ts). Nothing here reads or writes Firestore
 * directly: the bank server does that with its own credentials.
 *
 * The API key below is a public identifier, not a secret: it names the project
 * and grants nothing. The boundary is the server and firestore.rules.
 */

import type { Auth } from 'firebase/auth';

export const firebaseConfig = {
  apiKey: 'AIzaSyC0DoqZ92Bfdd5HLfkNFyCQ1LYjJPOurLk',
  authDomain: 'window-7b629.firebaseapp.com',
  projectId: 'window-7b629',
  storageBucket: 'window-7b629.firebasestorage.app',
  messagingSenderId: '931382417550',
  appId: '1:931382417550:web:e2c920adcf1424bcd3d1df',
  measurementId: 'G-KSZMN6VXGV',
};

export interface Cloud {
  auth: Auth;
  uid: string;
}

export const cloudState = { status: 'idle' as 'idle' | 'opening' | 'ready' | 'off', reason: '', uid: '' };

const TIMEOUT_MS = 8000;
let live: Cloud | null = null;
let opening: Promise<Cloud | null> | null = null;
let idToken = '';
/** a failure that won't fix itself this session (auth not enabled, a bad key): stop asking */
let dead = '';

function isPermanent(code: string): boolean {
  return ['configuration-not-found', 'operation-not-allowed', 'api-key-not-valid', 'admin-restricted-operation'].some((k) => code.includes(k));
}

function withTimeout<T>(work: Promise<T>, label: string): Promise<T> {
  return Promise.race([work, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), TIMEOUT_MS))]);
}

/** Automated browsers (the check tools) get no cloud, so they never write to the live project. */
function isProbe(): boolean {
  try {
    return !!navigator.webdriver && new URLSearchParams(location.search).get('cloud') !== '1';
  } catch {
    return false;
  }
}

/** Open the cloud, or hand back what is already open. Resolves null when there is none: play carries on. */
export function cloud(): Promise<Cloud | null> {
  if (isProbe()) return Promise.resolve(null);
  if (live) return Promise.resolve(live);
  if (dead) return Promise.resolve(null);
  if (opening) return opening;
  cloudState.status = 'opening';
  opening = (async () => {
    try {
      const [appMod, authMod] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
      const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
      const auth = authMod.getAuth(app);
      await withTimeout(auth.authStateReady(), 'auth');
      const user = auth.currentUser ?? (await withTimeout(authMod.signInAnonymously(auth), 'sign-in')).user;
      live = { auth, uid: user.uid };
      authMod.onIdTokenChanged(auth, (u) => {
        if (u && live) live.uid = u.uid;
        void u?.getIdToken().then((t) => (idToken = t));
      });
      idToken = await user.getIdToken().catch(() => '');
      cloudState.status = 'ready';
      cloudState.uid = user.uid;
      return live;
    } catch (err) {
      cloudState.status = 'off';
      cloudState.reason = String((err as { code?: string })?.code ?? err);
      if (isPermanent(cloudState.reason)) dead = cloudState.reason;
      console.warn('[cloud] off:', cloudState.reason);
      return null;
    } finally {
      opening = null;
    }
  })();
  return opening;
}

/** The current ID token (synchronous, for a page-teardown keepalive fetch), or ''. */
export function currentIdToken(): string {
  return idToken;
}

/** A fresh ID token, or ''. */
export async function idTokenNow(): Promise<string> {
  const c = await cloud();
  if (!c) return '';
  const t = await c.auth.currentUser?.getIdToken().catch(() => '');
  if (t) idToken = t;
  return t ?? '';
}
