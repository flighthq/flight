import { createBarrelDistortionEffect, initializeBarrelDistortionEffect } from './barrelDistortionEffect';

describe('createBarrelDistortionEffect', () => {
  it('carries options', () => {
    expect(createBarrelDistortionEffect({ amount: 0.3 })).toMatchObject({ amount: 0.3 });
  });

  it('tags the intent type', () => {
    expect(createBarrelDistortionEffect().kind).toBe('BarrelDistortionEffect');
  });
});
describe('initializeBarrelDistortionEffect', () => {
  it('is the construction initializer of createBarrelDistortionEffect', () => {
    expect(typeof initializeBarrelDistortionEffect).toBe('function');
  });
});
