import { applyFxaaEffectToGl, defaultGlFxaaEffectRunner, registerGlFxaaEffect } from './glFxaaEffect';

describe('applyFxaaEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyFxaaEffectToGl).toBe('function');
  });
});

describe('defaultGlFxaaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlFxaaEffectRunner).toBe('function');
  });
});

describe('registerGlFxaaEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlFxaaEffect).toBeTypeOf('function');
  });
});
