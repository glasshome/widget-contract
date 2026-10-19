import { describe, expect, test } from "bun:test";
import { type DashRelease, dashReleasesSchema, dashRequirement } from "./dash-releases";

const row = (version: string, stage: DashRelease["stage"], widgetSdk: string): DashRelease => ({
  version,
  stage,
  date: "2026-10-01",
  widgetSdk,
  ui: "1.19.0",
  syncLayer: "0.9.0",
});

const releases: DashRelease[] = [
  row("1.3.0", "stable", "1.17.1"),
  row("1.4.0", "stable", "1.21.0"),
  row("1.5.0-beta.1", "beta", "1.22.0"),
  row("1.5.0-beta.3", "beta", "1.23.1"),
];

describe("dashRequirement", () => {
  test("a stable Dash behind a stable that has it is told to update", () => {
    expect(dashRequirement("^1.21.0", releases, { version: "1.3.0", stage: null })).toEqual({
      kind: "update",
      version: "1.4.0",
    });
  });

  test("a stable Dash whose widget only a beta runs hears it is in beta", () => {
    expect(dashRequirement("^1.23.0", releases, { version: "1.4.0", stage: null })).toEqual({
      kind: "prerelease",
      version: "1.5.0-beta.3",
      stage: "beta",
    });
  });

  test("a beta Dash is told to update to the beta that has it", () => {
    expect(
      dashRequirement("^1.23.0", releases, { version: "1.5.0-beta.1", stage: "beta" }),
    ).toEqual({ kind: "update", version: "1.5.0-beta.3" });
  });

  test("a range no release satisfies is unreleased", () => {
    expect(dashRequirement("^1.30.0", releases, { version: "1.4.0", stage: null })).toEqual({
      kind: "unreleased",
    });
  });

  test("the running Dash that satisfies the range needs nothing", () => {
    expect(dashRequirement("^1.21.0", releases, { version: "1.4.0", stage: null })).toBeNull();
  });

  test("the newest prerelease names the stage the line is in", () => {
    const withRc = [...releases, row("1.5.0-rc.1", "rc", "1.23.2")];
    expect(dashRequirement("^1.23.0", withRc, { version: "1.4.0", stage: null })).toEqual({
      kind: "prerelease",
      version: "1.5.0-rc.1",
      stage: "rc",
    });
  });

  test("an unparseable running version or range answers null", () => {
    expect(dashRequirement("^1.21.0", releases, { version: "dev", stage: null })).toBeNull();
    expect(dashRequirement("not a range", releases, { version: "1.3.0", stage: null })).toBeNull();
  });
});

describe("dashReleasesSchema", () => {
  test("parses the hub table and refuses a row missing its sdk", () => {
    expect(dashReleasesSchema.safeParse(releases).success).toBe(true);
    expect(dashReleasesSchema.safeParse([{ version: "1.4.0", stage: "stable" }]).success).toBe(
      false,
    );
  });
});
