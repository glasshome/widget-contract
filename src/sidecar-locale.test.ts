import { expect, test } from "bun:test";
import { isSidecarLocale, LOCALES } from "./sidecar-locale";

test("a shipped language is a sidecar locale", () => {
  for (const tag of LOCALES) expect(isSidecarLocale(tag)).toBe(true);
});

test("en-XA, unlisted and prototype names are not", () => {
  expect(isSidecarLocale("en-XA")).toBe(false);
  expect(isSidecarLocale("pt")).toBe(false);
  expect(isSidecarLocale("__proto__")).toBe(false);
});
