import { describe, expect, test } from 'vitest';

import { createSizeDebugStub } from './size-debug-stub';

// The stub's whole job is a source transform, so it is assertable without building anything. It used
// to be checked only from `tools/size`, whose config exists to buy a node environment and a 300s
// timeout for real bundles — a five-minute lane gating a string rewrite.
describe('createSizeDebugStub', () => {
  test('replaces the authoring diagnostics call in release builds', () => {
    const plugin = createSizeDebugStub();
    const transform = plugin.transform as unknown as (code: string, id: string) => { code: string; map: null } | null;
    expect(transform('enableFlightDiagnostics(state);', 'render.canvas.ts')?.code).toBe('void (state);');
  });
});
