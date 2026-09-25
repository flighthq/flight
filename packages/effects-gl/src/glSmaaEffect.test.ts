import { applySmaaEffectToGl, glSmaaEffectRunner, registerGlSmaaEffect } from './glSmaaEffect.ts';

describe('applySmaaEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applySmaaEffectToGl).toBe('function');
  });
});

describe('glSmaaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof glSmaaEffectRunner).toBe('function');
  });
});

describe('registerGlSmaaEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlSmaaEffect).toBeTypeOf('function');
  });
});
