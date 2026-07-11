import { applyGradientGlowEffectToGl, defaultGlGradientGlowEffectRunner } from './glGradientGlowEffect';

describe('applyGradientGlowEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyGradientGlowEffectToGl).toBe('function');
  });
});

describe('defaultGlGradientGlowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlGradientGlowEffectRunner).toBe('function');
  });
});
