// Takes a 24-bit RGB color (`0xRRGGBB`, e.g. a TextFormat color) and returns a
// CSS `#RRGGBB` string. Any high-byte bits are masked off, so a 32-bit RGBA
// value would keep `GGBBAA` — pass RGB, not RGBA.
export function computeRGBHexString(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}
