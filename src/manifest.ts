import { valid } from "semver";
import { z } from "zod";
import { capabilitiesSchema } from "./capabilities";
import { requiresCapabilities } from "./version-compat";

/**
 * Canonical widget manifest schema. Single source of truth consumed by the
 * widget SDK (author types + build validation), the Hub (publish
 * validation), and Dash (install validation + consent UI).
 */

export const GridSizeSchema = z.object({
  w: z.number().int().min(1),
  h: z.number().int().min(1),
});

// Fields shared verbatim between the manifest and the publish request (the
// publish request is a projection of hub DB columns, not a manifest
// superset — manifest-only fields ride inside manifestJson).
const widgetCoreShape = {
  name: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().optional(),
  minSize: GridSizeSchema,
  maxSize: GridSizeSchema,
  sdkVersion: z.string().min(1),
} as const;

export const widgetManifestSchema = z
  .object({
    ...widgetCoreShape,
    defaultSize: GridSizeSchema.optional(),
    schema: z.record(z.string(), z.unknown()).optional(),
    defaultConfig: z.record(z.string(), z.unknown()).optional(),
    capabilities: capabilitiesSchema.optional(),

    // Round-trip fields set by the Hub / widget browser when installing. These
    // must validate so real manifests stringified from WidgetRegistryEntry
    // pass through the canonical schema without being stripped.
    tag: z.string().optional(),
    version: z.string().optional(),
    displayName: z.string().optional(),
    scope: z.string().optional(),
    author: z.string().optional(),
    license: z.string().optional(),
    homepage: z.string().url().optional(),
    source: z.string().url().optional(),
    permissions: z.array(z.string()).optional(),
    isOfficial: z.boolean().optional(),
    sha256Hash: z.string().optional(),
    bundleUrl: z.string().optional(),
    cssUrl: z.string().optional(),
    _registry: z.enum(["hub", "local"]).optional(),
    releaseNotes: z.string().optional(),
  })
  // Tolerate unknown keys so a new Hub-side optional field doesn't require
  // an SDK bump to install. Required fields still fail.
  .passthrough();

export type WidgetManifest = z.infer<typeof widgetManifestSchema>;

/**
 * Publish-time strict variant: a manifest whose sdkVersion range only admits
 * SDK >= 1.0.0 must declare capabilities (possibly empty for widgets that
 * never touch Home Assistant — the declaration itself is what's required, so
 * consent has something honest to show).
 */
export const publishManifestSchema = widgetManifestSchema.superRefine((manifest, ctx) => {
  if (requiresCapabilities(manifest.sdkVersion) && manifest.capabilities === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["capabilities"],
      message:
        "Manifests targeting SDK >= 1.0.0 must declare capabilities (use [] for widgets that do not touch Home Assistant)",
    });
  }
});

const SCOPE_REGEX = /^[a-z0-9][a-z0-9-]*$/;

/** A published widget's name and version become storage keys and CDN paths. */
export const WIDGET_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const WIDGET_FIELD_LIMITS = {
  displayName: 100,
  description: 4000,
  version: 64,
} as const;

export const widgetVersionSchema = z
  .string()
  .max(WIDGET_FIELD_LIMITS.version)
  .refine((v) => valid(v) === v, "Must be a semver version like 1.2.0");

export const PublishRequestSchema = z.object({
  ...widgetCoreShape,
  action: z.literal("request"),
  scope: z.string().regex(SCOPE_REGEX, "Must be lowercase alphanumeric with hyphens"),
  name: z
    .string()
    .regex(WIDGET_NAME_PATTERN, "Must be lowercase alphanumeric with hyphens, up to 64"),
  displayName: z.string().min(1).max(WIDGET_FIELD_LIMITS.displayName),
  description: z.string().max(WIDGET_FIELD_LIMITS.description).optional(),
  version: widgetVersionSchema,
  bundleSize: z.number().int().positive(),
  sha256Hash: z.string().min(1),
  cssSize: z.number().int().positive().optional(),
  cssSha256Hash: z.string().min(1).optional(),
  manifestJson: z.string().min(1),
});

export const PublishConfirmSchema = z.object({
  action: z.literal("confirm"),
  versionId: z.string().min(1),
});

export const PublishBodySchema = z.discriminatedUnion("action", [
  PublishRequestSchema,
  PublishConfirmSchema,
]);

/**
 * Serialize a GridSize to a JSON string for database storage.
 */
export function serializeGridSize(size: z.infer<typeof GridSizeSchema>): string {
  return JSON.stringify(size);
}

/**
 * Parse a GridSize from a database text column or API response.
 * Accepts a JSON string, an already-parsed object, or garbage.
 * Returns the fallback for any value that doesn't validate.
 */
export function parseGridSize(
  raw: unknown,
  fallback: z.infer<typeof GridSizeSchema> = { w: 1, h: 1 },
): z.infer<typeof GridSizeSchema> {
  if (raw != null && typeof raw === "object") {
    const result = GridSizeSchema.safeParse(raw);
    if (result.success) return result.data;
  }

  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      const result = GridSizeSchema.safeParse(parsed);
      if (result.success) return result.data;
    } catch {
      // not valid JSON — fall through
    }
  }

  return fallback;
}

/**
 * Format a zod error into a single user-friendly string.
 * Groups issues by path so the output reads like a bulleted list.
 */
export function formatSchemaError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
