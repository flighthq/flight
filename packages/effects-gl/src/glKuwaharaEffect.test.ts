import { applyKuwaharaEffectToGl, defaultGlKuwaharaEffectRunner, registerGlKuwaharaEffect } from './glKuwaharaEffect';

describe('applyKuwaharaEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyKuwaharaEffectToGl).toBe('function');
  });
});

describe('defaultGlKuwaharaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlKuwaharaEffectRunner).toBe('function');
  });
});

describe('registerGlKuwaharaEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlKuwaharaEffect).toBeTypeOf('function');
  });
});
