import { describe, expect, it } from 'vitest';

import { runCaptureSuite } from './captureSuite';

describe('runCaptureSuite', () => {
  // Browser-backed execution is covered by the repository capture commands; the public orchestrator
  // remains directly importable for packages that supply their own entries and server.
  it('is a callable capture-suite orchestrator', () => {
    expect(typeof runCaptureSuite).toBe('function');
  });
});
