import { describe, expect, test } from "bun:test";
import {
  CATALOG_LIMITS,
  KEY_PATTERN,
  icuShape,
  parseCatalog,
  sanitizeValue,
  validateTranslation,
  type Result,
} from "./i18n";

const rules = { banned: [/\btuile\b/i], maxRatio: 3 };
const ok = <T>(r: Result<T, unknown>) => (r.ok ? r.value : undefined);
const err = <E>(r: Result<unknown, E>) => (r.ok ? undefined : r.error);

describe("parseCatalog", () => {
  test("flat sorted object becomes a Map with no prototype", () => {
    const cat = ok(parseCatalog('{"a.b":"x","constructor":"y"}'));
    expect(cat?.get("a.b")).toBe("x");
    expect(cat?.get("constructor")).toBe("y");
    expect(cat?.get("toString")).toBeUndefined();
  });
  test("__proto__ key is a bad key", () => {
    expect(err(parseCatalog('{"__proto__":"x"}'))).toEqual({ kind: "bad_key", key: "__proto__" });
  });
  test("non-string value", () => {
    expect(err(parseCatalog('{"a":1}'))).toEqual({
      kind: "bad_value",
      key: "a",
      reason: "not_string",
    });
  });
  test("bidi override rejected", () => {
    expect(err(parseCatalog('{"a":"Dé\u202Everrouiller"}'))).toEqual({
      kind: "bad_value",
      key: "a",
      reason: "bidi",
    });
  });
  test("too many keys", () => {
    const big = JSON.stringify(
      Object.fromEntries(Array.from({ length: CATALOG_LIMITS.keys + 1 }, (_, i) => [`k${i}`, "v"])),
    );
    expect(err(parseCatalog(big))).toEqual({
      kind: "too_many_keys",
      count: CATALOG_LIMITS.keys + 1,
    });
  });
  test("not an object", () => {
    expect(err(parseCatalog("[]"))).toEqual({ kind: "not_object" });
    expect(err(parseCatalog("null"))).toEqual({ kind: "not_object" });
    expect(err(parseCatalog("not json"))).toEqual({ kind: "not_object" });
  });
  test("file too large", () => {
    const text = JSON.stringify({ a: "x".repeat(256 * 1024) });
    expect(err(parseCatalog(text))?.kind).toBe("file_too_large");
  });
  test("key and value caps", () => {
    expect(err(parseCatalog(JSON.stringify({ [`a${"b".repeat(128)}`]: "x" })))?.kind).toBe(
      "bad_key",
    );
    expect(err(parseCatalog(JSON.stringify({ a: "x".repeat(2001) })))).toEqual({
      kind: "bad_value",
      key: "a",
      reason: "too_long",
    });
  });
  test("bad key shapes", () => {
    for (const key of ["A", "a..b", ".a", "a.", "_a", "a b", ""]) {
      expect(err(parseCatalog(JSON.stringify({ [key]: "x" })))?.kind).toBe("bad_key");
    }
  });
  test("invalid icu value reports its key", () => {
    expect(err(parseCatalog('{"a":"{x"}'))).toEqual({
      kind: "bad_value",
      key: "a",
      reason: "icu_syntax",
    });
    expect(err(parseCatalog('{"a":"<b>x</b>"}'))).toEqual({
      kind: "bad_value",
      key: "a",
      reason: "icu_feature",
    });
  });
});

describe("KEY_PATTERN", () => {
  test("accepts dotted lowercase segments only", () => {
    expect(KEY_PATTERN.test("widget.light.on_label")).toBe(true);
    expect(KEY_PATTERN.test("__proto__")).toBe(false);
  });
});

describe("sanitizeValue", () => {
  test("NFC normalises", () => {
    expect(ok(sanitizeValue("e\u0301"))).toBe("\u00E9");
  });
  test("zero-width joiner rejected", () => {
    expect(err(sanitizeValue("a\u200Db"))).toBe("bidi");
  });
  test("newline allowed, other controls not", () => {
    expect(ok(sanitizeValue("a\nb"))).toBe("a\nb");
    expect(err(sanitizeValue("a\u0007b"))).toBe("control_char");
    expect(err(sanitizeValue("a\tb"))).toBe("control_char");
  });
});

