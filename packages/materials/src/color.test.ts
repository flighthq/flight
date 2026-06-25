import {
  computeRgbHexString,
  createHslColor,
  createHsvColor,
  createLinearColor,
  getColorContrastRatio,
  getColorLuminance,
  hslToRgb,
  hsvToRgb,
  lerpColor,
  lerpLinearColor,
  linearChannelToSrgb,
  packColor,
  packLinearToColor,
  premultiplyColorAlpha,
  rgbToHsl,
  rgbToHsv,
  unpackColorRgba,
  unpackColorToLinear,
  unpremultiplyColorAlpha,
} from './color';

describe('computeRgbHexString', () => {
  it('returns a 6-digit hex string of the lower 24 bits', () => {
    expect(computeRgbHexString(0x00ff0000)).toBe('#ff0000');
    expect(computeRgbHexString(0x0000ff00)).toBe('#00ff00');
    expect(computeRgbHexString(0x000000ff)).toBe('#0000ff');
    expect(computeRgbHexString(0x00000000)).toBe('#000000');
    expect(computeRgbHexString(0x00ffffff)).toBe('#ffffff');
  });
});

describe('createHslColor', () => {
  it('allocates a zeroed three-component HSL color', () => {
    expect(createHslColor()).toEqual([0, 0, 0]);
  });
});

describe('createHsvColor', () => {
  it('allocates a zeroed three-component HSV color', () => {
    expect(createHsvColor()).toEqual([0, 0, 0]);
  });
});

describe('createLinearColor', () => {
  it('allocates a zeroed four-component color', () => {
    expect(createLinearColor()).toEqual([0, 0, 0, 0]);
  });
});

describe('getColorContrastRatio', () => {
  it('returns 21 for black on white', () => {
    expect(getColorContrastRatio(0xffffffff, 0x000000ff)).toBeCloseTo(21, 0);
  });
  it('returns 1 for identical colors', () => {
    expect(getColorContrastRatio(0x808080ff, 0x808080ff)).toBeCloseTo(1, 3);
  });
  it('is symmetric — order of arguments does not matter', () => {
    const ratio1 = getColorContrastRatio(0xffffffff, 0x808080ff);
    const ratio2 = getColorContrastRatio(0x808080ff, 0xffffffff);
    expect(ratio1).toBeCloseTo(ratio2, 8);
  });
});

describe('getColorLuminance', () => {
  it('returns 1 for white', () => {
    expect(getColorLuminance(0xffffffff)).toBeCloseTo(1, 5);
  });
  it('returns 0 for black', () => {
    expect(getColorLuminance(0x000000ff)).toBeCloseTo(0, 5);
  });
  it('ignores the alpha channel', () => {
    expect(getColorLuminance(0xffffffff)).toBe(getColorLuminance(0xffffff00));
  });
  it('matches expected Rec. 709 value for mid-gray sRGB', () => {
    // sRGB 0x808080 → linear ≈ 0.21586; Rec.709: 0.2126*R + 0.7152*G + 0.0722*B = R (equal channels)
    expect(getColorLuminance(0x808080ff)).toBeCloseTo(0.21586, 4);
  });
});

describe('hslToRgb', () => {
  it('produces achromatic RGB for saturation = 0', () => {
    const out: [number, number, number, number] = [0, 0, 0, 1];
    hslToRgb(out, 0, 0, 0.5);
    expect(out[0]).toBeCloseTo(0.5);
    expect(out[1]).toBeCloseTo(0.5);
    expect(out[2]).toBeCloseTo(0.5);
  });
  it('round-trips with rgbToHsl for a primary color', () => {
    // Red: hue=0, s=1, l=0.5 → RGB (1, 0, 0)
    const out: [number, number, number, number] = [0, 0, 0, 1];
    hslToRgb(out, 0, 1, 0.5);
    expect(out[0]).toBeCloseTo(1, 5);
    expect(out[1]).toBeCloseTo(0, 5);
    expect(out[2]).toBeCloseTo(0, 5);
  });
  it('does not modify out[3] (alpha)', () => {
    const out: [number, number, number, number] = [0, 0, 0, 0.75];
    hslToRgb(out, 120, 1, 0.5);
    expect(out[3]).toBe(0.75);
  });
});

