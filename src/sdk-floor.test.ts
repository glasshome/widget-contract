import { describe, expect, test } from "bun:test";
import { deriveFloor, exportNames, sdkImportsOf, uiImportsOf } from "./sdk-floor";

const minified = `import{Widget as a,useDaylight as b}from"@glasshome/widget-sdk";`;
const spaced = `import { Badge as p, useDaylight as pe, useService as O } from "@glasshome/widget-sdk";`;

describe("sdkImportsOf", () => {
  test("reads imported names, not local aliases, in minified and spaced output", () => {
    expect([...sdkImportsOf(minified)]).toEqual(["Widget", "useDaylight"]);
    expect(sdkImportsOf(spaced).has("useDaylight")).toBe(true);
    expect(sdkImportsOf(spaced).has("pe")).toBe(false);
  });

  test("a namespace import counts as every export", () => {
    expect([...sdkImportsOf(`import*as s from"@glasshome/widget-sdk";`)]).toEqual(["*"]);
  });

  test("a dynamic import counts as every export", () => {
    expect(sdkImportsOf(`const s=await import("@glasshome/widget-sdk");`).has("*")).toBe(true);
  });

  test("imports from other modules are ignored", () => {
    expect(sdkImportsOf(`import{useDaylight}from"./local";`).size).toBe(0);
  });
});

describe("uiImportsOf", () => {
  test("sees static, bare and dynamic imports of the ui solid entry", () => {
    expect(uiImportsOf(`import{Button as b}from"@glasshome/ui/solid";`)).toBe(true);
    expect(uiImportsOf(`import "@glasshome/ui/solid";`)).toBe(true);
    expect(uiImportsOf(`const u=await import("@glasshome/ui/solid");`)).toBe(true);
  });

  test("ignores the sdk and other ui paths", () => {
    expect(uiImportsOf(minified)).toBe(false);
    expect(uiImportsOf(`import{t}from"@glasshome/ui/tokens";`)).toBe(false);
  });
});

describe("exportNames", () => {
  test("follows export star into a relative sibling", () => {
    expect(exportNames("export { a }; export * from './c.js'", () => "export { b }")).toEqual([
      "a",
      "b",
    ]);
  });

  test("a re-export from a package cannot be scanned", () => {
    expect(exportNames(`export { Button } from "@glasshome/ui/solid";`, () => null)).toBeNull();
    expect(exportNames(`export * from "@glasshome/ui/solid";`, () => null)).toBeNull();
  });

  test("reads the exported name of each alias, declarations and default", () => {
    const code = `export{Y as Widget,ee as useEntity,a as z};export const SDK_VERSION="1";export function f(){}export class K{}export default 1;`;
    expect(exportNames(code, () => null)).toEqual([
      "K",
      "SDK_VERSION",
      "Widget",
      "default",
      "f",
      "useEntity",
      "z",
    ]);
  });

  test("named re-exports and namespace re-exports from siblings", () => {
    const files: Record<string, string> = {
      "./a.js": `export { x as y } from "./sub/b.js"; export * as ns from "./sub/b.js"; export * from "./sub/b.js";`,
      "./sub/b.js": `export { w, x }; export * from "../c.js";`,
      "./c.js": `export { deep };`,
    };
    expect(exportNames(`export * from "./a.js";`, (spec) => files[spec] ?? null)).toEqual([
      "deep",
      "ns",
      "w",
      "x",
      "y",
    ]);
  });

  test("a sibling that cannot be read cannot be scanned", () => {
    expect(exportNames(`export * from "./gone.js";`, () => null)).toBeNull();
  });

  test("a cycle between siblings terminates", () => {
    const files: Record<string, string> = {
      "./a.js": `export { a }; export * from "./b.js";`,
      "./b.js": `export { b }; export * from "./a.js";`,
    };
    expect(exportNames(`export * from "./a.js";`, (spec) => files[spec] ?? null)).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("deriveFloor", () => {
  const history = {
    "1.0.0": ["Widget"],
    "1.5.0": ["Widget", "useEntity"],
    "1.9.0": ["Widget", "useEntity", "useWidgetDimensions"],
  };
  const derive = (code: string, h: Record<string, string[]> = history) =>
    deriveFloor({ code, history: h, buildSdk: "1.9.0" });
  const importing = (names: string) => `import{${names}}from"@glasshome/widget-sdk";`;

  test("the floor is the lowest version exporting every imported name", () => {
    expect(derive(importing("Widget as a"))).toEqual({ floor: "1.0.0", reason: "derived" });
    expect(derive(importing("Widget as a,useEntity as b"))).toEqual({
      floor: "1.5.0",
      reason: "derived",
    });
    expect(derive(importing("useWidgetDimensions as d"))).toEqual({
      floor: "1.9.0",
      reason: "derived",
    });
  });

  test("a name the build sdk does not export is refused", () => {
    expect(derive(importing("Widget as a,brandNew as b"))).toEqual({ refused: ["brandNew"] });
  });

  test("a namespace import pins the floor to the build sdk", () => {
    expect(derive(`import*as sdk from"@glasshome/widget-sdk";`)).toEqual({
      floor: "1.9.0",
      reason: "namespace-import",
    });
  });

  test("a direct ui import pins the floor to the build sdk", () => {
    expect(
      derive(`${importing("Widget as a")}import{Button as b}from"@glasshome/ui/solid";`),
    ).toEqual({
      floor: "1.9.0",
      reason: "direct-ui-import",
    });
  });

  test("a name that went missing in between holds the floor above the gap", () => {
    const gap = { "1.0.0": ["Widget"], "1.5.0": [], "1.9.0": ["Widget"] };
    expect(derive(importing("Widget as a"), gap)).toEqual({ floor: "1.9.0", reason: "derived" });
  });

  test("the floor never drops below 1.0.0", () => {
    const old = { "0.5.0": ["Widget"], "1.9.0": ["Widget"] };
    expect(derive(importing("Widget as a"), old)).toEqual({ floor: "1.0.0", reason: "derived" });
  });

  test("the floor never drops below the build sdk's major", () => {
    expect(
      deriveFloor({
        code: importing("Widget as a"),
        history: { "1.0.0": ["Widget"], "2.1.0": ["Widget"] },
        buildSdk: "2.1.0",
      }),
    ).toEqual({ floor: "2.0.0", reason: "derived" });
  });

  test("other prereleases are skipped; a prerelease build sdk counts", () => {
    const pre = {
      "1.0.0": ["Widget"],
      "1.5.0-beta.1": [],
      "1.9.0-rc.1": ["Widget", "useWidgetDimensions"],
    };
    expect(
      deriveFloor({ code: importing("Widget as a"), history: pre, buildSdk: "1.9.0-rc.1" }),
    ).toEqual({ floor: "1.0.0", reason: "derived" });
  });

  test("versions above the build sdk are ignored", () => {
    const later = { ...history, "1.10.0": [] };
    expect(derive(importing("Widget as a"), later)).toEqual({ floor: "1.0.0", reason: "derived" });
  });

  test("a build sdk missing from the history refuses every imported name", () => {
    expect(deriveFloor({ code: importing("Widget as a"), history, buildSdk: "1.9.1" })).toEqual({
      refused: ["Widget"],
    });
  });
});
