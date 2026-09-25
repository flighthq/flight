import { applyFxaaEffectToGl, glFxaaEffectRunner, registerGlFxaaEffect } from './glFxaaEffect.ts';

describe('applyFxaaEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyFxaaEffectToGl).toBe('function');
  });
});

describe('glFxaaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof glFxaaEffectRunner).toBe('function');
  });
});

describe('registerGlFxaaEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlFxaaEffect).toBeTypeOf('function');
  });
});
