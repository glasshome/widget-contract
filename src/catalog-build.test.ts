import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bundledCatalogModule,
  catalogModule,
  compileCatalogDir,
  writeCatalogModules,
  compileCatalogSource,
  pseudoCatalog,
} from "./catalog-build";

describe("compileCatalogSource", () => {
  test("compiles each value", () => {
    expect(compileCatalogSource(JSON.stringify({ "a.b": "Hello {name}" }), "en.json")).toEqual({
      "a.b": ["Hello ", { arg: "name" }],
    });
  });

  test("a bad value throws naming origin and key", () => {
    expect(() =>
      compileCatalogSource(JSON.stringify({ "bad.key": "{n, number}" }), "fr.json"),
    ).toThrow(/fr\.json: bad\.key: /);
  });
});

describe("pseudoCatalog", () => {
  test("accents letters and brackets the message", () => {
    expect(pseudoCatalog({ k: ["Hello ", { arg: "name" }] })).toEqual({
      k: ["[Hélló ", { arg: "name" }, " ~~~]"],
    });
  });

  test("accents plural branches, brackets only the top level", () => {
    const out = pseudoCatalog({
      k: [{ plural: "n", branches: { one: ["one item"], other: [{ pound: true }, " items"] } }],
    });
    expect(out).toEqual({
      k: [
        "[",
        {
          plural: "n",
          branches: { one: ["óñé ítém"], other: [{ pound: true }, " ítéms"] },
        },
        " ~~~~~~]",
      ],
    });
  });
});

describe("catalogModule", () => {
  test("emits a default-export module", () => {
    expect(catalogModule({ k: ["x"] })).toBe(`export default {"k":["x"]};\n`);
  });
});

describe("bundledCatalogModule", () => {
  test("emits the versioned bundle a widget's messages option reads", () => {
    expect(bundledCatalogModule({ k: ["x"] })).toBe(
      `export default {"v":1,"messages":{"k":["x"]}};\n`,
    );
  });
});

describe("writeCatalogModules", () => {
  test("writes one module per language plus the pseudo catalog, and the key type from English", () => {
    const dir = mkdtempSync(join(tmpdir(), "catalog-build-"));
    try {
      writeFileSync(join(dir, "en.json"), JSON.stringify({ "a.b": "Hello" }));
      writeFileSync(join(dir, "fr.json"), JSON.stringify({ "a.b": "Bonjour" }));
      const files = writeCatalogModules(dir, "DemoKey");
      expect(readdirSync(join(dir, "compiled")).sort()).toEqual(["en-XA.ts", "en.ts", "fr.ts"]);
      expect(files).toHaveLength(3);
      const en = readFileSync(join(dir, "compiled", "en.ts"), "utf-8");
      expect(en).toContain("export type DemoKey = keyof typeof catalog;");
      expect(readFileSync(join(dir, "compiled", "fr.ts"), "utf-8")).toContain("Bonjour");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("refuses a directory with no English", () => {
    const dir = mkdtempSync(join(tmpdir(), "catalog-build-"));
    try {
      writeFileSync(join(dir, "fr.json"), JSON.stringify({ k: "x" }));
      expect(() => writeCatalogModules(dir, "DemoKey")).toThrow(/no en\.json/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("compileCatalogDir", () => {
  test("compiles each language and adds the pseudo catalog", () => {
    const dir = mkdtempSync(join(tmpdir(), "catalog-build-"));
    try {
      writeFileSync(join(dir, "en.json"), JSON.stringify({ k: "Hi" }));
      writeFileSync(join(dir, "de.json"), JSON.stringify({ k: "Hallo" }));
      const catalogs = compileCatalogDir(dir);
      expect(Object.keys(catalogs).sort()).toEqual(["de", "en", "en-XA"]);
      expect(catalogs.de).toEqual({ k: ["Hallo"] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
