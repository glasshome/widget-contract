export type BundleFile = "index.js" | "index.css";

/**
 * Canonical storage/CDN path for a published widget file. Used by the Hub
 * presign + integrity verify, the widget CLI upload, and any consumer that
 * needs to address a published artifact. One builder so the two-file layout
 * cannot drift across call sites.
 */
export function bundleKey(scope: string, name: string, version: string, file: BundleFile): string {
  return `@${scope}/${name}/${version}/${file}`;
}
