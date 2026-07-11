import { applyConvolutionEffectToCanvas, defaultCanvasConvolutionEffectRunner } from './canvasConvolutionEffect';

describe('applyConvolutionEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyConvolutionEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasConvolutionEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasConvolutionEffectRunner).toBe('function');
  });
});
