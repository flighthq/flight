const sdkPackageName = '@flighthq/sdk';

function isAllowedNonSdkDependency(name: string): boolean {
  return name.startsWith('@flighthq/host-');
}

export function getInvalidExampleFlightDependencies(dependencies: Iterable<string>): string[] {
  return [...dependencies]
    .filter(
      (dependency) =>
        dependency.startsWith('@flighthq/') && dependency !== sdkPackageName && !isAllowedNonSdkDependency(dependency),
    )
    .sort();
}

export function getInvalidExampleFlightImportSpecifiers(specifiers: Iterable<string>): string[] {
  return [...specifiers]
    .filter((specifier) => {
      if (!specifier.startsWith('@flighthq/')) return false;
      if (specifier === sdkPackageName) return false;
      if (isAllowedNonSdkDependency(specifier)) return false;
      return !specifier.startsWith(`${sdkPackageName}/`) || specifier.startsWith(`${sdkPackageName}/contract`);
    })
    .sort();
}
