import { applyVignetteEffectToGl, glVignetteEffectRunner, registerGlVignetteEffect } from './glVignetteEffect';

describe('applyVignetteEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyVignetteEffectToGl).toBe('function');
  });
});

describe('glVignetteEffectRunner', () => {
  it('is a function', () => {
    expect(typeof glVignetteEffectRunner).toBe('function');
  });
});

describe('registerGlVignetteEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlVignetteEffect).toBeTypeOf('function');
  });
});
