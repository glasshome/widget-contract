import { describe, expect, test } from "bun:test";
import { localizeManifest } from "./catalog-keys";

describe("catalog-keys", () => {
  test("catalog-keys reaches no parser", () => {
    const schema = { type: "object", properties: { mode: { type: "string", title: "Mode" } } };
    const out = localizeManifest({ name: "", schema }, (key) =>
      key === "manifest.config.mode.title" ? "Mode de chauffe" : undefined,
    );
    expect((out.schema.properties as Record<string, { title: string }>).mode.title).toBe(
      "Mode de chauffe",
    );
  });
});
