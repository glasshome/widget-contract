import { describe, expect, test } from "bun:test";
import { bundleKey } from "./bundle-key";
import { publishManifestSchema, widgetManifestSchema } from "./manifest";

const baseManifest = {
  name: "Clock",
  minSize: { w: 1, h: 1 },
  maxSize: { w: 4, h: 4 },
  sdkVersion: "^1.0.0",
};

describe("widgetManifestSchema", () => {
  test("accepts a minimal manifest", () => {
    expect(widgetManifestSchema.safeParse(baseManifest).success).toBe(true);
  });

  test("passes through unknown keys", () => {
    const result = widgetManifestSchema.parse({ ...baseManifest, futureField: 42 });
    expect((result as Record<string, unknown>).futureField).toBe(42);
  });

  test("declares defaultSize (previously only in the TS interface, hidden by passthrough)", () => {
    const result = widgetManifestSchema.safeParse({
      ...baseManifest,
      defaultSize: { w: 2, h: 2 },
    });
    expect(result.success).toBe(true);
    expect(
      widgetManifestSchema.safeParse({ ...baseManifest, defaultSize: { w: 0, h: 2 } }).success,
    ).toBe(false);
  });

  test("accepts hub round-trip manifests with legacy tag field", () => {
    const result = widgetManifestSchema.safeParse({
      ...baseManifest,
      tag: "glasshome-clock",
      version: "1.0.0",
      scope: "glasshome",
      permissions: [],
    });
    expect(result.success).toBe(true);
  });

  test("rejects malformed capabilities", () => {
    expect(
      widgetManifestSchema.safeParse({
        ...baseManifest,
        capabilities: [{ domain: "light" }],
      }).success,
    ).toBe(false);
  });
});

describe("publishManifestSchema", () => {
  test("1.x manifest without capabilities is rejected", () => {
    expect(publishManifestSchema.safeParse(baseManifest).success).toBe(false);
  });

  test("1.x manifest with empty capabilities is accepted", () => {
    expect(
      publishManifestSchema.safeParse({ ...baseManifest, capabilities: [] }).success,
    ).toBe(true);
  });

  test("pre-1.0 manifest without capabilities is accepted (legacy)", () => {
    expect(
      publishManifestSchema.safeParse({ ...baseManifest, sdkVersion: "^0.5.2" }).success,
    ).toBe(true);
  });
});

describe("bundleKey", () => {
  test("matches the historical hub r2 layout", () => {
    expect(bundleKey("glasshome", "clock", "1.0.0", "index.js")).toBe(
      "@glasshome/clock/1.0.0/index.js",
    );
  });

  test("css variant", () => {
    expect(bundleKey("glasshome", "clock", "1.0.0", "index.css")).toBe(
      "@glasshome/clock/1.0.0/index.css",
    );
  });
});
