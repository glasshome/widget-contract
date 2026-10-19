const SDK_IMPORT_RE =
  /import\s*(\{[^}]*\}|\*\s*as\s+[\w$]+)\s*from\s*["']@glasshome\/widget-sdk["']/g;
const SDK_DYNAMIC_IMPORT_RE = /import\(\s*["']@glasshome\/widget-sdk["']\s*\)/;
const UI_IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']@glasshome\/ui\/solid["']/;

/** What a built bundle imports from the SDK, by exported name; `*` for a namespace or dynamic import. */
export function sdkImportsOf(code: string): Set<string> {
  const names = new Set<string>();
  if (SDK_DYNAMIC_IMPORT_RE.test(code)) names.add("*");
  for (const [, clause = ""] of code.matchAll(SDK_IMPORT_RE)) {
    if (!clause.startsWith("{")) {
      names.add("*");
      continue;
    }
    for (const part of clause.slice(1, -1).split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0];
      if (name) names.add(name);
    }
  }
  return names;
}

export function uiImportsOf(code: string): boolean {
  return UI_IMPORT_RE.test(code);
}

const EXPORT_CLAUSE_RE = /\bexport\s*\{([^}]*)\}(?:\s*from\s*["']([^"']+)["'])?/g;
const EXPORT_STAR_RE = /\bexport\s*\*\s*(?:as\s+([\w$]+)\s*)?from\s*["']([^"']+)["']/g;
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

function exportedNameOf(part: string): string | undefined {
  const pieces = part.trim().split(/\s+as\s+/);
  return pieces[pieces.length - 1] || undefined;
}

function collectExports(
  file: string,
  code: string,
  readSibling: (spec: string) => string | null,
  seen: Set<string>,
  names: Set<string>,
): boolean {
  for (const [, clause = "", from] of code.matchAll(EXPORT_CLAUSE_RE)) {
    if (from !== undefined && !isRelative(from)) return false;
    for (const part of clause.split(",")) {
      const name = exportedNameOf(part);
      if (name) names.add(name);
    }
  }
  for (const [, alias, from = ""] of code.matchAll(EXPORT_STAR_RE)) {
    if (!isRelative(from)) return false;
    if (alias) {
      names.add(alias);
      continue;
    }
    const sibling = resolveSibling(file, from);
    if (seen.has(sibling)) continue;
    seen.add(sibling);
    const siblingCode = readSibling(sibling);
    if (siblingCode === null) return false;
    if (!collectExports(sibling, siblingCode, readSibling, seen, names)) return false;
  }
  for (const match of code.matchAll(EXPORT_DECL_RE)) {
    const name = match.slice(1).find((m) => m !== undefined);
    if (name) names.add(name);
  }
  return true;
}

/**
 * Names an ESM entry exports, by static scan, following `export *` into relative siblings
 * (`readSibling` gets the specifier resolved against the entry's directory). Null when a
 * re-export points at a package or a sibling cannot be read.
 */
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

function compareVersions(a: Version, b: Version): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (a.prerelease === undefined) return b.prerelease === undefined ? 0 : 1;
  return b.prerelease === undefined ? -1 : 0;
}

export type FloorResult =
  | { floor: string; reason: "derived" | "namespace-import" | "direct-ui-import" }
  | { refused: string[] };

/**
 * The lowest SDK version whose exports cover every name `code` imports from the SDK,
 * walking down from `buildSdk` while each release in `history` still exports them all.
 * Never below 1.0.0 or the build SDK's major.
 */
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
        compareVersions(e.version, build) < 0,
    )
    .sort((a, b) => compareVersions(b.version, a.version));

  let floor = { key: buildSdk, version: build };
  for (const entry of older) {
    const exported = new Set(history[entry.key]);
    if (!names.every((n) => exported.has(n))) break;
    floor = entry;
  }

  const lowest = Math.max(1, build.major);
  if (floor.version.major < lowest) return { floor: `${lowest}.0.0`, reason: "derived" };
  return { floor: floor.key, reason: "derived" };
}
