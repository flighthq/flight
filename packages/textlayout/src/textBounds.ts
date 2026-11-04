// Generated from crates/flight-textlayout/src/text_bounds.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { Rectangle } from '@flighthq/geometry/contract';

import { TEXT_LAYOUT_GUTTER } from './textLayout.ts';
import type { TextBoundsSpec, TextLayoutResult } from './types.ts';

export const TEXT_BOUNDS_GUTTER: number = TEXT_LAYOUT_GUTTER;

export function computeTextBoundsHeight(spec: Readonly<TextBoundsSpec>, layout: Readonly<TextLayoutResult>): number {
  if (spec.autoSize === 'none') {
    return spec.height;
  }
  return Math.ceil(layout.textHeight + TEXT_LAYOUT_GUTTER * 2.0);
}

export function computeTextBoundsOffsetX(spec: Readonly<TextBoundsSpec>, layout: Readonly<TextLayoutResult>): number {
  const slack = spec.width - computeTextBoundsWidth(spec, layout);
  if (spec.autoSize === 'right') {
    return slack;
  }
  if (spec.autoSize === 'center') {
    return slack / 2.0;
  }
  return 0.0;
}

export function computeTextBoundsRectangle(
  out: Rectangle,
  spec: Readonly<TextBoundsSpec>,
  layout: Readonly<TextLayoutResult>,
): void {
  const width = computeTextBoundsWidth(spec, layout);
  const slack = spec.width - width;
  out.x = spec.autoSize === 'right' ? slack : spec.autoSize === 'center' ? slack / 2.0 : 0.0;
  out.y = 0.0;
  out.width = width;
  out.height = computeTextBoundsHeight(spec, layout);
}

export function computeTextBoundsWidth(spec: Readonly<TextBoundsSpec>, layout: Readonly<TextLayoutResult>): number {
  if (spec.autoSize === 'none' || (spec.wordWrap ?? false)) {
    return spec.width;
  }
  return Math.ceil(layout.textWidth + TEXT_LAYOUT_GUTTER * 2.0);
}
