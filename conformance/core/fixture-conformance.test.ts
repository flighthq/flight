import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeFixtureTreeStamp } from '../../scripts/fixtures';
import type { ConformanceFixtureAdapter, ConformanceFixtureTree } from './fixture-conformance';
import {
  discoverConformanceFixtureTrees,
  listConformanceFixtureReferences,
  runConformanceFixtureAdapters,
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
    for (const name of ['accepted.asset', 'rejected.asset', 'unsupported.asset', 'threw.asset', 'not-run.asset']) {
      write(directory, name, name);
    }
    const tree = fixtureTree(directory);
    const adapter: ConformanceFixtureAdapter = {
      id: 'sample',
      run: async ({ reference }) => {
        if (reference === 'threw.asset') throw new TypeError('fixture-derived message is deliberately not retained');
        if (reference === 'not-run.asset') {
          return { diagnostics: [], imported: false, notRunReason: 'companion-unavailable' };
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
        return {
          diagnostics: [{ kind: 'sample.partial', origin: 'sample', severity: 'Skip' }],
          imported: true,
        };
      },
      selects: (_tree, reference) => reference.endsWith('.asset'),
    };

    const results = await runConformanceFixtureAdapters([tree], [adapter], { concurrency: 3 });
    expect(Object.fromEntries(results.map((result) => [result.reference, result.state]))).toEqual({
      'accepted.asset': 'imported',
      'not-run.asset': 'not-run',
      'rejected.asset': 'rejected',
      'threw.asset': 'threw',
      'unsupported.asset': 'unsupported',
    });
    expect(results.find((result) => result.reference === 'threw.asset')).toMatchObject({ errorName: 'TypeError' });
    expect(JSON.stringify(results)).not.toContain('fixture-derived message');
  });

  it('applies a deterministic global limit after sorting candidates', async () => {
    const directory = makeTree('full', 'tree', 'fixture-release');
    write(directory, 'b.asset', 'b');
    write(directory, 'a.asset', 'a');
    const adapter: ConformanceFixtureAdapter = {
      id: 'sample',
      run: async () => ({ diagnostics: [], imported: true }),
      selects: () => true,
    };

    const results = await runConformanceFixtureAdapters([fixtureTree(directory)], [adapter], { limit: 1 });
    expect(results.map((result) => result.reference)).toEqual(['a.asset']);
  });
});

function fixtureTree(directory: string): ConformanceFixtureTree {
  return {
    directory,
    packs: [{ id: 'sample-fixtures', verifiedFixtureFiles: 2 }],
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
