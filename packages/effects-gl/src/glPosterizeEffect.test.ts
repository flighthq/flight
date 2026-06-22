import { applyPosterizeEffectToGl, defaultGlPosterizeEffectRunner } from './glPosterizeEffect';

describe('applyPosterizeEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyPosterizeEffectToGl).toBe('function');
  });
});

describe('defaultGlPosterizeEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlPosterizeEffectRunner).toBe('function');
  });
});
