export function isSidecarLocale(tag: string, locales: readonly string[]): boolean {
  if (tag === "en-XA") return false;
  return tag === "en" || locales.includes(tag);
}
