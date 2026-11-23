export const LOCALES = ["en", "fr", "es", "de"] as const;
export type Locale = (typeof LOCALES)[number];

export function isSidecarLocale(tag: string): tag is Locale {
  return (LOCALES as readonly string[]).includes(tag);
}
