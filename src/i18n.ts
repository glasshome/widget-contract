import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";

export const CATALOG_LIMITS = {
  keys: 2000,
  keyChars: 128,
  valueChars: 2000,
  fileBytes: 256 * 1024,
} as const;

export const KEY_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*(?:\.[a-z0-9]+(?:[-_][a-z0-9]+)*)*$/;

const MAX_ICU_DEPTH = 8;

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export type Catalog = ReadonlyMap<string, string>;

type ValueReason =
  | "not_string"
  | "too_long"
  | "control_char"
  | "bidi"
  | "icu_syntax"
  | "icu_feature";

export type CatalogError =
  | { kind: "not_object" }
  | { kind: "too_many_keys"; count: number }
  | { kind: "bad_key"; key: string }
  | { kind: "bad_value"; key: string; reason: ValueReason }
  | { kind: "file_too_large"; bytes: number };

export interface IcuShape {
  args: ReadonlySet<string>;
  plurals: ReadonlyMap<string, ReadonlySet<string>>;
}

export type TranslationError =
  | { kind: "args_differ"; expected: string[]; got: string[] }
  | { kind: "arg_kind"; arg: string; expected: string[]; got: string[] }
  | { kind: "select_branches"; arg: string; expected: string[]; got: string[] }
  | { kind: "plural_branches"; arg: string; expected: string[]; got: string[] }
  | { kind: "unknown_locale"; locale: string }
  | { kind: "new_url_or_number"; token: string }
  | { kind: "length_ratio"; ratio: number }
  | { kind: "banned_term"; term: string }
  | { kind: "value"; side: "source" | "translation"; reason: ValueReason };

const fail = <E>(error: E): { ok: false; error: E } => ({ ok: false, error });
const succeed = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });

export function sanitizeValue(value: string): Result<string, "control_char" | "bidi"> {
  if (!value.isWellFormed()) return fail("control_char");
  const text = value.normalize("NFC");
  if (/[^\P{Cc}\n]/u.test(text)) return fail("control_char");
  if (/[\p{Bidi_Control}\p{Cf}]/u.test(text)) return fail("bidi");
  return succeed(text);
}

type ArgKind = "plain" | "plural" | "select";

interface Analysis {
  shape: IcuShape;
  literals: string[];
  kinds: ReadonlyMap<string, ReadonlySet<ArgKind>>;
  selects: ReadonlyMap<string, ReadonlySet<string>>;
  pluralElements: { arg: string; branches: string[] }[];
}

function analyze(
  value: string,
  pluralOtherOptional = false,
): Result<Analysis, "icu_syntax" | "icu_feature"> {
  let ast: MessageFormatElement[];
  try {
    ast = parse(value, {
      ignoreTag: false,
      requiresOtherClause: false,
      shouldParseSkeletons: false,
    });
  } catch {
    return fail("icu_syntax");
  }
  const args = new Set<string>();
  const plurals = new Map<string, Set<string>>();
  const literals: string[] = [];
  const kinds = new Map<string, Set<ArgKind>>();
  const selects = new Map<string, Set<string>>();
  const pluralElements: { arg: string; branches: string[] }[] = [];
  const addKind = (arg: string, kind: ArgKind) => {
    args.add(arg);
    const set = kinds.get(arg) ?? new Set<ArgKind>();
    set.add(kind);
    kinds.set(arg, set);
  };
  let problem: "icu_syntax" | "icu_feature" | undefined;

  const walk = (elements: MessageFormatElement[], depth: number): void => {
    if (depth > MAX_ICU_DEPTH) {
      problem ??= "icu_syntax";
      return;
    }
    for (const el of elements) {
      switch (el.type) {
        case TYPE.literal:
          if (/[<>]/u.test(el.value)) problem ??= "icu_feature";
          literals.push(el.value);
          break;
        case TYPE.pound:
          break;
        case TYPE.argument:
          addKind(el.value, "plain");
          break;
        case TYPE.select: {
          addKind(el.value, "select");
          if (!("other" in el.options)) problem ??= "icu_syntax";
          const keys = selects.get(el.value) ?? new Set<string>();
          selects.set(el.value, keys);
          for (const name of Object.keys(el.options)) keys.add(name);
          for (const option of Object.values(el.options)) walk(option.value, depth + 1);
          break;
        }
        case TYPE.plural: {
          if (el.pluralType !== "cardinal" || el.offset !== 0) {
            problem ??= "icu_feature";
            break;
          }
          addKind(el.value, "plural");
          if (!pluralOtherOptional && !("other" in el.options)) problem ??= "icu_syntax";
          pluralElements.push({ arg: el.value, branches: Object.keys(el.options) });
          const branches = plurals.get(el.value) ?? new Set<string>();
          plurals.set(el.value, branches);
          for (const [name, option] of Object.entries(el.options)) {
            branches.add(name);
            walk(option.value, depth + 1);
          }
          break;
        }
        default:
          problem ??= "icu_feature";
      }
    }
  };
  walk(ast, 0);
  return problem
    ? fail(problem)
    : succeed({ shape: { args, plurals }, literals, kinds, selects, pluralElements });
}

export function icuShape(value: string): Result<IcuShape, "icu_syntax" | "icu_feature"> {
  const analysis = analyze(value);
  return analysis.ok ? succeed(analysis.value.shape) : analysis;
}

