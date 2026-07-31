import {
  applyGradientBevelEffectToGl,
  defaultGlGradientBevelEffectRunner,
  registerGlGradientBevelEffect,
} from './glGradientBevelEffect';

describe('applyGradientBevelEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyGradientBevelEffectToGl).toBe('function');
  });
});

describe('defaultGlGradientBevelEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlGradientBevelEffectRunner).toBe('function');
  });
});

describe('registerGlGradientBevelEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlGradientBevelEffect).toBeTypeOf('function');
  });
});
