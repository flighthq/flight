import { applySmaaEffectToGl, defaultGlSmaaEffectRunner, registerGlSmaaEffect } from './glSmaaEffect';

describe('applySmaaEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applySmaaEffectToGl).toBe('function');
  });
});

describe('defaultGlSmaaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlSmaaEffectRunner).toBe('function');
  });
});

describe('registerGlSmaaEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlSmaaEffect).toBeTypeOf('function');
  });
});
