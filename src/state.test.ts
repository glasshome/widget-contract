import { describe, expect, test } from "bun:test";
import {
  WIDGET_STATE_LIMITS,
  WidgetStateKeySchema,
  WidgetStateValueSchema,
  checkWidgetStateWrite,
  createMemoryWidgetState,
  widgetStateBytes,
} from "./state";

describe("checkWidgetStateWrite", () => {
  test("a key outside the grammar is refused", () => {
    expect(checkWidgetStateWrite({}, "", "1")).toBe("key");
    expect(checkWidgetStateWrite({}, "a".repeat(65), "1")).toBe("key");
    expect(checkWidgetStateWrite({}, "../x", "1")).toBe("key");
    expect(checkWidgetStateWrite({}, "recent.colours:v1", "1")).toBe("ok");
    expect(checkWidgetStateWrite({}, "a".repeat(64), "1")).toBe("ok");
  });

  test("a value is measured in UTF-8 bytes and nesting depth", () => {
    expect(checkWidgetStateWrite({}, "k", JSON.stringify("é".repeat(4096)))).toBe("value");
    expect(checkWidgetStateWrite({}, "k", JSON.stringify("é".repeat(4095)))).toBe("ok");
    expect(checkWidgetStateWrite({}, "k", JSON.stringify("x".repeat(8190)))).toBe("ok");
    expect(checkWidgetStateWrite({}, "k", "x")).toBe("value");
    expect(checkWidgetStateWrite({}, "k", "[".repeat(9) + "]".repeat(9))).toBe("value");
    expect(checkWidgetStateWrite({}, "k", "[".repeat(8) + "]".repeat(8))).toBe("ok");
    expect(checkWidgetStateWrite({}, "k", '{"a":{"b":[1,{"c":2}]}}')).toBe("ok");
  });

  test("the 33rd key and the instance total are refused, a replace is measured net", () => {
    const full = Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`k${i}`, "1"]));
    expect(checkWidgetStateWrite(full, "k32", "1")).toBe("keys");
    expect(checkWidgetStateWrite(full, "k0", "2")).toBe("ok");
    const big = Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [`k${i}`, `"${"x".repeat(8000)}"`]),
    );
    expect(checkWidgetStateWrite(big, "k8", `"${"x".repeat(8000)}"`)).toBe("instance");
    expect(checkWidgetStateWrite(big, "k0", `"${"y".repeat(8000)}"`)).toBe("ok");
    expect(checkWidgetStateWrite(big, "k0", null)).toBe("ok");
  });

  test("a delete of a valid key passes, of a bad key is refused", () => {
    expect(checkWidgetStateWrite({}, "gone", null)).toBe("ok");
    expect(checkWidgetStateWrite({}, "../x", null)).toBe("key");
  });
});

describe("schemas", () => {
  test("the key schema follows the grammar", () => {
    expect(WidgetStateKeySchema.safeParse("tab").success).toBe(true);
    expect(WidgetStateKeySchema.safeParse("-tab").success).toBe(false);
  });

  test("the value schema takes JSON text within the limits", () => {
    expect(WidgetStateValueSchema.safeParse("[[5,70]]").success).toBe(true);
    expect(WidgetStateValueSchema.safeParse("{").success).toBe(false);
    expect(WidgetStateValueSchema.safeParse("[".repeat(9) + "]".repeat(9)).success).toBe(false);
  });
});

describe("widgetStateBytes", () => {
  test("counts keys and values in UTF-8", () => {
    expect(widgetStateBytes({ ab: '"é"' })).toBe(2 + 4);
    expect(widgetStateBytes({})).toBe(0);
  });

  test("the limits are the ones decided", () => {
    expect(WIDGET_STATE_LIMITS).toEqual({
      keyChars: 64,
      valueBytes: 8192,
      maxDepth: 8,
      keys: 32,
      instanceBytes: 65536,
      memberBytes: 131072,
      sendsPerMinute: 30,
      memberWritesPerMinute: 240,
      coalesceMs: 500,
    });
  });
});

describe("createMemoryWidgetState", () => {
  test("the memory store keeps accepted writes and refuses the rest", () => {
    const mem = createMemoryWidgetState({ a: "1" });
    expect(mem.write("b", "2")).toBe("ok");
    expect(mem.write("c", "x")).toBe("value");
    expect(mem.snapshot()).toEqual({ a: "1", b: "2" });
  });

  test("null deletes, and a snapshot is a copy", () => {
    const mem = createMemoryWidgetState({ a: "1" });
    const before = mem.snapshot();
    expect(mem.write("a", null)).toBe("ok");
    expect(mem.snapshot()).toEqual({});
    expect(before).toEqual({ a: "1" });
  });
});