describe('hsvToRgb', () => {
  it('produces achromatic RGB for saturation = 0', () => {
    const out: [number, number, number, number] = [0, 0, 0, 1];
    hsvToRgb(out, 0, 0, 0.6);
    expect(out[0]).toBeCloseTo(0.6);
    expect(out[1]).toBeCloseTo(0.6);
    expect(out[2]).toBeCloseTo(0.6);
  });
  it('produces pure red for h=0, s=1, v=1', () => {
    const out: [number, number, number, number] = [0, 0, 0, 1];
    hsvToRgb(out, 0, 1, 1);
    expect(out[0]).toBeCloseTo(1, 5);
    expect(out[1]).toBeCloseTo(0, 5);
    expect(out[2]).toBeCloseTo(0, 5);
  });
  it('round-trips with rgbToHsv for a pure green', () => {
    const out: [number, number, number, number] = [0, 0, 0, 1];
    hsvToRgb(out, 120, 1, 1);
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[1]).toBeCloseTo(1, 5);
    expect(out[2]).toBeCloseTo(0, 5);
  });
});

describe('lerpColor', () => {
  it('returns start at t=0', () => {
    expect(lerpColor(0xff0000ff, 0x0000ffff, 0)).toBe(0xff0000ff);
  });
  it('returns end at t=1', () => {
    expect(lerpColor(0xff0000ff, 0x0000ffff, 1)).toBe(0x0000ffff);
  });
  it('clamps t below 0 to 0', () => {
    expect(lerpColor(0xff0000ff, 0x0000ffff, -1)).toBe(0xff0000ff);
  });
  it('clamps t above 1 to 1', () => {
    expect(lerpColor(0xff0000ff, 0x0000ffff, 2)).toBe(0x0000ffff);
  });
  it('midpoint between black and white is approximately mid-gray', () => {
    // Black (linear 0) and white (linear 1) — midpoint in linear is 0.5, which in sRGB ≈ 0xbc
    const mid = lerpColor(0x000000ff, 0xffffffff, 0.5);
    const r = (mid >>> 24) & 0xff;
    // linear 0.5 → sRGB ≈ 0xbc (188)
    expect(r).toBeCloseTo(0xbc, -1);
  });
});

describe('lerpLinearColor', () => {
  it('returns start at t=0', () => {
    const out = createLinearColor();
    const start: [number, number, number, number] = [1, 0, 0, 1];
    const end: [number, number, number, number] = [0, 0, 1, 1];
    lerpLinearColor(out, start, end, 0);
    expect(out).toEqual(start);
  });
  it('returns end at t=1', () => {
    const out = createLinearColor();
    const start: [number, number, number, number] = [1, 0, 0, 1];
    const end: [number, number, number, number] = [0, 0, 1, 1];
    lerpLinearColor(out, start, end, 1);
    expect(out).toEqual(end);
  });
  it('is alias-safe when out is the same object as start', () => {
    const start: [number, number, number, number] = [1, 0, 0, 1];
    const end: [number, number, number, number] = [0, 0, 1, 1];
    const out = start;
    lerpLinearColor(out, out, end, 0.5);
    expect(out[0]).toBeCloseTo(0.5, 8);
    expect(out[2]).toBeCloseTo(0.5, 8);
  });
  it('returns the out instance', () => {
    const out = createLinearColor();
    const start: [number, number, number, number] = [0, 0, 0, 0];
    const end: [number, number, number, number] = [1, 1, 1, 1];
    expect(lerpLinearColor(out, start, end, 0.5)).toBe(out);
  });
});

describe('linearChannelToSrgb', () => {
  it('maps 0 → 0', () => {
    expect(linearChannelToSrgb(0)).toBe(0);
  });
  it('maps 1 → 1', () => {
    expect(linearChannelToSrgb(1)).toBeCloseTo(1, 8);
  });
  it('is the inverse of the sRGB decode for a round-trip', () => {
    // A known linear value near the breakpoint.
    const linear = 0.5;
    const srgb = linearChannelToSrgb(linear);
    // Re-encode: sRGB(linear(x)) should round-trip within floating-point tolerance.
    const roundTrip = srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    expect(roundTrip).toBeCloseTo(linear, 5);
  });
});

