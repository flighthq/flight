import { applySsaoEffectToGl, defaultGlSsaoEffectRunner, registerGlSsaoEffect } from './glSsaoEffect';

describe('applySsaoEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applySsaoEffectToGl).toBe('function');
  });
});

describe('defaultGlSsaoEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlSsaoEffectRunner).toBe('function');
  });
});

describe('registerGlSsaoEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlSsaoEffect).toBeTypeOf('function');
  });
});
