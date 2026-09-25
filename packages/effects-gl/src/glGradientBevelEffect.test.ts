import {
  applyGradientBevelEffectToGl,
  glGradientBevelEffectRunner,
  registerGlGradientBevelEffect,
} from './glGradientBevelEffect.ts';

describe('applyGradientBevelEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyGradientBevelEffectToGl).toBe('function');
  });
});

describe('glGradientBevelEffectRunner', () => {
  it('is a function', () => {
    expect(typeof glGradientBevelEffectRunner).toBe('function');
  });
});

describe('registerGlGradientBevelEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlGradientBevelEffect).toBeTypeOf('function');
  });
});
