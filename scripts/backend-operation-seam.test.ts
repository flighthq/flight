import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  collectBackendInterfaceNames,
  createBackendOperationSeamReport,
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
      `${report.enforced} of ${report.total} interfaces enforced, ${report.notMigrated} not yet migrated`,
    );
  });

  // The ratchet direction: this slice migrated ten interfaces, so the enforced count may grow but must
  // never shrink. A regression that removes a seam fails here rather than quietly lowering the number.
  it('enforces at least the ten interfaces migrated so far', () => {
    expect(report.enforced).toBeGreaterThanOrEqual(10);
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
