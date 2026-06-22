import { applyVignetteEffectToGl, defaultGlVignetteEffectRunner } from './glVignetteEffect';

describe('applyVignetteEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyVignetteEffectToGl).toBe('function');
  });
});

describe('defaultGlVignetteEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlVignetteEffectRunner).toBe('function');
  });
});
