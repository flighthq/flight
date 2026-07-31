import { applyToneMapEffectToGl, defaultGlToneMapEffectRunner, registerGlToneMapEffect } from './glToneMapEffect';

describe('applyToneMapEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyToneMapEffectToGl).toBe('function');
  });
});

describe('defaultGlToneMapEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlToneMapEffectRunner).toBe('function');
  });
});

describe('registerGlToneMapEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlToneMapEffect).toBeTypeOf('function');
  });
});
