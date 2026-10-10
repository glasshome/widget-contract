import { afterEach, expect, test, vi } from "vitest";
import { createManualClock, sleep, systemClock } from "../src/clock";

afterEach(() => vi.useRealTimers());

test("systemClock captured before fake timers still follows them", async () => {
  const store = { clock: systemClock };
  vi.useFakeTimers();
  let fired = false;
  store.clock.setTimeout(() => (fired = true), 1_000);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(fired).toBe(true);
});

test("a manual clock settles under vitest fake timers without hanging", async () => {
  vi.useFakeTimers();
  const clock = createManualClock(0);
  let done = false;
  void sleep(clock, 50).then(() => (done = true));
  await clock.advance(50);
  expect(done).toBe(true);
});
