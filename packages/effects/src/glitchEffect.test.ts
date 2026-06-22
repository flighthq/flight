import { createGlitchEffect } from './glitchEffect';

describe('createGlitchEffect', () => {
  it('tags the intent type', () => {
    expect(createGlitchEffect().kind).toBe('GlitchEffect');
  });

  it('carries options', () => {
    expect(createGlitchEffect({ intensity: 0.7, blockSize: 22, colorShift: 12, seed: 3 })).toMatchObject({
      intensity: 0.7,
      blockSize: 22,
      colorShift: 12,
      seed: 3,
    });
  });
});
