import type { RichTextData, TextLayoutResult } from '@flighthq/types';

import { computeTextBoundsHeight, computeTextBoundsWidth, TEXT_BOUNDS_GUTTER } from './textBounds';

export function computeRichTextBottomScrollV(data: Readonly<RichTextData>, layout: Readonly<TextLayoutResult>): number {
  return Math.min(layout.numLines, data.scrollV + getVisibleLineCount(data, layout) - 1);
}

export function computeRichTextLineCount(layout: Readonly<TextLayoutResult>): number {
  return layout.numLines;
}

export function computeRichTextMaxScrollH(data: Readonly<RichTextData>, layout: Readonly<TextLayoutResult>): number {
  const visibleWidth = Math.max(0, computeTextBoundsWidth(data, layout) - TEXT_BOUNDS_GUTTER * 2);
  return Math.max(0, Math.ceil(layout.textWidth - visibleWidth));
}

export function computeRichTextMaxScrollV(data: Readonly<RichTextData>, layout: Readonly<TextLayoutResult>): number {
  if (layout.numLines <= 1) return 1;
  return Math.max(1, layout.numLines - getVisibleLineCount(data, layout) + 1);
}

export function computeRichTextTextHeight(layout: Readonly<TextLayoutResult>): number {
  return Math.ceil(layout.textHeight);
}

export function computeRichTextTextWidth(layout: Readonly<TextLayoutResult>): number {
  return Math.ceil(layout.textWidth);
}

export function getRichTextScrollYOffset(lineHeights: readonly number[], firstVisibleLine: number): number {
  let offset = 0;
  const limit = Math.min(firstVisibleLine, lineHeights.length);
  for (let i = 0; i < limit; i++) offset += lineHeights[i];
  return offset;
}

function getVisibleLineCount(data: Readonly<RichTextData>, layout: Readonly<TextLayoutResult>): number {
  const visibleHeight = Math.max(0, computeTextBoundsHeight(data, layout) - TEXT_BOUNDS_GUTTER * 2);
  if (visibleHeight === 0) return 1;

  let total = 0;
  let count = 0;
  for (const height of layout.lineHeights) {
    if (count > 0 && total + height > visibleHeight) break;
    total += height;
    count++;
  }
  return Math.max(1, count);
}
