import { applyLensDistortionEffectToGl, defaultGlLensDistortionEffectRunner } from './glLensDistortionEffect';

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
