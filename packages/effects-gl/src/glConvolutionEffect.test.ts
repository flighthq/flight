import {
  applyConvolutionEffectToGl,
  defaultGlConvolutionEffectRunner,
  registerGlConvolutionEffect,
} from './glConvolutionEffect';

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

describe('registerGlConvolutionEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlConvolutionEffect).toBeTypeOf('function');
  });
});
