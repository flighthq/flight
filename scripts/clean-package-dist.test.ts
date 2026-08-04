import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { cleanPackageBuildOutputs } from './clean-package-dist';

describe('cleanPackageBuildOutputs', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
  });

  it('removes distributions and build metadata from current and orphaned package directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'flight-clean-dist-'));
    roots.push(root);
    const first = packageDirectory(root, 'first');
    const orphan = join(root, 'renamed-away');
    mkdirSync(join(orphan, 'dist'), { recursive: true });
    writeFileSync(join(first, 'dist', 'stale.js'), 'stale');
    writeFileSync(join(orphan, 'dist', 'stale.d.ts'), 'stale');
    writeFileSync(join(first, 'tsconfig.tsbuildinfo'), 'stale');
    writeFileSync(join(orphan, 'legacy.tsbuildinfo'), 'stale');
    writeFileSync(join(first, 'source.ts'), 'source');

    cleanPackageBuildOutputs([first, orphan]);

    expect(existsSync(join(first, 'dist'))).toBe(false);
    expect(existsSync(join(orphan, 'dist'))).toBe(false);
    expect(existsSync(join(first, 'tsconfig.tsbuildinfo'))).toBe(false);
    expect(existsSync(join(orphan, 'legacy.tsbuildinfo'))).toBe(false);
    expect(existsSync(join(first, 'source.ts'))).toBe(true);
  });

  it('is idempotent when a package directory has no generated output', () => {
    const root = mkdtempSync(join(tmpdir(), 'flight-clean-dist-'));
    roots.push(root);
    const directory = packageDirectory(root, 'clean');
    rmSync(join(directory, 'dist'), { recursive: true });

    expect(() => cleanPackageBuildOutputs([directory])).not.toThrow();
  });
});

function packageDirectory(root: string, name: string): string {
  const directory = join(root, name);
  mkdirSync(join(directory, 'dist'), { recursive: true });
  writeFileSync(join(directory, 'package.json'), '{}');
  return directory;
}
