import { applyToneMapEffectToGl, glToneMapEffectRunner, registerGlToneMapEffect } from './glToneMapEffect.ts';

describe('applyToneMapEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyToneMapEffectToGl).toBe('function');
  });
});

describe('glToneMapEffectRunner', () => {
  it('is a function', () => {
    expect(typeof glToneMapEffectRunner).toBe('function');
  });
});

describe('registerGlToneMapEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlToneMapEffect).toBeTypeOf('function');
  });
});
