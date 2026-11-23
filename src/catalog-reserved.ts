import type { WidgetManifest } from "./manifest";

export type JsonSchema = Record<string, unknown>;

export interface LocalizedManifestText {
  localizedName?: string;
  description?: string;
  exampleLabels: (string | undefined)[];
  schema: JsonSchema;
}

export type ReservedRefusal = {
  key: string;
  reason: "icu" | "too-long" | "key-too-long" | "author-defined" | "duplicate-key";
};

const MAX_KEY_CHARS = 128;
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

function collect(manifest: WidgetManifest): Entry[] {
  const out: Entry[] = [{ key: "manifest.name", value: manifest.name, set: () => {} }];
  if (manifest.description !== undefined && manifest.description.length <= MAX_TEXT_CHARS) {
    out.push({ key: "manifest.description", value: manifest.description, set: () => {} });
  }
  const examples: unknown = manifest["examples"];
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

export function reservedKeys(manifest: WidgetManifest): Readonly<Record<string, string>> {
  const keys: Record<string, string> = {};
  for (const { key, value } of collect(manifest)) {
    if (!Object.hasOwn(keys, key)) keys[key] = value;
  }
  return keys;
}

export function reservedRefusals(
  manifest: WidgetManifest,
  authorEnglish: Record<string, string>,
): ReservedRefusal[] {
  const refusals: ReservedRefusal[] = [];
  for (const key of Object.keys(authorEnglish)) {
    if (key.startsWith("manifest.")) refusals.push({ key, reason: "author-defined" });
  }
  const seen = new Set<string>();
  for (const { key, value } of collect(manifest)) {
    if (seen.has(key)) {
      refusals.push({ key, reason: "duplicate-key" });
      continue;
    }
    seen.add(key);
    if (key.length > MAX_KEY_CHARS) refusals.push({ key, reason: "key-too-long" });
    else if (value.includes("{")) refusals.push({ key, reason: "icu" });
    else if (value.length > (key === "manifest.name" ? MAX_NAME_CHARS : MAX_TEXT_CHARS)) {
      refusals.push({ key, reason: "too-long" });
    }
  }
  return refusals;
}

export function localizeManifest(
  manifest: WidgetManifest,
  lookup: (key: string) => string | undefined,
): LocalizedManifestText {
  const schema: JsonSchema = structuredClone(manifest.schema ?? {});
  const entries = collect({ ...manifest, schema });
  for (const entry of entries) {
    const translated = lookup(entry.key);
    if (translated !== undefined) entry.set(translated);
  }
  const examples: unknown = manifest["examples"];
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
