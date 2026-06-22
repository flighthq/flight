import { createLensDirtEffect } from './lensDirtEffect';

describe('createLensDirtEffect', () => {
  it('tags the intent type', () => {
    expect(createLensDirtEffect().kind).toBe('LensDirtEffect');
  });

  it('carries options', () => {
    expect(createLensDirtEffect({ intensity: 1.5, threshold: 0.45, seed: 4 })).toMatchObject({
      intensity: 1.5,
      threshold: 0.45,
      seed: 4,
    });
  });
});
