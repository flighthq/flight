import type { TextLayoutResult, TextMetrics } from '@flighthq/types';

export function createTextMetrics(): TextMetrics {
  return { height: 0, numLines: 0, width: 0 };
}

// Fills `out` with the measured content size from a computed layout (the glyph extent, ceil'd to whole
// pixels to match computeRichTextTextWidth/Height). Pure read — call after the layout is current, e.g. via
// ensureRichTextLayout.
export function getTextMetrics(out: TextMetrics, layout: Readonly<TextLayoutResult>): void {
  out.width = Math.ceil(layout.textWidth);
  out.height = Math.ceil(layout.textHeight);
  out.numLines = layout.numLines;
}
