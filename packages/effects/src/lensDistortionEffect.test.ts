import { createLensDistortionEffect } from './lensDistortionEffect';

describe('createLensDistortionEffect', () => {
  it('tags the intent type', () => {
    expect(createLensDistortionEffect().kind).toBe('LensDistortionEffect');
  });

  it('carries options', () => {
    expect(createLensDistortionEffect({ amount: 0.3, scale: 0.9 })).toMatchObject({ amount: 0.3, scale: 0.9 });
  });
});
