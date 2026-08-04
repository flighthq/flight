export function readPackageChurn(repoRoot: string, since: string): Map<string, Map<string, number>>;

export function sumChurnSince(byDate: Map<string, number> | undefined, since: string): number;
