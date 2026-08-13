import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeFixtureTreeStamp } from '../../scripts/fixtures';
import type { ConformanceFixtureAdapter, ConformanceFixtureTree } from './fixture-conformance';
import {
  createConformanceFixturePlan,
  discoverConformanceFixtureTrees,
  listConformanceFixtureReferences,
  runConformanceFixtureAdapters,
  runConformanceFixturePlan,
  scoreConformanceFixturePlan,
} from './fixture-conformance';

let workspace = '';

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'flight-fixture-conformance-'));
});

afterEach(() => {
  rmSync(workspace, { force: true, recursive: true });
});

describe('discoverConformanceFixtureTrees', () => {
  it('discovers only complete stamps for the requested pinned release', () => {
    const current = makeTree('full', 'shared-tree', 'fixture-release');
    makeTree('demo', 'old-tree', 'old-release');
    mkdirSync(join(workspace, 'extracted', 'full', 'unstamped-tree'), { recursive: true });

    expect(discoverConformanceFixtureTrees(workspace, 'fixture-release')).toEqual([
      {
        directory: current,
        packs: [{ id: 'sample-fixtures', verifiedFixtureFiles: 2 }],
        release: 'fixture-release',
        tree: 'shared-tree',
        variant: 'full',
      },
    ]);
  });
});

describe('listConformanceFixtureReferences', () => {
  it('keeps fixture paths while excluding acquisition metadata', () => {
    const tree = makeTree('full', 'tree', 'fixture-release');
    write(tree, 'models/a.gltf', '{}');
    write(tree, 'models/NOTES.md', 'fixture');
    write(tree, 'models/LICENSE.md', 'metadata');
    write(tree, 'LICENSES/one.txt', 'metadata');
    write(tree, 'NOTICE.md', 'metadata');

    expect(listConformanceFixtureReferences(tree)).toEqual(['models/NOTES.md', 'models/a.gltf']);
  });
});

describe('runConformanceFixtureAdapters', () => {
  it('runs matching adapters and records outcomes without turning fixture failures into runner failures', async () => {
    const directory = makeTree('full', 'tree', 'fixture-release');
    for (const name of [
      'accepted.asset',
      'degraded.asset',
      'rejected.asset',
      'unsupported.asset',
      'threw.asset',
      'not-run.asset',
    ]) {
      write(directory, name, name);
    }
    const tree = fixtureTree(directory, 6);
    const adapter: ConformanceFixtureAdapter = {
      features: [],
      id: 'sample',
      implementation: {
        run: async ({ reference }) => {
          if (reference === 'threw.asset') throw new TypeError('fixture-derived message is deliberately not retained');
          if (reference === 'not-run.asset') {
            return { diagnostics: [], imported: false, notRunReason: 'companion-unavailable' };
          }
          if (reference === 'degraded.asset') {
            return {
              diagnostics: [{ kind: 'sample.value-dropped', origin: 'sample', severity: 'Drop' }],
              imported: true,
            };
          }
          if (reference === 'unsupported.asset') {
            return {
              diagnostics: [{ kind: 'sample.unsupported-version', origin: 'sample', severity: 'Reject' }],
              imported: false,
            };
          }
          if (reference === 'rejected.asset') {
            return {
              diagnostics: [{ kind: 'sample.invalid', origin: 'sample', severity: 'Reject' }],
              imported: false,
            };
          }
          return { diagnostics: [], imported: true };
        },
        state: 'available',
      },
      selects: (_tree, reference) => reference.endsWith('.asset'),
    };

    const plan = createConformanceFixturePlan([tree], [adapter]);
    const results = await runConformanceFixturePlan(plan, 3);
    expect(Object.fromEntries(results.map((result) => [result.reference, result.state]))).toEqual({
      'accepted.asset': 'imported',
      'degraded.asset': 'degraded',
      'not-run.asset': 'not-run',
      'rejected.asset': 'rejected',
      'threw.asset': 'threw',
      'unsupported.asset': 'unsupported',
    });
    expect(results.find((result) => result.reference === 'threw.asset')).toMatchObject({ errorName: 'TypeError' });
    expect(JSON.stringify(results)).not.toContain('fixture-derived message');
    expect(scoreConformanceFixturePlan(plan, results).files).toMatchObject({
      acceptedCoverage: { denominator: 6, numerator: 1, state: 'measured', value: 1 / 6 },
      acceptedFiles: 1,
      attemptedFiles: 6,
      completedFiles: 4,
    });
  });

  it('applies a deterministic global limit after sorting candidates', async () => {
    const directory = makeTree('full', 'tree', 'fixture-release');
    write(directory, 'b.asset', 'b');
    write(directory, 'a.asset', 'a');
    const adapter: ConformanceFixtureAdapter = {
      features: [],
      id: 'sample',
      implementation: { run: async () => ({ diagnostics: [], imported: true }), state: 'available' },
      selects: () => true,
    };

    const results = await runConformanceFixtureAdapters([fixtureTree(directory, 2)], [adapter], { limit: 1 });
    expect(results.map((result) => result.reference)).toEqual(['a.asset']);
  });

  it('fails when the current tree no longer has its stamped fixture population', async () => {
    const directory = makeTree('full', 'tree', 'fixture-release');
    write(directory, 'only-one.asset', 'one');
    const adapter: ConformanceFixtureAdapter = {
      features: [],
      id: 'sample',
      implementation: { run: async () => ({ diagnostics: [], imported: true }), state: 'available' },
      selects: () => true,
    };

    await expect(runConformanceFixtureAdapters([fixtureTree(directory, 2)], [adapter])).rejects.toThrow(
      'no longer matches its verified stamp',
    );
  });
});

