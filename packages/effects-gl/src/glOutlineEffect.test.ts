import { applyOutlineEffectToGl, glOutlineEffectRunner, registerGlOutlineEffect } from './glOutlineEffect.ts';

describe('applyOutlineEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyOutlineEffectToGl).toBe('function');
  });
});

describe('glOutlineEffectRunner', () => {
  it('is a function', () => {
    expect(typeof glOutlineEffectRunner).toBe('function');
  });
});

describe('registerGlOutlineEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlOutlineEffect).toBeTypeOf('function');
  });
});
