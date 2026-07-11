/**
 * Color-matrix math: preset builders, combinators, and evaluation for 4×5 RGBA color matrices.
 *
 * A color-matrix is a 4×5 affine transform applied to premultiplied RGBA color vectors:
 *   | R' |   | m0  m1  m2  m3  m4  |   | R |
 *   | G' | = | m5  m6  m7  m8  m9  | × | G |
 *   | B' |   | m10 m11 m12 m13 m14 |   | B |
 *   | A' |   | m15 m16 m17 m18 m19 |   | A |
 *                                       | 1 |
 *
 * Row 0 = R output coefficients (R, G, B, A inputs, then R offset).
 * Row 1 = G output coefficients.
 * Row 2 = B output coefficients.
 * Row 3 = A output coefficients.
 *
 * The offset column (indices 4, 9, 14, 19) is in the range 0..255 (Flash convention).
 */

/** Required length of a valid color-matrix array. */
export const COLOR_MATRIX_LENGTH = 20;

/**
 * Evaluates `matrix` against a packed `0xRRGGBBAA` color. Useful for previews and tests; pure
 * math, no surface operations. Offsets are in the Flash 0–255 range; result is clamped to 0–255
 * per channel and repacked as `0xRRGGBBAA`.
 */
export function applyColorMatrixToColor(matrix: Readonly<number[]>, packedRgba: number): number {
  const r = (packedRgba >>> 24) & 0xff;
  const g = (packedRgba >>> 16) & 0xff;
  const b = (packedRgba >>> 8) & 0xff;
  const a = packedRgba & 0xff;
  const rOut = clampByte(matrix[0] * r + matrix[1] * g + matrix[2] * b + matrix[3] * a + matrix[4]);
  const gOut = clampByte(matrix[5] * r + matrix[6] * g + matrix[7] * b + matrix[8] * a + matrix[9]);
  const bOut = clampByte(matrix[10] * r + matrix[11] * g + matrix[12] * b + matrix[13] * a + matrix[14]);
  const aOut = clampByte(matrix[15] * r + matrix[16] * g + matrix[17] * b + matrix[18] * a + matrix[19]);
  return ((rOut << 24) | (gOut << 16) | (bOut << 8) | aOut) >>> 0;
}

/**
 * Composes `source` into `target` in place: `target = target × source` (applies source first,
 * then target). Matches OpenFL `ColorMatrixFilter.concat` semantics. Alias-safe: `source` may be
 * `target`.
 */
export function concatColorMatrix(target: number[], source: Readonly<number[]>): void {
  multiplyColorMatrix(target, source, target);
}

/**
 * Returns a color matrix that adds `amount` to the brightness offset of each channel. Positive
 * `amount` brightens; negative darkens. `amount` is in the Flash 0–255 offset range. Allocates a
 * new array.
 */
export function createBrightnessColorMatrix(amount: number): number[] {
  // prettier-ignore
  return [
    1, 0, 0, 0, amount,
    0, 1, 0, 0, amount,
    0, 0, 1, 0, amount,
    0, 0, 0, 1, 0,
  ];
}

/**
 * Returns a channel-mixer color matrix. Each `[r, g, b]` triple defines the source mix for the
 * corresponding output channel. Values are in the 0–1 range (1 = full contribution). Allocates a
 * new array.
 *
 * Example: `createChannelMixerColorMatrix([1, 0, 0], [0, 1, 0], [0, 0, 1])` is the identity.
 * Swapping channels: `createChannelMixerColorMatrix([0, 1, 0], [1, 0, 0], [0, 0, 1])` swaps R/G.
 */
export function createChannelMixerColorMatrix(
  redOut: Readonly<[number, number, number]>,
  greenOut: Readonly<[number, number, number]>,
  blueOut: Readonly<[number, number, number]>,
): number[] {
  // prettier-ignore
  return [
    redOut[0], redOut[1], redOut[2], 0, 0,
    greenOut[0], greenOut[1], greenOut[2], 0, 0,
    blueOut[0], blueOut[1], blueOut[2], 0, 0,
    0, 0, 0, 1, 0,
  ];
}

/**
 * Returns a color balance matrix that independently shifts highlights, midtones, and shadows.
 * Each parameter is a `[red, green, blue]` offset in the –100..100 range (Flash-style, mapped to
 * –255..255 offsets). Allocates a new array.
 *
 * Implementation uses a three-range additive model: shadows affect dark pixels (luma < 85),
 * highlights affect bright pixels (luma > 170), and midtones are weighted by proximity to the
 * centre luma value. Because colour matrices cannot represent luma-gating directly, the offsets
 * are applied uniformly and weighted by the fraction of the range each band covers; for precise
 * per-band clamping use a LUT-based approach in `filters-surface`.
 */
