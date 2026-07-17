import { premultiplyColorAlpha, unpremultiplyColorAlpha } from './premultiplyColorAlpha';

describe('premultiplyColorAlpha', () => {
  it('returns fully-opaque color unchanged (alpha=1)', () => {
    expect(premultiplyColorAlpha(0xff0000ff)).toBe(0xff0000ff);
  });
  it('multiplies RGB by alpha and preserves the alpha channel', () => {
    const result = premultiplyColorAlpha(0xff00007f);
    expect((result >>> 24) & 0xff).toBeCloseTo(0x7f, -1);
    expect(result & 0xff).toBe(0x7f);
  });
  it('returns black-with-alpha-0 for fully transparent color', () => {
    const result = premultiplyColorAlpha(0xff000000);
    expect(result & 0xff).toBe(0);
    expect((result >>> 24) & 0xff).toBe(0);
  });
  it('round-trips with unpremultiplyColorAlpha for fully-opaque', () => {
    const color = 0xab3456ff;
    expect(unpremultiplyColorAlpha(premultiplyColorAlpha(color))).toBe(color);
  });
});

describe('unpremultiplyColorAlpha', () => {
  it('returns fully-opaque color unchanged', () => {
    expect(unpremultiplyColorAlpha(0xff0000ff)).toBe(0xff0000ff);
  });
  it('divides RGB by alpha and preserves the alpha channel', () => {
    const premul = premultiplyColorAlpha((0xff0000ff & (0xffffff80 >>> 0)) | 0x80);
    const result = unpremultiplyColorAlpha(premul);
    expect(result & 0xff).toBe(0x80);
  });
  it('returns the input unchanged for alpha=0', () => {
    const color = 0xff000000;
    expect(unpremultiplyColorAlpha(color)).toBe(color);
  });
});
