import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  UNIT_TEST_COST_EXEMPTIONS,
  checkUnitTestCost,
  collectUnitTestCapabilitySites,
  createEmptyUnitTestCostReport,
  formatUnitTestCostReport,
  getUnitTestCapability,
  readUnitTestSources,
} from './unitTestCost.ts';

// ★ EVERY FIXTURE SPECIFIER IS ASSEMBLED AT RUNTIME, AND THAT IS NOT STYLE. This file's subject is a
// pattern in source text, so a fixture written as a literal would put that pattern in THIS file — and
// the gate scans every lane file, including this one. Spelling the specifiers out would make the
// detector report its own test as a violation, which is the defect where a specimen cannot be told from
// an instance. Assembling them keeps the assertions exact while leaving the file text clean.
const CHILD_PROCESS = `node:child${'_'}process`;
const BUNDLER = `roll${'up'}`;
const COMPILER = `type${'script'}`;

describe('checkUnitTestCost', () => {
  it('reports a capability site that the ledger does not carry', () => {
    const report = checkUnitTestCost([source('packages/example/src/a.test.ts', CHILD_PROCESS)], []);

    expect(report.unexpected).toEqual([
      { capability: 'spawns-process', path: 'packages/example/src/a.test.ts', specifier: CHILD_PROCESS },
    ]);
    expect(report.stale).toEqual([]);
  });

  it('accepts a capability site the ledger carries', () => {
    const report = checkUnitTestCost(
      [source('packages/example/src/a.test.ts', CHILD_PROCESS)],
      [{ capability: 'spawns-process', path: 'packages/example/src/a.test.ts' }],
    );

    expect(report.unexpected).toEqual([]);
    expect(report.stale).toEqual([]);
  });

  // ★ The ratchet has to bite in BOTH directions. An entry nobody prunes stops describing the tree and
  // starts excusing it, so a file that has been repaired must fail until its exemption is dropped.
  it('reports a ledger entry whose file no longer reaches for the capability', () => {
    const report = checkUnitTestCost(
      [source('packages/example/src/a.test.ts', 'node:fs')],
      [{ capability: 'spawns-process', path: 'packages/example/src/a.test.ts' }],
    );

    expect(report.stale).toEqual([{ capability: 'spawns-process', path: 'packages/example/src/a.test.ts' }]);
    expect(report.unexpected).toEqual([]);
  });

  it('counts the scanned population so a clean verdict cannot describe an empty scan', () => {
    expect(checkUnitTestCost([], []).scannedFiles).toBe(0);
    expect(checkUnitTestCost([source('packages/example/src/a.test.ts', 'node:fs')], []).scannedFiles).toBe(1);
  });
});

describe('collectUnitTestCapabilitySites', () => {
  it('finds the dynamic spelling as well as the static one', () => {
    const dynamic = { path: 'packages/example/src/a.test.ts', source: `await import('${BUNDLER}');` };

    expect(collectUnitTestCapabilitySites([dynamic])).toEqual([
      { capability: 'builds-bundle', path: 'packages/example/src/a.test.ts', specifier: BUNDLER },
    ]);
  });

  it('reports one site per file and capability, however many imports carry it', () => {
    const twice = {
      path: 'packages/example/src/a.test.ts',
      source: `import a from '${COMPILER}';\nimport b from '${COMPILER}';`,
    };

    expect(collectUnitTestCapabilitySites([twice])).toHaveLength(1);
  });

  it('ignores ordinary imports', () => {
    expect(collectUnitTestCapabilitySites([source('packages/example/src/a.test.ts', 'node:fs')])).toEqual([]);
  });
});

describe('createEmptyUnitTestCostReport', () => {
  // Compared against the production path, never against a field list written here — a list would be a
  // second copy of the shape, which is the defect the factory exists to remove.
  it('supplies every field the real report producer does', () => {
    expect(Object.keys(createEmptyUnitTestCostReport()).sort()).toEqual(Object.keys(checkUnitTestCost([], [])).sort());
  });
});

describe('formatUnitTestCostReport', () => {
  it('names the offending file, the specifier, and the remedy', () => {
    const text = formatUnitTestCostReport(
      checkUnitTestCost([source('packages/example/src/a.test.ts', CHILD_PROCESS)], []),
    );

    expect(text).toContain('packages/example/src/a.test.ts');
    expect(text).toContain(CHILD_PROCESS);
    expect(text).toContain('UNIT_TEST_COST_EXEMPTIONS');
  });

  it('reports the scanned population on a clean verdict', () => {
    expect(formatUnitTestCostReport(checkUnitTestCost([source('a.test.ts', 'node:fs')], []))).toContain('1 files');
  });
});

describe('getUnitTestCapability', () => {
  it('maps each integration specifier to its capability', () => {
    expect(getUnitTestCapability(CHILD_PROCESS)).toBe('spawns-process');
    expect(getUnitTestCapability(BUNDLER)).toBe('builds-bundle');
    expect(getUnitTestCapability(COMPILER)).toBe('runs-compiler');
  });

  it('returns null for an ordinary specifier', () => {
    expect(getUnitTestCapability('node:fs')).toBeNull();
    expect(getUnitTestCapability('@flighthq/types/contract')).toBeNull();
  });
});

describe('readUnitTestSources', () => {
  it('reads each named path relative to the root', () => {
    const root = mkdtempSync(join(tmpdir(), 'flight-cost-'));
    try {
      mkdirSync(join(root, 'scripts'));
      writeFileSync(join(root, 'scripts', 'a.test.ts'), 'contents');

      expect(readUnitTestSources(root, ['scripts/a.test.ts'])).toEqual([
        { path: 'scripts/a.test.ts', source: 'contents' },
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

describe('UNIT_TEST_COST_EXEMPTIONS', () => {
  it('names each file and capability at most once', () => {
    const keys = UNIT_TEST_COST_EXEMPTIONS.map(({ capability, path }) => `${path} ${capability}`);

    expect(new Set(keys).size).toBe(keys.length);
  });
});

function source(path: string, specifier: string): { path: string; source: string } {
  return { path, source: `import x from '${specifier}';` };
}
