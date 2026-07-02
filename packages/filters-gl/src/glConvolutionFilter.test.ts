import { applyConvolutionFilterToGl, MAX_CONVOLUTION_FILTER_GL_KERNEL_SIZE } from './glConvolutionFilter';
import { makeFilterState, makeRenderTarget } from './glTestHelper';

describe('applyConvolutionFilterToGl', () => {
  it('applies a 3x3 identity kernel without throwing', () => {
    const { state } = makeFilterState();
    expect(() =>
      applyConvolutionFilterToGl(state, makeRenderTarget(), makeRenderTarget(), {
        matrix: [0, 0, 0, 0, 1, 0, 0, 0, 0],
        matrixX: 3,
        matrixY: 3,
      }),
    ).not.toThrow();
  });

  it('throws for a kernel larger than 7x7', () => {
    const { state } = makeFilterState();
    const matrix = new Array(64).fill(0);
    expect(() =>
      applyConvolutionFilterToGl(state, makeRenderTarget(), makeRenderTarget(), {
        matrix,
        matrixX: 8,
        matrixY: 8,
      }),
    ).toThrow();
  });

  it('throws for zero matrix dimensions', () => {
    const { state } = makeFilterState();
    expect(() =>
      applyConvolutionFilterToGl(state, makeRenderTarget(), makeRenderTarget(), {
        matrix: [],
        matrixX: 0,
        matrixY: 0,
      }),
    ).toThrow();
  });
});

describe('MAX_CONVOLUTION_FILTER_GL_KERNEL_SIZE', () => {
  it('is the 7x7 weight cap enforced by the shader uniform array', () => {
    expect(MAX_CONVOLUTION_FILTER_GL_KERNEL_SIZE).toBe(49);
  });
});
