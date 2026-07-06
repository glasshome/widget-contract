# @glasshome/widget-contract

The shared contract between every part of the [GlassHome](https://glasshome.app) widget pipeline: the widget SDK (author declarations), the Hub (publish validation), and Dash (install consent and runtime enforcement).

The capability set shown at consent, validated at publish, and enforced at the HA bridge must be computed by the same code. If they drift, the consent screen lies, and that is a vulnerability. This package is that single definition.

## Exports

- `capabilitiesSchema` / `capabilityGrantSchema` — the capability grammar widgets declare in their manifest. One grant = one consent sentence: a Home Assistant domain, `read` or `control` access, optional entity-pattern and service narrowing.
- `matchesCapability(caps, rpc)` — the pure enforcement predicate. The Dash HA bridge validates every widget service call with it; deny by default.
- `describeCapability(cap)` — renders a grant as the plain-language consent sentence ("Control your lights"). Same object enforcement uses, so consent cannot drift from enforcement.
- `widgetManifestSchema` / `publishManifestSchema` — the canonical widget manifest schema; the publish variant requires a capabilities declaration for SDK >= 1.0.0 manifests.
- `bundleKey(scope, name, version, file)` — canonical storage path for published widget files (`index.js` / `index.css`).
- `checkSdkCompat` / `satisfiesSdk` / `requiresCapabilities` — SDK version compatibility rules shared by loader, installer, and Hub search.

## Design notes

- Zero UI dependencies. Runs in Node (Hub), the browser main thread (consent UI), and a Web Worker (enforcement).
- `matchesCapability` requires entity ids; target expansion (area/device/label to entities) happens in the caller before the check.
- Entity narrowing patterns keep the domain literal (`light.living_*`), so a pattern can never widen a grant beyond its domain.

Part of the [GlassHome](https://glasshome.app) widget security architecture.
