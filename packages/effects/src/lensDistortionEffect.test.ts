import { createLensDistortionEffect, initializeLensDistortionEffect } from './lensDistortionEffect';

describe('createLensDistortionEffect', () => {
  it('tags the intent type', () => {
    expect(createLensDistortionEffect().kind).toBe('LensDistortionEffect');
  });

  it('carries options', () => {
    expect(createLensDistortionEffect({ amount: 0.3, scale: 0.9 })).toMatchObject({ amount: 0.3, scale: 0.9 });
  });
});
describe('initializeLensDistortionEffect', () => {
  it('is the construction initializer of createLensDistortionEffect', () => {
    expect(typeof initializeLensDistortionEffect).toBe('function');
  });
});
