import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { findOrphanedPackageDistDirectories, formatOrphanedPackageDistError } from './check-package-dist-orphans';

describe('package dist orphan detection', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
  });

  it('finds only dist directories whose package manifest no longer exists', () => {
    const root = temporaryRoot(roots);
    const packages = join(root, 'packages');
    const live = join(packages, 'live');
    const orphanB = join(packages, 'orphan-b');
    const orphanA = join(packages, 'orphan-a');
    const residue = join(packages, 'residue');
    const distFile = join(packages, 'dist-file');

    mkdirSync(join(live, 'dist'), { recursive: true });
    writeFileSync(join(live, 'package.json'), '{}');
    mkdirSync(join(orphanB, 'dist'), { recursive: true });
    mkdirSync(join(orphanA, 'dist'), { recursive: true });
    mkdirSync(residue, { recursive: true });
    mkdirSync(distFile, { recursive: true });
    writeFileSync(join(distFile, 'dist'), 'not a directory');

    expect(findOrphanedPackageDistDirectories(packages)).toEqual([join(orphanA, 'dist'), join(orphanB, 'dist')]);
  });

  it('reports the misleading directories and the atomic clean remediation', () => {
    const root = temporaryRoot(roots);
    const directories = [join(root, 'packages', 'removed', 'dist')];

    expect(formatOrphanedPackageDistError(directories, root)).toBe(
      [
        'Orphaned package build output detected:',
        '  - packages/removed/dist',
        '',
        'These directories have dist/ output but no package.json. They can masquerade as live APIs',
        'in tools such as plain recursive grep (rg ignores generated output through .gitignore).',
        'Run `npm run clean` to remove dist and sibling TypeScript build metadata together.',
      ].join('\n'),
    );
  });
});

function temporaryRoot(roots: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'flight-dist-orphans-'));
  roots.push(root);
  return root;
}
