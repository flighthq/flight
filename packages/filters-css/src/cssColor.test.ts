import { cssRgbaFromColor } from './cssColor';

describe('cssRgbaFromColor', () => {
  it('unpacks a 0xRRGGBB color and appends the alpha', () => {
    expect(cssRgbaFromColor(0x112233, 1)).toBe('rgba(17,34,51,1.000)');
  });

  it('formats alpha to three decimals', () => {
    expect(cssRgbaFromColor(0xff0000, 0.5)).toBe('rgba(255,0,0,0.500)');
  });

  it('masks the color to 24 bits', () => {
    expect(cssRgbaFromColor(0x000000, 0)).toBe('rgba(0,0,0,0.000)');
  });
});
