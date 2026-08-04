export const FLIGHT_PACKAGE_AUTHOR = 'Joshua Granick and other contributors';
export const FLIGHT_PACKAGE_LICENSE = ['M', 'IT'].join('');

export interface PackageLicenseManifest {
  author?: unknown;
  license?: unknown;
}

export interface PackageLicenseViolation {
  detail: string;
  label: string;
}

/** Enforces the repository's own declaration on every publishable package manifest. */
export function getPackageLicenseViolations(
  path: string,
  manifest: Readonly<PackageLicenseManifest> | null,
): PackageLicenseViolation[] {
  const violations: PackageLicenseViolation[] = [];
  if (manifest?.author !== FLIGHT_PACKAGE_AUTHOR) {
    violations.push({
      detail: `got ${describeValue(manifest?.author)}`,
      label: `${path} author matches the root LICENSE holder`,
    });
  }
  if (manifest?.license !== FLIGHT_PACKAGE_LICENSE) {
    violations.push({
      detail: `got ${describeValue(manifest?.license)}`,
      label: `${path} license is ${JSON.stringify(FLIGHT_PACKAGE_LICENSE)}`,
    });
  }
  return violations;
}

function describeValue(value: unknown): string {
  return JSON.stringify(value) ?? 'undefined';
}
