import { describe, expect, it } from 'vitest';

import { getPackageLockWorkspaceViolations, type PackageLockJson, type WorkspaceManifest } from './package-lock-policy';

const manifest: WorkspaceManifest = {
  path: 'packages/example',
  name: '@flighthq/example',
  version: '0.2.0',
  dependencies: {
    '@flighthq/types': '*',
  },
};

const validLock: PackageLockJson = {
  packages: {
    'packages/example': {
      name: '@flighthq/example',
      version: '0.2.0',
      dependencies: {
        '@flighthq/types': '*',
      },
    },
    'node_modules/@flighthq/example': {
      resolved: 'packages/example',
      link: true,
    },
    'node_modules/@flighthq/types': {
      resolved: 'packages/types',
      link: true,
    },
  },
};

function check(
  manifests: readonly WorkspaceManifest[],
  lock: PackageLockJson,
  directories: readonly string[] = manifests.map(({ path }) => path),
) {
  const existingDirectories = new Set(directories);
  return getPackageLockWorkspaceViolations(manifests, lock, (path) => existingDirectories.has(path));
}

describe('package-lock workspace policy', () => {
  it('accepts manifest entries and workspace links that match the real layout', () => {
    expect(check([manifest], validLock)).toEqual([]);
  });

  it('reports the exact entry for a package added without updating the lock', () => {
    const lock: PackageLockJson = {
      packages: {
        ...validLock.packages,
        'node_modules/@flighthq/new-package': {
          resolved: 'packages/new-package',
          link: true,
        },
      },
    };
    const newManifest: WorkspaceManifest = {
      path: 'packages/new-package',
      name: '@flighthq/new-package',
      version: '0.2.0',
    };

    expect(check([manifest, newManifest], lock)).toContainEqual({
      label: 'package-lock.json has workspace entry packages/new-package',
      detail:
        'add exactly packages["packages/new-package"] for @flighthq/new-package@0.2.0; preserve unrelated lock data',
    });
  });

  it('reports a stale lock entry after a workspace directory is renamed or deleted', () => {
    const lock: PackageLockJson = {
      packages: {
        ...validLock.packages,
        'packages/old-name': {
          name: '@flighthq/old-name',
          version: '0.2.0',
        },
      },
    };

    expect(check([manifest], lock)).toContainEqual({
      label: 'package-lock.json workspace entry packages/old-name maps to an existing directory',
      detail: 'remove exactly packages["packages/old-name"]; packages/old-name does not exist',
    });
  });

  it('reports manifest name and version drift at an unchanged path', () => {
    const lock: PackageLockJson = {
      packages: {
        ...validLock.packages,
        'packages/example': {
          name: '@flighthq/old-name',
          version: '0.1.0',
        },
      },
    };

    expect(check([manifest], lock)).toEqual(
      expect.arrayContaining([
        {
          label: 'packages/example package-lock name matches manifest',
          detail: 'set packages["packages/example"].name to "@flighthq/example"; got "@flighthq/old-name"',
        },
        {
          label: 'packages/example package-lock version matches manifest',
          detail: 'set packages["packages/example"].version to "0.2.0"; got "0.1.0"',
        },
      ]),
    );
  });

  it('reports the exact replacement for a broken workspace link', () => {
    const lock: PackageLockJson = {
      packages: {
        ...validLock.packages,
        'node_modules/@flighthq/example': {
          resolved: 'packages/old-name',
          link: false,
        },
      },
    };

    expect(check([manifest], lock)).toContainEqual({
      label: 'package-lock.json has workspace link node_modules/@flighthq/example',
      detail:
        'set exactly packages["node_modules/@flighthq/example"] to {"resolved":"packages/example","link":true}; got {"resolved":"packages/old-name","link":false}',
    });
  });

  it('reports a declared Flight dependency whose workspace link is missing', () => {
    const lock: PackageLockJson = {
      packages: {
        'packages/example': validLock.packages!['packages/example'],
        'node_modules/@flighthq/example': validLock.packages!['node_modules/@flighthq/example'],
      },
    };

    expect(check([manifest], lock)).toContainEqual({
      label: 'packages/example dependency @flighthq/types has a workspace link',
      detail:
        'add exactly packages["node_modules/@flighthq/types"] with link true; declared by packages/example/package.json',
    });
  });

  it('reports a newly declared sibling dependency even when its global link already exists', () => {
    const lock: PackageLockJson = {
      packages: {
        ...validLock.packages,
        'packages/example': {
          name: '@flighthq/example',
          version: '0.2.0',
        },
      },
    };

    expect(check([manifest], lock)).toContainEqual({
      label: 'packages/example dependencies entry for @flighthq/types matches manifest',
      detail: 'set exactly packages["packages/example"].dependencies["@flighthq/types"] to "*"; got undefined',
    });
  });
});
