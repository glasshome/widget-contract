export type BundleFile = "index.js" | "index.css";

/**
 * Canonical storage/CDN path for a published widget file, for the Hub upload
 * door and any consumer that addresses a published artifact. One builder so
 * the two-file layout cannot drift across call sites.
 */
export function bundleKey(scope: string, name: string, version: string, file: BundleFile): string {
  for (const segment of [scope, name, version]) {
    if (!isPlainSegment(segment)) throw new Error(`Unsafe bundle path segment: ${segment}`);
  }
  return `@${scope}/${name}/${version}/${file}`;
}

/** One storage path segment that cannot climb, nest, or be read as a query or escape. */
export const isPlainSegment = (s: string): boolean =>
  s.length > 0 && s !== "." && s !== ".." && !/[/\\%?#]/.test(s);
