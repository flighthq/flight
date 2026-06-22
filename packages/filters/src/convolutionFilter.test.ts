import { createConvolutionFilter } from './convolutionFilter';

describe('createConvolutionFilter', () => {
  it('sets type to convolution', () => {
    const f = createConvolutionFilter({ matrix: [1], matrixX: 1, matrixY: 1 });
    expect(f.kind).toBe('ConvolutionFilter');
  });

  it('spreads required fields', () => {
    const matrix = [0, 1, 0, 1, -4, 1, 0, 1, 0];
    const f = createConvolutionFilter({ matrix, matrixX: 3, matrixY: 3 });
    expect(f.matrixX).toBe(3);
    expect(f.matrixY).toBe(3);
  });
});
