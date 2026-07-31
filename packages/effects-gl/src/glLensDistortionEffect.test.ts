import {
  applyLensDistortionEffectToGl,
  defaultGlLensDistortionEffectRunner,
  registerGlLensDistortionEffect,
} from './glLensDistortionEffect';

describe('applyLensDistortionEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyLensDistortionEffectToGl).toBe('function');
  });
});

describe('defaultGlLensDistortionEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlLensDistortionEffectRunner).toBe('function');
  });
});

describe('registerGlLensDistortionEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlLensDistortionEffect).toBeTypeOf('function');
  });
});
