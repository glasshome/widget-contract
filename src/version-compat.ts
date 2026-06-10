import { intersects, parse, satisfies, validRange } from "semver";

/**
 * SDK version compatibility, consolidated from the three prior
 * implementations (dash widget-loader, dash-server install assert, hub
 * compatSdk search filter). Pure: callers decide how to log/report.
 *
 * - "mount": fully compatible
 * - "warn-and-mount": minor mismatch or wildcard, mount with a warning
 * - "block": major mismatch or unparseable, hard block
 */
export interface VersionCheckResult {
  action: "mount" | "warn-and-mount" | "block";
  message: string;
}

// A prerelease host (1.0.0-rc.1) sorts BELOW its release (1.0.0), so it fails
// ranges like ^1.0.0 even with includePrerelease. A prerelease of X claims X's
// API surface in our ecosystem, so retry with the host's base version. This
// generalizes the loader's INS-04 fix.
function hostSatisfies(hostSdkVersion: string, widgetSdkRange: string): boolean {
  if (satisfies(hostSdkVersion, widgetSdkRange, { includePrerelease: true })) return true;
  const host = parse(hostSdkVersion);
  if (!host || host.prerelease.length === 0) return false;
  return satisfies(`${host.major}.${host.minor}.${host.patch}`, widgetSdkRange, {
    includePrerelease: true,
  });
}

export function checkSdkCompat(hostSdkVersion: string, widgetSdkRange: string): VersionCheckResult {
  if (widgetSdkRange === "*") {
    // "*" is warn-and-mount — authors should declare a real range. The CLI
    // rejects "*" at publish time; already-installed widgets still mount.
    return {
      action: "warn-and-mount",
      message: `Wildcard sdkVersion "*" — widget may break across host updates`,
    };
  }

  try {
    if (hostSatisfies(hostSdkVersion, widgetSdkRange)) {
      return { action: "mount", message: `SDK ${hostSdkVersion} satisfies ${widgetSdkRange}` };
    }
  } catch {
    // Invalid range — fall through to parse-based comparison
  }

  const host = parse(hostSdkVersion);
  const widgetParsed = parse(widgetSdkRange.replace(/[\^~>=<]/g, ""));

  if (!host || !widgetParsed) {
    return {
      action: "block",
      message: `Cannot parse version: host=${hostSdkVersion}, widget=${widgetSdkRange}`,
    };
  }

  if (host.major !== widgetParsed.major) {
    return {
      action: "block",
      message: `Major version mismatch: host ${hostSdkVersion} vs widget requires ${widgetSdkRange}`,
    };
  }

  // For 0.x semver, minor bumps are breaking — block if host minor differs
  // from the widget requirement in either direction. Widget ^0.8.0 on host
  // 0.9.0 is "SDK too old" for the widget's assumed API surface.
  if (host.major === 0 && host.minor !== widgetParsed.minor) {
    return {
      action: "block",
      message: `SDK too old: host ${hostSdkVersion} vs widget requires ${widgetSdkRange}`,
    };
  }

  return {
    action: "warn-and-mount",
    message: `Minor version mismatch: host ${hostSdkVersion} vs widget requires ${widgetSdkRange}. Widget may have degraded functionality.`,
  };
}

/**
 * Boolean form for filtering (hub search, install-time assert).
 */
export function satisfiesSdk(hostSdkVersion: string, widgetSdkRange: string): boolean {
  try {
    return hostSatisfies(hostSdkVersion, widgetSdkRange);
  } catch {
    return false;
  }
}

/**
 * True when a manifest's sdkVersion range only admits SDK >= 1.0.0, i.e. the
 * capability-aware SDK generation. Publish validation uses this to require a
 * capabilities declaration. Invalid or wildcard ranges return false — they
 * are rejected elsewhere.
 */
export function requiresCapabilities(widgetSdkRange: string): boolean {
  if (validRange(widgetSdkRange) === null || widgetSdkRange === "*") return false;
  try {
    return !intersects(widgetSdkRange, "<1.0.0", { includePrerelease: true });
  } catch {
    return false;
  }
}
