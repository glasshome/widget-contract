import { describe, expect, test } from "bun:test";
import { checkSdkCompat, requiresCapabilities, satisfiesSdk } from "./version-compat";

describe("checkSdkCompat — parity with the dash loader behavior", () => {
  test("exact range satisfied mounts", () => {
    expect(checkSdkCompat("0.5.2", "^0.5.0").action).toBe("mount");
  });

  test("wildcard warns and mounts", () => {
    expect(checkSdkCompat("0.5.2", "*").action).toBe("warn-and-mount");
  });

  test("prerelease host matches plain widget range (includePrerelease)", () => {
    expect(checkSdkCompat("0.9.0-beta.2", "^0.9.0").action).toBe("mount");
  });

  test("prerelease of the same base version mounts (rc host, release range)", () => {
    expect(checkSdkCompat("1.0.0-rc.1", "^1.0.0").action).toBe("mount");
  });

  test("major mismatch blocks", () => {
    expect(checkSdkCompat("1.0.0", "^0.5.0").action).toBe("block");
    expect(checkSdkCompat("0.5.2", "^1.0.0").action).toBe("block");
  });

  test("0.x minor mismatch blocks in both directions", () => {
    expect(checkSdkCompat("0.9.0", "^0.8.0").action).toBe("block");
    expect(checkSdkCompat("0.8.0", "^0.9.0").action).toBe("block");
  });

  test("1.x minor mismatch warns and mounts", () => {
    expect(checkSdkCompat("1.2.0", "1.1.7").action).toBe("warn-and-mount");
  });

  test("unparseable input blocks", () => {
    expect(checkSdkCompat("garbage", "also-garbage").action).toBe("block");
  });
});

describe("satisfiesSdk", () => {
  test("true on plain satisfaction", () => {
    expect(satisfiesSdk("1.0.0", "^1.0.0")).toBe(true);
  });

  test("prerelease host included", () => {
    expect(satisfiesSdk("1.0.0-rc.1", "^1.0.0")).toBe(true);
  });

  test("false on mismatch or garbage", () => {
    expect(satisfiesSdk("0.5.2", "^1.0.0")).toBe(false);
    expect(satisfiesSdk("nope", "^1.0.0")).toBe(false);
  });
});

describe("requiresCapabilities", () => {
  test("1.x-only ranges require capabilities", () => {
    expect(requiresCapabilities("^1.0.0")).toBe(true);
    expect(requiresCapabilities("1.2.3")).toBe(true);
    expect(requiresCapabilities(">=1.0.0 <2.0.0")).toBe(true);
  });

  test("pre-1.0 ranges do not", () => {
    expect(requiresCapabilities("^0.5.0")).toBe(false);
    expect(requiresCapabilities(">=0.9.0")).toBe(false); // admits 0.9.x
  });

  test("wildcard and invalid ranges do not (rejected elsewhere)", () => {
    expect(requiresCapabilities("*")).toBe(false);
    expect(requiresCapabilities("garbage")).toBe(false);
  });
});