export function createColorBalanceColorMatrix(
  shadows: Readonly<[number, number, number]>,
  midtones: Readonly<[number, number, number]>,
  highlights: Readonly<[number, number, number]>,
): number[] {
  // Map each band's [-100,100] range to Flash offsets [-255,255] and weight by band contribution.
  // Shadows weight 0.25, midtones 0.5, highlights 0.25 — ensures the total offset range matches
  // a single-band full swing without clipping the combined result beyond ±255.
  const scale = 255 / 100;
  const rOff = (shadows[0] * 0.25 + midtones[0] * 0.5 + highlights[0] * 0.25) * scale;
  const gOff = (shadows[1] * 0.25 + midtones[1] * 0.5 + highlights[1] * 0.25) * scale;
  const bOff = (shadows[2] * 0.25 + midtones[2] * 0.5 + highlights[2] * 0.25) * scale;
  // prettier-ignore
  return [
    1, 0, 0, 0, rOff,
    0, 1, 0, 0, gOff,
    0, 0, 1, 0, bOff,
    0, 0, 0, 1, 0,
  ];
}

/**
 * Returns a color matrix that tints toward `packedRgba` (0xRRGGBBAA) by `amount` (0 = original,
 * 1 = solid tint color). Allocates a new array.
 */
export function createColorMatrixFromTint(packedRgba: number, amount: number): number[] {
  const tr = ((packedRgba >>> 24) & 0xff) * amount;
  const tg = ((packedRgba >>> 16) & 0xff) * amount;
  const tb = ((packedRgba >>> 8) & 0xff) * amount;
  const keep = 1 - amount;
  // prettier-ignore
  return [
    keep, 0, 0, 0, tr,
    0, keep, 0, 0, tg,
    0, 0, keep, 0, tb,
    0, 0, 0, 1, 0,
  ];
}

/**
 * Returns a color matrix that scales contrast by `amount` (1 = original, 0 = flat mid-grey, >1 =
 * increased contrast). Allocates a new array.
 */
export function createContrastColorMatrix(amount: number): number[] {
  // Translate to midpoint, scale, translate back: offset = 128 * (1 - amount).
  const offset = 128 * (1 - amount);
  // prettier-ignore
  return [
    amount, 0, 0, 0, offset,
    0, amount, 0, 0, offset,
    0, 0, amount, 0, offset,
    0, 0, 0, 1, 0,
  ];
}

/**
 * Returns a color matrix that desaturates by `amount` (0 = no change, 1 = fully desaturated /
 * grayscale). Allocates a new array. Equivalent to `createSaturationColorMatrix(1 - amount)`.
 */
export function createDesaturateColorMatrix(amount: number): number[] {
  return createSaturationColorMatrix(1 - amount);
}

/**
 * Returns a grayscale color matrix using luma-weighted ITU-R BT.601 coefficients
 * (R=0.299, G=0.587, B=0.114). Allocates a new array.
 */