describe('scoreConformanceFixturePlan', () => {
  it('distinguishes adapter availability from reaching the target Flight method', async () => {
    const directory = makeTree('full', 'tree', 'fixture-release');
    write(directory, 'one.asset', 'one');
    write(directory, 'two.txt', 'two');
    const adapter: ConformanceFixtureAdapter = {
      features: [],
      id: 'available',
      implementation: {
        run: async () => ({ diagnostics: [], imported: false, notRunReason: 'companion-unavailable' }),
        state: 'available',
      },
      selects: (_tree, reference) => reference.endsWith('.asset'),
    };
    const plan = createConformanceFixturePlan([fixtureTree(directory, 2)], [adapter]);
    const results = await runConformanceFixturePlan(plan);

    expect(scoreConformanceFixturePlan(plan, results)).toMatchObject({
      acceptedImport: { denominator: 0, numerator: 0, state: 'not-measured', value: null },
      executionCoverage: { denominator: 1, numerator: 0, state: 'measured', value: 0 },
      implementationCoverage: { denominator: 1, numerator: 1, state: 'measured', value: 1 },
      outcomes: { 'not-run': 1 },
    });
  });

  it('keeps file acceptance separate from adapter-declared feature expectations', async () => {
    const directory = makeTree('full', 'tree', 'fixture-release');
    write(directory, 'one.asset', 'one');
    write(directory, 'two.asset', 'two');
    const adapter: ConformanceFixtureAdapter = {
      features: [{ id: 'sample.geometry', label: 'Geometry survives import' }],
      id: 'available',
      implementation: {
        run: async ({ reference }) => ({
          diagnostics: [],
          featureOutcomes: [{ id: 'sample.geometry', state: reference === 'one.asset' ? 'passed' : 'failed' }],
          imported: true,
        }),
        state: 'available',
      },
      selects: () => true,
    };
    const plan = createConformanceFixturePlan([fixtureTree(directory, 2)], [adapter]);
    const results = await runConformanceFixturePlan(plan);
    const score = scoreConformanceFixturePlan(plan, results);

    expect(score.files).toEqual({
      acceptedCoverage: { denominator: 2, numerator: 2, state: 'measured', value: 1 },
      acceptedFiles: 2,
      acceptedOfAttempted: { denominator: 2, numerator: 2, state: 'measured', value: 1 },
      attemptedFiles: 2,
      completedFiles: 2,
      corpusFiles: 2,
      executionCoverage: { denominator: 2, numerator: 2, state: 'measured', value: 1 },
      matchedFiles: 2,
      selectionCoverage: { denominator: 2, numerator: 2, state: 'measured', value: 1 },
    });
    expect(score.features).toMatchObject({
      checks: { failed: 1, 'not-run': 0, passed: 1 },
      conformingFeatures: 0,
      declaredFeatures: 1,
      observedFeatures: 1,
      testedFeatures: 1,
      workingAsExpected: { denominator: 1, numerator: 0, state: 'measured', value: 0 },
    });
    expect(score.features.rows).toEqual([
      {
        adapter: 'available',
        checks: { failed: 1, 'not-run': 0, passed: 1 },
        id: 'sample.geometry',
        label: 'Geometry survives import',
        state: 'failing',
      },
    ]);
  });

  it('keeps unmatched corpus files in the headline coverage denominator', async () => {
    const directory = makeTree('full', 'tree', 'fixture-release');
    write(directory, 'one.asset', 'one');
    write(directory, 'sidecar.bin', 'two');
    const adapter: ConformanceFixtureAdapter = {
      features: [],
      id: 'available',
      implementation: { run: async () => ({ diagnostics: [], imported: true }), state: 'available' },
      selects: (_tree, reference) => reference.endsWith('.asset'),
    };
    const plan = createConformanceFixturePlan([fixtureTree(directory, 2)], [adapter]);
    const results = await runConformanceFixturePlan(plan);

    expect(scoreConformanceFixturePlan(plan, results).files).toEqual({
      acceptedCoverage: { denominator: 2, numerator: 1, state: 'measured', value: 0.5 },
      acceptedFiles: 1,
      acceptedOfAttempted: { denominator: 1, numerator: 1, state: 'measured', value: 1 },
      attemptedFiles: 1,
      completedFiles: 1,
      corpusFiles: 2,
      executionCoverage: { denominator: 2, numerator: 1, state: 'measured', value: 0.5 },
      matchedFiles: 1,
      selectionCoverage: { denominator: 2, numerator: 1, state: 'measured', value: 0.5 },
    });
  });

  it('rejects results that do not correspond to the selected candidate identities', async () => {
    const directory = makeTree('full', 'tree', 'fixture-release');
    write(directory, 'one.asset', 'one');
    write(directory, 'two.txt', 'two');
    const adapter: ConformanceFixtureAdapter = {
      features: [],
      id: 'available',
      implementation: { run: async () => ({ diagnostics: [], imported: true }), state: 'available' },
      selects: (_tree, reference) => reference.endsWith('.asset'),
    };
    const plan = createConformanceFixturePlan([fixtureTree(directory, 2)], [adapter]);
    const results = await runConformanceFixturePlan(plan);

    expect(() => scoreConformanceFixturePlan(plan, [{ ...results[0]!, reference: 'different.asset' }])).toThrow(
      'does not match its selected candidate identity',
    );
  });

  it('retains zero-candidate families as not-measured score rows', async () => {
    const directory = makeTree('full', 'tree', 'fixture-release');
    write(directory, 'one.txt', 'one');
    write(directory, 'two.txt', 'two');
    const adapter: ConformanceFixtureAdapter = {
      features: [],
      id: 'future',
      implementation: { reason: 'flight-importer-unavailable', state: 'unavailable' },
      selects: (_tree, reference) => reference.endsWith('.future'),
    };
    const plan = createConformanceFixturePlan([fixtureTree(directory, 2)], [adapter]);
    const results = await runConformanceFixturePlan(plan);
    const score = scoreConformanceFixturePlan(plan, results);

    expect(score.families).toEqual([
      {
        acceptedImport: { denominator: 0, numerator: 0, state: 'not-measured', value: null },
        adapter: 'future',
        eligibleCandidateRuns: 0,
        executionCoverage: { denominator: 0, numerator: 0, state: 'not-measured', value: null },
        implementation: 'unavailable',
        implementationCoverage: { denominator: 0, numerator: 0, state: 'not-measured', value: null },
        outcomes: { degraded: 0, imported: 0, 'not-run': 0, rejected: 0, threw: 0, unsupported: 0 },
        selectedCandidateRuns: 0,
        selectionCoverage: { denominator: 0, numerator: 0, state: 'not-measured', value: null },
      },
    ]);
  });

  it('scores selection, implementation, execution, and accepted imports as separate populations', async () => {
    const directory = makeTree('full', 'tree', 'fixture-release');
    write(directory, 'one.asset', 'one');
    write(directory, 'two.txt', 'two');
    const available: ConformanceFixtureAdapter = {
      features: [],
      id: 'available',
      implementation: { run: async () => ({ diagnostics: [], imported: true }), state: 'available' },
      selects: (_tree, reference) => reference.endsWith('.asset'),
    };
    const unavailable: ConformanceFixtureAdapter = {
      features: [],
      id: 'unavailable',
      implementation: { reason: 'flight-importer-unavailable', state: 'unavailable' },
      selects: (_tree, reference) => reference.endsWith('.asset'),
    };
    const plan = createConformanceFixturePlan([fixtureTree(directory, 2)], [available, unavailable]);
    const results = await runConformanceFixturePlan(plan, 2);

    expect(scoreConformanceFixturePlan(plan, results)).toMatchObject({
      acceptedImport: { denominator: 1, numerator: 1, state: 'measured', value: 1 },
      assurance: { fixtureContent: 'not-retained', importAcceptanceSemanticCorrectness: 'not-measured' },
      executionCoverage: { denominator: 1, numerator: 1, state: 'measured', value: 1 },
      implementationCoverage: { denominator: 2, numerator: 1, state: 'measured', value: 0.5 },
      outcomes: { imported: 1, 'not-run': 1 },
      selectionCoverage: { denominator: 2, numerator: 2, state: 'measured', value: 1 },
    });
  });
});

function fixtureTree(directory: string, verifiedFixtureFiles: number): ConformanceFixtureTree {
  return {
    directory,
    packs: [{ id: 'sample-fixtures', verifiedFixtureFiles }],
    release: 'fixture-release',
    tree: 'tree',
    variant: 'full',
  };
}

function makeTree(variant: string, tree: string, tag: string): string {
  const directory = join(workspace, 'extracted', variant, tree);
  writeFixtureTreeStamp(directory, {
    packs: [
      {
        file: `sample-fixtures-${variant}-${tag}.tar.gz`,
        metadataFiles: 0,
        pack: 'sample-fixtures',
        sha256: 'a'.repeat(64),
        verifiedFixtureFiles: 2,
      },
    ],
    tag,
    variant,
  });
  return directory;
}

function write(root: string, reference: string, text: string): void {
  const path = join(root, ...reference.split('/'));
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text, 'utf8');
}
