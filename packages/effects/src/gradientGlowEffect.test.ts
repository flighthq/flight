import { createGradientGlowEffect } from './gradientGlowEffect';

describe('createGradientGlowEffect', () => {
  it('tags the intent type', () => {
    expect(createGradientGlowEffect({ colors: [0xff0000, 0x00ff00], alphas: [1, 1], ratios: [0, 255] }).kind).toBe(
      'GradientGlowEffect',
    );
  });

  it('carries options', () => {
    expect(
      createGradientGlowEffect({ colors: [0xff0000, 0x00ff00], alphas: [1, 1], ratios: [0, 255], strength: 2 }),
    ).toMatchObject({ strength: 2 });
  });
});
