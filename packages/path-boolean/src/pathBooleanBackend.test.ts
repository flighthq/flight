import { describe, expect, it } from 'vitest';

import { createDefaultPathBooleanBackend } from './pathBooleanBackend';

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
