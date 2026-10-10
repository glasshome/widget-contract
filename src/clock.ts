export type TimerHandle = { readonly __timer: true };

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle | undefined): void;
  setInterval(fn: () => void, ms: number): TimerHandle;
  clearInterval(handle: TimerHandle | undefined): void;
}

type GlobalHandle = ReturnType<typeof globalThis.setTimeout>;
const asHandle = (h: GlobalHandle) => h as unknown as TimerHandle;
const asGlobal = (h: TimerHandle | undefined) => h as unknown as GlobalHandle | undefined;

// Globals are read per call so a mount test's fake timers drive code built on this clock.
export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => asHandle(globalThis.setTimeout(fn, ms)),
  clearTimeout: (h) => globalThis.clearTimeout(asGlobal(h)),
  setInterval: (fn, ms) => asHandle(globalThis.setInterval(fn, ms)),
  clearInterval: (h) => globalThis.clearInterval(asGlobal(h)),
};

export function sleep(clock: Clock, ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clock.clearTimeout(handle);
      reject(signal?.reason);
    };
    const handle = clock.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function timeoutSignal(clock: Clock, ms: number): AbortSignal {
  const controller = new AbortController();
  clock.setTimeout(
    () => controller.abort(new DOMException("The operation timed out.", "TimeoutError")),
    ms,
  );
  return controller.signal;
}

export type Deadline<T> = { ok: true; value: T } | { ok: false };

export function withDeadline<T>(clock: Clock, work: Promise<T>, ms: number): Promise<Deadline<T>> {
  return new Promise((resolve, reject) => {
    const handle = clock.setTimeout(() => resolve({ ok: false }), ms);
    work.then(
      (value) => {
        clock.clearTimeout(handle);
        resolve({ ok: true, value });
      },
      (err: unknown) => {
        clock.clearTimeout(handle);
        reject(err);
      },
    );
  });
}

export interface ManualClock extends Clock {
  advance(ms: number): Promise<void>;
  pending(): number;
  setNow(epochMs: number): void;
}

interface Entry {
  id: number;
  at: number;
  every?: number;
  fn: () => void;
}

const DRAIN_TURNS = 1_000;
const LOOP_LIMIT = 10_000;

// Microtasks only: a macrotask drain hangs when this module loads under vitest fake timers.
async function drain(): Promise<void> {
  for (let i = 0; i < DRAIN_TURNS; i++) await null;
}

export function createManualClock(startEpochMs = 0): ManualClock {
  let now = startEpochMs;
  let seq = 0;
  let advancing = false;
  const queue = new Map<number, Entry>();

  const add = (fn: () => void, ms: number, every?: number): TimerHandle => {
    const id = ++seq;
    queue.set(id, { id, at: now + Math.max(0, ms || 0), every, fn });
    return { id } as unknown as TimerHandle;
  };
  const clear = (h: TimerHandle | undefined) => {
    if (h) queue.delete((h as unknown as { id: number }).id);
  };
  const nextDue = (until: number): Entry | undefined => {
    let best: Entry | undefined;
    for (const e of queue.values()) {
      if (e.at > until) continue;
      if (!best || e.at < best.at || (e.at === best.at && e.id < best.id)) best = e;
    }
    return best;
  };

  return {
    now: () => now,
    setTimeout: (fn, ms) => add(fn, ms),
    clearTimeout: clear,
    setInterval: (fn, ms) => add(fn, ms, Math.max(1, ms || 0)),
    clearInterval: clear,
    pending: () => queue.size,
    setNow(epochMs) {
      const shift = epochMs - now;
      now = epochMs;
      for (const e of queue.values()) e.at += shift;
    },
    async advance(ms) {
      if (advancing) throw new Error("advance called while another advance is running");
      advancing = true;
      try {
        const until = now + ms;
        await drain();
        let fired = 0;
        for (let e = nextDue(until); e; e = nextDue(until)) {
          if (++fired > LOOP_LIMIT) {
            throw new Error(`advance fired ${LOOP_LIMIT} timers in ${ms}ms: a re-arming timer`);
          }
          now = e.at;
          if (e.every) e.at += e.every;
          else queue.delete(e.id);
          e.fn();
          await drain();
        }
        now = until;
      } finally {
        advancing = false;
      }
    },
  };
}
