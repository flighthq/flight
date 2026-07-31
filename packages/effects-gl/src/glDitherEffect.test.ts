import { applyDitherEffectToGl, defaultGlDitherEffectRunner, registerGlDitherEffect } from './glDitherEffect';

describe('applyDitherEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyDitherEffectToGl).toBe('function');
  });
});

describe('defaultGlDitherEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlDitherEffectRunner).toBe('function');
  });
});

describe('registerGlDitherEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlDitherEffect).toBeTypeOf('function');
  });
});
