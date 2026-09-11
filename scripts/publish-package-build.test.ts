import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');

describe('package publisher build', () => {
  it('cleans every package distribution before the build published with lifecycle scripts disabled', () => {
    const publisher = readFileSync(resolve(ROOT, 'scripts/publish-packages.ts'), 'utf8');
    const manifest = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };

    // The publisher passes --ignore-scripts because it builds the whole graph once. A plain
    // `npm run build` here is not equivalent to package prepack: TypeScript leaves the emitted files
    // for deleted sources in dist, and npm's files allow-list then includes those obsolete modules.
    expect(publisher).toContain("const publishArgs = ['publish', '--access', 'public', '--ignore-scripts'];");
    expect(publisher).toContain("execFileSync('npm', ['run', 'build:clean'], { cwd: root, stdio: 'inherit' });");
    expect(publisher).not.toContain("execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });");

    // Follow the command through to the operation that removes both dist and its incremental state.
    expect(manifest.scripts['build:clean']).toBe('npm run clean && npm run build');
    expect(manifest.scripts.clean).toBe('npm run clean:build');
    expect(manifest.scripts['clean:build']).toContain('tsx ./scripts/clean-package-dist.ts');
  });
});
