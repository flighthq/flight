import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  BACKEND_OPERATION_SEAM_SCOPE_CAVEAT,
  collectBackendInterfaceNames,
  collectExplicitHostOperationSeams,
  createBackendOperationSeamReport,
  createEmptyBackendOperationSeamReport,
  formatBackendOperationSeamReport,
  hasBackendOperationSeamFailure,
  isAggregatorContractLane,
} from './backend-operation-seam-core';
import type { BackendOperationSeamReport } from './backend-operation-seam-core';
import { GATE_STRUCTURAL_LIMIT } from './gate-provenance';

// The ratchet. Membership in the enforced set is DERIVED — a package is migrated because it exports
// `explain<Name>Operation`, or because its explicit Host trait has equal method coverage in production
// calls, never because it appears in a list here.
describe('backend operation seam ratchet', () => {
  let report: BackendOperationSeamReport;
  let explicitHostSlots: ReadonlyMap<string, string>;

  beforeAll(async () => {
    const names = collectBackendInterfaceNames(packageSourceFiles('types'));
    const exportsByPackage = new Map<string, ReadonlySet<string>>();
    for (const packageName of packageNames()) {
      const publicLane = join(ROOT, 'packages', packageName, 'src', 'contract.ts');
      if (!existsSync(publicLane)) continue;
      // An aggregator lane serves other packages' BUILT output, so it would keep vouching for a seam its
      // real owner has deleted. See `isAggregatorContractLane`.
      if (isAggregatorContractLane(readFileSync(publicLane, 'utf-8'))) continue;
      const module = (await import(/* @vite-ignore */ pathToFileURL(publicLane).href)) as Record<string, unknown>;
      exportsByPackage.set(packageName, new Set(Object.keys(module)));
    }
    explicitHostSlots = collectExplicitHostOperationSeams(
      packageSourceFiles('types'),
      packageNames().flatMap(packageSourceFiles),
    );
    report = createBackendOperationSeamReport(names, exportsByPackage, explicitHostSlots);
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
  // Raised 12 → 13 on evidence, not on the live reading. Copying the current count into the floor is
  // rebaselining: it would absorb a regression as readily as a migration, since both change the number.
  // What distinguishes them is WHY it moved, and that was derived before this line was touched:
  //
  //   - the membership predicate has ONE commit in its history (107dca458), which PREDATES the commit
  //     that last set this floor (f74297faf) — so the rule that decides membership has not loosened;
  //   - of the 13 enforced interfaces, 12 had their `explain<Name>Operation` at or before f74297faf and
  //     all 12 are still enforced, so nothing silently dropped out and got masked by an addition;
  //   - exactly one arrived after: AudioDevice, in de0ab6862 "add AudioDeviceBackend seam with 13
  //     operations" — a new backend, which is why the denominator moved with it rather than a member
  //     being reclassified into the numerator.
  //
  // Window is the next independently evidenced migration: all 28 operations are now structurally queried,
  // with sentinel, host, custom-precedence, and host-fallback coverage. This raises the floor 13 → 14;
  // it does not rewrite the preceding 12 → 13 AudioDevice history.
  // Image then independently adds operation-specific explanation for Bitmap materialization, with sentinel,
  // host, custom-precedence, and consumer-absence coverage. That raises the floor 14 → 15.
  // The explicit-Host completion ruling then closes a second, equal-coverage migration shape: a Has* trait
  // owns the exact Host slot and production directly calls every non-lifecycle backend operation through it.
  // Deriving that shape adds 23 already-landed explicit Host interfaces without weakening the legacy
  // explain/has predicate, raising the floor 15 → 38. MediaSession and MediaSessionAction are among those
  // completions, and deleting either Host slot or any direct operation call drops this count.
  // 38 of 83 enforced / 45 not migrated after the explicit-Host completion ruling.
  it('never enforces fewer interfaces than the slices already landed', () => {
    expect(report.enforced).toBeGreaterThanOrEqual(38);
  });

  // ★ THE SCOPE CAVEAT MUST SURVIVE. The count is read as "N operations work"; it means an export exists.
  // Deleting the caveat to tidy the output fails here.
  it('prints the caveat that the count is migration and says what it cannot measure', () => {
    const output = formatBackendOperationSeamReport(report);
    expect(output).toContain(BACKEND_OPERATION_SEAM_SCOPE_CAVEAT);
    expect(output).toContain('STRUCTURAL');
    expect(output).toContain('counts migration');
    expect(output).toContain(GATE_STRUCTURAL_LIMIT);
  });

  // ★ THE SCOPE CAVEAT MUST SURVIVE. The count is read as "N operations work"; it means an export exists.
  // Deleting the caveat to tidy the output fails here.
  it('prints the caveat that the count is migration and says what it cannot measure', () => {
    const output = formatBackendOperationSeamReport(report);
    expect(output).toContain(BACKEND_OPERATION_SEAM_SCOPE_CAVEAT);
    expect(output).toContain('STRUCTURAL');
    expect(output).toContain('counts migration');
    expect(output).toContain(GATE_STRUCTURAL_LIMIT);
  });

  it('reports no violation among the migrated interfaces', () => {
    expect(report.violations).toEqual([]);
    expect(hasBackendOperationSeamFailure(report)).toBe(false);
  });

  it('derives the explicit Screen and MediaSession Host completions by equal interface coverage', () => {
    expect(explicitHostSlots.get('ScreenQuery')).toBe('Host.screen.query');
    expect(explicitHostSlots.get('MediaSession')).toBe('Host.media.session');
    expect(explicitHostSlots.get('MediaSessionAction')).toBe('Host.media.sessionAction');
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

describe('isAggregatorContractLane', () => {
  it('matches a lane that re-exports another package by name, and not one that re-exports its own files', () => {
    expect(isAggregatorContractLane("export * from '@flighthq/media';")).toBe(true);
    expect(isAggregatorContractLane("export * from './audioDeviceBackend';")).toBe(false);
    expect(isAggregatorContractLane("export { createMediaBackend } from './media';")).toBe(false);
  });

  // ★ Against the live tree, so the predicate is checked on the thing it actually classifies rather than
  // on strings written here. `sdk` is the repo's one barrel; every other lane re-exports its own files.
  it('selects exactly the sdk barrel out of the live contract lanes', () => {
    const aggregators = packageNames().filter((packageName) => {
      const lane = join(ROOT, 'packages', packageName, 'src', 'contract.ts');
      return existsSync(lane) && isAggregatorContractLane(readFileSync(lane, 'utf-8'));
    });
    expect(aggregators).toEqual(['sdk']);
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
