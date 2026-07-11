import { applyGradientBevelEffectToGl, defaultGlGradientBevelEffectRunner } from './glGradientBevelEffect';

describe('applyGradientBevelEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyGradientBevelEffectToGl).toBe('function');
  });
});

describe('defaultGlGradientBevelEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlGradientBevelEffectRunner).toBe('function');
  });
});
