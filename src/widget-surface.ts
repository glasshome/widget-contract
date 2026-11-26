import surfaceV2 from "./widget-surface-v2.json" with { type: "json" };
import { importsOf } from "./sdk-floor";
import { HOST_PROVIDED_MODULES } from "./shared-modules";

export interface WidgetSurface {
  modules: Record<string, string[] | "entry">;
  withheld: Record<string, Record<string, string[]>>;
}

/** What a widget built for SDK major 2 may import from each module the Solid 2 guest serves. */
export const WIDGET_SURFACE_V2: WidgetSurface = surfaceV2 as unknown as WidgetSurface;

function moduleViolations(module: string, names: Set<string>, surface: WidgetSurface): string[] {
  const allowed = surface.modules[module];
  if (allowed === undefined) return [`${module}: not served to this major`];
  const withheld = new Set(Object.values(surface.withheld[module] ?? {}).flat());
  const refused = (name: string) =>
    allowed === "entry" ? withheld.has(name) : !allowed.includes(name);
  return [...names]
    .filter(refused)
    .map((name) => (name === "*" ? `${module}: unlisted import` : `${module}: ${name}`));
}

/** Each import of a built widget bundle that its SDK major's guest does not expose. */
export function surfaceViolations(code: string, surface: WidgetSurface): string[] {
  const modules = new Set([...HOST_PROVIDED_MODULES, ...Object.keys(surface.modules)]);
  return [...modules].flatMap((module) => {
    const names = importsOf(code, module);
    return names.size === 0 ? [] : moduleViolations(module, names, surface);
  });
}
