import { expect, test } from "bun:test";
import { isSidecarLocale } from "./sidecar-locale";

const locales = ["en", "fr", "es", "de"];

test("a listed tag and en are sidecar locales", () => {
  expect(isSidecarLocale("fr", locales)).toBe(true);
  expect(isSidecarLocale("en", locales)).toBe(true);
  expect(isSidecarLocale("en", [])).toBe(true);
});

test("en-XA, unlisted and prototype names are not", () => {
  expect(isSidecarLocale("en-XA", locales)).toBe(false);
  expect(isSidecarLocale("en-XA", [...locales, "en-XA"])).toBe(false);
  expect(isSidecarLocale("pt", locales)).toBe(false);
  expect(isSidecarLocale("__proto__", locales)).toBe(false);
});
