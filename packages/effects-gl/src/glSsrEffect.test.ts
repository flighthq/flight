import { applySsrEffectToGl, defaultGlSsrEffectRunner, registerGlSsrEffect } from './glSsrEffect';

describe('applySsrEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applySsrEffectToGl).toBe('function');
  });
});

describe('defaultGlSsrEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlSsrEffectRunner).toBe('function');
  });
});

describe('registerGlSsrEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlSsrEffect).toBeTypeOf('function');
  });
});
