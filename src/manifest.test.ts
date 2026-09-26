import { describe, expect, test } from "bun:test";
import { bundleKey } from "./bundle-key";
import { PublishRequestSchema, publishManifestSchema, widgetManifestSchema } from "./manifest";

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
    expect(publishManifestSchema.safeParse({ ...baseManifest, capabilities: [] }).success).toBe(
      true,
    );
  });

  test("pre-1.0 manifest without capabilities is accepted (legacy)", () => {
    expect(publishManifestSchema.safeParse({ ...baseManifest, sdkVersion: "^0.5.2" }).success).toBe(
      true,
    );
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

describe("publish request names and versions", () => {
  const request = {
    action: "request",
    scope: "glasshome",
    name: "binary-sensor",
    displayName: "Binary Sensor",
    version: "1.2.0",
    minSize: { w: 1, h: 1 },
    maxSize: { w: 4, h: 4 },
    sdkVersion: "^1.0.0",
    bundleSize: 10,
    sha256Hash: "abc",
    manifestJson: "{}",
  };
  const accepts = (patch: Record<string, unknown>) =>
    PublishRequestSchema.safeParse({ ...request, ...patch }).success;

  test("accepts a plain name and a semver version", () => {
    expect(accepts({})).toBe(true);
    expect(accepts({ version: "1.0.0-beta.1" })).toBe(true);
  });

  test("refuses names that could leave their path segment", () => {
    for (const name of ["..", "%2e%2e", "a/b", "A", "-a", "a".repeat(65), ""]) {
      expect(accepts({ name })).toBe(false);
    }
  });

  test("refuses versions that are not strict semver", () => {
    for (const version of ["..", "../x", "v1.0.0", "1.0", "1.0.0/..", `1.0.0-${"a".repeat(64)}`]) {
      expect(accepts({ version })).toBe(false);
    }
  });
});

describe("bundleKey segments", () => {
  test("refuses dot segments, separators and encodings", () => {
    for (const bad of ["..", ".", "a/b", "a\\b", "%2e%2e", ""]) {
      expect(() => bundleKey("glasshome", bad, "1.0.0", "index.js")).toThrow();
      expect(() => bundleKey("glasshome", "clock", bad, "index.js")).toThrow();
    }
  });
});
