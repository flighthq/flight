import { applyBlurEffectToGl, applyGaussianBlurToGl, defaultGlBlurEffectRunner } from './glBlurEffect';

describe('applyBlurEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyBlurEffectToGl).toBe('function');
  });
});

describe('applyGaussianBlurToGl', () => {
  it('is a function', () => {
    expect(typeof applyGaussianBlurToGl).toBe('function');
  });
});

describe('defaultGlBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlBlurEffectRunner).toBe('function');
  });
});
