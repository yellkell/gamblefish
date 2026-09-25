/**
 * THE CLOUD SAVE: the whole game (wallet, backpack, catch log, upgrades) kept on
 * the bank server under this headset's uid, so an account carries everything a
 * player has, bought coins included, to a new headset.
 *
 * The rule is simple: the newer save wins. Every local save is stamped with the
 * time it was made; a few seconds after the game settles (and as the page goes
 * away) the save goes up with its stamp, and the server keeps it only if it's
 * newer than what it has. At boot, a newer save on the server comes down.
 *
 * LOGGING IN on a new headset is the one exception: that headset's own save
 * (a fresh start, usually) must not beat the account's just because it was
 * touched more recently. `markAdopt()` makes the next boot take the server's
 * save whatever the stamps say.
 */

import type { GameState } from '../fishing/tidewater.ts';
import { bankHttp, call, identity } from './bank.ts';
import { currentIdToken } from './firebase.ts';

const AT_KEY = 'vrfish.saveAt';
const ADOPT_KEY = 'vrfish.adopt';
const PUSH_AFTER_MS = 8000;

const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string): void {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private window: the cloud save just doesn't happen */
    }
  },
  del(k: string): void {
    try {
      localStorage.removeItem(k);
    } catch {
      /* fine */
    }
  },
};

export const cloudSave = { status: 'idle' as 'idle' | 'synced' | 'pending' | 'off', lastPush: 0 };

/** The next boot takes the account's save (set when this headset logs in to an account). */
export function markAdopt(): void {
  store.set(ADOPT_KEY, '1');
}

let timer: ReturnType<typeof setTimeout> | null = null;
let game: GameState | null = null;
/** true while applying a save from the server, so that doesn't count as a new local change */
let applying = false;

function localAt(): number {
  return Number(store.get(AT_KEY) ?? 0) || 0;
}

async function push(): Promise<void> {
  timer = null;
  if (!game) return;
  const who = await identity();
  if (!who) {
    cloudSave.status = 'off';
    return;
  }
  try {
    await call('/save', { method: 'POST', headers: { 'content-type': 'application/json', ...who }, body: JSON.stringify({ data: JSON.stringify(game), at: localAt() }) });
    cloudSave.status = 'synced';
    cloudSave.lastPush = Date.now();
  } catch {
    cloudSave.status = 'pending';
    schedule(30_000); // the server may be asleep: try again later
  }
}

function schedule(ms = PUSH_AFTER_MS): void {
  cloudSave.status = 'pending';
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void push(), ms);
}

/**
 * Hook the game's save: every local save is stamped and queued for the cloud.
 * Then reconcile with the server: adopt its save if it's newer (or if this
 * headset just logged in), otherwise send ours up.
 */
export async function bootCloudSave(state: GameState): Promise<void> {
  game = state;
  const save = state.save.bind(state);
  state.save = () => {
    save();
    if (applying) return;
    store.set(AT_KEY, String(Date.now()));
    schedule();
  };
  // as the page goes away, send what we have (a keepalive fetch outlives the page)
  window.addEventListener('pagehide', () => {
    if (!timer || !game) return;
    const token = currentIdToken();
    if (!token) return;
    try {
      void fetch(`${bankHttp()}/save`, {
        method: 'POST',
        keepalive: true,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ data: JSON.stringify(game), at: localAt() }),
      });
    } catch {
      /* next boot pushes it */
    }
  });

  const who = await identity();
  if (!who) {
    cloudSave.status = 'off';
    return;
  }
  const adopt = store.get(ADOPT_KEY) === '1';
  try {
    const remote = await call<{ data: string | null; at: number }>('/save', { headers: who });
    if (remote.data && (adopt || remote.at > localAt())) {
      applying = true;
      if (state.fromJSON(JSON.parse(remote.data))) {
        state.save();
        store.set(AT_KEY, String(remote.at));
        state.emit();
        console.log(`[cloud save] took the account's save from ${new Date(remote.at).toISOString()}`);
      }
      applying = false;
      cloudSave.status = 'synced';
    } else if (localAt() > remote.at || !remote.data) {
      if (!localAt()) store.set(AT_KEY, String(Date.now()));
      await push();
    } else cloudSave.status = 'synced';
    store.del(ADOPT_KEY);
  } catch {
    applying = false;
    cloudSave.status = 'pending';
    schedule(30_000);
  }
}
