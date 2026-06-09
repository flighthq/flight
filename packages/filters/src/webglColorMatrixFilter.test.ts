import { describe, expect, it } from 'vitest';

import { makeFilterState as makeWebGLState, makeRenderTarget } from './filterTestHelper';
import { applyWebGLColorMatrixFilter } from './webglColorMatrixFilter';

const IDENTITY_MATRIX = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

describe('applyWebGLColorMatrixFilter', () => {
  it('calls drawElements for a valid 20-element matrix', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLColorMatrixFilter(state, makeRenderTarget(), makeRenderTarget(), { matrix: IDENTITY_MATRIX });
    expect(gl.drawElements).toHaveBeenCalledTimes(1);
  });

  it('throws for a matrix shorter than 20 elements', () => {
    const { state } = makeWebGLState();
    expect(() =>
      applyWebGLColorMatrixFilter(state, makeRenderTarget(), makeRenderTarget(), {
        matrix: [1, 0, 0, 0, 0],
      }),
    ).toThrow('20 values');
  });

  it('uploads each matrix row as a uniform4f', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLColorMatrixFilter(state, makeRenderTarget(), makeRenderTarget(), { matrix: IDENTITY_MATRIX });
    // 4 rows + 1 offsets row = 5 uniform4f calls
    expect(gl.uniform4f).toHaveBeenCalledTimes(5);
  });

  it('divides the offset column by 255 before upload', () => {
    const { state, gl } = makeWebGLState();
    const matrix = [...IDENTITY_MATRIX];
    matrix[4] = 255; // red offset = 255
    applyWebGLColorMatrixFilter(state, makeRenderTarget(), makeRenderTarget(), { matrix });
    // offsets are the last uniform4f call; red should be 255/255=1
    const offsets = (gl.uniform4f as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    expect(offsets?.[1]).toBeCloseTo(1);
  });
});
