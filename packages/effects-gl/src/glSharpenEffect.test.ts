import { applySharpenEffectToGl, defaultGlSharpenEffectRunner, registerGlSharpenEffect } from './glSharpenEffect';

describe('applySharpenEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applySharpenEffectToGl).toBe('function');
  });
});

describe('defaultGlSharpenEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlSharpenEffectRunner).toBe('function');
  });
});

describe('registerGlSharpenEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlSharpenEffect).toBeTypeOf('function');
  });
});
