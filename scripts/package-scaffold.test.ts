import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { scaffoldPackageCells } from '../agents/packages/scaffold.mjs';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

describe('scaffoldPackageCells', () => {
  it('scaffolds a real package and ignores a stale directory without package.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'flight-package-scaffold-'));
    temporaryDirectories.push(root);
    const cellsDirectory = join(root, 'agents', 'packages');
    const depthDirectory = join(root, 'depth');
    const packagesDirectory = join(root, 'packages');
    mkdirSync(join(packagesDirectory, 'real-package'), { recursive: true });
    mkdirSync(join(packagesDirectory, 'stale-renamed-away'));
    writeFileSync(join(packagesDirectory, 'real-package', 'package.json'), '{}');

    const result = scaffoldPackageCells({ cellsDirectory, depthDirectory, packagesDirectory });

    expect(result).toEqual({ created: 2, packageNames: ['real-package'], skipped: 0 });
    expect(readdirSync(cellsDirectory)).toEqual(['real-package']);
    expect(existsSync(join(cellsDirectory, 'real-package', 'charter.md'))).toBe(true);
    expect(existsSync(join(cellsDirectory, 'real-package', 'status.md'))).toBe(true);
    expect(existsSync(join(cellsDirectory, 'stale-renamed-away'))).toBe(false);
  });
});
