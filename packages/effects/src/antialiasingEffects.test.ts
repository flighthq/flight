import { createFXAAEffect, createSMAAEffect, createTAAEffect } from './antialiasingEffects';

describe('createFXAAEffect', () => {
  it('tags the intent type', () => {
    expect(createFXAAEffect().type).toBe('fxaa');
  });

  it('carries options', () => {
    expect(createFXAAEffect({ edgeThreshold: 0.05, subpixel: 0.75 })).toMatchObject({
      edgeThreshold: 0.05,
      subpixel: 0.75,
    });
  });
});

describe('createSMAAEffect', () => {
  it('tags the intent type', () => {
    expect(createSMAAEffect().type).toBe('smaa');
  });

  it('carries options', () => {
    expect(createSMAAEffect({ threshold: 0.1 })).toMatchObject({ threshold: 0.1 });
  });
});

describe('createTAAEffect', () => {
  it('tags the intent type', () => {
    expect(createTAAEffect().type).toBe('taa');
  });

  it('carries options', () => {
    expect(createTAAEffect({ feedback: 0.9 })).toMatchObject({ feedback: 0.9 });
  });
});
