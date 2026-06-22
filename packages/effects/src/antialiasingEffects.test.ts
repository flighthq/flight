import { createFxaaEffect, createSmaaEffect, createTaaEffect } from './antialiasingEffects';

describe('createFxaaEffect', () => {
  it('tags the intent type', () => {
    expect(createFxaaEffect().type).toBe('fxaa');
  });

  it('carries options', () => {
    expect(createFxaaEffect({ edgeThreshold: 0.05, subpixel: 0.75 })).toMatchObject({
      edgeThreshold: 0.05,
      subpixel: 0.75,
    });
  });
});

describe('createSmaaEffect', () => {
  it('tags the intent type', () => {
    expect(createSmaaEffect().type).toBe('smaa');
  });

  it('carries options', () => {
    expect(createSmaaEffect({ threshold: 0.1 })).toMatchObject({ threshold: 0.1 });
  });
});

describe('createTaaEffect', () => {
  it('tags the intent type', () => {
    expect(createTaaEffect().type).toBe('taa');
  });

  it('carries options', () => {
    expect(createTaaEffect({ feedback: 0.9 })).toMatchObject({ feedback: 0.9 });
  });
});
