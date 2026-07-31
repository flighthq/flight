import {
  applyRadialBlurEffectToGl,
  defaultGlRadialBlurEffectRunner,
  registerGlRadialBlurEffect,
} from './glRadialBlurEffect';

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

describe('registerGlRadialBlurEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlRadialBlurEffect).toBeTypeOf('function');
  });
});
