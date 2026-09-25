export {
  computeBitmapTextLocalBoundsRectangle,
  createBitmapText,
  getBitmapTextBounds,
  getBitmapTextLineCount,
  getBitmapTextPages,
  isBitmapTextGlyphLayoutStale,
  isBitmapTextTruncated,
  reserveBitmapText,
  setBitmapTextAlign,
  setBitmapTextEllipsis,
  setBitmapTextGlyphSource,
  setBitmapTextLetterSpacing,
  setBitmapTextLineHeight,
  setBitmapTextMaxLines,
  setBitmapTextText,
  setBitmapTextWrapWidth,
} from './bitmapText.ts';
export * from './enableBitmapTextGuards.ts';
export * from './explainBitmapTextMissingGlyphs.ts';
export { refreshBitmapTextGlyphLayout, setBitmapTextMissingGlyphGuard, updateBitmapText } from './updateBitmapText.ts';
