// AngelCode BMFont **text** (.fnt) format schema.
// Reference: https://www.angelcode.com/products/bmfont/doc/file_format.html
// The text .fnt is a line-per-record format: each line begins with a tag (info/common/page/chars/
// char/kernings/kerning) followed by `key=value` attributes; string values are double-quoted and
// comma-separated tuples (padding, spacing) are kept verbatim as strings. This document is the raw,
// loss-tolerant parse; @flighthq/bitmapfont builds a BitmapFont from it (regions + glyphs + kerning).

// The `info` tag: how the font was baked (mostly identification; not used for layout).
export interface BitmapFontTextInfo {
  bold: boolean;
  charset: string;
  face: string;
  italic: boolean;
  // "top,right,bottom,left" glyph padding, verbatim.
  padding: string;
  size: number;
  // "horizontal,vertical" spacing, verbatim.
  spacing: string;
  smooth: boolean;
  unicode: boolean;
}

// The `common` tag: line metrics and page layout.
export interface BitmapFontTextCommon {
  // Pixels from the top of a line down to the baseline.
  base: number;
  // Pixels between successive baselines.
  lineHeight: number;
  // Number of page images the glyphs are spread across.
  pages: number;
  // Page image height in pixels.
  scaleH: number;
  // Page image width in pixels.
  scaleW: number;
}

// A `page` tag: one glyph atlas image and its id.
export interface BitmapFontTextPage {
  file: string;
  id: number;
}

// A `char` tag: one glyph's pixel rectangle (x/y/width/height) plus placement metrics.
export interface BitmapFontTextChar {
  chnl: number;
  height: number;
  // Unicode code point.
  id: number;
  page: number;
  width: number;
  x: number;
  xadvance: number;
  xoffset: number;
  y: number;
  yoffset: number;
}

// A `kerning` tag: an adjacent-pair advance adjustment.
export interface BitmapFontTextKerning {
  amount: number;
  first: number;
  second: number;
}

export interface BitmapFontTextDocument {
  chars: BitmapFontTextChar[];
  common: BitmapFontTextCommon;
  info: BitmapFontTextInfo;
  kernings: BitmapFontTextKerning[];
  pages: BitmapFontTextPage[];
}
