// Tiled color literals (`#RRGGBB` or `#AARRGGBB`, the leading `#` optional) converted to and from
// Flight's single packed-RGBA convention (`0xRRGGBBAA`, alpha in the low byte). A 6-digit literal is
// fully opaque (alpha 0xff). These back the map background color; per-element `color` custom
// properties keep their raw Tiled string.

// Formats a packed-RGBA color back to Tiled's `#AARRGGBB` literal (always 8 digits, alpha first).
export function formatTiledColor(packed: number): string {
  const p = packed >>> 0;
  const alpha = p & 0xff;
  const rgb = (p >>> 8) & 0xffffff;
  return `#${hex2(alpha)}${hex6(rgb)}`;
}

// Parses a Tiled color literal to packed RGBA, or null when the string is not a valid 6- or 8-digit
// hex color.
export function parseTiledColor(text: string): number | null {
  let s = text.trim();
  if (s.startsWith('#')) s = s.slice(1);
  if (!/^[0-9a-fA-F]+$/.test(s)) return null;
  if (s.length === 6) {
    const rgb = parseInt(s, 16);
    return ((rgb << 8) | 0xff) >>> 0;
  }
  if (s.length === 8) {
    const argb = parseInt(s, 16);
    const alpha = (argb >>> 24) & 0xff;
    const rgb = argb & 0xffffff;
    return ((rgb << 8) | alpha) >>> 0;
  }
  return null;
}

function hex2(value: number): string {
  return value.toString(16).padStart(2, '0');
}

function hex6(value: number): string {
  return value.toString(16).padStart(6, '0');
}