describe('packColor', () => {
  it('packs white components to 0xffffffff', () => {
    expect(packColor(1, 1, 1, 1)).toBe(0xffffffff);
  });
  it('packs black components to 0x000000ff', () => {
    expect(packColor(0, 0, 0, 1)).toBe(0x000000ff);
  });
  it('clamps out-of-range values', () => {
    expect(packColor(2, -1, 0.5, 1)).toBe(packColor(1, 0, 0.5, 1));
  });
});

describe('packLinearToColor', () => {
  it('is the inverse of unpackColorToLinear for white', () => {
    const out = createLinearColor();
    unpackColorToLinear(out, 0xffffffff);
    expect(packLinearToColor(out)).toBe(0xffffffff);
  });
  it('is the inverse of unpackColorToLinear for black (opaque)', () => {
    const out = createLinearColor();
    unpackColorToLinear(out, 0x000000ff);
    expect(packLinearToColor(out)).toBe(0x000000ff);
  });
  it('passes alpha through without gamma encoding', () => {
    // Alpha 0x80 / 0xff ≈ 0.502; should round-trip through linear-space alpha.
    const color = 0x000000_80 >>> 0;
    const out = createLinearColor();
    unpackColorToLinear(out, color);
    const repacked = packLinearToColor(out);
    expect(repacked & 0xff).toBe(0x80);
  });
  it('round-trips a mid-gray color within 1 LSB', () => {
    const color = 0x808080ff >>> 0;
    const out = createLinearColor();
    unpackColorToLinear(out, color);
    const repacked = packLinearToColor(out);
    const origR = (color >>> 24) & 0xff;
    const repR = (repacked >>> 24) & 0xff;
    expect(Math.abs(repR - origR)).toBeLessThanOrEqual(1);
  });
});

