import { applyBevelEffectToGl, defaultGlBevelEffectRunner, registerGlBevelEffect } from './glBevelEffect';

describe('applyBevelEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyBevelEffectToGl).toBe('function');
  });
});

describe('defaultGlBevelEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlBevelEffectRunner).toBe('function');
  });
});

describe('registerGlBevelEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlBevelEffect).toBeTypeOf('function');
  });
});
