import { describe, expect, test } from "bun:test";
import { PublishBodySchema } from "./manifest";
import { LOCALES } from "./sidecar-locale";
import { SIDECAR_LIMITS, sidecarPathRefusal } from "./sidecars";

describe("sidecarPathRefusal", () => {
  test("an image under files/ and a shipped locale pass", () => {
    expect(sidecarPathRefusal("files/hero.png", LOCALES)).toBeNull();
    expect(sidecarPathRefusal("locales/fr.json", LOCALES)).toBeNull();
  });

  test.each([
    "files/../index.js",
    "files/HERO.PNG",
    "files/hero.gif",
    "files/a%2fb.png",
    "locales/__proto__.json",
    "files/.hidden.png",
  ])("%s is refused as grammar", (path) => {
    expect(sidecarPathRefusal(path, LOCALES)).toBe("grammar");
  });

  test("the bundle files are reserved", () => {
    expect(sidecarPathRefusal("index.css", LOCALES)).toBe("reserved");
    expect(sidecarPathRefusal("index.js", LOCALES)).toBe("reserved");
    expect(sidecarPathRefusal(".env", LOCALES)).toBe("reserved");
  });

  test("a locale outside the list is refused", () => {
    expect(sidecarPathRefusal("locales/en-XA.json", LOCALES)).toBe("locale");
    expect(sidecarPathRefusal("locales/pt.json", LOCALES)).toBe("locale");
  });
});

describe("publish fields", () => {
  const request = {
    action: "request",
    scope: "glasshome",
    name: "climate",
    displayName: "Climate",
    minSize: { w: 1, h: 1 },
    maxSize: { w: 2, h: 2 },
    sdkVersion: "^1.0.0",
    version: "1.0.0",
    bundleSize: 10,
    sha256Hash: "a",
    manifestJson: "{}",
  };
  const file = { path: "files/hero.png", sha256: "a".repeat(64), bytes: 5 };

  test("files are optional on request and confirm", () => {
    expect(PublishBodySchema.safeParse(request).success).toBe(true);
    expect(PublishBodySchema.safeParse({ ...request, files: [file] }).success).toBe(true);
    expect(
      PublishBodySchema.safeParse({ action: "confirm", versionId: "v", files: [file] }).success,
    ).toBe(true);
  });

  test("more files than the limit are refused", () => {
    const files = Array.from({ length: SIDECAR_LIMITS.files + 1 }, () => file);
    expect(PublishBodySchema.safeParse({ ...request, files }).success).toBe(false);
  });

  test("a malformed digest is refused", () => {
    expect(
      PublishBodySchema.safeParse({ ...request, files: [{ ...file, sha256: "zz" }] }).success,
    ).toBe(false);
  });
});
