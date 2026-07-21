/**
 * Module specifiers the host serves to widgets through its import map.
 *
 * Single source of truth for both sides of the boundary: the host derives its
 * import map / vendor bundles from this list, and the widget build (via
 * `isWidgetExternal` in @glasshome/widget-sdk) externalizes exactly these
 * specifiers. Matching is exact, not prefix-based: a specifier the import map
 * does not serve (e.g. "@glasshome/ui/tokens") must be bundled into the
 * widget, because leaving it external means a 404 at runtime.
 *
 * `@glasshome/sync-layer*` entries are served for the SDK's own use; widgets
 * are blocked from importing them directly by the SDK's build guard.
 */
export const HOST_PROVIDED_MODULES = [
  "solid-js",
  "solid-js/web",
  "solid-js/store",
  // Must be a singleton: the <iconify-icon> custom element, its icon storage,
  // and the API provider config are module-local. A second bundled copy splits
  // registration from rendering and every icon falls back to a network fetch.
  // (Only the core; @iconify-icon/solid is a stateless wrapper, safe to copy.)
  "iconify-icon",
  "@glasshome/widget-sdk",
  "@glasshome/ui/solid",
  "@glasshome/sync-layer/solid",
  "@glasshome/sync-layer",
] as const;

export type HostProvidedModule = (typeof HOST_PROVIDED_MODULES)[number];

const HOST_PROVIDED_SET: ReadonlySet<string> = new Set(HOST_PROVIDED_MODULES);

/** True when the host import map serves `id`, so widget builds must not bundle it. */
export function isHostProvidedModule(id: string): boolean {
  return HOST_PROVIDED_SET.has(id);
}
