import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { getLocalPackageTargetStatus } from '../agents/packages/todo-target.mjs';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

describe('getLocalPackageTargetStatus', () => {
  it('classifies a residue-only package with historical evidence as stale', () => {
    const { cellDirectory, packagesDirectory } = createFixture();
    mkdirSync(join(packagesDirectory, 'tileset', 'dist'), { recursive: true });
    writeFileSync(join(cellDirectory, 'review.md'), '# historical review');

    expect(getLocalPackageTargetStatus(packagesDirectory, cellDirectory, 'tileset', '@flighthq/tileset')).toBe('stale');
  });

  it('accepts the named scoped package target when its manifest exists', () => {
    const { cellDirectory, packagesDirectory } = createFixture();
    mkdirSync(join(packagesDirectory, 'live-target'), { recursive: true });
    writeFileSync(join(packagesDirectory, 'live-target', 'package.json'), '{}');

    expect(
      getLocalPackageTargetStatus(packagesDirectory, cellDirectory, 'historical-cell', '@flighthq/live-target'),
    ).toBe('built');
  });

  it('keeps a charter without implementation history in the unbuilt queue', () => {
    const { cellDirectory, packagesDirectory } = createFixture();

    expect(
      getLocalPackageTargetStatus(packagesDirectory, cellDirectory, 'future-package', '@flighthq/future-package'),
    ).toBe('unbuilt');
  });
});

function createFixture(): { cellDirectory: string; packagesDirectory: string } {
  const directory = mkdtempSync(join(tmpdir(), 'flight-package-todo-'));
  temporaryDirectories.push(directory);
  const cellDirectory = join(directory, 'cell');
  const packagesDirectory = join(directory, 'packages');
  mkdirSync(cellDirectory);
  mkdirSync(packagesDirectory);
  return { cellDirectory, packagesDirectory };
}
