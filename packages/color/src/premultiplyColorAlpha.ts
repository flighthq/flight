// Generated from crates/flight-color/src/premultiply_color_alpha.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * Premultiplies the RGB channels of a packed sRGB `0xRRGGBBAA` color by its alpha channel
 * and returns a new packed color. Output RGB = round(RGB * alpha). The alpha channel
 * is preserved unchanged. Fully-transparent (alpha=0) results in black-with-alpha-0.
 * Used when a renderer requires premultiplied-alpha color values.
 */
export function premultiplyColorAlpha(color: number): number {
  const a = (color & 0xff) / 255;
  const r = ((n: number): number => Math.trunc(n + 0.5 * Math.sign(n)))(((color >>> 24) & 0xff) * a) >>> 0;
  const g = ((n: number): number => Math.trunc(n + 0.5 * Math.sign(n)))(((color >>> 16) & 0xff) * a) >>> 0;
  const b = ((n: number): number => Math.trunc(n + 0.5 * Math.sign(n)))(((color >>> 8) & 0xff) * a) >>> 0;
  return ((r << 24) | (g << 16) | (b << 8) | (color & 0xff)) >>> 0;
}

/**
 * Reverses premultiplied-alpha encoding for a packed sRGB `0xRRGGBBAA` color.
 * Output RGB = round(RGB / alpha), clamped to [0, 255]. Returns the input unchanged
 * when alpha is 0 (division-by-zero guard: fully-transparent stays black-with-alpha-0).
 */
export function unpremultiplyColorAlpha(color: number): number {
  const a = (color & 0xff) / 255;
  if (a === 0) {
    return color >>> 0;
  }
  const r =
    Math.min(((n: number): number => Math.trunc(n + 0.5 * Math.sign(n)))(((color >>> 24) & 0xff) / a), 255) >>> 0;
  const g =
    Math.min(((n: number): number => Math.trunc(n + 0.5 * Math.sign(n)))(((color >>> 16) & 0xff) / a), 255) >>> 0;
  const b =
    Math.min(((n: number): number => Math.trunc(n + 0.5 * Math.sign(n)))(((color >>> 8) & 0xff) / a), 255) >>> 0;
  return ((r << 24) | (g << 16) | (b << 8) | (color & 0xff)) >>> 0;
}
