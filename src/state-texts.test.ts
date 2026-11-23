import { expect, test } from "bun:test";
import { stateText, type StateTexts } from "./state-texts";

const texts: StateTexts = {
  component: {
    cover: { _: { open: "Offen" }, garage: { open: "Garage offen" } },
    climate: { _: { heat: "Heizen" } },
  },
  entity: {
    ring: {
      siren: {
        state: { open: "Ring offen" },
        attributes: { mode: { loud: "Laut" } },
      },
    },
  },
};

test("entity key wins over device class", () => {
  const q = { domain: "cover", state: "open", deviceClass: "garage" };
  expect(stateText(texts, { ...q, platform: "ring", translationKey: "siren" })).toBe("Ring offen");
});

test("device class wins over the domain default", () => {
  expect(stateText(texts, { domain: "cover", state: "open", deviceClass: "garage" })).toBe(
    "Garage offen",
  );
  expect(stateText(texts, { domain: "cover", state: "open", deviceClass: "door" })).toBe("Offen");
  expect(stateText(texts, { domain: "cover", state: "open" })).toBe("Offen");
});

test("an attribute reads only its own group", () => {
  const q = { domain: "cover", platform: "ring", translationKey: "siren", attribute: "mode" };
  expect(stateText(texts, { ...q, state: "loud" })).toBe("Laut");
  expect(stateText(texts, { ...q, state: "open" })).toBeUndefined();
});

test("prototype names and huge states find nothing", () => {
  for (const state of ["__proto__", "constructor", "toString", "x".repeat(10_000)]) {
    expect(stateText(texts, { domain: "cover", state })).toBeUndefined();
  }
  expect(stateText(texts, { domain: "__proto__", state: "open" })).toBeUndefined();
  expect(
    stateText(texts, {
      domain: "cover",
      state: "open",
      platform: "constructor",
      translationKey: "x",
    }),
  ).toBe("Offen");
});
