// Generated from crates/flight-textlayout/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export {
  clearRichTextContent,
  computeRichTextContent,
  createRichTextContent,
  getRichTextContent,
  initializeRichTextContent,
} from './richTextContent.ts';
export {
  computeRichTextBottomScrollV,
  computeRichTextLineCount,
  computeRichTextMaxScrollH,
  computeRichTextMaxScrollV,
  computeRichTextTextHeight,
  computeRichTextTextWidth,
  getRichTextScrollYOffset,
} from './richTextMetrics.ts';
export {
  computeRichTextCharIndexAtPoint,
  computeRichTextLineMetrics,
  getRichTextCharBoundaries,
  getRichTextFirstCharInParagraph,
  getRichTextLineIndexAtPoint,
  getRichTextLineIndexOfChar,
  getRichTextLineLength,
  getRichTextLineOffset,
  getRichTextLineText,
  getRichTextLinkAtPoint,
  getRichTextParagraphLength,
  getRichTextSelectionRectangles,
} from './richTextQuery.ts';
export {
  TEXT_BOUNDS_GUTTER,
  computeTextBoundsHeight,
  computeTextBoundsOffsetX,
  computeTextBoundsRectangle,
  computeTextBoundsWidth,
} from './textBounds.ts';
export {
  TEXT_LAYOUT_GUTTER,
  computeTextLayout,
  createTextLayoutResult,
  initializeTextLayoutResult,
  isTextLayoutTruncated,
} from './textLayout.ts';
export { createTextLayoutGroup, initializeTextLayoutGroup } from './textLayoutGroup.ts';
export { getTextLayoutMeasureProvider, setTextLayoutMeasureProvider } from './textLayoutMeasure.ts';
export { clearTextLayoutResult, getTextLayoutResult } from './textLayoutRuntime.ts';
export { getTextLineBreakIndex, getTextLineBreaks } from './textLineBreaks.ts';
export { createTextMetrics, getTextMetrics, initializeTextMetrics } from './textMetrics.ts';
export {
  getTextAutoSizeString,
  getTextJustificationString,
  getTextVerticalAlignString,
  parseTextAutoSize,
  parseTextJustification,
  parseTextVerticalAlign,
} from './typeStrings.ts';
export { TextAutoSize, TextJustification, TextVerticalAlign } from './types.ts';
export type {
  RichTextContent,
  TextBoundsSpec,
  TextLayoutGroup,
  TextLayoutParams,
  TextLayoutResult,
  TextLineMetrics,
  TextMetrics,
  TextSelectionRectangle,
} from './types.ts';
export { createTextFormatRange, initializeTextFormatRange } from '@flighthq/textformat/contract';
export type {
  TextFormat,
  TextFormatAlign,
  TextFormatListMarker,
  TextFormatRangeRaw,
} from '@flighthq/textformat/contract';
export { measureText } from '@flighthq/textshaper/contract';
export type { HostTextShaperCapability, TextDirection, TextMeasureFunction } from '@flighthq/textshaper/contract';
