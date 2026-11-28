import { collect, type ManifestWords, MAX_TEXT_CHARS } from "./catalog-keys";
import { compileMessage, parseCatalog } from "./i18n";
import { nameRefusal } from "./name-refusal";

export {
  type JsonSchema,
  localizeManifest,
  type LocalizedManifestText,
  type ManifestWords,
  reservedSegment,
} from "./catalog-keys";

export type ReservedRefusal = {
  key: string;
  reason:
    | "grammar"
    | "too-long"
    | "author-defined"
    | "duplicate-key"
    | "unknown-key"
    | "left-out"
    | "name";
};

const MAX_NAME_CHARS = 100;

/** The text the catalog grammar holds for `value` as plain words under `key`; undefined when it cannot. */
function carried(key: string, value: string): string | undefined {
  if (key === "manifest.name" && value.length > MAX_NAME_CHARS) return undefined;
  const parsed = parseCatalog(JSON.stringify({ [key]: value }));
  const text = parsed.ok ? parsed.value.get(key) : undefined;
  if (text === undefined) return undefined;
  const compiled = compileMessage(text);
  if (!compiled.ok) return undefined;
  const literal = compiled.value.filter((part): part is string => typeof part === "string");
  return literal.length === compiled.value.length && literal.join("") === text ? text : undefined;
}

function firstPerKey(manifest: ManifestWords): Map<string, string> {
  const first = new Map<string, string>();
  for (const { key, value } of collect(manifest)) {
    if (!first.has(key)) first.set(key, value);
  }
  return first;
}

/** The manifest's English under its reserved keys; a value the catalog grammar cannot carry stays out and shows untranslated. */
export function reservedKeys(manifest: ManifestWords): Readonly<Record<string, string>> {
  const keys: Record<string, string> = {};
  for (const [key, value] of firstPerKey(manifest)) {
    const text = carried(key, value);
    if (text !== undefined) keys[key] = text;
  }
  return keys;
}

/** Reserved keys whose manifest text the catalog grammar cannot carry, so they stay English in every language. */
export function reservedKeysLeftOut(manifest: ManifestWords): string[] {
  return [...firstPerKey(manifest)]
    .filter(([key, value]) => carried(key, value) === undefined)
    .map(([key]) => key);
}

export function reservedRefusals(
  manifest: ManifestWords,
  authorEnglish: Record<string, string>,
): ReservedRefusal[] {
  const refusals: ReservedRefusal[] = [];
  for (const key of Object.keys(authorEnglish)) {
    if (key.startsWith("manifest.")) refusals.push({ key, reason: "author-defined" });
  }
  const seen = new Set<string>();
  for (const { key } of collect(manifest)) {
    if (seen.has(key)) refusals.push({ key, reason: "duplicate-key" });
    seen.add(key);
  }
  return refusals;
}

export function reservedLocaleRefusals(
  manifest: ManifestWords,
  catalog: Record<string, string>,
): ReservedRefusal[] {
  const derived = reservedKeys(manifest);
  const leftOut = new Set(reservedKeysLeftOut(manifest));
  const refusals: ReservedRefusal[] = [];
  for (const [key, value] of Object.entries(catalog)) {
    if (!key.startsWith("manifest.")) continue;
    if (leftOut.has(key)) refusals.push({ key, reason: "left-out" });
    else if (!Object.hasOwn(derived, key)) refusals.push({ key, reason: "unknown-key" });
    else if (value.length > (key === "manifest.name" ? MAX_NAME_CHARS : MAX_TEXT_CHARS)) {
      refusals.push({ key, reason: "too-long" });
    } else if (key === "manifest.name" && nameRefusal(value)) {
      refusals.push({ key, reason: "name" });
    } else if (carried(key, value) === undefined) refusals.push({ key, reason: "grammar" });
  }
  return refusals;
}
