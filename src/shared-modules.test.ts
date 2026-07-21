import { describe, expect, test } from "bun:test";
import { HOST_PROVIDED_MODULES, isHostProvidedModule } from "./shared-modules";

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
