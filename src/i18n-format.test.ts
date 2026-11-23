import { describe, expect, test } from "bun:test";
import { compileMessage, type Result } from "./i18n";
import { formatMessage, formatParts, type CompiledMessage } from "./i18n-format";

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
