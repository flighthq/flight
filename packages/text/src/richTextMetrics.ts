// Generated from crates/flight-text/src/rich_text_metrics.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { TEXT_BOUNDS_GUTTER, computeTextBoundsHeight, computeTextBoundsWidth } from '@flighthq/textlayout/contract';
import type { TextBoundsSpec, TextLayoutResult } from '@flighthq/textlayout/contract';

import type { RichTextData } from './types.ts';

function boundsSpec(data: Readonly<RichTextData>): TextBoundsSpec {
  return { autoSize: data.autoSize, height: data.height, width: data.width, wordWrap: data.wordWrap };
}

export function computeRichTextBottomScrollV(data: Readonly<RichTextData>, layout: Readonly<TextLayoutResult>): number {
  return Math.min(layout.numLines, data.scrollV + getVisibleLineCount(data, layout) - 1.0);
}

export function computeRichTextLineCount(layout: Readonly<TextLayoutResult>): number {
  return layout.numLines;
}

export function computeRichTextMaxScrollH(data: Readonly<RichTextData>, layout: Readonly<TextLayoutResult>): number {
  const visibleWidth = Math.max(computeTextBoundsWidth(boundsSpec(data), layout) - TEXT_BOUNDS_GUTTER * 2.0, 0.0);
  return Math.max(Math.ceil(layout.textWidth - visibleWidth), 0.0);
}

export function computeRichTextMaxScrollV(data: Readonly<RichTextData>, layout: Readonly<TextLayoutResult>): number {
  if (layout.numLines <= 1) {
    return 1.0;
  }
  return Math.max(layout.numLines - getVisibleLineCount(data, layout) + 1.0, 1.0);
}

export function computeRichTextTextHeight(layout: Readonly<TextLayoutResult>): number {
  return Math.ceil(layout.textHeight);
}

export function computeRichTextTextWidth(layout: Readonly<TextLayoutResult>): number {
  return Math.ceil(layout.textWidth);
}

export function getRichTextScrollYOffset(lineHeights: Readonly<number[]>, firstVisibleLine: number): number {
  let offset = 0.0;
  const end = Math.min(firstVisibleLine, lineHeights.length);
  for (let index = 0; index < end; index += 1) {
    offset += lineHeights[index];
  }
  return offset;
}

function getVisibleLineCount(data: Readonly<RichTextData>, layout: Readonly<TextLayoutResult>): number {
  const visibleHeight = Math.max(computeTextBoundsHeight(boundsSpec(data), layout) - TEXT_BOUNDS_GUTTER * 2.0, 0.0);
  if (visibleHeight === 0.0) {
    return 1.0;
  }
  let total = 0.0;
  let count = 0;
  for (const height of layout.lineHeights) {
    if (count > 0 && total + height > visibleHeight) {
      break;
    }
    total += height;
    count += 1;
  }
  return Math.max(count, 1.0);
}
