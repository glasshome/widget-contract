const SDK = "@glasshome/widget-sdk";
const UI_SOLID = "@glasshome/ui/solid";

interface Masked {
  code: string;
  strings: string[];
}

const REGEX_AFTER_PUNCT = new Set("(,=:[!&|?{};+-*%<>~^}");
const REGEX_AFTER_WORDS = new Set([
  "return",
  "typeof",
  "instanceof",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "case",
  "do",
  "else",
  "yield",
  "await",
  "export",
  "default",
]);

function regexAllowed(prev: string): boolean {
  return prev === "" || REGEX_AFTER_PUNCT.has(prev) || REGEX_AFTER_WORDS.has(prev);
}

// Blanks comments, regex literals and template text; every string literal becomes `"<index>"`.
function mask(src: string): Masked {
  const strings: string[] = [];
  let i = 0;
  let out = "";
  let prev = "";

  const skipRegex = (): void => {
    let j = i + 1;
    let inClass = false;
    while (j < src.length) {
      const d = src[j];
      if (d === "\\") {
        j += 2;
        continue;
      }
      if (d === "\n") break;
      if (inClass) {
        if (d === "]") inClass = false;
      } else if (d === "[") inClass = true;
      else if (d === "/") break;
      j++;
    }
    j++;
    while (j < src.length && /[A-Za-z]/.test(src[j] ?? "")) j++;
    i = j;
  };

  const readString = (quote: string): void => {
    let j = i + 1;
    let s = "";
    while (j < src.length && src[j] !== quote && src[j] !== "\n") {
      if (src[j] === "\\") {
        s += src.slice(j, j + 2);
        j += 2;
      } else {
        s += src[j];
        j++;
      }
    }
    i = j + 1;
    out += `"${strings.length}"`;
    strings.push(s);
  };

  const lex = (inTemplate: boolean): void => {
    let depth = 0;
    while (i < src.length) {
      const c = src[i] ?? "";
      const next = src[i + 1];
      if (c === "/" && next === "/") {
        const end = src.indexOf("\n", i);
        i = end === -1 ? src.length : end;
        out += " ";
      } else if (c === "/" && next === "*") {
        const end = src.indexOf("*/", i + 2);
        i = end === -1 ? src.length : end + 2;
        out += " ";
      } else if (c === '"' || c === "'") {
        readString(c);
        prev = '"';
      } else if (c === "`") {
        readTemplate();
        prev = "`";
      } else if (c === "/" && regexAllowed(prev)) {
        skipRegex();
        out += "0";
        prev = "0";
      } else if (/[\w$]/.test(c)) {
        let j = i;
        while (j < src.length && /[\w$]/.test(src[j] ?? "")) j++;
        prev = src.slice(i, j);
        out += prev;
        i = j;
      } else {
        if (c === "{") depth++;
        if (c === "}") {
          if (depth === 0 && inTemplate) return;
          depth--;
        }
        out += c;
        if (!/\s/.test(c)) prev = c;
        i++;
      }
    }
  };

  const readTemplate = (): void => {
    i++;
    out += "`";
    while (i < src.length && src[i] !== "`") {
      if (src[i] === "\\") i += 2;
      else if (src[i] === "$" && src[i + 1] === "{") {
        i += 2;
        out += "${";
        prev = "{";
        lex(true);
        out += "}";
        i++;
      } else i++;
    }
    i++;
    out += "`";
  };

  lex(false);
  return { code: out, strings };
}

const SPEC_POSITION_RE = /(?<![.\w$])(?:from\s*|import\s*\(?\s*)"(\d+)"/g;
const STATIC_IMPORT_RE =
  /\bimport\s*(?:([\w$]+)\s*(?:,\s*)?)?(\{[^}]*\}|\*\s*as\s+[\w$]+)?\s*from\s*"(\d+)"/g;
