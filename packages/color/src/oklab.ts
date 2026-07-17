// Converts linear sRGB [0..1] to Oklab, writing [L, a, b] into `out` (L∈[0..1],
// a/b∈~[-0.5..0.5]). Oklab is a perceptually uniform space; equal steps in L, a, b are
// visually equal. Reference: Ottosson 2020. Alias-safe.
export function linearRgbToOklab(out: [number, number, number], r: number, g: number, b: number): void {
  // linear sRGB → LMS via a 3×3 matrix.
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

// Converts Oklab [L, a, b] back to linear sRGB [0..1], writing [r, g, b] into `out`.
// Alias-safe.
export function oklabToLinearRgb(out: [number, number, number], L: number, a: number, b: number): void {
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
