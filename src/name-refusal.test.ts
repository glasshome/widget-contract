import { describe, expect, test } from "bun:test";
import { parseCatalog } from "./i18n";
import { nameRefusal } from "./name-refusal";

describe("nameRefusal", () => {
  test("blank letters and invisible characters are blank", () => {
    expect(nameRefusal("ㅤ")).toBe("blank");
    expect(nameRefusal("ᅟᅠ")).toBe("blank");
    expect(nameRefusal("⠀ ​")).toBe("blank");
    expect(nameRefusal("")).toBe("blank");
  });
  test("a word mixing Latin with Cyrillic or Greek is refused", () => {
    expect(nameRefusal("Сlimate")).toBe("mixed-script");
    expect(nameRefusal("Clιmate")).toBe("mixed-script");
  });
  test("a control, format, bidi or invisible character anywhere is refused", () => {
    expect(nameRefusal("Glass\u202EemoH")).toBe("control");
    expect(nameRefusal("\u202Ekcolc")).toBe("control");
    expect(nameRefusal("Glass\u2067emoH\u2069")).toBe("control");
    expect(nameRefusal("Clock\u0085")).toBe("control");
    expect(nameRefusal("Clock\u0007")).toBe("control");
    expect(nameRefusal("Glass\u200BHome")).toBe("control");
    expect(nameRefusal("Glass\u00ADHome")).toBe("control");
    expect(nameRefusal("Clock\uFE0F")).toBe("control");
  });
  test("ordinary names pass", () => {
    expect(nameRefusal("Climate")).toBeNull();
    expect(nameRefusal("Klimaanlage")).toBeNull();
    expect(nameRefusal("空調 Pro")).toBeNull();
    expect(nameRefusal("Климат Pro")).toBeNull();
  });
});

describe("parseCatalog manifest.name", () => {
  test("a blank name is an error naming the key", () => {
    const result = parseCatalog(JSON.stringify({ "manifest.name": "ㅤ" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ kind: "bad_value", key: "manifest.name" });
  });
  test("a name holding an invisible character is an error naming the key", () => {
    const result = parseCatalog(JSON.stringify({ "manifest.name": "Horloge\uFE0F" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        kind: "bad_value",
        key: "manifest.name",
        reason: "control_char",
      });
    }
  });
  test("other keys are not name-checked", () => {
    expect(parseCatalog(JSON.stringify({ "other.key": "Сlimate" })).ok).toBe(true);
  });
});
