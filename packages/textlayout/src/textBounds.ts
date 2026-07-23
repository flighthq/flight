import type { RectangleLike, TextBoundsSpec, TextLayoutResult } from '@flighthq/types';

import { TEXT_LAYOUT_GUTTER } from './textLayout';

// Inner padding (px) between the box edge and its text, applied on every side. Exported for the scroll
// metrics in richTextMetrics, which subtract it to derive the visible content area.
// Alias of TEXT_LAYOUT_GUTTER so both names refer to the same shared value without duplication risk.
export const TEXT_BOUNDS_GUTTER = TEXT_LAYOUT_GUTTER;

// The box height: the declared height when autoSize is off, else the measured content height plus a
// gutter on the top and bottom.
export function computeTextBoundsHeight(spec: TextBoundsSpec, layout: Readonly<TextLayoutResult>): number {
  if (spec.autoSize === 'none') return spec.height;
  return Math.ceil(layout.textHeight + TEXT_LAYOUT_GUTTER * 2);
}

// The horizontal anchor offset of the box within the declared width: 0 for left/none, the full slack
// for right, half for center. Renderers that position the field use this directly.
export function computeTextBoundsOffsetX(spec: TextBoundsSpec, layout: Readonly<TextLayoutResult>): number {
  const slack = spec.width - computeTextBoundsWidth(spec, layout);
  if (spec.autoSize === 'right') return slack;
  if (spec.autoSize === 'center') return slack / 2;
  return 0;
}

// Fills `out` with the local-bounds rectangle a text object occupies: x = the left/right/center anchor
// offset, y = 0, width/height = the box. This is the per-frame calculation behind the text kinds'
// computeLocalBoundsRectangle hooks; callers that want the cached node bounds go through
// getNodeLocalBoundsRectangle instead. `out` may not alias `spec` (spec is read after out.x is written).
export function computeTextBoundsRectangle(
  out: RectangleLike,
  spec: TextBoundsSpec,
  layout: Readonly<TextLayoutResult>,
): void {
  const width = computeTextBoundsWidth(spec, layout);
  const slack = spec.width - width;
  out.x = spec.autoSize === 'right' ? slack : spec.autoSize === 'center' ? slack / 2 : 0;
  out.y = 0;
  out.width = width;
  out.height = computeTextBoundsHeight(spec, layout);
}

// The box width: the declared width when autoSize is off or wordWrap constrains it, else the measured
// content width plus a gutter on the left and right.
export function computeTextBoundsWidth(spec: TextBoundsSpec, layout: Readonly<TextLayoutResult>): number {
  if (spec.autoSize === 'none' || spec.wordWrap) return spec.width;
  return Math.ceil(layout.textWidth + TEXT_LAYOUT_GUTTER * 2);
}
