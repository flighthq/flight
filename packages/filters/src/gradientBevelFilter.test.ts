import { createGradientBevelFilter } from './gradientBevelFilter';

describe('createGradientBevelFilter', () => {
  it('sets type to gradientBevel', () => {
    const f = createGradientBevelFilter({ colors: [0xffffff], alphas: [1], ratios: [0] });
    expect(f.kind).toBe('GradientBevelFilter');
  });

  it('stores gradient arrays', () => {
    const colors = [0xffffff, 0x000000];
    const alphas = [1, 0];
    const ratios = [0, 255];
    const f = createGradientBevelFilter({ colors, alphas, ratios });
    expect(f.colors).toBe(colors);
    expect(f.alphas).toBe(alphas);
    expect(f.ratios).toBe(ratios);
  });
});
