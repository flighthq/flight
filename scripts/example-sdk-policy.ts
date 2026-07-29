const sdkPackageName = '@flighthq/sdk';

export function getInvalidExampleFlightDependencies(dependencies: Iterable<string>): string[] {
  return [...dependencies]
    .filter((dependency) => dependency.startsWith('@flighthq/') && dependency !== sdkPackageName)
    .sort();
}

export function getInvalidExampleFlightImportSpecifiers(specifiers: Iterable<string>): string[] {
  return [...specifiers]
    .filter((specifier) => {
      if (!specifier.startsWith('@flighthq/')) return false;
      if (specifier === sdkPackageName) return false;
      return !specifier.startsWith(`${sdkPackageName}/`) || specifier.startsWith(`${sdkPackageName}/contract`);
    })
    .sort();
}
