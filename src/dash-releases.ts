import { compare, gt, satisfies, valid, validRange } from "semver";
import { z } from "zod";

export const dashReleaseSchema = z.object({
  version: z.string(),
  stage: z.enum(["beta", "rc", "stable"]),
  date: z.string(),
  widgetSdk: z.string(),
  ui: z.string(),
  syncLayer: z.string(),
});

export const dashReleasesSchema = z.array(dashReleaseSchema);

export type DashRelease = z.infer<typeof dashReleaseSchema>;

export type DashNeeds =
  | { kind: "update"; version: string }
  | { kind: "prerelease"; version: string; stage: "beta" | "rc" }
  | { kind: "unreleased" };

export interface RunningDash {
  version: string;
  stage: "beta" | "rc" | null;
}

/** Which Dash runs a widget built for `sdkRange`, as seen from the running Dash's channel; null when it already does. */
export function dashRequirement(
  sdkRange: string,
  releases: DashRelease[],
  running: RunningDash,
): DashNeeds | null {
  if (!validRange(sdkRange) || !valid(running.version)) return null;
  const runs = (r: DashRelease) => satisfies(r.widgetSdk, sdkRange, { includePrerelease: true });
  const current = releases.find((r) => r.version === running.version);
  if (current && runs(current)) return null;

  const having = releases
    .filter((r) => valid(r.version) && runs(r))
    .sort((a, b) => compare(a.version, b.version));
  if (having.length === 0) return { kind: "unreleased" };

  const ahead = having.filter((r) => gt(r.version, running.version));
  const onChannel = (r: DashRelease) => running.stage !== null || r.stage === "stable";
  const update = ahead.find(onChannel);
  if (update) return { kind: "update", version: update.version };

  const newest = ahead.findLast((r) => r.stage !== "stable");
  if (newest && newest.stage !== "stable") {
    return { kind: "prerelease", version: newest.version, stage: newest.stage };
  }
  return null;
}
