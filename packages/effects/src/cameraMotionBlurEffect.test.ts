import { createCameraMotionBlurEffect } from './cameraMotionBlurEffect';

describe('createCameraMotionBlurEffect', () => {
  it('tags the intent type', () => {
    expect(createCameraMotionBlurEffect().kind).toBe('CameraMotionBlurEffect');
  });

  it('carries options', () => {
    expect(createCameraMotionBlurEffect({ intensity: 0.5, samples: 12 })).toMatchObject({
      intensity: 0.5,
      samples: 12,
    });
  });
});
