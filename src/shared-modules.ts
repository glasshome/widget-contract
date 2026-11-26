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
const SHARED_MODULES = [
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

const BY_MAJOR = {
  1: ["solid-js", "solid-js/web", "solid-js/store", ...SHARED_MODULES],
  2: ["solid-js", "@solidjs/web", ...SHARED_MODULES],
} as const;

export type SdkMajor = keyof typeof BY_MAJOR;

/** The specifiers the host serves to widgets built for SDK `major`. */
export function hostProvidedModules(major: SdkMajor): readonly string[] {
  return BY_MAJOR[major];
}

/** Every specifier any major serves: what a widget build leaves external whichever SDK it targets. */
export const HOST_PROVIDED_MODULES: readonly string[] = [
  ...new Set([...BY_MAJOR[1], ...BY_MAJOR[2]]),
];

const SETS: Record<SdkMajor, ReadonlySet<string>> = {
  1: new Set(BY_MAJOR[1]),
  2: new Set(BY_MAJOR[2]),
};
const ANY_SET: ReadonlySet<string> = new Set(HOST_PROVIDED_MODULES);

/** True when the host import map serves `id` (to widgets of `major`, or of any major), so widget builds must not bundle it. */
export function isHostProvidedModule(id: string, major?: SdkMajor): boolean {
  return (major === undefined ? ANY_SET : SETS[major]).has(id);
}
