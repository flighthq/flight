import {
  applyPosterizeEffectToGl,
  defaultGlPosterizeEffectRunner,
  registerGlPosterizeEffect,
} from './glPosterizeEffect';

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

describe('registerGlPosterizeEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlPosterizeEffect).toBeTypeOf('function');
  });
});
