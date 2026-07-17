// Premultiplies the RGB channels of a packed sRGB `0xRRGGBBAA` color by its alpha channel
// and returns a new packed color. Output RGB = round(RGB × alpha). The alpha channel
// is preserved unchanged. Fully-transparent (alpha=0) results in black-with-alpha-0.
// Used when a renderer requires premultiplied-alpha color values.
export function premultiplyColorAlpha(color: number): number {
  const a = (color & 0xff) / 0xff;
  const r = Math.round(((color >>> 24) & 0xff) * a);
  const g = Math.round(((color >>> 16) & 0xff) * a);
  const b = Math.round(((color >>> 8) & 0xff) * a);
  return ((r << 24) | (g << 16) | (b << 8) | (color & 0xff)) >>> 0;
}

// Reverses premultiplied-alpha encoding for a packed sRGB `0xRRGGBBAA` color.
// Output RGB = round(RGB / alpha), clamped to [0, 255]. Returns the input unchanged
// when alpha is 0 (division-by-zero guard: fully-transparent stays black-with-alpha-0).
export function unpremultiplyColorAlpha(color: number): number {
  const a = (color & 0xff) / 0xff;
  if (a === 0) return color;
  const r = Math.min(255, Math.round(((color >>> 24) & 0xff) / a));
  const g = Math.min(255, Math.round(((color >>> 16) & 0xff) / a));
  const b = Math.min(255, Math.round(((color >>> 8) & 0xff) / a));
  return ((r << 24) | (g << 16) | (b << 8) | (color & 0xff)) >>> 0;
}
