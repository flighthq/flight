import { describe, expect, it } from 'vitest';

import { makeFilterState as makeWebGLState, makeRenderTarget } from './filterTestHelper';
import { applyWebGLConvolutionFilter } from './webglConvolutionFilter';

describe('applyWebGLConvolutionFilter', () => {
  it('calls drawElements for a valid 3×3 kernel', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLConvolutionFilter(state, makeRenderTarget(), makeRenderTarget(), {
      matrix: [0, 0, 0, 0, 1, 0, 0, 0, 0],
      matrixX: 3,
      matrixY: 3,
    });
    expect(gl.drawElements).toHaveBeenCalledTimes(1);
  });

  it('accepts the maximum 7×7 kernel', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLConvolutionFilter(state, makeRenderTarget(), makeRenderTarget(), {
      matrix: new Array(49).fill(1),
      matrixX: 7,
      matrixY: 7,
    });
    expect(gl.drawElements).toHaveBeenCalledTimes(1);
  });

  it('throws for non-positive matrix dimensions', () => {
    const { state } = makeWebGLState();
    expect(() =>
      applyWebGLConvolutionFilter(state, makeRenderTarget(), makeRenderTarget(), {
        matrix: [1],
        matrixX: 0,
        matrixY: 1,
      }),
    ).toThrow('positive');
  });

  it('throws for kernels exceeding the 7×7 limit', () => {
    const { state } = makeWebGLState();
    expect(() =>
      applyWebGLConvolutionFilter(state, makeRenderTarget(), makeRenderTarget(), {
        matrix: new Array(64).fill(1),
        matrixX: 8,
        matrixY: 8,
      }),
    ).toThrow('7×7');
  });

  it('throws when the matrix array is smaller than matrixX × matrixY', () => {
    const { state } = makeWebGLState();
    expect(() =>
      applyWebGLConvolutionFilter(state, makeRenderTarget(), makeRenderTarget(), {
        matrix: [1, 0, 0],
        matrixX: 3,
        matrixY: 3,
      }),
    ).toThrow('dimensions');
  });

  it('uploads the padded kernel as a float array uniform', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLConvolutionFilter(state, makeRenderTarget(), makeRenderTarget(), {
      matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      matrixX: 3,
      matrixY: 3,
    });
    expect(gl.uniform1fv).toHaveBeenCalledTimes(1);
    const [, data] = (gl.uniform1fv as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((data as Float32Array).length).toBe(49);
  });
});
