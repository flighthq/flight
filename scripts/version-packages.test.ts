import { describe, expect, it } from 'vitest';

import { getWorkspaceLockVersionMismatches, hasOnlyWorkspaceVersionChanges } from './version-packages';

describe('getWorkspaceLockVersionMismatches', () => {
  it('accepts a complete lockfile bump', () => {
    expect(
      getWorkspaceLockVersionMismatches(
        ['packages/example', 'packages/types'],
        {
          packages: {
            'packages/example': { version: '0.3.1' },
            'packages/types': { version: '0.3.1' },
          },
        },
        '0.3.1',
      ),
    ).toEqual([]);
  });

  it('reports missing, mismatched, and stale workspace entries', () => {
    expect(
      getWorkspaceLockVersionMismatches(
        ['packages/example', 'packages/types'],
        {
          packages: {
            'packages/example': { version: '0.3.0' },
            'packages/stale': { version: '0.2.0' },
          },
        },
        '0.3.1',
      ),
    ).toEqual([
      'packages/example: expected "0.3.1", got "0.3.0"',
      'packages/stale: expected "0.3.1", got "0.2.0"',
      'packages/types: expected "0.3.1", got missing entry',
    ]);
  });
});

describe('hasOnlyWorkspaceVersionChanges', () => {
  it('accepts changes to packages/* version fields', () => {
    const before = lockText('0.3.0', '@flighthq/example');
    const after = lockText('0.3.1', '@flighthq/example');

    expect(hasOnlyWorkspaceVersionChanges(before, after)).toBe(true);
  });

  it('reports changes beyond packages/* version fields', () => {
    const before = lockText('0.3.0', '@flighthq/example');
    const after = lockText('0.3.1', '@flighthq/renamed');

    expect(hasOnlyWorkspaceVersionChanges(before, after)).toBe(false);
  });
});

function lockText(version: string, name: string): string {
  return `{
  "packages": {
    "": {
      "name": "flight"
    },
    "packages/example": {
      "name": "${name}",
      "version": "${version}"
    }
  }
}
`;
}
