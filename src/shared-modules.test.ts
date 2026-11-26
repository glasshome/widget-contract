import { describe, expect, test } from "bun:test";
import { HOST_PROVIDED_MODULES, hostProvidedModules, isHostProvidedModule } from "./shared-modules";

describe("isHostProvidedModule — exact-match contract", () => {
  test("every listed specifier matches", () => {
    for (const id of HOST_PROVIDED_MODULES) {
      expect(isHostProvidedModule(id)).toBe(true);
    }
  });

  test("subpaths the import map does not serve are NOT host-provided", () => {
    // Externalizing these produced runtime 404s (build green, mount dead):
    expect(isHostProvidedModule("@glasshome/ui")).toBe(false);
    expect(isHostProvidedModule("@glasshome/ui/tokens")).toBe(false);
    expect(isHostProvidedModule("@glasshome/widget-sdk/vite")).toBe(false);
    expect(isHostProvidedModule("solid-js/html")).toBe(false);
  });
});

describe("host-provided modules per SDK major", () => {
  test("major 1 serves Solid 1's three entries", () => {
    const ids = hostProvidedModules(1);
    for (const id of ["solid-js", "solid-js/web", "solid-js/store"]) expect(ids).toContain(id);
    expect(ids).not.toContain("@solidjs/web");
  });

  test("major 2 serves solid-js and @solidjs/web, and none of Solid 1's subpaths", () => {
    const ids = hostProvidedModules(2);
    expect(ids).toContain("solid-js");
    expect(ids).toContain("@solidjs/web");
    expect(ids).not.toContain("solid-js/web");
    expect(ids).not.toContain("solid-js/store");
  });

  test("both majors serve the SDK", () => {
    for (const major of [1, 2] as const) {
      expect(hostProvidedModules(major)).toContain("@glasshome/widget-sdk");
    }
  });

  test("a module is host-provided for the major that lists it", () => {
    expect(isHostProvidedModule("solid-js/store", 1)).toBe(true);
    expect(isHostProvidedModule("solid-js/store", 2)).toBe(false);
    expect(isHostProvidedModule("@solidjs/web", 2)).toBe(true);
    expect(isHostProvidedModule("@solidjs/web", 1)).toBe(false);
  });

  test("without a major, any major's module counts", () => {
    expect(isHostProvidedModule("solid-js/store")).toBe(true);
    expect(isHostProvidedModule("@solidjs/web")).toBe(true);
  });

  test("HOST_PROVIDED_MODULES is the union of both majors", () => {
    const union = new Set([...hostProvidedModules(1), ...hostProvidedModules(2)]);
    expect(new Set(HOST_PROVIDED_MODULES)).toEqual(union);
  });
});
