import { applyConvolutionEffectToGl, defaultGlConvolutionEffectRunner } from './glConvolutionEffect';

describe('applyConvolutionEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyConvolutionEffectToGl).toBe('function');
  });
});

describe('defaultGlConvolutionEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlConvolutionEffectRunner).toBe('function');
  });
});
