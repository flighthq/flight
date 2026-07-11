import { applyGlEffectInvertTintPass, applyGlEffectTintPass } from './glEffectTintShader';

describe('applyGlEffectInvertTintPass', () => {
  it('is a function', () => {
    expect(typeof applyGlEffectInvertTintPass).toBe('function');
  });
});

describe('applyGlEffectTintPass', () => {
  it('is a function', () => {
    expect(typeof applyGlEffectTintPass).toBe('function');
  });
});
