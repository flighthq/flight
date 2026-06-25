import { createBarrelDistortionEffect } from './barrelDistortionEffect';

describe('createBarrelDistortionEffect', () => {
  it('carries options', () => {
    expect(createBarrelDistortionEffect({ amount: 0.3 })).toMatchObject({ amount: 0.3 });
  });

  it('tags the intent type', () => {
    expect(createBarrelDistortionEffect().kind).toBe('BarrelDistortionEffect');
  });
});
