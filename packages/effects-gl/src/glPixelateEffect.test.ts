import { applyPixelateEffectToGl, defaultGlPixelateEffectRunner, registerGlPixelateEffect } from './glPixelateEffect';

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

describe('registerGlPixelateEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlPixelateEffect).toBeTypeOf('function');
  });
});
