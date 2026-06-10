export {
  capabilitiesSchema,
  capabilityGrantSchema,
  describeCapability,
  matchesCapability,
} from "./capabilities";
export type { CapabilityGrant, ServiceCallRpc } from "./capabilities";

export {
  formatSchemaError,
  GridSizeSchema,
  parseGridSize,
  PublishBodySchema,
  PublishConfirmSchema,
  PublishRequestSchema,
  publishManifestSchema,
  serializeGridSize,
  widgetManifestSchema,
} from "./manifest";
export type { WidgetManifest } from "./manifest";

export { bundleKey } from "./bundle-key";
export type { BundleFile } from "./bundle-key";

export { checkSdkCompat, requiresCapabilities, satisfiesSdk } from "./version-compat";
export type { VersionCheckResult } from "./version-compat";