function checkValue(
  value: string,
  pluralOtherOptional = false,
): Result<{ text: string } & Analysis, ValueReason> {
  const clean = sanitizeValue(value);
  if (!clean.ok) return clean;
  if (clean.value.length > CATALOG_LIMITS.valueChars) return fail("too_long");
  const analysis = analyze(clean.value, pluralOtherOptional);
  if (!analysis.ok) return analysis;
  return succeed({ text: clean.value, ...analysis.value });
}

export function parseCatalog(text: string): Result<Catalog, CatalogError> {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > CATALOG_LIMITS.fileBytes) return fail({ kind: "file_too_large", bytes });
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail({ kind: "not_object" });
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return fail({ kind: "not_object" });
  }
  const entries = Object.entries(data);
  if (entries.length > CATALOG_LIMITS.keys) {
    return fail({ kind: "too_many_keys", count: entries.length });
  }
  const catalog = new Map<string, string>();
  for (const [key, raw] of entries) {
    if (key.length > CATALOG_LIMITS.keyChars || !KEY_PATTERN.test(key)) {
      return fail({ kind: "bad_key", key });
    }
    if (typeof raw !== "string") return fail({ kind: "bad_value", key, reason: "not_string" });
    const checked = checkValue(raw);
    if (!checked.ok) return fail({ kind: "bad_value", key, reason: checked.error });
    catalog.set(key, checked.value.text);
  }
  return succeed(catalog);
}

const DOT = "[.\\u3002]";
const TOKEN_PATTERNS = [
  /(?:https?:\/\/|www\.)[^\s"'<>]+/giu,
  new RegExp(`[\\p{L}\\p{N}._%+-]+@[\\p{L}\\p{N}-]+(?:${DOT}[\\p{L}\\p{N}-]+)+`, "gu"),
  new RegExp(`[\\p{L}\\p{N}-]+(?:${DOT}[\\p{L}\\p{N}-]+)*${DOT}\\p{L}{2,}`, "gu"),
  /\p{Nd}+/gu,
];

function tokens(literals: readonly string[]): string[] {
  const found: string[] = [];
  for (const literal of literals.map((l) => l.normalize("NFKC"))) {
    for (const pattern of TOKEN_PATTERNS) {
      for (const match of literal.matchAll(pattern)) {
        found.push(match[0].replace(/[.\u3002,;:!?)\]]+$/u, ""));
      }
    }
  }
  return found;
}

function supportedLocale(locale: string): boolean {
  try {
    return Intl.PluralRules.supportedLocalesOf([locale]).length > 0;
  } catch {
    return false;
  }
}

const sorted = (values: Iterable<string>) => [...values].sort();
const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

function kindsOf(a: Analysis, arg: string): string[] {
  return sorted(a.kinds.get(arg) ?? []);
}

function structureError(
  src: Analysis,
  out: Analysis,
  locale: string,
): TranslationError | undefined {
  const expectedArgs = sorted(src.shape.args);
  const gotArgs = sorted(out.shape.args);
  if (!sameList(expectedArgs, gotArgs)) {
    return { kind: "args_differ", expected: expectedArgs, got: gotArgs };
  }
  for (const arg of expectedArgs) {
    const expected = kindsOf(src, arg);
    const got = kindsOf(out, arg);
    if (!sameList(expected, got)) return { kind: "arg_kind", arg, expected, got };
  }
  for (const [arg, keys] of src.selects) {
    const expected = sorted(keys);
    const got = sorted(out.selects.get(arg) ?? []);
    if (!sameList(expected, got)) return { kind: "select_branches", arg, expected, got };
  }
  const allowed = new Set<string>(new Intl.PluralRules(locale).resolvedOptions().pluralCategories);
  for (const { arg, branches } of out.pluralElements) {
    const valid =
      branches.every((b) => allowed.has(b) || /^=\d+$/u.test(b)) && branches.includes("other");
    if (!valid) {
      return {
        kind: "plural_branches",
        arg,
        expected: sorted([...allowed, "=N"]),
        got: sorted(branches),
      };
    }
  }
  return undefined;
}

export function validateTranslation(
  source: string,
  translated: string,
  locale: string,
  rules: { banned: readonly RegExp[]; maxRatio: number },
): Result<string, TranslationError> {
  if (!supportedLocale(locale)) return fail({ kind: "unknown_locale", locale });
  const src = checkValue(source);
  if (!src.ok) return fail({ kind: "value", side: "source", reason: src.error });
  const out = checkValue(translated, true);
  if (!out.ok) return fail({ kind: "value", side: "translation", reason: out.error });

  const structure = structureError(src.value, out.value, locale);
  if (structure) return fail(structure);

  const known = new Set(tokens(src.value.literals));
  for (const token of tokens(out.value.literals)) {
    if (!known.has(token)) return fail({ kind: "new_url_or_number", token });
  }

  for (const rule of rules.banned) {
    const match = out.value.text.match(new RegExp(rule.source, rule.flags.replace(/[gy]/gu, "")));
    if (match) return fail({ kind: "banned_term", term: match[0] });
  }

  if (src.value.text.length > 8) {
    const ratio = out.value.text.length / src.value.text.length;
    if (ratio > rules.maxRatio) return fail({ kind: "length_ratio", ratio });
  }
  return succeed(out.value.text);
}