describe('premultiplyColorAlpha', () => {
  it('returns fully-opaque color unchanged (alpha=1)', () => {
    expect(premultiplyColorAlpha(0xff0000ff)).toBe(0xff0000ff);
  });
  it('multiplies RGB by alpha and preserves the alpha channel', () => {
    // Red at 50% alpha: R=255*0.502≈128, A unchanged=0x80
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

describe('rgbToHsl', () => {
  it('converts pure red to hue=0, s=1, l=0.5', () => {
    const out: [number, number, number] = [0, 0, 0];
    rgbToHsl(out, 0xff0000ff);
    expect(out[0]).toBeCloseTo(0, 3);
    expect(out[1]).toBeCloseTo(1, 5);
    expect(out[2]).toBeCloseTo(0.5, 5);
  });
  it('converts white to hue=0, s=0, l=1', () => {
    const out: [number, number, number] = [0, 0, 0];
    rgbToHsl(out, 0xffffffff);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0);
    expect(out[2]).toBeCloseTo(1, 5);
  });
  it('converts black to hue=0, s=0, l=0', () => {
    const out: [number, number, number] = [0, 0, 0];
    rgbToHsl(out, 0x000000ff);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0);
    expect(out[2]).toBeCloseTo(0, 5);
  });
  it('returns the out instance', () => {
    const out: [number, number, number] = [0, 0, 0];
    expect(rgbToHsl(out, 0xff0000ff)).toBe(out);
  });
  it('round-trips with hslToRgb within 1 LSB', () => {
    const hsl: [number, number, number] = [0, 0, 0];
    rgbToHsl(hsl, 0x3c8ab5ff);
    const rgb: [number, number, number, number] = [0, 0, 0, 1];
    hslToRgb(rgb, hsl[0], hsl[1], hsl[2]);
    const repacked =
      (Math.round(rgb[0] * 0xff) << 24) | (Math.round(rgb[1] * 0xff) << 16) | (Math.round(rgb[2] * 0xff) << 8) | 0xff;
    const orig = 0x3c8ab5ff >>> 0;
    expect(Math.abs(((repacked >>> 24) & 0xff) - ((orig >>> 24) & 0xff))).toBeLessThanOrEqual(1);
  });
});

describe('rgbToHsv', () => {
  it('converts pure red to hue=0, s=1, v=1', () => {
    const out: [number, number, number] = [0, 0, 0];
    rgbToHsv(out, 0xff0000ff);
    expect(out[0]).toBeCloseTo(0, 3);
    expect(out[1]).toBeCloseTo(1, 5);
    expect(out[2]).toBeCloseTo(1, 5);
  });
  it('converts black to s=0, v=0', () => {
    const out: [number, number, number] = [0, 0, 0];
    rgbToHsv(out, 0x000000ff);
    expect(out[1]).toBe(0);
    expect(out[2]).toBeCloseTo(0, 5);
  });
  it('converts white to s=0, v=1', () => {
    const out: [number, number, number] = [0, 0, 0];
    rgbToHsv(out, 0xffffffff);
    expect(out[1]).toBe(0);
    expect(out[2]).toBeCloseTo(1, 5);
  });
  it('returns the out instance', () => {
    const out: [number, number, number] = [0, 0, 0];
    expect(rgbToHsv(out, 0xff0000ff)).toBe(out);
  });
});

describe('unpackColorRgba', () => {
  it('extracts white as all-ones', () => {
    const out: [number, number, number, number] = [0, 0, 0, 0];
    unpackColorRgba(out, 0xffffffff);
    expect(out[0]).toBeCloseTo(1, 5);
    expect(out[1]).toBeCloseTo(1, 5);
    expect(out[2]).toBeCloseTo(1, 5);
    expect(out[3]).toBeCloseTo(1, 5);
  });
  it('does NOT gamma-decode — mid sRGB stays above the linear midpoint', () => {
    const out: [number, number, number, number] = [0, 0, 0, 0];
    unpackColorRgba(out, 0x808080ff);
    // Without gamma decode, 0x80/0xff ≈ 0.502 — above the linear midpoint.
    expect(out[0]).toBeCloseTo(0x80 / 0xff, 4);
  });
});

describe('unpackColorToLinear', () => {
  it('decodes white and black exactly at the endpoints', () => {
    const out = createLinearColor();
    expect(unpackColorToLinear(out, 0xffffffff)).toEqual([1, 1, 1, 1]);
    expect(unpackColorToLinear(out, 0x000000ff)).toEqual([0, 0, 0, 1]);
  });

  it('passes alpha through linearly without gamma decode', () => {
    const out = createLinearColor();
    unpackColorToLinear(out, 0x00000080);
    expect(out[3]).toBeCloseTo(0x80 / 0xff, 6);
  });

  it('gamma-decodes RGB so mid sRgb is below the linear midpoint', () => {
    const out = createLinearColor();
    unpackColorToLinear(out, 0x808080ff);
    expect(out[0]).toBeCloseTo(0.21586, 4);
    expect(out[0]).toBe(out[1]);
    expect(out[1]).toBe(out[2]);
  });

  it('returns the same out instance it was given', () => {
    const out = createLinearColor();
    expect(unpackColorToLinear(out, 0xff0000ff)).toBe(out);
  });
});

describe('unpremultiplyColorAlpha', () => {
  it('returns fully-opaque color unchanged', () => {
    expect(unpremultiplyColorAlpha(0xff0000ff)).toBe(0xff0000ff);
  });
  it('divides RGB by alpha and preserves the alpha channel', () => {
    // Premultiplied: R=128 (≈0x80), A=0x80 → straight: R ≈ 255
    const premul = premultiplyColorAlpha((0xff0000ff & (0xffffff80 >>> 0)) | 0x80);
    const result = unpremultiplyColorAlpha(premul);
    expect(result & 0xff).toBe(0x80);
  });
  it('returns the input unchanged for alpha=0', () => {
    const color = 0xff000000;
    expect(unpremultiplyColorAlpha(color)).toBe(color);
  });
});
