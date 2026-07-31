import { applyOutlineEffectToGl, defaultGlOutlineEffectRunner, registerGlOutlineEffect } from './glOutlineEffect';

describe('applyOutlineEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyOutlineEffectToGl).toBe('function');
  });
});

describe('defaultGlOutlineEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlOutlineEffectRunner).toBe('function');
  });
});

describe('registerGlOutlineEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlOutlineEffect).toBeTypeOf('function');
  });
});
