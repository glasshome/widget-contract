import { describe, expect, test } from "bun:test";
import { surfaceViolations, WIDGET_SURFACE_V2 } from "./widget-surface";

describe("surfaceViolations", () => {
  test("passes a bundle that imports only what the Solid 2 guest serves", () => {
    const bundle =
      'import{createSignal as a}from"solid-js";import{insert as b,template as c}from"@solidjs/web";import{Widget as d}from"@glasshome/widget-sdk";export default [a,b,c,d];';
    expect(surfaceViolations(bundle, WIDGET_SURFACE_V2)).toEqual([]);
  });

  test("names each withheld export and unserved module a bundle imports", () => {
    const bundle = [
      'import{hydrate as a}from"@solidjs/web";',
      'import{sharedConfig as c}from"solid-js";',
      'import{produce as g}from"solid-js/store";',
      'import{Button as h}from"@glasshome/ui/solid";',
      "export default [a,c,g,h];",
    ].join("");
    expect(surfaceViolations(bundle, WIDGET_SURFACE_V2).sort()).toEqual([
      "@glasshome/ui/solid: not served to this major",
      "@solidjs/web: hydrate",
      "solid-js/store: not served to this major",
      "solid-js: sharedConfig",
    ]);
  });

  test("refuses a namespace import of a listed module", () => {
    const bundle = 'import*as w from"@solidjs/web";export default w;';
    expect(surfaceViolations(bundle, WIDGET_SURFACE_V2)).toEqual(["@solidjs/web: unlisted import"]);
  });
});
