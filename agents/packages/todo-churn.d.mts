export interface PackageChurn {
  commits: number;
  lines: number;
  owned: number;
  sweeps: number;
}

export function isOwnedCommit(packageCount: number, packageLines: number, commitLines: number): boolean;

export function isSweptCommit(packageCount: number, packageLines: number): boolean;

export function readLastCommitDates(log: string): Map<string, string>;

export function readPackageChurn(repoRoot: string, since: string): Map<string, Map<string, PackageChurn>>;

export function readPackageLastCommitDates(repoRoot: string): Map<string, string>;

export function sumChurnSince(byDate: Map<string, PackageChurn> | undefined, since: string): PackageChurn;
