import { compileMessage, parseCatalog } from "./i18n";
import { nameRefusal } from "./name-refusal";

export type JsonSchema = Record<string, unknown>;

export interface LocalizedManifestText {
  localizedName?: string;
  description?: string;
  exampleLabels: (string | undefined)[];
  schema: JsonSchema;
}

/** What reserving and localizing read of a manifest; the contract's, the SDK's and the CLI's manifest types all fit. */
export interface ManifestWords {
  name: string;
  description?: string;
  schema?: object;
  examples?: unknown;
}

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
const MAX_TEXT_CHARS = 2000;

const PLAIN_SEGMENT = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

function base32(bytes: Uint8Array): string {
  let out = "";
  let bits = 0;
  let acc = 0;
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
    acc &= (1 << bits) - 1;
  }
  if (bits > 0) out += BASE32[(acc << (5 - bits)) & 31];
  return out;
}

export function reservedSegment(raw: string): string {
  if (PLAIN_SEGMENT.test(raw) && !raw.startsWith("x-")) return raw;
  return `x-${base32(new TextEncoder().encode(raw))}`;
}

interface Entry {
  key: string;
  value: string;
  set(text: string): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function walkNode(node: unknown, path: readonly string[], out: Entry[]): void {
  if (!isRecord(node)) return;
  const prefix = ["manifest", "config", ...path].join(".");
  const text = (field: string, suffix: string) => {
    const value = node[field];
    if (typeof value === "string") {
      out.push({ key: `${prefix}.${suffix}`, value, set: (t) => void (node[field] = t) });
    }
  };
  text("title", "title");
  text("description", "description");
  text("placeholder", "placeholder");
  text("addLabel", "add-label");

  const labels = node["labels"];
  if (isRecord(labels)) {
    for (const [id, value] of Object.entries(labels)) {
      if (typeof value === "string") {
        out.push({
          key: `${prefix}.labels.${reservedSegment(id)}`,
          value,
          set: (t) => void (labels[id] = t),
        });
      }
    }
  }
  const presets = node["presets"];
  if (isRecord(presets)) {
    for (const [id, preset] of Object.entries(presets)) {
      if (isRecord(preset) && typeof preset["label"] === "string") {
        out.push({
          key: `${prefix}.presets.${reservedSegment(id)}.label`,
          value: preset["label"],
          set: (t) => void (preset["label"] = t),
        });
      }
    }
  }

  const properties = node["properties"];
  if (isRecord(properties)) {
    for (const [name, child] of Object.entries(properties)) {
      walkNode(child, [...path, reservedSegment(name)], out);
    }
  }
  walkNode(node["items"], [...path, "x-items-all"], out);
  const branches = node["oneOf"];
  if (Array.isArray(branches)) {
    branches.forEach((branch, i) => walkNode(branch, [...path, `x-oneof-${i}`], out));
  }
}

function collect(manifest: ManifestWords): Entry[] {
  const out: Entry[] = [{ key: "manifest.name", value: manifest.name, set: () => {} }];
  if (manifest.description !== undefined && manifest.description.length <= MAX_TEXT_CHARS) {
    out.push({ key: "manifest.description", value: manifest.description, set: () => {} });
  }
  const examples = manifest.examples;
  if (Array.isArray(examples)) {
    examples.forEach((example, i) => {
      if (isRecord(example) && typeof example["label"] === "string") {
        out.push({
          key: `manifest.examples.${i}.label`,
          value: example["label"],
          set: () => {},
        });
      }
    });
  }
  walkNode(manifest.schema, [], out);
  return out;
}

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

export function localizeManifest(
  manifest: ManifestWords,
  lookup: (key: string) => string | undefined,
): LocalizedManifestText {
  const schema: JsonSchema = { ...structuredClone(manifest.schema ?? {}) };
  const entries = collect({ ...manifest, schema });
  for (const entry of entries) {
    const translated = lookup(entry.key);
    if (translated !== undefined) entry.set(translated);
  }
  const examples = manifest.examples;
  const exampleLabels = Array.isArray(examples)
    ? examples.map((_, i) => lookup(`manifest.examples.${i}.label`))
    : [];
  const result: LocalizedManifestText = { exampleLabels, schema };
  const localizedName = lookup("manifest.name");
  if (localizedName !== undefined) result.localizedName = localizedName;
  if (manifest.description !== undefined && manifest.description.length <= MAX_TEXT_CHARS) {
    const description = lookup("manifest.description");
    if (description !== undefined) result.description = description;
  }
  return result;
}
