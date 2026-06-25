// Color-science recipe math. Complete working-space functions for HDR rendering, color grading,
// and perceptual operations. All functions are alias-safe and zero-allocation (out-param pattern).
// These are the substrate-agnostic primitives shared across all backends.

// Converts HSL [h∈[0..360), s∈[0..1], l∈[0..1]] to sRGB [0..1]. Writes into `out`.
// Alias-safe.
export function computeHslToRgb(h: number, s: number, l: number, out: [number, number, number]): void {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r1: number;
  let g1: number;
  let b1: number;
  if (hh < 1) {
    r1 = c;
    g1 = x;
    b1 = 0;
  } else if (hh < 2) {
    r1 = x;
    g1 = c;
    b1 = 0;
  } else if (hh < 3) {
    r1 = 0;
    g1 = c;
    b1 = x;
  } else if (hh < 4) {
    r1 = 0;
    g1 = x;
    b1 = c;
  } else if (hh < 5) {
    r1 = x;
    g1 = 0;
    b1 = c;
  } else {
    r1 = c;
    g1 = 0;
    b1 = x;
  }
  const m = l - c / 2;
  out[0] = r1 + m;
  out[1] = g1 + m;
  out[2] = b1 + m;
}

// sRGB transfer function: converts a single linear-light channel value to gamma-encoded sRGB.
// The piecewise IEC 61966-2-1 formula. Input in [0..∞], output in [0..1].
export function computeLinearToSrgb(x: number): number {
  const v = Math.max(0, x);
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

// Converts Oklab back to linear sRGB [0..1]. Alias-safe.
export function computeOklabToRgb(L: number, a: number, b: number, out: [number, number, number]): void {
  // Oklab → LMS.
  const lc = L + 0.3963377774 * a + 0.2158037573 * b;
  const mc = L - 0.1055613458 * a - 0.0638541728 * b;
  const sc = L - 0.0894841775 * a - 1.291485548 * b;
  // Cube.
  const l = lc * lc * lc;
  const m = mc * mc * mc;
  const s = sc * sc * sc;
  // LMS → linear sRGB.
  out[0] = Math.max(0, 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  out[1] = Math.max(0, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  out[2] = Math.max(0, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
}

// Converts sRGB [0..1] to HSL [h∈[0..360), s∈[0..1], l∈[0..1]]. Writes into `out`.
// Alias-safe: reads all inputs before writing.
export function computeRgbToHsl(r: number, g: number, b: number, out: [number, number, number]): void {
  const rc = Math.max(0, Math.min(1, r));
  const gc = Math.max(0, Math.min(1, g));
  const bc = Math.max(0, Math.min(1, b));
  const max = Math.max(rc, gc, bc);
  const min = Math.min(rc, gc, bc);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d > 1e-10) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rc) {
      h = ((gc - bc) / d + 6) % 6;
    } else if (max === gc) {
      h = (bc - rc) / d + 2;
    } else {
      h = (rc - gc) / d + 4;
    }
    h *= 60;
  }
  out[0] = h;
  out[1] = s;
  out[2] = l;
}

// Converts linear sRGB [0..1] to Oklab [L∈[0..1], a∈~[-0.5..0.5], b∈~[-0.5..0.5]].
// Oklab is a perceptually uniform space; changes in L, a, b produce visually equal steps.
// Reference: Ottosson 2020. Alias-safe.
export function computeRgbToOklab(r: number, g: number, b: number, out: [number, number, number]): void {
  // sRGB (linear) → LMS via a 3×3 matrix.
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  // Cube-root compress.
  const lc = Math.cbrt(Math.max(0, l));
  const mc = Math.cbrt(Math.max(0, m));
  const sc = Math.cbrt(Math.max(0, s));
  // LMS → Oklab.
  out[0] = 0.2104542553 * lc + 0.793617785 * mc - 0.0040720468 * sc;
  out[1] = 1.9779984951 * lc - 2.428592205 * mc + 0.4505937099 * sc;
  out[2] = 0.0259040371 * lc + 0.7827717662 * mc - 0.808675766 * sc;
}

// sRGB transfer function: converts a gamma-encoded sRGB channel to linear light.
// The piecewise IEC 61966-2-1 inverse. Input in [0..1], output in [0..∞).
export function computeSrgbToLinear(x: number): number {
  const v = Math.max(0, x);
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
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
