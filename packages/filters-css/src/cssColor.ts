/**
 * Formats a filter `color` (packed 0xRRGGBB, the alpha carried separately as a
 * 0..1 float) as a CSS `rgba(r,g,b,a)` string. Shared by the CSS filter
 * builders so the packed-int → CSS-color conversion lives in one place.
 */
export function cssRgbaFromColor(color: number, alpha: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}
