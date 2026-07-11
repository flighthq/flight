import { applyDropShadowEffectToGl, defaultGlDropShadowEffectRunner } from './glDropShadowEffect';

describe('applyDropShadowEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyDropShadowEffectToGl).toBe('function');
  });
});

describe('defaultGlDropShadowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlDropShadowEffectRunner).toBe('function');
  });
});
