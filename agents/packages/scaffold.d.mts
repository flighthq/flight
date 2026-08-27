export interface PackageScaffoldOptions {
  readonly cellsDirectory?: string;
  readonly depthDirectory?: string;
  readonly packagesDirectory?: string;
}

export interface PackageScaffoldResult {
  readonly created: number;
  readonly packageNames: readonly string[];
  readonly skipped: number;
}

export function findRealPackageNames(packagesDirectory: string): readonly string[];

export function scaffoldPackageCells(options?: Readonly<PackageScaffoldOptions>): PackageScaffoldResult;
