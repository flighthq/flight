import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { TextLayoutResult, TextMetrics, EntityConstruction } from '@flighthq/types/contract';

export function createTextMetrics(): TextMetrics {
  const out = allocateEntity<TextMetrics>();
  initializeTextMetrics(out);
  return finishEntity(out);
}

// Fills `out` with the measured content size from a computed layout (the glyph extent, ceil'd to whole
// pixels to match computeRichTextTextWidth/Height). Pure read — call after the layout is current, e.g. via
// ensureRichTextLayout.
export function getTextMetrics(out: TextMetrics, layout: Readonly<TextLayoutResult>): void {
  out.width = Math.ceil(layout.textWidth);
  out.height = Math.ceil(layout.textHeight);
  out.numLines = layout.numLines;
}

export function initializeTextMetrics(out: EntityConstruction<TextMetrics>): void {
  out.height = 0;
  out.numLines = 0;
  out.width = 0;
}
