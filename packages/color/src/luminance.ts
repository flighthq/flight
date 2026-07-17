import { srgbChannelToLinear } from './srgbTransfer';

// WCAG 2.x contrast ratio between two packed sRGB `0xRRGGBBAA` colors (alpha ignored).
// Returns the ratio in [1, 21]; 1 = no contrast, 21 = black on white. The formula is
// (L1 + 0.05) / (L2 + 0.05) where L1 ≥ L2 are the relative luminances.
export function getColorContrastRatio(a: number, b: number): number {
  const la = getColorLuminance(a);
  const lb = getColorLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

// Rec. 709 relative luminance of a packed sRGB `0xRRGGBBAA` color (alpha ignored).
// Gamma-decodes RGB to linear, then applies the Rec. 709 luminance weights. Returns a
// value in [0, 1] where 0 is black and 1 is white.
export function getColorLuminance(color: number): number {
  const r = srgbChannelToLinear(((color >>> 24) & 0xff) / 0xff);
  const g = srgbChannelToLinear(((color >>> 16) & 0xff) / 0xff);
  const b = srgbChannelToLinear(((color >>> 8) & 0xff) / 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Rec. 2020 luminance weights (ITU-R BT.2020). Writes [r, g, b] weights into `out`.
// L = 0.2627 * R + 0.6780 * G + 0.0593 * B.
export function getRec2020LuminanceWeights(out: [number, number, number]): void {
  out[0] = 0.2627;
  out[1] = 0.678;
  out[2] = 0.0593;
}

// Rec. 709 / sRGB luminance weights (ITU-R BT.709). Writes [r, g, b] weights into `out`.
// L = 0.2126 * R + 0.7152 * G + 0.0722 * B.
export function getRec709LuminanceWeights(out: [number, number, number]): void {
  out[0] = 0.2126;
  out[1] = 0.7152;
  out[2] = 0.0722;
}
