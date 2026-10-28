// Generated from crates/flight-textformat/src/text_format_range_raw.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityRaw } from '@flighthq/entity/contract';

import type { TextFormat } from './textFormat.ts';

/**
 * Half-open UTF-16 code-unit offsets (D15), with the same format object as the caller.
 */
export interface TextFormatRangeRaw extends EntityRaw {
  end: number;
  format: TextFormat;
  start: number;
}

/**
 * Mechanically relocated from textlayout/textFormatRange.ts to its approved D8 type owner.
 */
export function createTextFormatRange(format: TextFormat, start: number, end: number): TextFormatRangeRaw {
  let out: TextFormatRangeRaw = allocateEntity<TextFormatRangeRaw>();
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
