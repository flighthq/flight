import { applyHalftoneEffectToGl, glHalftoneEffectRunner, registerGlHalftoneEffect } from './glHalftoneEffect.ts';

describe('applyHalftoneEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyHalftoneEffectToGl).toBe('function');
  });
});

describe('glHalftoneEffectRunner', () => {
  it('is a function', () => {
    expect(typeof glHalftoneEffectRunner).toBe('function');
  });
});

describe('registerGlHalftoneEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlHalftoneEffect).toBeTypeOf('function');
  });
});
