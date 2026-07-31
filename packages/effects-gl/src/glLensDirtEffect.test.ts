import { applyLensDirtEffectToGl, defaultGlLensDirtEffectRunner, registerGlLensDirtEffect } from './glLensDirtEffect';

describe('applyLensDirtEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyLensDirtEffectToGl).toBe('function');
  });
});

describe('defaultGlLensDirtEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlLensDirtEffectRunner).toBe('function');
  });
});

describe('registerGlLensDirtEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlLensDirtEffect).toBeTypeOf('function');
  });
});
