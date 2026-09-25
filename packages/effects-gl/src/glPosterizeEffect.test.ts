import { applyPosterizeEffectToGl, glPosterizeEffectRunner, registerGlPosterizeEffect } from './glPosterizeEffect.ts';

describe('applyPosterizeEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyPosterizeEffectToGl).toBe('function');
  });
});

describe('glPosterizeEffectRunner', () => {
  it('is a function', () => {
    expect(typeof glPosterizeEffectRunner).toBe('function');
  });
});

describe('registerGlPosterizeEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlPosterizeEffect).toBeTypeOf('function');
  });
});
