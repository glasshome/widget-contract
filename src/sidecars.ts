export const FILE_PATH = /^files\/[a-z0-9][a-z0-9-]{0,63}\.(png|jpg|webp)$/;
export const LOCALE_PATH = /^locales\/([a-z]{2}(?:-[A-Z]{2})?)\.json$/;

export const SIDECAR_LIMITS = {
  fileBytes: 2_097_152,
  localeBytes: 262_144,
  versionBytes: 10_485_760,
  files: 64,
  side: 4096,
  pixels: 16_777_216,
} as const;

const RESERVED = new Set(["index.js", "index.css"]);

export function sidecarPathRefusal(
  path: string,
  locales: readonly string[],
): "grammar" | "reserved" | "locale" | null {
  if (RESERVED.has(path) || path.startsWith(".")) return "reserved";
  if (FILE_PATH.test(path)) return null;
  const tag = LOCALE_PATH.exec(path)?.[1];
  if (tag === undefined) return "grammar";
  return locales.includes(tag) ? null : "locale";
}
