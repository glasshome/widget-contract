import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  localizeManifest,
  reservedKeys,
  reservedRefusals,
  reservedSegment,
} from "./catalog-reserved";
import { CATALOG_LIMITS, KEY_PATTERN } from "./i18n";
import { WIDGET_FIELD_LIMITS, widgetManifestSchema, type WidgetManifest } from "./manifest";

const manifest = (extra: Record<string, unknown> = {}): WidgetManifest =>
  widgetManifestSchema.parse({
    name: "Climate",
    description: "Heat and cool",
    minSize: { w: 1, h: 1 },
    maxSize: { w: 2, h: 2 },
    sdkVersion: "^1.0.0",
    examples: [{ label: "Living room" }],
    schema: {
      type: "object",
      properties: {
        mode: { type: "string", title: "Mode", labels: { heat_cool: "Heat and cool" } },
      },
    },
    ...extra,
  });

const withSchema = (schema: Record<string, unknown>) => manifest({ schema });

describe("reservedKeys", () => {
  test("covers name, description, example labels and schema text", () => {
    expect(reservedKeys(manifest())).toEqual({
      "manifest.name": "Climate",
      "manifest.description": "Heat and cool",
      "manifest.examples.0.label": "Living room",
      "manifest.config.mode.title": "Mode",
      "manifest.config.mode.labels.heat_cool": "Heat and cool",
    });
  });

  test("reads placeholder, addLabel, description and presets", () => {
    const keys = reservedKeys(
      withSchema({
        type: "object",
        properties: {
          pic: {
            title: "Picture",
            description: "Pick one",
            placeholder: "None",
            addLabel: "Add picture",
            presets: { coast: { label: "Coast", thumb: "data:" } },
          },
        },
      }),
    );
    expect(keys).toMatchObject({
      "manifest.config.pic.title": "Picture",
      "manifest.config.pic.description": "Pick one",
      "manifest.config.pic.placeholder": "None",
      "manifest.config.pic.add-label": "Add picture",
      "manifest.config.pic.presets.coast.label": "Coast",
    });
  });
});

describe("reservedSegment", () => {
  test("plain segments stay, others become x- plus base32", () => {
    expect(reservedSegment("heat_cool")).toBe("heat_cool");
    expect(reservedSegment("Heat Cool")).toBe("x-jbswc5bainxw63a");
    expect(reservedSegment("x-ab")).toBe("x-pawwcyq");
    expect(reservedSegment("_a")).toBe("x-l5qq");
  });
});

describe("injectivity", () => {
  const titles = (schema: Record<string, unknown>) => Object.keys(reservedKeys(withSchema(schema)));
  const keysOf = (schema: Record<string, unknown>) =>
    titles(schema).filter((k) => k.startsWith("manifest.config."));

  test("each pair gives different, valid keys", () => {
    const dotted = keysOf({ properties: { "a.b": { title: "T" } } });
    const nested = keysOf({ properties: { a: { properties: { b: { title: "T" } } } } });
    const upper = keysOf({ properties: { X: { title: "T" } } });
    const lower = keysOf({ properties: { x: { title: "T" } } });
    const named = keysOf({ properties: { items: { title: "T" } } });
    const array = keysOf({ properties: { list: { items: { title: "T" } } } });
    const arrayNamed = keysOf({ properties: { list: { properties: { items: { title: "T" } } } } });
    expect(dotted).not.toEqual(nested);
    expect(upper).not.toEqual(lower);
    expect(named).not.toEqual(keysOf({ items: { title: "T" } }));
    expect(array).not.toEqual(arrayNamed);
    for (const key of [...dotted, ...nested, ...upper, ...lower, ...named, ...array]) {
      expect(KEY_PATTERN.test(key)).toBe(true);
    }
  });

  test("two oneOf branches with the same property keep both titles", () => {
    const keys = reservedKeys(
      withSchema({
        properties: {
          chips: {
            items: {
              oneOf: [
                { properties: { entityId: { title: "First" } } },
                { properties: { entityId: { title: "Second" } } },
              ],
            },
          },
        },
      }),
    );
    const titleKeys = Object.keys(keys).filter((k) => k.endsWith(".title"));
    expect(titleKeys).toHaveLength(2);
    expect(Object.values(keys)).toEqual(expect.arrayContaining(["First", "Second"]));
  });
});

describe("first-party manifests", () => {
  const widgetsDir = join(import.meta.dir, "../../widgets/src");
  const present = existsSync(widgetsDir);
  // docs/work/2026-11-03-localization-1-6: skipped only where the widgets submodule is not checked out
  const run = present ? test : test.skip;

  run("every manifest walks without duplicate or over-long keys", () => {
    const names = readdirSync(widgetsDir).filter((n) =>
      existsSync(join(widgetsDir, n, "manifest.json")),
    );
    expect(names).toHaveLength(21);
    for (const name of names) {
      const parsed = widgetManifestSchema.parse(
        JSON.parse(readFileSync(join(widgetsDir, name, "manifest.json"), "utf8")),
      );
      const entries = reservedKeys(parsed);
      for (const key of Object.keys(entries)) {
        expect(key.length).toBeLessThanOrEqual(128);
        expect(KEY_PATTERN.test(key)).toBe(true);
      }
      expect(reservedRefusals(parsed, {}).filter((r) => r.reason === "key-too-long")).toEqual([]);
    }
  });

  run("the header chip branches produce distinct title keys", () => {
    const parsed = widgetManifestSchema.parse(
      JSON.parse(readFileSync(join(widgetsDir, "header/manifest.json"), "utf8")),
    );
    const keys = Object.keys(reservedKeys(parsed)).filter((k) =>
      k.includes("x-items-all.x-oneof-"),
    );
    expect(keys.length).toBeGreaterThan(1);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.some((k) => k.includes(".x-oneof-0."))).toBe(true);
    expect(keys.some((k) => k.includes(".x-oneof-1."))).toBe(true);
  });
});

