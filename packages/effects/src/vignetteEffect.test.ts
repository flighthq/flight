import { createVignetteEffect } from './vignetteEffect';

describe('createVignetteEffect', () => {
  it('tags the intent type', () => {
    expect(createVignetteEffect().kind).toBe('VignetteEffect');
  });

  it('carries options', () => {
    expect(createVignetteEffect({ intensity: 1, radius: 0.7, softness: 0.4, color: 0x000000ff })).toMatchObject({
      intensity: 1,
      radius: 0.7,
      softness: 0.4,
      color: 0x000000ff,
    });
  });
});
