export type LocalPackageTargetStatus = 'built' | 'stale' | 'unbuilt';

export function getLocalPackageTargetStatus(
  codePackagesDir: string,
  cellDir: string,
  cellName: string,
  packageName: string | undefined,
): LocalPackageTargetStatus;