describe("reservedRefusals", () => {
  test("ICU syntax in a value", () => {
    const m = withSchema({
      properties: { mode: { labels: { heat_cool: "{n} rooms" } } },
    });
    expect(reservedRefusals(m, {})).toEqual([
      { key: "manifest.config.mode.labels.heat_cool", reason: "icu" },
    ]);
  });

  test("an author key under manifest.", () => {
    expect(reservedRefusals(manifest(), { "manifest.name": "Mine", "app.title": "Fine" })).toEqual([
      { key: "manifest.name", reason: "author-defined" },
    ]);
  });

  test("a key past 128 characters", () => {
    let node: Record<string, unknown> = { title: "Deep" };
    for (let i = 0; i < 6; i++) node = { properties: { [`property_number_${i}_long`]: node } };
    const refusals = reservedRefusals(withSchema(node), {});
    expect(refusals).toHaveLength(1);
    expect(refusals[0]?.reason).toBe("key-too-long");
  });

  test("a value past its limit", () => {
    const m = manifest({ name: "n".repeat(WIDGET_FIELD_LIMITS.displayName + 1) });
    expect(reservedRefusals(m, {})).toEqual([{ key: "manifest.name", reason: "too-long" }]);
  });

  test("limits match the catalog limits", () => {
    const long = "k".repeat(CATALOG_LIMITS.keyChars + 1);
    const m = withSchema({ properties: { [long]: { title: "T" } } });
    expect(reservedRefusals(m, {}).map((r) => r.reason)).toEqual(["key-too-long"]);
    const text = withSchema({
      properties: { mode: { title: "t".repeat(CATALOG_LIMITS.valueChars + 1) } },
    });
    expect(reservedRefusals(text, {}).map((r) => r.reason)).toEqual(["too-long"]);
  });
});

describe("duplicate keys", () => {
  const labelsClash = withSchema({
    properties: { mode: { labels: { title: "X" }, properties: { labels: { title: "Y" } } } },
  });

  test("labels entry and a child property named labels refuse, first value kept", () => {
    expect(reservedKeys(labelsClash)["manifest.config.mode.labels.title"]).toBe("X");
    expect(reservedRefusals(labelsClash, {})).toEqual([
      { key: "manifest.config.mode.labels.title", reason: "duplicate-key" },
    ]);
  });

  test("presets never collide: their keys end in .label, no node field does", () => {
    const m = withSchema({
      properties: {
        pic: {
          presets: { title: { label: "X" }, label: { label: "Y" } },
          properties: { presets: { title: "Z", properties: { title: { title: "W" } } } },
        },
      },
    });
    expect(reservedRefusals(m, {})).toEqual([]);
    expect(Object.keys(reservedKeys(m))).toHaveLength(7);
  });
});

describe("long descriptions", () => {
  test("over 2000 characters is not reserved, refused or localized", () => {
    const m = manifest({ description: "d".repeat(2500) });
    expect(reservedKeys(m)["manifest.description"]).toBeUndefined();
    expect(reservedRefusals(m, {})).toEqual([]);
    expect(localizeManifest(m, () => "fr").description).toBeUndefined();
  });
  test("2000 characters is reserved", () => {
    const m = manifest({ description: "d".repeat(2000) });
    expect(reservedKeys(m)["manifest.description"]).toHaveLength(2000);
    expect(reservedRefusals(m, {})).toEqual([]);
  });
});

describe("localizeManifest", () => {
  test("changes only the looked-up nodes and never name or displayName", () => {
    const source = manifest({ displayName: "Climate" });
    const before = structuredClone(source);
    const out = localizeManifest(source, (key) =>
      key === "manifest.name"
        ? "Climat"
        : key === "manifest.config.mode.title"
          ? "Mode (fr)"
          : undefined,
    );
    expect(out.localizedName).toBe("Climat");
    expect(out.description).toBeUndefined();
    expect(out.exampleLabels).toEqual([undefined]);
    const expected = structuredClone(before.schema) as {
      properties: { mode: { title: string } };
    };
    expected.properties.mode.title = "Mode (fr)";
    expect(out.schema).toEqual(expected);
    expect(source).toEqual(before);
    expect(source.name).toBe("Climate");
    expect(source.displayName).toBe("Climate");
  });

  test("translates description, example labels and option labels", () => {
    const out = localizeManifest(manifest(), (key) => `fr:${key}`);
    expect(out.description).toBe("fr:manifest.description");
    expect(out.exampleLabels).toEqual(["fr:manifest.examples.0.label"]);
    expect(JSON.stringify(out.schema)).toContain("fr:manifest.config.mode.labels.heat_cool");
  });
});
