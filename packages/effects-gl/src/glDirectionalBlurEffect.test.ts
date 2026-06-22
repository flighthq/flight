import { applyDirectionalBlurEffectToGl, defaultGlDirectionalBlurEffectRunner } from './glDirectionalBlurEffect';

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
