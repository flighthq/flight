import { describe, expect, test } from 'vitest';

import { createSizeDebugStub } from './size-debug-stub';

// The stub's whole job is a source transform, so it is assertable without building anything. It used
// to be checked only from `tools/size`, whose config exists to buy a node environment and a 300s
// timeout for real bundles — a five-minute lane gating a string rewrite.
describe('createSizeDebugStub', () => {
  test('replaces the authoring diagnostics call in release builds', () => {
    const plugin = createSizeDebugStub();
    const transform = plugin.transform as unknown as (code: string, id: string) => { code: string; map: null } | null;
    expect(
      transform('enableFlightDiagnostics(state);', '/repo/examples/packages/example/src/render.canvas.ts')?.code,
    ).toBe('void (state);');
  });

  test('replaces a multiline diagnostics call while preserving render-state construction', () => {
    const plugin = createSizeDebugStub();
    const transform = plugin.transform as unknown as (code: string, id: string) => { code: string; map: null } | null;
    const source = [
      'enableFlightDiagnostics(',
      '  createCanvasRenderState(',
      '    createCanvasRenderSurface(canvas),',
      '    scene2dCanvasPipeline,',
      '  ),',
      ');',
    ].join('\n');

    expect(transform(source, '/repo/tools/size/fixtures/flight-diagnostics/src/render.canvas.ts')?.code).toBe(
      [
        'void (',
        '  createCanvasRenderState(',
        '    createCanvasRenderSurface(canvas),',
        '    scene2dCanvasPipeline,',
        '  ));',
      ].join('\n'),
    );
  });

  test('does not rewrite the diagnostics implementation itself', () => {
    const plugin = createSizeDebugStub();
    const transform = plugin.transform as unknown as (code: string, id: string) => { code: string; map: null } | null;
    const source = 'export function enableFlightDiagnostics(state: RenderState): void { register(state); }';

    expect(transform(source, '/repo/packages/debug/src/debug.ts')).toBeNull();
  });
});
