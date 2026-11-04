// Generated from crates/flight-textlayout/src/text_metrics.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';

import type { TextLayoutResult, TextMetrics } from './types.ts';

export function createTextMetrics(): TextMetrics {
  let out: TextMetrics = allocateEntity<TextMetrics>();
  initializeTextMetrics(out);
  return out;
}

export function getTextMetrics(out: TextMetrics, layout: Readonly<TextLayoutResult>): void {
  out.width = Math.ceil(layout.textWidth);
  out.height = Math.ceil(layout.textHeight);
  out.numLines = layout.numLines;
}

export function initializeTextMetrics(out: TextMetrics): void {
  out.height = 0.0;
  out.numLines = 0;
  out.width = 0.0;
}
