import {
  createBokehDepthOfFieldEffect,
  createChromaticAberrationEffect,
  createLensDistortionEffect,
  createLensFlareEffect,
  createTiltShiftEffect,
  createVignetteEffect,
} from './lensEffects';

describe('createBokehDepthOfFieldEffect', () => {
  it('tags the intent type', () => {
    expect(createBokehDepthOfFieldEffect().type).toBe('bokehDoF');
  });

  it('carries options', () => {
    expect(createBokehDepthOfFieldEffect({ focusDistance: 0.5, focusRange: 0.2, maxBlur: 4 })).toMatchObject({
      focusDistance: 0.5,
      focusRange: 0.2,
      maxBlur: 4,
    });
  });
});

describe('createChromaticAberrationEffect', () => {
  it('tags the intent type', () => {
    expect(createChromaticAberrationEffect().type).toBe('chromaticAberration');
  });

  it('carries options', () => {
    expect(createChromaticAberrationEffect({ intensity: 0.01, radial: false })).toMatchObject({
      intensity: 0.01,
      radial: false,
    });
  });
});

describe('createLensDistortionEffect', () => {
  it('tags the intent type', () => {
    expect(createLensDistortionEffect().type).toBe('lensDistortion');
  });

  it('carries options', () => {
    expect(createLensDistortionEffect({ amount: 0.3, scale: 0.9 })).toMatchObject({ amount: 0.3, scale: 0.9 });
  });
});

describe('createLensFlareEffect', () => {
  it('tags the intent type', () => {
    expect(createLensFlareEffect().type).toBe('lensFlare');
  });

  it('carries options', () => {
    expect(createLensFlareEffect({ threshold: 0.8, intensity: 2, ghosts: 4, halo: 0.5 })).toMatchObject({
      threshold: 0.8,
      intensity: 2,
      ghosts: 4,
      halo: 0.5,
    });
  });
});

describe('createTiltShiftEffect', () => {
  it('tags the intent type', () => {
    expect(createTiltShiftEffect().type).toBe('tiltShift');
  });

  it('carries options', () => {
    expect(createTiltShiftEffect({ center: 0.5, width: 0.2, blur: 4 })).toMatchObject({
      center: 0.5,
      width: 0.2,
      blur: 4,
    });
  });
});

describe('createVignetteEffect', () => {
  it('tags the intent type', () => {
    expect(createVignetteEffect().type).toBe('vignette');
  });

  it('carries options', () => {
    expect(createVignetteEffect({ intensity: 1, radius: 0.7, softness: 0.4, color: 0x000000ff })).toMatchObject({
      intensity: 1,
      radius: 0.7,
      softness: 0.4,
      color: 0x000000ff,
    });
  });
});
