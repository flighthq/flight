import { createConvolutionEffect } from './convolutionEffect';

describe('createConvolutionEffect', () => {
  it('tags the intent type', () => {
    expect(createConvolutionEffect({ matrix: [1], matrixX: 1, matrixY: 1 }).kind).toBe('ConvolutionEffect');
  });

  it('carries required fields', () => {
    const matrix = [0, 1, 0, 1, -4, 1, 0, 1, 0];
    const effect = createConvolutionEffect({ matrix, matrixX: 3, matrixY: 3 });
    expect(effect.matrixX).toBe(3);
    expect(effect.matrixY).toBe(3);
    expect(effect.matrix).toBe(matrix);
  });

  it('carries optional fields', () => {
    const effect = createConvolutionEffect({ matrix: [1], matrixX: 1, matrixY: 1, bias: 8, preserveAlpha: false });
    expect(effect).toMatchObject({ bias: 8, preserveAlpha: false });
  });
});
