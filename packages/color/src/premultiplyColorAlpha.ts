// Generated from crates/flight-color/src/premultiply_color_alpha.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * Premultiplies the RGB channels of a packed sRGB `0xRRGGBBAA` color by its alpha channel
 * and returns a new packed color. Output RGB = round(RGB * alpha). The alpha channel
 * is preserved unchanged. Fully-transparent (alpha=0) results in black-with-alpha-0.
 * Used when a renderer requires premultiplied-alpha color values.
 */
export function premultiplyColorAlpha(color: number): number {
  const a = (color & 255) / 255.0;
  const r = Math.round(((color >>> 24) & 255) * a) >>> 0;
  const g = Math.round(((color >>> 16) & 255) * a) >>> 0;
  const b = Math.round(((color >>> 8) & 255) * a) >>> 0;
  return ((r << 24) | (g << 16) | (b << 8) | (color & 255)) >>> 0;
}

/**
 * Reverses premultiplied-alpha encoding for a packed sRGB `0xRRGGBBAA` color.
 * Output RGB = round(RGB / alpha), clamped to [0, 255]. Returns the input unchanged
 * when alpha is 0 (division-by-zero guard: fully-transparent stays black-with-alpha-0).
 */
export function unpremultiplyColorAlpha(color: number): number {
  const a = (color & 255) / 255.0;
  if (a === 0.0) {
    return color >>> 0;
  }
  const r = Math.min(Math.round(((color >>> 24) & 255) / a), 255.0) >>> 0;
  const g = Math.min(Math.round(((color >>> 16) & 255) / a), 255.0) >>> 0;
  const b = Math.min(Math.round(((color >>> 8) & 255) / a), 255.0) >>> 0;
  return ((r << 24) | (g << 16) | (b << 8) | (color & 255)) >>> 0;
}
