import { z } from "zod";

/**
 * Capability grammar for widget home-control access.
 *
 * One grant = one consent sentence. The same grant object is rendered at
 * install time (describeCapability) and enforced at runtime
 * (matchesCapability), so what the user approved is what gets enforced,
 * by construction. Keep this file free of UI and platform dependencies:
 * it runs in the Hub (Node), the Dash main thread, and the HA bridge Worker.
 */

const DOMAIN_REGEX = /^[a-z_][a-z0-9_]*$/;

// Entity narrowing patterns: literal entity ids with optional "*" globs in
// the object id, e.g. "light.living_*". The domain part stays literal so a
// pattern can never widen a grant beyond its domain.
const ENTITY_PATTERN_REGEX = /^[a-z_][a-z0-9_]*\.[a-z0-9_*]+$/;

const SERVICE_REGEX = /^[a-z0-9_]+$/;

export const capabilityGrantSchema = z.object({
  domain: z.string().regex(DOMAIN_REGEX, "Must be a Home Assistant domain like 'light'"),
  access: z.enum(["read", "control"]),
  entities: z
    .array(
      z.string().regex(ENTITY_PATTERN_REGEX, "Must be an entity id pattern like 'light.living_*'"),
    )
    .min(1)
    .optional(),
  services: z
    .array(z.string().regex(SERVICE_REGEX, "Must be a service name like 'turn_on'"))
    .min(1)
    .optional(),
});

export const capabilitiesSchema = z.array(capabilityGrantSchema).max(32);

export type CapabilityGrant = z.infer<typeof capabilityGrantSchema>;

/**
 * A service call as seen by the enforcement point. The caller (the HA bridge
 * Worker) must expand area/device/label targets to concrete entity ids
 * BEFORE building this — enforcement only reasons about entity ids.
 */
export interface ServiceCallRpc {
  domain: string;
  service: string;
  entityIds: string[];
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[a-z0-9_]*");
  return new RegExp(`^${escaped}$`);
}

function entityDomain(entityId: string): string {
  const dot = entityId.indexOf(".");
  return dot === -1 ? "" : entityId.slice(0, dot);
}

function grantAllowsEntity(grant: CapabilityGrant, entityId: string): boolean {
  if (!grant.entities) return entityDomain(entityId) === grant.domain;
  return grant.entities.some((pattern) => globToRegex(pattern).test(entityId));
}

/**
 * One grant authorizing a call on its own: control access, same domain,
 * service within the grant's service narrowing (or no narrowing), and EVERY
 * targeted entity within its entity narrowing (or, with no narrowing,
 * belonging to its domain).
 *
 * A call with no entity targets (e.g. a domain-wide service) requires a grant
 * without entity narrowing — a widget scoped to specific entities must not
 * reach domain-wide services.
 */
function authorizesFully(grant: CapabilityGrant, rpc: ServiceCallRpc): boolean {
  if (grant.domain !== rpc.domain) return false;
  if (grant.services && !grant.services.includes(rpc.service)) return false;
  if (rpc.entityIds.length === 0) return !grant.entities;
  return rpc.entityIds.every((id) => grantAllowsEntity(grant, id));
}

/**
 * The enforcement predicate. Deny-by-default: anything not explicitly matched
 * is rejected.
 *
 * A service call names two things — the function (`music_assistant.get_queue`)
 * and what it acts on (`media_player.speaker`). They agree for a domain's own
 * services (`light.turn_on` on `light.kitchen`) and diverge for an
 * integration's: Music Assistant and Sonos own no entities, so their services
 * act on `media_player.*`. Requiring one grant to authorize both denies every
 * integration service, whatever the user approved.
 *
 * So: one grant covering the whole call, or else a grant for the function plus
 * grants covering each entity it touches. Narrowings never combine within a
 * domain — that path demands the covering grant belong to another domain and
 * carry no service narrowing of its own.
 */
export function matchesCapability(caps: readonly CapabilityGrant[], rpc: ServiceCallRpc): boolean {
  const controls = caps.filter((grant) => grant.access === "control");
  if (controls.some((grant) => authorizesFully(grant, rpc))) return true;
  if (rpc.entityIds.length === 0) return false;

  const functionGranted = controls.some(
    (grant) =>
      grant.domain === rpc.domain &&
      !grant.entities &&
      (!grant.services || grant.services.includes(rpc.service)),
  );
  if (!functionGranted) return false;

  return rpc.entityIds.every((id) =>
    controls.some(
      (grant) => grant.domain !== rpc.domain && !grant.services && grantAllowsEntity(grant, id),
    ),
  );
}

/**
 * The read predicate, twin of matchesCapability: a grant of either access
 * whose domain and entity narrowing cover the entity. Control implies read.
 */
export function matchesRead(caps: readonly CapabilityGrant[], entityId: string): boolean {
  return caps.some(
    (grant) => entityDomain(entityId) === grant.domain && grantAllowsEntity(grant, entityId),
  );
}

// Friendly plural names for the domains a homeowner will actually see in a
// consent prompt. Anything unlisted falls back to the raw domain name.
const DOMAIN_LABELS: Record<string, string> = {
  alarm_control_panel: "alarm system",
  binary_sensor: "sensors",
  button: "buttons",
  camera: "cameras",
  climate: "thermostat",
  cover: "blinds and covers",
  fan: "fans",
  humidifier: "humidifiers",
  input_boolean: "toggles",
  light: "lights",
  lock: "locks",
  media_player: "media players",
  number: "adjustable values",
  remote: "remotes",
  scene: "scenes",
  script: "scripts",
  select: "selectors",
  sensor: "sensors",
  siren: "sirens",
  sun: "sunrise and sunset times",
  switch: "switches",
  vacuum: "vacuums",
  valve: "valves",
  water_heater: "water heater",
  weather: "weather data",
};

/**
 * Render a grant as the consent sentence shown to the user. Generated from
 * the same object matchesCapability enforces, so the consent screen cannot
 * drift from enforcement.
 */
export function describeCapability(cap: CapabilityGrant): string {
  const label = DOMAIN_LABELS[cap.domain] ?? `${cap.domain.replace(/_/g, " ")} devices`;
  const verb = cap.access === "control" ? "Control" : "Read";
  let sentence = `${verb} your ${label}`;
  if (cap.entities) {
    sentence += ` (${cap.entities.join(", ")})`;
  }
  if (cap.services) {
    sentence += ` — only: ${cap.services.map((s) => s.replace(/_/g, " ")).join(", ")}`;
  }
  return sentence;
}
