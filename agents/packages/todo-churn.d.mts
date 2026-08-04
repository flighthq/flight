export interface PackageChurn {
  commits: number;
  lines: number;
  sweeps: number;
}

export function readPackageChurn(repoRoot: string, since: string): Map<string, Map<string, PackageChurn>>;

export function sumChurnSince(byDate: Map<string, PackageChurn> | undefined, since: string): PackageChurn;
