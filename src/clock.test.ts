import { describe, expect, test } from "bun:test";
import { createManualClock, sleep, systemClock, timeoutSignal, withDeadline } from "./clock";

describe("createManualClock", () => {
  test("now starts at the given epoch and only moves on advance", async () => {
    const clock = createManualClock(1_000);
    expect(clock.now()).toBe(1_000);
    await clock.advance(250);
    expect(clock.now()).toBe(1_250);
  });

  test("fires due timers in due order, then creation order, with now at each due time", async () => {
    const clock = createManualClock(0);
    const seen: string[] = [];
    clock.setTimeout(() => seen.push(`b@${clock.now()}`), 20);
    clock.setTimeout(() => seen.push(`a@${clock.now()}`), 10);
    clock.setTimeout(() => seen.push(`c@${clock.now()}`), 20);
    await clock.advance(20);
    expect(seen).toEqual(["a@10", "b@20", "c@20"]);
  });

  test("a timer created during advance at the current instant fires in the same advance", async () => {
    const clock = createManualClock(0);
    const seen: number[] = [];
    clock.setTimeout(() => clock.setTimeout(() => seen.push(clock.now()), 0), 5);
    await clock.advance(5);
    expect(seen).toEqual([5]);
  });

  test("settles promise chains between timers", async () => {
    const clock = createManualClock(0);
    let steps = 0;
    void (async () => {
      for (let i = 0; i < 25; i++) await null;
      await sleep(clock, 100);
      steps++;
      for (let i = 0; i < 25; i++) await null;
      await sleep(clock, 100);
      steps++;
    })();
    await clock.advance(200);
    expect(steps).toBe(2);
  });

  test("intervals repeat and stop when cleared", async () => {
    const clock = createManualClock(0);
    let n = 0;
    const h = clock.setInterval(() => n++, 10);
    await clock.advance(35);
    expect(n).toBe(3);
    clock.clearInterval(h);
    expect(clock.pending()).toBe(0);
    await clock.advance(100);
    expect(n).toBe(3);
  });

  test("clearInterval from inside the callback stops the interval", async () => {
    const clock = createManualClock(0);
    let n = 0;
    const h = clock.setInterval(() => {
      n++;
      clock.clearInterval(h);
    }, 10);
    await clock.advance(50);
    expect(n).toBe(1);
    expect(clock.pending()).toBe(0);
  });

  test("a self re-arming zero-delay timer throws instead of hanging", async () => {
    const clock = createManualClock(0);
    const loop = () => clock.setTimeout(loop, 0);
    loop();
    await expect(clock.advance(1)).rejects.toThrow(/re-arming/);
  });

  test("setNow shifts pending timers so time never runs backwards", async () => {
    const clock = createManualClock(0);
    const seen: number[] = [];
    clock.setTimeout(() => seen.push(clock.now()), 10);
    clock.setNow(1_000);
    await clock.advance(10);
    expect(seen).toEqual([1_010]);
    expect(clock.now()).toBe(1_010);
  });

  test("pending counts live timers: the absence proof", async () => {
    const clock = createManualClock(0);
    const h = clock.setTimeout(() => {}, 50);
    expect(clock.pending()).toBe(1);
    clock.clearTimeout(h);
    expect(clock.pending()).toBe(0);
  });
});

describe("helpers on a manual clock", () => {
  test("withDeadline returns the value and leaves no timer behind", async () => {
    const clock = createManualClock(0);
    const result = await withDeadline(clock, Promise.resolve(7), 1_000);
    expect(result).toEqual({ ok: true, value: 7 });
    expect(clock.pending()).toBe(0);
  });

  test("withDeadline reports a miss when the deadline passes first", async () => {
    const clock = createManualClock(0);
    const work = Promise.withResolvers<number>();
    const pending = withDeadline(clock, work.promise, 1_000);
    await clock.advance(1_000);
    expect(await pending).toEqual({ ok: false });
    expect(clock.pending()).toBe(0);
  });

  test("timeoutSignal aborts with a TimeoutError on the clock's time", async () => {
    const clock = createManualClock(0);
    const signal = timeoutSignal(clock, 500);
    await clock.advance(499);
    expect(signal.aborted).toBe(false);
    await clock.advance(1);
    expect(signal.aborted).toBe(true);
    expect((signal.reason as DOMException).name).toBe("TimeoutError");
  });

  test("sleep rejects when its signal aborts and clears its timer", async () => {
    const clock = createManualClock(0);
    const stop = new AbortController();
    const slept = sleep(clock, 1_000, stop.signal);
    stop.abort();
    await expect(slept).rejects.toThrow();
    expect(clock.pending()).toBe(0);
  });
});

describe("systemClock", () => {
  test("reads the globals on every call", () => {
    const real = Date.now;
    Date.now = () => 42;
    try {
      expect(systemClock.now()).toBe(42);
    } finally {
      Date.now = real;
    }
  });
});
