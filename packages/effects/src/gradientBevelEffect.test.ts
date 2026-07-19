import { createGradientBevelEffect } from './gradientBevelEffect';

describe('createGradientBevelEffect', () => {
  it('tags the intent type', () => {
    expect(createGradientBevelEffect({ colors: [0xff0000, 0x00ff00], alphas: [1, 1], ratios: [0, 255] }).kind).toBe(
      'GradientBevelEffect',
    );
  });

  it('carries options', () => {
    expect(
      createGradientBevelEffect({
        colors: [0xff0000, 0x00ff00],
        alphas: [1, 1],
        ratios: [0, 255],
        sourceMode: 'hide',
        strength: 2,
      }),
    ).toMatchObject({ sourceMode: 'hide', strength: 2 });
  });
});
