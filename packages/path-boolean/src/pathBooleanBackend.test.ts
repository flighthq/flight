import type { PathBooleanBackend } from '@flighthq/types';
import { afterEach, describe, expect, it } from 'vitest';

import { createDefaultPathBooleanBackend, getPathBooleanBackend, setPathBooleanBackend } from './pathBooleanBackend';

// The backend is module-level state; reset to the lazy default after each test so cases stay isolated.
afterEach(() => setPathBooleanBackend(null));

describe('createDefaultPathBooleanBackend', () => {
  it('builds a working kernel that computes a boolean', () => {
    const backend = createDefaultPathBooleanBackend();
    const result = backend.computePathBoolean(
      [[0, 0, 10, 0, 10, 10, 0, 10]],
      [[20, 20, 30, 20, 30, 30, 20, 30]],
      'union',
      'nonZero',
    );
    expect(result.length).toBe(2);
  });

  it('builds an independent instance each call', () => {
    expect(createDefaultPathBooleanBackend()).not.toBe(createDefaultPathBooleanBackend());
  });
});

describe('getPathBooleanBackend', () => {
  it('lazily installs and returns the default kernel', () => {
    const backend = getPathBooleanBackend();
    expect(typeof backend.computePathBoolean).toBe('function');
  });

  it('returns the same installed backend on repeat calls', () => {
    expect(getPathBooleanBackend()).toBe(getPathBooleanBackend());
  });
});

describe('setPathBooleanBackend', () => {
  it('installs a custom backend that getPathBooleanBackend then returns', () => {
    const custom: PathBooleanBackend = { computePathBoolean: () => [] };
    setPathBooleanBackend(custom);
    expect(getPathBooleanBackend()).toBe(custom);
  });

  it('clears back to a lazily-created default when passed null', () => {
    const custom: PathBooleanBackend = { computePathBoolean: () => [] };
    setPathBooleanBackend(custom);
    setPathBooleanBackend(null);
    expect(getPathBooleanBackend()).not.toBe(custom);
  });
});