const BARE_IMPORT_RE = /\bimport\s*"(\d+)"/g;
const DYNAMIC_IMPORT_RE = /(?<![.\w$])import\s*\(\s*"(\d+)"\s*\)/g;
const EXPORT_FROM_RE = /\bexport\s*(\{[^}]*\}|\*(?:\s*as\s+[\w$]+)?)\s*from\s*"(\d+)"/g;

function specIs(m: Masked, index: string | undefined, spec: string): boolean {
  return index !== undefined && m.strings[Number(index)] === spec;
}

function addClauseNames(clause: string, names: Set<string>): void {
  for (const part of clause.slice(1, -1).split(",")) {
    const name = part.trim().split(/\s+as\s+/)[0];
    if (name) names.add(name);
  }
}

/** What a built bundle imports from the SDK, by exported name; `*` when it cannot be listed. */
export function sdkImportsOf(code: string): Set<string> {
  const m = mask(code);
  const names = new Set<string>();
  let accounted = 0;

  for (const [, def, clause, spec] of m.code.matchAll(STATIC_IMPORT_RE)) {
    if (!specIs(m, spec, SDK) || (def === undefined && clause === undefined)) continue;
    accounted++;
    if (def) names.add("default");
    if (clause?.startsWith("{")) addClauseNames(clause, names);
    else if (clause) names.add("*");
  }
  for (const [, spec] of m.code.matchAll(BARE_IMPORT_RE)) {
    if (specIs(m, spec, SDK)) accounted++;
  }
  for (const [, spec] of m.code.matchAll(DYNAMIC_IMPORT_RE)) {
    if (!specIs(m, spec, SDK)) continue;
    accounted++;
    names.add("*");
  }
  for (const [, clause = "", spec] of m.code.matchAll(EXPORT_FROM_RE)) {
    if (!specIs(m, spec, SDK)) continue;
    accounted++;
    if (clause.startsWith("{")) addClauseNames(clause, names);
    else names.add("*");
  }

  const positions = [...m.code.matchAll(SPEC_POSITION_RE)].filter(([, spec]) =>
    specIs(m, spec, SDK),
  ).length;
  if (positions > accounted) names.add("*");
  return names;
}

export function uiImportsOf(code: string): boolean {
  const m = mask(code);
  return [...m.code.matchAll(SPEC_POSITION_RE)].some(([, spec]) => specIs(m, spec, UI_SOLID));
}

const EXPORT_CLAUSE_RE = /\bexport\s*\{([^}]*)\}(?:\s*from\s*"(\d+)")?/g;
const EXPORT_STAR_RE = /\bexport\s*\*\s*(?:as\s+([\w$]+|"\d+")\s*)?from\s*"(\d+)"/g;
const EXPORT_DECL_RE =
  /\bexport\s+(?:(default)\b|(?:async\s+)?function\s*\*?\s*([\w$]+)|class\s+([\w$]+)|(?:const|let|var)\s+([\w$]+))/g;

function isRelative(spec: string): boolean {
  return spec.startsWith("./") || spec.startsWith("../");
}

function resolveSibling(fromFile: string, spec: string): string {
  const parts = fromFile
    .split("/")
    .slice(0, -1)
    .filter((p) => p !== ".");
  for (const seg of spec.split("/")) {
    if (seg === ".") continue;
    if (seg === ".." && parts.length > 0 && parts[parts.length - 1] !== "..") parts.pop();
    else parts.push(seg);
  }
  return parts[0] === ".." ? parts.join("/") : `./${parts.join("/")}`;
}

function unmaskName(m: Masked, name: string): string {
  const literal = /^"(\d+)"$/.exec(name);
  return literal ? (m.strings[Number(literal[1])] ?? name) : name;
}

