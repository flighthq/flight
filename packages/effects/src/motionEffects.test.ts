import { createCameraMotionBlurEffect, createDirectionalBlurEffect, createRadialBlurEffect } from './motionEffects';

describe('createCameraMotionBlurEffect', () => {
  it('tags the intent type', () => {
    expect(createCameraMotionBlurEffect().type).toBe('cameraMotionBlur');
  });

  it('carries options', () => {
    expect(createCameraMotionBlurEffect({ intensity: 0.5, samples: 12 })).toMatchObject({
      intensity: 0.5,
      samples: 12,
    });
  });
});

describe('createDirectionalBlurEffect', () => {
  it('tags the intent type', () => {
    expect(createDirectionalBlurEffect().type).toBe('directionalBlur');
  });

  it('carries options', () => {
    expect(createDirectionalBlurEffect({ angle: 1, length: 8 })).toMatchObject({ angle: 1, length: 8 });
  });
});

describe('createRadialBlurEffect', () => {
  it('tags the intent type', () => {
    expect(createRadialBlurEffect().type).toBe('radialBlur');
  });

  it('carries options', () => {
    expect(createRadialBlurEffect({ centerX: 0.5, centerY: 0.5, strength: 0.2 })).toMatchObject({
      centerX: 0.5,
      centerY: 0.5,
      strength: 0.2,
    });
  });
});
