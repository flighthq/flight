import { createDisplacementEffect } from './displacementEffect';

describe('createDisplacementEffect', () => {
  it('tags the intent type', () => {
    expect(createDisplacementEffect().kind).toBe('DisplacementEffect');
  });

  it('carries options', () => {
    expect(createDisplacementEffect({ intensity: 10, frequency: 14, seed: 2 })).toMatchObject({
      intensity: 10,
      frequency: 14,
      seed: 2,
    });
  });
});
