/**
 * (ff2 src/experience/introGate.ts, in spirit.) While the boot intro's curtain is up, the
 * island waits: the rod, the teleport and the pointers ignore the controllers, and the music
 * holds its first note for the moment the curtain drops.
 */

let active = false;
let release: (() => void) | null = null;
let done: Promise<void> = Promise.resolve();

export function introActive(): boolean {
  return active;
}

/** Resolves when the curtain drops (at once if no intro is running). */
export function introDone(): Promise<void> {
  return done;
}

export function setIntroActive(on: boolean): void {
  if (on === active) return;
  active = on;
  if (on) done = new Promise<void>((r) => (release = r));
  else {
    release?.();
    release = null;
  }
}