function collectExports(
  file: string,
  code: string,
  readSibling: (spec: string) => string | null,
  seen: Set<string>,
  names: Set<string>,
): boolean {
  const m = mask(code);
  for (const [, clause = "", fromIndex] of m.code.matchAll(EXPORT_CLAUSE_RE)) {
    if (fromIndex !== undefined && !isRelative(m.strings[Number(fromIndex)] ?? "")) return false;
    for (const part of clause.split(",")) {
      const pieces = part.trim().split(/\s+as\s+/);
      const name = pieces[pieces.length - 1];
      if (name) names.add(unmaskName(m, name));
    }
  }
  for (const [, alias, fromIndex] of m.code.matchAll(EXPORT_STAR_RE)) {
    const from = m.strings[Number(fromIndex)] ?? "";
    if (!isRelative(from)) return false;
    if (alias) {
      names.add(unmaskName(m, alias));
      continue;
    }
    const sibling = resolveSibling(file, from);
    if (seen.has(sibling)) continue;
    seen.add(sibling);
    const siblingCode = readSibling(sibling);
    if (siblingCode === null) return false;
    if (!collectExports(sibling, siblingCode, readSibling, seen, names)) return false;
  }
  for (const match of m.code.matchAll(EXPORT_DECL_RE)) {
    const name = match.slice(1).find((g) => g !== undefined);
    if (name) names.add(name);
  }
  return true;
}

/** Names an ESM entry exports; null when a re-export leaves the package or a sibling is unreadable. */
export function exportNames(
  entryCode: string,
  readSibling: (spec: string) => string | null,
): string[] | null {
  const names = new Set<string>();
  if (!collectExports("./index.js", entryCode, readSibling, new Set(), names)) return null;
  return [...names].sort();
}

interface Version {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | undefined;
}

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

function parseVersion(v: string): Version | null {
  const m = VERSION_RE.exec(v);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), prerelease: m[4] };
}

function comparePrerelease(a: string, b: string): number {
  const as = a.split(".");
  const bs = b.split(".");
  for (let k = 0; k < Math.max(as.length, bs.length); k++) {
    const x = as[k];
    const y = bs[k];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) return Number(x) - Number(y);
    if (xn !== yn) return xn ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

function compareVersions(a: Version, b: Version): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (a.prerelease === undefined) return b.prerelease === undefined ? 0 : 1;
  if (b.prerelease === undefined) return -1;
  return comparePrerelease(a.prerelease, b.prerelease);
}

/** Semver order; unparseable versions sort last. */
export function compareSdkVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (pa && pb) return compareVersions(pa, pb);
  if (pa) return -1;
  if (pb) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export type FloorResult =
  | { floor: string; reason: "derived" | "namespace-import" | "direct-ui-import" }
  | { refused: string[] };

/** Lowest recorded release in the build SDK's major from which every imported name stays exported. */
export function deriveFloor(input: {
  code: string;
  history: Record<string, string[]>;
  buildSdk: string;
}): FloorResult {
  const { code, history, buildSdk } = input;
  const imported = sdkImportsOf(code);
  if (imported.has("*")) return { floor: buildSdk, reason: "namespace-import" };

  const names = [...imported];
  const buildExports = new Set(history[buildSdk] ?? []);
  const refused = names.filter((n) => !buildExports.has(n));
  if (refused.length > 0) return { refused };

  if (uiImportsOf(code)) return { floor: buildSdk, reason: "direct-ui-import" };

  const build = parseVersion(buildSdk);
  if (!build) return { refused: names };

  const older = Object.keys(history)
    .map((key) => ({ key, version: parseVersion(key) }))
    .filter(
      (e): e is { key: string; version: Version } =>
        e.version !== null &&
        e.version.prerelease === undefined &&
        e.version.major === build.major &&
        e.version.major >= 1 &&
        compareVersions(e.version, build) < 0,
    )
    .sort((a, b) => compareVersions(b.version, a.version));

  let floor = buildSdk;
  for (const entry of older) {
    const exported = new Set(history[entry.key]);
    if (!names.every((n) => exported.has(n))) break;
    floor = entry.key;
  }
  return { floor, reason: "derived" };
}
