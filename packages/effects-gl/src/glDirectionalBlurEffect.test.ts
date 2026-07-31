import {
  applyDirectionalBlurEffectToGl,
  defaultGlDirectionalBlurEffectRunner,
  registerGlDirectionalBlurEffect,
} from './glDirectionalBlurEffect';

describe('applyDirectionalBlurEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyDirectionalBlurEffectToGl).toBe('function');
  });
});

describe('defaultGlDirectionalBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlDirectionalBlurEffectRunner).toBe('function');
  });
});

describe('registerGlDirectionalBlurEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlDirectionalBlurEffect).toBeTypeOf('function');
  });
});
