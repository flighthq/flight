import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createPublishedPackageReadme,
  getPublishedPackageArtifacts,
  withTemporaryPublishArtifacts,
} from './package-publish-artifacts';

const sourceRef = '0123456789abcdef0123456789abcdef01234567';
const manifest = {
  name: '@flighthq/example',
  version: '0.4.0-next.42.0123456',
  description: 'A focused example package.',
  repository: { directory: 'packages/example' },
};

describe('package publish artifacts', () => {
  it('generates a minimal leaf README tied to the exact artifact source', () => {
    const readme = createPublishedPackageReadme(manifest, sourceRef);

    expect(readme).toContain('# @flighthq/example');
    expect(readme).toContain('npm install @flighthq/example');
    expect(readme).toContain('@flighthq/example/contract');
    expect(readme).toContain(`https://github.com/flighthq/flight/tree/${sourceRef}/packages/example`);
    expect(readme).toContain(`https://github.com/flighthq/flight/blob/${sourceRef}/LICENSE.md`);
  });

  it('uses the root README for the aggregate SDK package', () => {
    const artifacts = getPublishedPackageArtifacts({
      packageDir: '/tmp/sdk',
      manifest: { ...manifest, name: '@flighthq/sdk', repository: { directory: 'packages/sdk' } },
      rootReadme: '# Flight\n',
      license: 'license text\n',
      sourceRef,
    });

    expect(artifacts.get('/tmp/sdk/README.md')).toBe('# Flight\n');
    expect(artifacts.get('/tmp/sdk/LICENSE.md')).toBe('license text\n');
  });

  it('restores an existing README and removes publish-only files after failure', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'flight-publish-artifacts-'));
    const readmePath = join(directory, 'README.md');
    const licensePath = join(directory, 'LICENSE.md');
    writeFileSync(readmePath, 'developer notes\n');

    try {
      await expect(
        withTemporaryPublishArtifacts(
          {
            packageDir: directory,
            manifest,
            rootReadme: '# Flight\n',
            license: 'license text\n',
            sourceRef,
          },
          async () => {
            expect(readFileSync(readmePath, 'utf8')).toContain('npm install @flighthq/example');
            expect(readFileSync(licensePath, 'utf8')).toBe('license text\n');
            throw new Error('publish failed');
          },
        ),
      ).rejects.toThrow('publish failed');

      expect(readFileSync(readmePath, 'utf8')).toBe('developer notes\n');
      expect(() => readFileSync(licensePath, 'utf8')).toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('places both conventional files in the npm tarball despite a restrictive files list', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'flight-pack-artifacts-'));
    writeFileSync(
      join(directory, 'package.json'),
      `${JSON.stringify({ ...manifest, files: ['index.js'], main: 'index.js' }, null, 2)}\n`,
    );
    writeFileSync(join(directory, 'index.js'), 'export {};\n');

    try {
      await withTemporaryPublishArtifacts(
        {
          packageDir: directory,
          manifest,
          rootReadme: '# Flight\n',
          license: 'license text\n',
          sourceRef,
        },
        async () => {
          const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
            cwd: directory,
            encoding: 'utf8',
          });
          const packed = JSON.parse(output) as Array<{ files: Array<{ path: string }> }>;
          expect(packed[0]?.files.map((file) => file.path).sort()).toEqual([
            'LICENSE.md',
            'README.md',
            'index.js',
            'package.json',
          ]);
        },
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
