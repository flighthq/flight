import { applyVignetteEffectToGl, defaultGlVignetteEffectRunner, registerGlVignetteEffect } from './glVignetteEffect';

describe('applyVignetteEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyVignetteEffectToGl).toBe('function');
  });
});

describe('defaultGlVignetteEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlVignetteEffectRunner).toBe('function');
  });
});

describe('registerGlVignetteEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlVignetteEffect).toBeTypeOf('function');
  });
});
