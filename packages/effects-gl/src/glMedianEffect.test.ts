import { applyMedianEffectToGl, defaultGlMedianEffectRunner, registerGlMedianEffect } from './glMedianEffect';

describe('applyMedianEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyMedianEffectToGl).toBe('function');
  });
});

describe('defaultGlMedianEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlMedianEffectRunner).toBe('function');
  });
});

describe('registerGlMedianEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlMedianEffect).toBeTypeOf('function');
  });
});
