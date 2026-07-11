import { applyInnerGlowEffectToGl, defaultGlInnerGlowEffectRunner } from './glInnerGlowEffect';

describe('applyInnerGlowEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyInnerGlowEffectToGl).toBe('function');
  });
});

describe('defaultGlInnerGlowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlInnerGlowEffectRunner).toBe('function');
  });
});
