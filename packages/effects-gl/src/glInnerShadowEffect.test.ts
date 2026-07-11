import { applyInnerShadowEffectToGl, defaultGlInnerShadowEffectRunner } from './glInnerShadowEffect';

describe('applyInnerShadowEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyInnerShadowEffectToGl).toBe('function');
  });
});

describe('defaultGlInnerShadowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlInnerShadowEffectRunner).toBe('function');
  });
});
