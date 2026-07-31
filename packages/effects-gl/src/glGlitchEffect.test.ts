import { applyGlitchEffectToGl, defaultGlGlitchEffectRunner, registerGlGlitchEffect } from './glGlitchEffect';

describe('applyGlitchEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyGlitchEffectToGl).toBe('function');
  });
});

describe('defaultGlGlitchEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlGlitchEffectRunner).toBe('function');
  });
});

describe('registerGlGlitchEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlGlitchEffect).toBeTypeOf('function');
  });
});
