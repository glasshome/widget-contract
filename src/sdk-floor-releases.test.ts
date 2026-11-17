import { describe, expect, test } from "bun:test";
import { deriveFloor, missingReleases, releasesInChangelog } from "./sdk-floor";

const importing = (names: string) => `import{${names}}from"@glasshome/widget-sdk";`;

const released = ["1.23.1", "1.24.0", "1.25.0", "1.26.0", "1.27.0"];
const committed = { "1.23.1": ["Widget"] };
const complete = {
  ...committed,
  "1.24.0": ["Widget"],
  "1.25.0": ["Widget", "useThing"],
  "1.26.0": ["Widget", "useThing"],
  "1.27.0": ["Widget", "useThing"],
};

describe("releasesInChangelog", () => {
  test("lists each stable heading once, oldest first, and skips prose and prereleases", () => {
    const changelog = [
      "# Changelog",
      "## [1.10.0](https://example.test/compare/v1.9.0...v1.10.0) (2026-01-02)",
      "## [1.9.0](https://example.test) (2026-01-01)",
      "## [1.11.0-beta.1](https://example.test)",
      "The fix shipped in ## [1.12.0] is not a heading.",
      "## [1.9.0](https://example.test) (again)",
    ].join("\n");
    expect(releasesInChangelog(changelog)).toEqual(["1.9.0", "1.10.0"]);
  });
});

describe("missingReleases", () => {
  test("names the releases below the build that the history skips", () => {
    expect(missingReleases(committed, released, "1.27.0")).toEqual(["1.24.0", "1.25.0", "1.26.0"]);
  });

  test("ignores the build itself, newer releases, 0.x, prereleases and other majors", () => {
    expect(
      missingReleases({}, ["0.5.0", "1.0.0-rc.1", "1.2.0", "1.3.0", "2.0.0"], "1.3.0"),
    ).toEqual(["1.2.0"]);
  });
});

describe("deriveFloor with the releases it must cover", () => {
  const code = importing("Widget as a,useThing as b");

  test("a name added between the committed history and the build floors at the release that added it", () => {
    expect(
      deriveFloor({ code, history: complete, buildSdk: "1.27.0", releases: released }),
    ).toEqual({ floor: "1.25.0", reason: "derived" });
  });

  test("a history that skips a release is incomplete, never floored at the build", () => {
    const stale = { ...committed, "1.27.0": ["Widget", "useThing"] };
    expect(deriveFloor({ code, history: stale, buildSdk: "1.27.0", releases: released })).toEqual({
      incomplete: ["1.24.0", "1.25.0", "1.26.0"],
    });
  });

  test("a trusted history is read as it stands, hole or not", () => {
    const stale = { ...committed, "1.27.0": ["Widget", "useThing"] };
    expect(deriveFloor({ code, history: stale, buildSdk: "1.27.0", releases: "trusted" })).toEqual({
      floor: "1.27.0",
      reason: "derived",
    });
  });

  test("a namespace import needs no history, so a gap does not matter", () => {
    expect(
      deriveFloor({
        code: `import*as sdk from"@glasshome/widget-sdk";`,
        history: { "1.27.0": [] },
        buildSdk: "1.27.0",
        releases: released,
      }),
    ).toEqual({ floor: "1.27.0", reason: "namespace-import" });
  });
});
