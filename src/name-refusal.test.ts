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
  test("other keys are not name-checked", () => {
    expect(parseCatalog(JSON.stringify({ "other.key": "Сlimate" })).ok).toBe(true);
  });
});
