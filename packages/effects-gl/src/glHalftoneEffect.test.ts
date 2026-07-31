import { applyHalftoneEffectToGl, defaultGlHalftoneEffectRunner, registerGlHalftoneEffect } from './glHalftoneEffect';

describe('applyHalftoneEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyHalftoneEffectToGl).toBe('function');
  });
});

describe('defaultGlHalftoneEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlHalftoneEffectRunner).toBe('function');
  });
});

describe('registerGlHalftoneEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlHalftoneEffect).toBeTypeOf('function');
  });
});