describe("icuShape", () => {
  test("args and plural branches", () => {
    const s = ok(icuShape("{name} has {count, plural, one {# light} other {# lights}}"));
    expect([...(s?.args ?? [])].sort()).toEqual(["count", "name"]);
    expect([...(s?.plurals.get("count") ?? [])].sort()).toEqual(["one", "other"]);
  });
  test("tags are a feature error", () => {
    expect(err(icuShape("<b>{x}</b>"))).toBe("icu_feature");
  });
  test("date skeleton is a feature error", () => {
    expect(err(icuShape("{d, date, short}"))).toBe("icu_feature");
  });
  test("number format and ordinal plural are feature errors", () => {
    expect(err(icuShape("{n, number}"))).toBe("icu_feature");
    expect(err(icuShape("{n, selectordinal, one {#st} other {#th}}"))).toBe("icu_feature");
  });
  test("unbalanced brace is a syntax error", () => {
    expect(err(icuShape("{x"))).toBe("icu_syntax");
  });
  test("select requires other", () => {
    expect(err(icuShape("{x, select, a {A}}"))).toBe("icu_syntax");
    expect(ok(icuShape("{x, select, a {A} other {B}}"))?.args.has("x")).toBe(true);
  });
  test("nested plurals are collected per argument", () => {
    const s = ok(
      icuShape(
        "{a, plural, one {{b, plural, one {x} other {y}}} other {{b, plural, =0 {z} other {y}}}}",
      ),
    );
    expect([...(s?.plurals.get("a") ?? [])].sort()).toEqual(["one", "other"]);
    expect([...(s?.plurals.get("b") ?? [])].sort()).toEqual(["=0", "one", "other"]);
  });
  test("pound outside a plural is literal text", () => {
    expect(ok(icuShape("Item #1"))?.args.size).toBe(0);
  });
  test("deeply nested input is refused, not a stack overflow", () => {
    const deep = "{a, select, o {".repeat(500) + "x" + "} other {y}}".repeat(500);
    expect(icuShape(deep).ok).toBe(false);
  });
});

describe("validateTranslation", () => {
  const src = "{count, plural, one {# light on} other {# lights on}}";
  test("fr accepts one, many, other", () => {
    const fr =
      "{count, plural, one {# lumière allumée} many {# lumières allumées} other {# lumières allumées}}";
    expect(ok(validateTranslation(src, fr, "fr", rules))).toBe(fr);
  });
  test("fr rejects a zero branch", () => {
    const fr = "{count, plural, zero {aucune} one {# lumière} other {# lumières}}";
    expect(err(validateTranslation(src, fr, "fr", rules))?.kind).toBe("plural_branches");
  });
  test("explicit =0 branch is allowed", () => {
    const fr = "{count, plural, =0 {aucune} one {# lumière} other {# lumières}}";
    expect(ok(validateTranslation(src, fr, "fr", rules))).toBe(fr);
  });
  test("missing other", () => {
    expect(err(validateTranslation(src, "{count, plural, one {# x}}", "fr", rules))?.kind).toBe(
      "plural_branches",
    );
  });
  test("argument renamed", () => {
    expect(err(validateTranslation("Hello {name}", "Bonjour {nom}", "fr", rules))).toEqual({
      kind: "args_differ",
      expected: ["name"],
      got: ["nom"],
    });
  });
  test("new url rejected", () => {
    expect(
      err(validateTranslation("Open settings", "Ouvrir https://evil.example", "fr", rules)),
    ).toEqual({
      kind: "new_url_or_number",
      token: "https://evil.example",
    });
  });
  test("email and bare domain rejected", () => {
    expect(err(validateTranslation("Contact us", "Écrire à a@b.example", "fr", rules))?.kind).toBe(
      "new_url_or_number",
    );
    expect(err(validateTranslation("Contact us", "Voir evil.example", "fr", rules))?.kind).toBe(
      "new_url_or_number",
    );
  });
  test("numbers must come from the source", () => {
    expect(ok(validateTranslation("Wait 5 minutes", "Attendre 5 minutes", "fr", rules))).toBe(
      "Attendre 5 minutes",
    );
    expect(
      err(validateTranslation("Wait 5 minutes", "Attendre 50 minutes", "fr", rules))?.kind,
    ).toBe("new_url_or_number");
  });
  test("banned term", () => {
    expect(err(validateTranslation("Add widget", "Ajouter une tuile", "fr", rules))).toEqual({
      kind: "banned_term",
      term: "tuile",
    });
  });
  test("length ratio", () => {
    expect(err(validateTranslation("Add a widget", "x".repeat(100), "fr", rules))?.kind).toBe(
      "length_ratio",
    );
  });
  test("short sources skip the ratio", () => {
    expect(ok(validateTranslation("On", "Allumé", "fr", rules))).toBe("Allumé");
  });
  test("invisible characters in a translation are a value error", () => {
    expect(err(validateTranslation("Open", "Ou\u202Evrir", "fr", rules))).toEqual({
      kind: "value",
      reason: "bad_value",
    });
  });
  test("returns the NFC form", () => {
    expect(ok(validateTranslation("Open", "Ouvrír", "fr", rules))).toBe("Ouvrír".normalize("NFC"));
  });
  test("select translated keeps args", () => {
    const s = "{x, select, a {A} other {B}}";
    expect(ok(validateTranslation(s, "{x, select, a {Un} other {Autre}}", "fr", rules))).toBe(
      "{x, select, a {Un} other {Autre}}",
    );
  });
});

describe("plural without other", () => {
  test("catalog values need other in plurals", () => {
    expect(err(icuShape("{n, plural, one {x}}"))).toBe("icu_syntax");
  });
});
