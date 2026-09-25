import { applyKuwaharaEffectToGl, glKuwaharaEffectRunner, registerGlKuwaharaEffect } from './glKuwaharaEffect.ts';

describe('applyKuwaharaEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyKuwaharaEffectToGl).toBe('function');
  });
});

describe('glKuwaharaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof glKuwaharaEffectRunner).toBe('function');
  });
});

describe('registerGlKuwaharaEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlKuwaharaEffect).toBeTypeOf('function');
  });
});
