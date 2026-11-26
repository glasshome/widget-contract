const MAJOR_RE = /^(\d+)\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** The SDK version a build stands for: the package version, or the first release of a major the SDK declares ahead of it. */
export function buildSdkVersion(pkg: {
  version?: unknown;
  glasshome?: { sdkMajor?: unknown };
}): string | null {
  if (typeof pkg.version !== "string") return null;
  const major = pkg.glasshome?.sdkMajor;
  const versionMajor = MAJOR_RE.exec(pkg.version)?.[1];
  if (versionMajor === undefined || typeof major !== "number" || major <= Number(versionMajor))
    return pkg.version;
  return `${major}.0.0`;
}
