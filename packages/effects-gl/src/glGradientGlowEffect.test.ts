import {
  applyGradientGlowEffectToGl,
  glGradientGlowEffectRunner,
  registerGlGradientGlowEffect,
} from './glGradientGlowEffect';

describe('applyGradientGlowEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyGradientGlowEffectToGl).toBe('function');
  });
});

describe('glGradientGlowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof glGradientGlowEffectRunner).toBe('function');
  });
});

describe('registerGlGradientGlowEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlGradientGlowEffect).toBeTypeOf('function');
  });
});
