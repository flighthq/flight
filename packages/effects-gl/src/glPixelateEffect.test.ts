import { applyPixelateEffectToGl, defaultGlPixelateEffectRunner } from './glPixelateEffect';

describe('applyPixelateEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyPixelateEffectToGl).toBe('function');
  });
});

describe('defaultGlPixelateEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlPixelateEffectRunner).toBe('function');
  });
});
