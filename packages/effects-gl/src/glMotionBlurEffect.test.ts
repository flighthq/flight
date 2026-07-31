import {
  applyMotionBlurEffectToGl,
  defaultGlMotionBlurEffectRunner,
  registerGlMotionBlurEffect,
} from './glMotionBlurEffect';

describe('applyMotionBlurEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyMotionBlurEffectToGl).toBe('function');
  });
});

describe('defaultGlMotionBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlMotionBlurEffectRunner).toBe('function');
  });
});

describe('registerGlMotionBlurEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlMotionBlurEffect).toBeTypeOf('function');
  });
});
