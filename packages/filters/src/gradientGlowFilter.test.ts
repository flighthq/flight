import { createGradientGlowFilter } from './gradientGlowFilter';

describe('createGradientGlowFilter', () => {
  it('sets type to gradientGlow', () => {
    const f = createGradientGlowFilter({ colors: [0xff0000], alphas: [1], ratios: [128] });
    expect(f.kind).toBe('GradientGlowFilter');
  });
});
