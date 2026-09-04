import { createCrtEffect, initializeCrtEffect } from './crtEffect';

describe('createCrtEffect', () => {
  it('tags the intent type', () => {
    expect(createCrtEffect().kind).toBe('CrtEffect');
  });

  it('carries options', () => {
    expect(createCrtEffect({ curvature: 0.2, scanlineIntensity: 0.5, vignette: 0.3, aberration: 0.01 })).toMatchObject({
      curvature: 0.2,
      scanlineIntensity: 0.5,
      vignette: 0.3,
      aberration: 0.01,
    });
  });
});
describe('initializeCrtEffect', () => {
  it('is the construction initializer of createCrtEffect', () => {
    expect(typeof initializeCrtEffect).toBe('function');
  });
});
