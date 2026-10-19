import { type ImportSpecifier, ImportType, initSync, parse } from "es-module-lexer";

const SDK = "@glasshome/widget-sdk";
const UI_SOLID = "@glasshome/ui/solid";

type Lexed = ReturnType<typeof parse>;

function lex(code: string): Lexed | null {
  initSync();
  try {
    return parse(code);
  } catch {
    return null;
  }
}

const IMPORT_CLAUSE_RE =
  /^import\s*(?:([\w$]+)\s*(?:,\s*)?)?(\{[^}]*\}|\*\s*as\s+[\w$]+)?\s*from\b/;
const BARE_IMPORT_RE = /^import\s*["']/;
const EXPORT_FROM_RE = /^export\s*(\{[^}]*\}|\*(?:\s*as\s+[\w$]+)?)\s*from\b/;

function addClauseNames(clause: string, names: Set<string>): void {
  for (const part of clause.slice(1, -1).split(",")) {
    const name = part.trim().split(/\s+as\s+/)[0];
    if (name) names.add(name);
  }
}

function readStaticClause(raw: string, names: Set<string>): void {
  const statement = raw.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, " ");
  const exported = EXPORT_FROM_RE.exec(statement);
  if (exported) {
    const clause = exported[1] ?? "";
    if (clause.startsWith("{")) addClauseNames(clause, names);
    else names.add("*");
    return;
  }
  if (BARE_IMPORT_RE.test(statement)) return;
  const imported = IMPORT_CLAUSE_RE.exec(statement);
  if (!imported || (imported[1] === undefined && imported[2] === undefined)) {
    names.add("*");
    return;
  }
  if (imported[1]) names.add("default");
  const clause = imported[2];
  if (clause?.startsWith("{")) addClauseNames(clause, names);
  else if (clause) names.add("*");
}

function isDynamic(imp: ImportSpecifier): boolean {
  return (
    imp.t === ImportType.Dynamic ||
    imp.t === ImportType.DynamicSourcePhase ||
    imp.t === ImportType.DynamicDeferPhase
  );
}

/** What a built bundle imports from the SDK, by exported name; `*` when it cannot be listed. */
export function sdkImportsOf(code: string): Set<string> {
  const lexed = lex(code);
  if (!lexed) return new Set(["*"]);
  const names = new Set<string>();
  let reported = 0;
  for (const imp of lexed[0]) {
    if (imp.t === ImportType.ImportMeta) continue;
    if (isDynamic(imp)) {
      if (imp.n === undefined) names.add("*");
      else if (imp.n === SDK) {
        reported++;
        names.add("*");
      }
      continue;
    }
    if (imp.n !== SDK) continue;
    reported++;
    if (imp.t === ImportType.Static) readStaticClause(code.slice(imp.ss, imp.se), names);
    else names.add("*");
  }
  if (code.split(SDK).length - 1 > reported) names.add("*");
  return names;
}

export function uiImportsOf(code: string): boolean {
  return lex(code)?.[0].some((imp) => imp.n === UI_SOLID) ?? false;
}

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

const NAMED_OR_NAMESPACE_REEXPORT_RE = /^export\s*(?:\{|\*\s*as\b)/;

function collectExports(
  file: string,
  code: string,
  readSibling: (spec: string) => string | null,
  seen: Set<string>,
  names: Set<string>,
): boolean {
  const lexed = lex(code);
  if (!lexed) return false;
  const [imports, exports] = lexed;
  for (const exp of exports) names.add(exp.n);
  for (const imp of imports) {
    if (imp.t !== ImportType.Static) continue;
    const statement = code.slice(imp.ss, imp.se);
    if (!statement.startsWith("export")) continue;
    if (imp.n === undefined || !isRelative(imp.n)) return false;
    if (NAMED_OR_NAMESPACE_REEXPORT_RE.test(statement)) continue;
    const sibling = resolveSibling(file, imp.n);
    if (seen.has(sibling)) continue;
    seen.add(sibling);
    const siblingCode = readSibling(sibling);
    if (siblingCode === null) return false;
    if (!collectExports(sibling, siblingCode, readSibling, seen, names)) return false;
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
