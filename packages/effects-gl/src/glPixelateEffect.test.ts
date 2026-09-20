import { applyPixelateEffectToGl, glPixelateEffectRunner, registerGlPixelateEffect } from './glPixelateEffect';

describe('applyPixelateEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyPixelateEffectToGl).toBe('function');
  });
});

describe('glPixelateEffectRunner', () => {
  it('is a function', () => {
    expect(typeof glPixelateEffectRunner).toBe('function');
  });
});

describe('registerGlPixelateEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlPixelateEffect).toBeTypeOf('function');
  });
});
