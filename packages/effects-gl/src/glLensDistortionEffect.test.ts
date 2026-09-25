import {
  applyLensDistortionEffectToGl,
  glLensDistortionEffectRunner,
  registerGlLensDistortionEffect,
} from './glLensDistortionEffect.ts';

describe('applyLensDistortionEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyLensDistortionEffectToGl).toBe('function');
  });
});

describe('glLensDistortionEffectRunner', () => {
  it('is a function', () => {
    expect(typeof glLensDistortionEffectRunner).toBe('function');
  });
});

describe('registerGlLensDistortionEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlLensDistortionEffect).toBeTypeOf('function');
  });
});
