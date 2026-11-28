import { describe, expect, test } from "bun:test";
import { compileMessage, type Result } from "./i18n";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatMessage, formatParts, readBundled, type CompiledMessage } from "./i18n-format";

const env = (l: string) => ({
  plural: (n: number) => new Intl.PluralRules(l).select(n),
  number: (n: number) => new Intl.NumberFormat(l).format(n),
});

const compile = (source: string): CompiledMessage => {
  const result: Result<CompiledMessage, unknown> = compileMessage(source);
  if (!result.ok) throw new Error(`compile failed: ${String(result.error)}`);
  return result.value;
};

describe("formatMessage", () => {
  test("french zero takes the singular", () => {
    const m = compile("{count, plural, one {# appareil} other {# appareils}}");
    expect(formatMessage(m, { count: 0 }, env("fr"))).toBe("0 appareil");
    expect(formatMessage(m, { count: 2 }, env("fr"))).toBe("2 appareils");
  });
  test("exact match beats category", () => {
    const m = compile("{count, plural, =0 {none} one {# item} other {# items}}");
    expect(formatMessage(m, { count: 0 }, env("en"))).toBe("none");
    expect(formatMessage(m, { count: 1 }, env("en"))).toBe("1 item");
  });
  test("pound and plain numbers use the locale format", () => {
    const m = compile("{count, plural, other {# Geräte}}");
    expect(formatMessage(m, { count: 1234 }, env("de"))).toBe("1.234 Geräte");
    expect(formatMessage(compile("{n}"), { n: 1234 }, env("de"))).toBe("1.234");
  });
  test("missing argument renders literally", () => {
    expect(formatMessage(compile("Hi {name}"), {}, env("en"))).toBe("Hi {name}");
  });
  test("select falls to other", () => {
    const m = compile("{kind, select, a {A} other {O}}");
    expect(formatMessage(m, { kind: "a" }, env("en"))).toBe("A");
    expect(formatMessage(m, { kind: "z" }, env("en"))).toBe("O");
  });
});

describe("formatParts", () => {
  test("keeps non-string values and merges strings", () => {
    const link = { sentinel: true };
    expect(formatParts(compile("Read {link} now"), { link }, env("en"))).toEqual([
      "Read ",
      link,
      " now",
    ]);
    expect(formatParts(compile("a {x} b"), { x: "-" }, env("en"))).toEqual(["a - b"]);
  });
});

describe("readBundled", () => {
  const fixture: unknown = JSON.parse(
    readFileSync(join(import.meta.dir, "../tests/fixtures/bundled-v1.json"), "utf8"),
  );
  const expected = (
    fixture as {
      expected: {
        key: string;
        locale: string;
        args: Record<string, string | number>;
        text: string;
      }[];
    }
  ).expected;

  test("the committed v1 catalog formats to its recorded strings", () => {
    const messages = readBundled(fixture);
    expect(messages).not.toBeNull();
    expect(expected.length).toBeGreaterThan(4);
    for (const row of expected) {
      const message = messages?.[row.key];
      expect(message).toBeDefined();
      if (message) expect(formatMessage(message, row.args, env(row.locale))).toBe(row.text);
    }
  });

  test("an unknown version or shape is no catalog", () => {
    expect(readBundled({ v: 2, messages: {} })).toBeNull();
    expect(readBundled({ v: 1, messages: [] })).toBeNull();
    expect(readBundled({ v: 1 })).toBeNull();
    expect(readBundled(null)).toBeNull();
    expect(readBundled("x")).toBeNull();
  });
});
