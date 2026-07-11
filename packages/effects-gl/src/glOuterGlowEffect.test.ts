import { applyOuterGlowEffectToGl, defaultGlOuterGlowEffectRunner } from './glOuterGlowEffect';

describe('applyOuterGlowEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyOuterGlowEffectToGl).toBe('function');
  });
});

describe('defaultGlOuterGlowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlOuterGlowEffectRunner).toBe('function');
  });
});
