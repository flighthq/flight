import { applyMedianEffectToGl, glMedianEffectRunner, registerGlMedianEffect } from './glMedianEffect';

describe('applyMedianEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyMedianEffectToGl).toBe('function');
  });
});

describe('glMedianEffectRunner', () => {
  it('is a function', () => {
    expect(typeof glMedianEffectRunner).toBe('function');
  });
});

describe('registerGlMedianEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlMedianEffect).toBeTypeOf('function');
  });
});
