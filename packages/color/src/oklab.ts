// Generated from crates/flight-color/src/oklab.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * Clamps linear sRGB channels to the displayable [0, 1] gamut, writing [r, g, b] into `out`.
 * This is a channel clamp, not a perceptual gamut-mapping operation. Alias-safe.
 */
export function clampLinearRgb(out: Float32Array, r: number, g: number, b: number): void {
  out[0] = Math.min(Math.max(r, 0.0), 1.0);
  out[1] = Math.min(Math.max(g, 0.0), 1.0);
  out[2] = Math.min(Math.max(b, 0.0), 1.0);
}

/**
 * Converts linear sRGB [0..1] to Oklab, writing [L, a, b] into `out` (L in [0..1],
 * a/b in ~[-0.5..0.5]). Oklab is a perceptually uniform space; equal steps in L, a, b are
 * visually equal. Reference: Ottosson 2020. Alias-safe.
 */
export function linearRgbToOklab(out: Float32Array, r: number, g: number, b: number): void {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const lc = Math.cbrt(Math.max(l, 0.0));
  const mc = Math.cbrt(Math.max(m, 0.0));
  const sc = Math.cbrt(Math.max(s, 0.0));
  out[0] = 0.2104542553 * lc + 0.793617785 * mc - 0.0040720468 * sc;
  out[1] = 1.9779984951 * lc - 2.428592205 * mc + 0.4505937099 * sc;
  out[2] = 0.0259040371 * lc + 0.7827717662 * mc - 0.808675766 * sc;
}

/**
 * Converts Oklab [L, a, b] back to unclamped linear sRGB, writing [r, g, b] into `out`.
 * Negative and greater-than-one channels are preserved so this remains a true inverse; callers that
 * require the displayable sRGB gamut can compose the result with `clampLinearRgb`. Alias-safe.
 */
export function oklabToLinearRgb(out: Float32Array, l: number, a: number, b: number): void {
  const lc = l + 0.3963377774 * a + 0.2158037573 * b;
  const mc = l - 0.1055613458 * a - 0.0638541728 * b;
  const sc = l - 0.0894841775 * a - 1.291485548 * b;
  const lCube = lc * lc * lc;
  const m = mc * mc * mc;
  const s = sc * sc * sc;
  out[0] = 4.0767416621 * lCube - 3.3077115913 * m + 0.2309699292 * s;
  out[1] = -1.2684380046 * lCube + 2.6097574011 * m - 0.3413193965 * s;
  out[2] = -0.0041960863 * lCube - 0.7034186147 * m + 1.707614701 * s;
}
