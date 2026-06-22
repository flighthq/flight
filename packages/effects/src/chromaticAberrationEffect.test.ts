import { createChromaticAberrationEffect } from './chromaticAberrationEffect';

describe('createChromaticAberrationEffect', () => {
  it('tags the intent type', () => {
    expect(createChromaticAberrationEffect().kind).toBe('ChromaticAberrationEffect');
  });

  it('carries options', () => {
    expect(createChromaticAberrationEffect({ intensity: 0.01, radial: false })).toMatchObject({
      intensity: 0.01,
      radial: false,
    });
  });
});
