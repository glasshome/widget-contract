import { expect, test } from "bun:test";
import { stateText, type StateTexts } from "./state-texts";

const texts: StateTexts = {
  component: {
    cover: { _: { state: { open: "Offen" } }, garage: { state: { open: "Garage offen" } } },
    climate: {
      _: { state: { heat: "Heizen" }, attributes: { preset_mode: { eco: "Eco" } } },
    },
  },
  entity: {
    ring: {
      cover: {
        siren: {
          state: { open: "Ring offen" },
          attributes: { mode: { loud: "Laut" } },
        },
      },
    },
    unifi_access: {
      select: { door_lock_rule: { state: { keep_lock: "Verriegelt lassen" } } },
      sensor: { door_lock_rule: { state: { keep_lock: "Verriegelt" } } },
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

test("an entity key reads under its own domain", () => {
  const q = { platform: "unifi_access", translationKey: "door_lock_rule", state: "keep_lock" };
  expect(stateText(texts, { ...q, domain: "select" })).toBe("Verriegelt lassen");
  expect(stateText(texts, { ...q, domain: "sensor" })).toBe("Verriegelt");
  expect(stateText(texts, { ...q, domain: "lock" })).toBeUndefined();
});

test("an attribute with no entity words falls back to the domain's", () => {
  const q = { domain: "climate", attribute: "preset_mode", state: "eco" };
  expect(stateText(texts, q)).toBe("Eco");
  expect(stateText(texts, { ...q, platform: "ring", translationKey: "none" })).toBe("Eco");
  expect(stateText(texts, { ...q, attribute: "fan_mode" })).toBeUndefined();
});
