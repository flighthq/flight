import { createFxaaEffect, initializeFxaaEffect } from './fxaaEffect';

describe('createFxaaEffect', () => {
  it('tags the intent type', () => {
    expect(createFxaaEffect().kind).toBe('FxaaEffect');
  });

  it('carries options', () => {
    expect(createFxaaEffect({ edgeThreshold: 0.05, subpixel: 0.75 })).toMatchObject({
      edgeThreshold: 0.05,
      subpixel: 0.75,
    });
  });
});
describe('initializeFxaaEffect', () => {
  it('is the construction initializer of createFxaaEffect', () => {
    expect(typeof initializeFxaaEffect).toBe('function');
  });
});
