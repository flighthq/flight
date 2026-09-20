import { applySharpenEffectToGl, glSharpenEffectRunner, registerGlSharpenEffect } from './glSharpenEffect';

describe('applySharpenEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applySharpenEffectToGl).toBe('function');
  });
});

describe('glSharpenEffectRunner', () => {
  it('is a function', () => {
    expect(typeof glSharpenEffectRunner).toBe('function');
  });
});

describe('registerGlSharpenEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlSharpenEffect).toBeTypeOf('function');
  });
});
