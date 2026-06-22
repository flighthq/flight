import { createMotionBlurEffect } from './motionBlurEffect';

describe('createMotionBlurEffect', () => {
  it('tags the intent type', () => {
    expect(createMotionBlurEffect().kind).toBe('MotionBlurEffect');
  });

  it('carries options', () => {
    expect(createMotionBlurEffect({ intensity: 0.8, samples: 12 })).toMatchObject({ intensity: 0.8, samples: 12 });
  });
});
