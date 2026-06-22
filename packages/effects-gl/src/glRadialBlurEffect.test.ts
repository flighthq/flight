import { applyRadialBlurEffectToGl, defaultGlRadialBlurEffectRunner } from './glRadialBlurEffect';

describe('applyRadialBlurEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyRadialBlurEffectToGl).toBe('function');
  });
});

describe('defaultGlRadialBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlRadialBlurEffectRunner).toBe('function');
  });
});
