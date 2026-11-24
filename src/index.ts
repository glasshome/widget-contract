export type { BundleFile } from "./bundle-key";
export { bundleKey, isPlainSegment } from "./bundle-key";
export type { CapabilityGrant, ServiceCallRpc } from "./capabilities";
export {
  capabilitiesSchema,
  capabilityGrantSchema,
  describeCapability,
  matchesCapability,
  matchesRead,
} from "./capabilities";
export type { SidecarFile, WidgetManifest } from "./manifest";
export {
  formatSchemaError,
  GridSizeSchema,
  PublishBodySchema,
  PublishConfirmSchema,
  PublishRequestSchema,
  parseGridSize,
  publishManifestSchema,
  serializeGridSize,
  WIDGET_FIELD_LIMITS,
  WIDGET_NAME_PATTERN,
  widgetManifestSchema,
  widgetVersionSchema,
} from "./manifest";
export { nameRefusal } from "./name-refusal";
export type { Locale } from "./sidecar-locale";
export { isSidecarLocale, LOCALES } from "./sidecar-locale";
export type { HostProvidedModule } from "./shared-modules";
export { HOST_PROVIDED_MODULES, isHostProvidedModule } from "./shared-modules";
export type { VersionCheckResult } from "./version-compat";
export { checkSdkCompat, requiresCapabilities, satisfiesSdk } from "./version-compat";
