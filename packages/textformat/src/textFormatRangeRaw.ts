// Generated from crates/flight-textformat/src/text_format_range_raw.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';

import type { TextFormat, TextFormatRangeRaw } from './types.ts';

export type { TextFormatRangeRaw } from './types.ts';

/**
 * Mechanically relocated from textlayout/textFormatRange.ts to its approved D8 type owner.
 */
export function createTextFormatRange(format: TextFormat, start: number, end: number): TextFormatRangeRaw {
  let out: TextFormatRangeRaw = Object.assign(allocateEntity<TextFormatRangeRaw>(), { end: 0, start: 0 });
  initializeTextFormatRange(out, format, start, end);
  return out;
}

export function initializeTextFormatRange(
  out: TextFormatRangeRaw,
  format: TextFormat,
  start: number,
  end: number,
): void {
  out.end = end;
  out.format = format;
  out.start = start;
}
