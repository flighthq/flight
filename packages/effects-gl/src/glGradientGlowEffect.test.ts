import {
  applyGradientGlowEffectToGl,
  defaultGlGradientGlowEffectRunner,
  registerGlGradientGlowEffect,
} from './glGradientGlowEffect';

describe('applyGradientGlowEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyGradientGlowEffectToGl).toBe('function');
  });
});

describe('defaultGlGradientGlowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlGradientGlowEffectRunner).toBe('function');
  });
});

describe('registerGlGradientGlowEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlGradientGlowEffect).toBeTypeOf('function');
  });
});
