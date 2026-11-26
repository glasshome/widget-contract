import surfaceV2 from "./widget-surface-v2.json" with { type: "json" };
import { importsOf } from "./sdk-floor";
import { HOST_PROVIDED_MODULES } from "./shared-modules";

export interface WidgetSurface {
  modules: Record<string, string[] | "entry">;
  withheld: Record<string, Record<string, string[]>>;
}

/** What a widget built for SDK major 2 may import from each module the Solid 2 guest serves. */
export const WIDGET_SURFACE_V2: WidgetSurface = surfaceV2 as unknown as WidgetSurface;

/** Each import of a built widget bundle that its SDK major's guest does not expose. */
export function surfaceViolations(code: string, surface: WidgetSurface): string[] {
  const problems: string[] = [];
  const modules = new Set([...HOST_PROVIDED_MODULES, ...Object.keys(surface.modules)]);
  for (const module of modules) {
    const names = importsOf(code, module);
    if (names.size === 0) continue;
    const allowed = surface.modules[module];
    if (allowed === undefined) {
      problems.push(`${module}: not served to this major`);
      continue;
    }
    const withheld = new Set(Object.values(surface.withheld[module] ?? {}).flat());
    for (const name of names) {
      if (allowed === "entry" ? withheld.has(name) : !allowed.includes(name)) {
        problems.push(name === "*" ? `${module}: unlisted import` : `${module}: ${name}`);
      }
    }
  }
  return problems;
}
