import { applyKuwaharaEffectToGl, defaultGlKuwaharaEffectRunner } from './glKuwaharaEffect';

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
