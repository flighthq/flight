// Generated from crates/flight-textformat/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export {
  FontVariationItalic,
  FontVariationOpticalSize,
  FontVariationSlant,
  FontVariationWeight,
  FontVariationWidth,
} from './fontVariation.ts';
export type { FontVariation } from './fontVariation.ts';
export {
  getTextFormatAlignString,
  getTextFormatAscent,
  getTextFormatDescent,
  getTextFormatHeight,
  getTextFormatLeading,
  getTextFormatListMarkerString,
  mergeTextFormat,
  parseTextFormatAlign,
  parseTextFormatListMarker,
} from './textFormat.ts';
export type { TextFormat, TextFormatAlign, TextFormatListMarker } from './textFormat.ts';
export { createTextFormatRange, initializeTextFormatRange } from './textFormatRangeRaw.ts';
export type { TextFormatRangeRaw } from './textFormatRangeRaw.ts';
export { TextFormatRange } from './textFormatRange.ts';
