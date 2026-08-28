import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  collectBackendInterfaceNames,
  createBackendOperationSeamReport,
  createEmptyBackendOperationSeamReport,
  formatBackendOperationSeamReport,
  hasBackendOperationSeamFailure,
} from './backend-operation-seam-core';
import type { BackendOperationSeamReport } from './backend-operation-seam-core';

// The ratchet. Membership in the enforced set is DERIVED — a package is migrated because it exports
// `explain<Name>Operation`, never because it appears in a list here — so the gate tightens by itself as
// each slice lands and cannot be quieted by editing a roster.
describe('backend operation seam ratchet', () => {
  let report: BackendOperationSeamReport;

  beforeAll(async () => {
    const names = collectBackendInterfaceNames(packageSourceFiles('types'));
    const exportsByPackage = new Map<string, ReadonlySet<string>>();
    for (const packageName of packageNames()) {
      const publicLane = join(ROOT, 'packages', packageName, 'src', 'contract.ts');
      if (!existsSync(publicLane)) continue;
      const module = (await import(/* @vite-ignore */ pathToFileURL(publicLane).href)) as Record<string, unknown>;
      exportsByPackage.set(packageName, new Set(Object.keys(module)));
    }
    report = createBackendOperationSeamReport(names, exportsByPackage);
    // eslint-disable-next-line no-console
    console.log(formatBackendOperationSeamReport(report));
  }, 300_000);

  it('prints both counts and holds the partition', () => {
    expect(report.total).toBeGreaterThan(0);
    expect(report.enforced + report.notMigrated).toBe(report.total);
    expect(formatBackendOperationSeamReport(report)).toContain(
      `${report.enforced} of ${report.total} interface shapes enforced (declaration only; consumer builds not validated here), ${report.notMigrated} not yet migrated`,
    );
  });

  // ★ THE RATCHET FLOOR, and it must be raised by every slice that migrates an interface. This is the
  // one committed number in the gate, and it is what makes the ratchet a ratchet: membership is derived,
  // but "never fewer than we already had" cannot be derived from the same source without being circular.
  //
  // Found by mutation rather than by review: renaming `explainMediaSessionOperation` correctly dropped the
  // printed count from 11 to 10, and NOTHING FAILED, because the floor still read 10 from the previous
  // slice. A ratchet whose floor lags is a ratchet that lets one regression through per slice.
  it('never enforces fewer interfaces than the slices already landed', () => {
    expect(report.enforced).toBeGreaterThanOrEqual(12);
  });

  it('reports no violation among the migrated interfaces', () => {
    expect(report.violations).toEqual([]);
    expect(hasBackendOperationSeamFailure(report)).toBe(false);
  });

  // Membership is structural: every enforced entry names the package whose exports proved it, and nothing
  // is enforced without an owner.
  it('derives every enforced entry from a package that exports the seam', () => {
    for (const entry of report.entries.filter((candidate) => candidate.migrated)) {
      expect(entry.packageName).not.toBeNull();
    }
  });
});

describe('createEmptyBackendOperationSeamReport', () => {
  // ★ Compared against the production path, never against a field list written here — a list would be a
  // second copy of the shape, which is the defect the factory exists to remove.
  it('supplies every field the real report producer does', () => {
    const produced = createBackendOperationSeamReport([], new Map());
    expect(Object.keys(createEmptyBackendOperationSeamReport()).sort()).toEqual(Object.keys(produced).sort());
  });

  it('is empty rather than merely well-typed', () => {
    const empty = createEmptyBackendOperationSeamReport();
    expect(empty.enforced).toBe(0);
    expect(empty.notMigrated).toBe(0);
    expect(empty.total).toBe(0);
    expect(empty.entries).toEqual([]);
    expect(empty.violations).toEqual([]);
  });
});

const ROOT = resolve(__dirname, '..');

function packageNames(): string[] {
  return readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(ROOT, 'packages', entry.name, 'package.json')))
    .map((entry) => entry.name)
    .sort();
}

function packageSourceFiles(packageName: string): string[] {
  const sourceDir = join(ROOT, 'packages', packageName, 'src');
  if (!existsSync(sourceDir)) return [];
  return readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts'))
    .map((entry) => join(sourceDir, entry.name));
}
