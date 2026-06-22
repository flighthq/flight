import { createLensFlareEffect } from './lensFlareEffect';

describe('createLensFlareEffect', () => {
  it('tags the intent type', () => {
    expect(createLensFlareEffect().kind).toBe('LensFlareEffect');
  });

  it('carries options', () => {
    expect(createLensFlareEffect({ threshold: 0.8, intensity: 2, ghosts: 4, halo: 0.5 })).toMatchObject({
      threshold: 0.8,
      intensity: 2,
      ghosts: 4,
      halo: 0.5,
    });
  });
});
