import { describe, expect, test } from "bun:test";
import { catalogModule, compileCatalogSource, pseudoCatalog } from "./catalog-build";

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