export function createGrayscaleColorMatrix(): number[] {
  const r = 0.299;
  const g = 0.587;
  const b = 0.114;
  // prettier-ignore
  return [
    r, g, b, 0, 0,
    r, g, b, 0, 0,
    r, g, b, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

/**
 * Returns a hue-rotation color matrix that rotates the hue wheel by `degrees`. Allocates a new
 * array.
 */
export function createHueRotateColorMatrix(degrees: number): number[] {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Hue rotation via the standard 3×3 rotation in a perceptual luminance-preserving basis.
  const lumR = 0.213;
  const lumG = 0.715;
  const lumB = 0.072;
  // prettier-ignore
  return [
    lumR + cos * (1 - lumR) + sin * -lumR, lumG + cos * -lumG + sin * -lumG, lumB + cos * -lumB + sin * (1 - lumB), 0, 0,
    lumR + cos * -lumR + sin * 0.143, lumG + cos * (1 - lumG) + sin * 0.140, lumB + cos * -lumB + sin * -0.283, 0, 0,
    lumR + cos * -lumR + sin * -(1 - lumR), lumG + cos * -lumG + sin * lumG, lumB + cos * (1 - lumB) + sin * lumB, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

/**
 * Returns the identity color matrix. Applying it leaves colors unchanged.
 * Allocates a new array.
 */
export function createIdentityColorMatrix(): number[] {
  // prettier-ignore
  return [
    1, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 1, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

/**
 * Returns an invert color matrix that produces `255 - channel` per RGB channel. Alpha is
 * unchanged. Allocates a new array.
 */
export function createInvertColorMatrix(): number[] {
  // prettier-ignore
  return [
    -1, 0, 0, 0, 255,
    0, -1, 0, 0, 255,
    0, 0, -1, 0, 255,
    0, 0, 0, 1, 0,
  ];
}

/**
 * Returns a levels color matrix that remaps the input range `[inBlack, inWhite]` to the output
 * range `[outBlack, outWhite]` with optional `gamma` correction. All values are in 0–255. `gamma`
 * defaults to 1 (linear). Allocates a new array.
 *
 * The remapping function is:
 *   output = outBlack + (outWhite - outBlack) * ((input - inBlack) / (inWhite - inBlack))^(1/gamma)
 * Because colour matrices cannot represent a true power-law curve, `gamma` is approximated via a
 * linear scale-and-offset that matches the midpoint of the gamma curve; for exact gamma correction
 * apply a LUT in `filters-surface`.
 */
export function createLevelsColorMatrix(
  inBlack: number,
  inWhite: number,
  outBlack: number,
  outWhite: number,
  gamma = 1,
): number[] {
  // Guard against degenerate input range.
  const inRange = inWhite - inBlack;
  const scale = inRange === 0 ? 1 : (outWhite - outBlack) / inRange;
  // Linear-midpoint gamma approximation: a slope correction factor at the midpoint.
  const gammaCorrectedScale = scale * (gamma === 1 ? 1 : Math.pow(0.5, 1 / gamma - 1));
  const offset = outBlack - inBlack * gammaCorrectedScale;
  // prettier-ignore
  return [
    gammaCorrectedScale, 0, 0, 0, offset,
    0, gammaCorrectedScale, 0, 0, offset,
    0, 0, gammaCorrectedScale, 0, offset,
    0, 0, 0, 1, 0,
  ];
}

/**
 * Returns a color matrix that scales the alpha channel by `alpha` (0 = transparent, 1 = opaque).
 * RGB channels are unchanged. Allocates a new array.
 */
export function createOpacityColorMatrix(alpha: number): number[] {
  // prettier-ignore
  return [
    1, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 1, 0, 0,
    0, 0, 0, alpha, 0,
  ];
}

/**
 * Returns a color matrix that applies a Polaroid-style warm orange-tint look.
 * Allocates a new array. This is a data constant exposed as a factory for
 * consistent API shape with the other presets.
 */
export function createPolaroidColorMatrix(): number[] {
  // Warm highlight, slightly desaturated mid-tones, lifted blacks.
  // prettier-ignore
  return [
    1.438, -0.062, -0.062, 0, -31.8,
    -0.122, 1.378, -0.122, 0, 16.2,
    -0.016, -0.016, 1.484, 0, -47.6,
    0, 0, 0, 1, 0,
  ];
}

/**
 * Returns a color matrix that scales color saturation by `amount` (0 = grayscale, 1 = original,
 * >1 = oversaturated). Allocates a new array.
 */
export function createSaturationColorMatrix(amount: number): number[] {
  const r = 0.299 * (1 - amount);
  const g = 0.587 * (1 - amount);
  const b = 0.114 * (1 - amount);
  // prettier-ignore
  return [
    r + amount, g, b, 0, 0,
    r, g + amount, b, 0, 0,
    r, g, b + amount, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

/**
 * Returns a sepia-tone color matrix. Allocates a new array.
 */
export function createSepiaColorMatrix(): number[] {
  // Standard sepia values widely used in CSS/Flash.
  // prettier-ignore
  return [
    0.393, 0.769, 0.189, 0, 0,
    0.349, 0.686, 0.168, 0, 0,
    0.272, 0.534, 0.131, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

/**
 * Returns a color matrix approximating the Technicolor two-strip process: warm reds/oranges
 * with cyan shadows and a slight green cross-process. Allocates a new array.
 */
export function createTechnicolorColorMatrix(): number[] {
  // Derived from the classic Technicolor look formula widely cited in colour grading literature.
  // prettier-ignore
  return [
    1.9126, -0.8, -0.09, 0, 11.79,
    -0.2, 1.7, -0.27, 0, -14.69,
    -0.14, -0.21, 1.62, 0, -3.38,
    0, 0, 0, 1, 0,
  ];
}

/**
 * Returns a vintage/faded-film color matrix: desaturated, warm tones, lifted blacks.
 * Allocates a new array.
 */
export function createVintageColorMatrix(): number[] {
  // prettier-ignore
  return [
    0.9, 0.05, 0.05, 0, 10,
    0.0, 0.85, 0.0, 0, 5,
    0.0, 0.0, 0.75, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

/**
 * Returns a white-balance color matrix that adjusts color temperature toward warm (positive
 * `temperature` values) or cool (negative) and tint toward green (positive `tint`) or magenta
 * (negative). Both parameters are in the –100..100 range. Allocates a new array.
 *
 * Temperature shifts are modelled as complementary R/B channel gains (warm = more R, less B).
 * Tint shifts are modelled as G channel gain (more G = green, less G = magenta). This matches the
 * Lightroom/Camera Raw slider convention.
 */
export function createWhiteBalanceColorMatrix(temperature: number, tint: number): number[] {
  // Map [-100, 100] to multiplicative gain adjustments centred at 1.
  // Max temperature shift = ±0.3 gain on R/B; max tint shift = ±0.15 gain on G.
  const tempScale = temperature / 100;
  const tintScale = tint / 100;
  const rGain = 1 + tempScale * 0.3;
  const gGain = 1 + tintScale * 0.15;
  const bGain = 1 - tempScale * 0.3;
  // prettier-ignore
  return [
    rGain, 0, 0, 0, 0,
    0, gGain, 0, 0, 0,
    0, 0, bGain, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

/**
 * Composes matrix `b` applied first and then `a`. The result is equivalent to applying `b` to a
 * color and then `a` to the result. When `out` is provided the result is written there (alias-safe:
 * `out` may be `a` or `b`). Returns the output array (either `out` or a freshly allocated array).
 */
export function multiplyColorMatrix(a: Readonly<number[]>, b: Readonly<number[]>, out?: number[]): number[] {
  // Read all inputs into locals before writing to `out` (alias-safe).
  const a0 = a[0],
    a1 = a[1],
    a2 = a[2],
    a3 = a[3],
    a4 = a[4];
  const a5 = a[5],
    a6 = a[6],
    a7 = a[7],
    a8 = a[8],
    a9 = a[9];
  const a10 = a[10],
    a11 = a[11],
    a12 = a[12],
    a13 = a[13],
    a14 = a[14];
  const a15 = a[15],
    a16 = a[16],
    a17 = a[17],
    a18 = a[18],
    a19 = a[19];
  const b0 = b[0],
    b1 = b[1],
    b2 = b[2],
    b3 = b[3],
    b4 = b[4];
  const b5 = b[5],
    b6 = b[6],
    b7 = b[7],
    b8 = b[8],
    b9 = b[9];
  const b10 = b[10],
    b11 = b[11],
    b12 = b[12],
    b13 = b[13],
    b14 = b[14];
  const b15 = b[15],
    b16 = b[16],
    b17 = b[17],
    b18 = b[18],
    b19 = b[19];
  const result = out ?? new Array(20);
  // Row 0 (R output)
  result[0] = a0 * b0 + a1 * b5 + a2 * b10 + a3 * b15;
  result[1] = a0 * b1 + a1 * b6 + a2 * b11 + a3 * b16;
  result[2] = a0 * b2 + a1 * b7 + a2 * b12 + a3 * b17;
  result[3] = a0 * b3 + a1 * b8 + a2 * b13 + a3 * b18;
  result[4] = a0 * b4 + a1 * b9 + a2 * b14 + a3 * b19 + a4;
  // Row 1 (G output)
  result[5] = a5 * b0 + a6 * b5 + a7 * b10 + a8 * b15;
  result[6] = a5 * b1 + a6 * b6 + a7 * b11 + a8 * b16;
  result[7] = a5 * b2 + a6 * b7 + a7 * b12 + a8 * b17;
  result[8] = a5 * b3 + a6 * b8 + a7 * b13 + a8 * b18;
  result[9] = a5 * b4 + a6 * b9 + a7 * b14 + a8 * b19 + a9;
  // Row 2 (B output)
  result[10] = a10 * b0 + a11 * b5 + a12 * b10 + a13 * b15;
  result[11] = a10 * b1 + a11 * b6 + a12 * b11 + a13 * b16;
  result[12] = a10 * b2 + a11 * b7 + a12 * b12 + a13 * b17;
  result[13] = a10 * b3 + a11 * b8 + a12 * b13 + a13 * b18;
  result[14] = a10 * b4 + a11 * b9 + a12 * b14 + a13 * b19 + a14;
  // Row 3 (A output)
  result[15] = a15 * b0 + a16 * b5 + a17 * b10 + a18 * b15;
  result[16] = a15 * b1 + a16 * b6 + a17 * b11 + a18 * b16;
  result[17] = a15 * b2 + a16 * b7 + a17 * b12 + a18 * b17;
  result[18] = a15 * b3 + a16 * b8 + a17 * b13 + a18 * b18;
  result[19] = a15 * b4 + a16 * b9 + a17 * b14 + a18 * b19 + a19;
  return result;
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}
