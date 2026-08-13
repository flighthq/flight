import type { FontVariation } from './FontVariation';

export type TextFormatAlign = 'center' | 'end' | 'justify' | 'left' | 'right' | 'start';

// The glyph drawn at the start of a bulleted paragraph. 'none' suppresses the marker glyph while
// keeping the paragraph indent; an absent value defaults to the filled disc bullet.
export type TextFormatListMarker = 'circle' | 'decimal' | 'disc' | 'none' | 'square';

export interface TextFormat {
  align?: TextFormatAlign;
  blockIndent?: number;
  bold?: boolean;
  bullet?: boolean;
  // Run color as Flight's packed sRGB RGBA integer (`0xRRGGBBAA`); alpha is linear coverage.
  color?: number;
  font?: string;
  indent?: number;
  italic?: boolean;
  kerning?: boolean;
  leading?: number;
  leftMargin?: number;
  letterSpacing?: number;
  listMarker?: TextFormatListMarker;
  rightMargin?: number;
  size?: number;
  strikethrough?: boolean;
  tabStops?: number[];
  target?: string;
  underline?: boolean;
  url?: string;
  // Variable-font axis settings for this run, as OpenType tag/value pairs — the same shape
  // TextShaperOptions.variations takes, so a shaper reads them without a conversion at the seam.
  // Absent means the font's own defaults stand, which is not the same as an empty list.
  variations?: readonly FontVariation[];
}
