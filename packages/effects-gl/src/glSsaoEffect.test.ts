import { applySsaoEffectToGl, glSsaoEffectRunner, registerGlSsaoEffect } from './glSsaoEffect.ts';

describe('applySsaoEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applySsaoEffectToGl).toBe('function');
  });
});

describe('glSsaoEffectRunner', () => {
  it('is a function', () => {
    expect(typeof glSsaoEffectRunner).toBe('function');
  });
});

describe('registerGlSsaoEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlSsaoEffect).toBeTypeOf('function');
  });
});
