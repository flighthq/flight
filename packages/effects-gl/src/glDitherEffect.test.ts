import { applyDitherEffectToGl, glDitherEffectRunner, registerGlDitherEffect } from './glDitherEffect.ts';

describe('applyDitherEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyDitherEffectToGl).toBe('function');
  });
});

describe('glDitherEffectRunner', () => {
  it('is a function', () => {
    expect(typeof glDitherEffectRunner).toBe('function');
  });
});

describe('registerGlDitherEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlDitherEffect).toBeTypeOf('function');
  });
});
